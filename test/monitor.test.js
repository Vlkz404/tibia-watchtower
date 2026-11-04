import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Monitor, applyObservation, applyGuildObservation, statusText, playerText } from '../src/monitor.js';
import { Store, emptyMonitor, playerTarget, guildTarget } from '../src/store.js';
import { TibiaError } from '../src/tibia.js';
import { sendNotification } from '../src/notifications.js';

const config = { guildId: '234567890123456789' };
const userId = '345678901234567890';
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tibia-monitor-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new Store(directory);
  store.update((s) => { s.players = [playerTarget('Test Knight')]; s.notificationsEnabled = true; s.channelIds = [userId]; s.pollSeconds = 60; });
  const sent = [];
  const client = {
    channels: { fetch: async () => ({ guildId: config.guildId, isSendable: () => true, send: async (payload) => sent.push(payload) }) },
    guilds: { fetch: async () => ({ members: { fetch: async () => ({}) } }) },
    users: { fetch: async () => ({ send: async (payload) => sent.push(payload) }) },
  };
  let time = Date.parse('2026-11-04T10:00:00Z');
  const clock = () => time;
  const advance = (ms = 61000) => { time += ms; };
  return { store, sent, client, clock, advance, directory };
}
const observation = (status, name = 'Test Knight') => ({ name, status, world: 'Quelibra', guild: 'Quelibra Pune', lastLogin: null, source: 'tibiadata' });

test('baseline is silent and transitions persist without duplicates after restart', async (t) => {
  const { store, sent, client, clock, advance, directory } = setup(t);
  let state = 'offline'; const service = { player: async () => observation(state) };
  const monitor = new Monitor(client, config, store, service, clock);
  await monitor.check(); assert.equal(sent.length, 0); assert.equal(store.get().players[0].monitor.lastOffline, null);
  state = 'online'; advance(); await monitor.check();
  assert.equal(sent.length, 1); assert.equal(store.get().players[0].monitor.history[0].from, '2026-11-04T10:00:00.000Z');
  advance(); await monitor.check(); assert.equal(sent.length, 1);
  const restarted = new Monitor(client, config, new Store(directory), service, clock);
  await restarted.check(); assert.equal(sent.length, 1);
  state = 'offline'; advance(); await restarted.check(); assert.equal(sent.length, 2);
  assert.equal(new Store(directory).get().players[0].monitor.history.length, 2);
});

test('one failed target does not block others or turn failure into offline', async (t) => {
  const { store, sent, client, clock, advance } = setup(t);
  store.update((s) => { s.players.push(playerTarget('Other Knight')); });
  let failed = false; let calls = 0;
  const service = { player: async (name) => { calls++; if (failed && name === 'Test Knight') throw new TibiaError('HTTP 403'); return observation('online', name); } };
  const monitor = new Monitor(client, config, store, service, clock);
  await monitor.check(); const previous = store.get().players[0].monitor.checkedAt;
  failed = true; advance(); await monitor.check();
  assert.equal(store.get().players[0].monitor.status, 'online'); assert.equal(store.get().players[0].monitor.checkedAt, previous);
  assert.match(playerText(store.get().players[0]), /outdated/);
  assert.equal(store.get().players[1].monitor.error, null); assert.equal(sent.length, 0);
  await monitor.check(); assert.equal(calls, 4);
});

test('pause, master switch, and offline filter prevent alerts', async (t) => {
  const { store, sent, client, clock, advance } = setup(t);
  let calls = 0; let state = 'offline';
  const monitor = new Monitor(client, config, store, { player: async () => { calls++; return observation(state); } }, clock);
  store.update((s) => { s.monitorEnabled = false; }); await monitor.check(); assert.equal(calls, 0);
  store.update((s) => { s.monitorEnabled = true; s.notificationsEnabled = false; }); await monitor.check();
  state = 'online'; advance(); await monitor.check(); assert.equal(sent.length, 0);
  store.update((s) => { s.notificationsEnabled = true; s.offlineAlerts = false; }); state = 'offline'; advance(); await monitor.check(); assert.equal(sent.length, 0);
});

test('concurrent queries and targets removed during requests are discarded', async (t) => {
  const { store, sent, client, clock } = setup(t);
  let resolve; let calls = 0;
  const monitor = new Monitor(client, config, store, { player: () => { calls++; return new Promise((done) => { resolve = done; }); } }, clock);
  const pending = monitor.check(); await monitor.check(); assert.equal(calls, 1);
  store.update((s) => { s.players = []; s.monitorRevision++; }); resolve(observation('online')); await pending;
  assert.equal(store.get().players.length, 0); assert.equal(sent.length, 0);
});

test('history is bounded and source changes or repeated cache samples are silent', () => {
  let state = emptyMonitor();
  for (let n = 0; n < 105; n++) state = applyObservation(state, observation(n % 2 ? 'online' : 'offline'), new Date(n * 60000).toISOString()).next;
  assert.equal(state.history.length, 100);
  const prior = { ...emptyMonitor(), status: 'online', source: 'html', checkedAt: '2026-11-04T10:00:00Z' };
  const changed = applyObservation(prior, observation('offline'), '2026-11-04T10:01:00Z');
  assert.equal(changed.event, null); assert.equal(changed.next.status, 'offline');
  const stale = { ...changed.next, observedAt: '2026-11-04T10:00:00Z' };
  assert.equal(applyObservation(stale, { ...observation('online'), observedAt: stale.observedAt }, '2026-11-04T10:02:00Z').next.status, 'offline');
});

test('guild baseline and new members are silent; leaving a guild is not logout', () => {
  const initial = guildTarget('Test Guild');
  const snap = (members) => ({ name: 'Test Guild', world: 'Quelibra', source: 'tibiadata', observedAt: null, members });
  const first = applyGuildObservation(initial, snap([{ name: 'Test Knight', status: 'offline' }]), '2026-11-04T10:00:00Z');
  assert.equal(first.events.length, 0);
  const second = applyGuildObservation(first.next, snap([{ name: 'Test Knight', status: 'online' }, { name: 'New Knight', status: 'online' }]), '2026-11-04T10:02:00Z');
  assert.equal(second.events.length, 1); assert.equal(second.events[0].name, 'Test Knight');
  const removed = applyGuildObservation(second.next, snap([{ name: 'New Knight', status: 'online' }]), '2026-11-04T10:04:00Z');
  assert.equal(removed.events.length, 0);
});

test('individual and guild targets do not duplicate alerts; API cadences are fixed', async (t) => {
  const { store, sent, client, clock, advance } = setup(t);
  store.update((s) => { s.guilds.push(guildTarget('Test Guild')); s.pollSeconds = 900; });
  let state = 'offline'; let guildCalls = 0;
  const service = {
    player: async () => observation(state),
    guild: async () => { guildCalls++; return { name: 'Test Guild', world: 'Quelibra', source: 'tibiadata', observedAt: null, members: [{ name: 'Test Knight', status: state }] }; },
  };
  const monitor = new Monitor(client, config, store, service, clock);
  await monitor.check(); state = 'online'; advance(121000); await monitor.check();
  assert.equal(sent.length, 1); assert.equal((sent[0].content.match(/\*\*Test Knight\*\*/g) || []).length, 1);
  advance(); await monitor.check(); assert.equal(guildCalls, 2);
  assert.match(statusText(store.get()), /Players:\*\* 1/);
});

test('tests send marked messages without changing history and enforce cooldown', async (t) => {
  const { store, sent, client, clock, advance } = setup(t);
  store.update((s) => { s.notificationsEnabled = false; s.dmEnabled = false; });
  const monitor = new Monitor(client, config, store, {}, clock);
  const before = store.get(); await monitor.testSend('message', 'channels', userId);
  assert.match(sent[0].content, /^\[TEST/); assert.deepEqual(store.get(), before);
  await assert.rejects(() => monitor.testSend('status', 'dm', userId), /30 seconds/);
  advance(); await monitor.testSend('status', 'dm', userId); assert.equal(sent.length, 2);
  assert.deepEqual(store.get(), before);
});

test('opt-out during fetch and leaving the server prevent DMs', async () => {
  let current = { guildId: config.guildId, channelIds: [], dmEnabled: true, dmUserIds: [userId] }; let sent = 0;
  const client = { guilds: { fetch: async () => ({ members: { fetch: async () => ({}) } }) }, users: { fetch: async () => { current = { ...current, dmUserIds: [] }; return { send: async () => { sent++; } }; } } };
  await sendNotification(client, current, 'test', () => current); assert.equal(sent, 0);
  current = { ...current, dmUserIds: [userId] }; client.guilds.fetch = async () => ({ members: { fetch: async () => { throw new Error('left'); } } });
  assert.equal((await sendNotification(client, current, 'test'))[0].ok, false); assert.equal(sent, 0);
});
