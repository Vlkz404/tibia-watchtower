import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canManage, canTest, handleDashboard, renderDashboard, setSubscription, addTargets } from '../src/dashboard.js';
import { Store, defaults, playerTarget, guildTarget } from '../src/store.js';
import { commands } from '../src/commands.js';

const config = { ownerId: '123456789012345678', guildId: '234567890123456789' };
const userId = '345678901234567890';
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tibia-ui-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new Store(directory) };
}
function interaction(customId, permissions = []) {
  const i = {
    customId, user: { id: userId }, memberPermissions: new PermissionsBitField(permissions),
    values: [], isModalSubmit: () => false, isFromMessage: () => true,
    reply: async (value) => { i.response = value; },
    deferUpdate: async () => { i.deferred = true; },
    editReply: async (value) => { i.response = value; },
    showModal: async (value) => { i.modal = value.toJSON(); },
  };
  return i;
}

test('owner and moderators can manage settings; ordinary members cannot', () => {
  assert.equal(canManage(interaction(''), config), false);
  assert.equal(canManage(interaction('', [PermissionFlagsBits.ModerateMembers]), config), true);
  assert.equal(canManage(interaction('', [PermissionFlagsBits.ManageGuild]), config), true);
  const i = interaction(''); i.user.id = config.ownerId;
  assert.equal(canManage(i, config), true);
});

test('settings persist and snapshots cannot mutate stored data', (t) => {
  const { directory, store } = setup(t);
  store.update((s) => { s.notificationsEnabled = true; });
  setSubscription(store, userId, true);
  setSubscription(store, userId, true);
  const restored = new Store(directory);
  assert.equal(restored.get().notificationsEnabled, true);
  assert.deepEqual(restored.get().subscribers, [userId]);
  const snapshot = restored.get(); snapshot.subscribers.push('invalid');
  assert.deepEqual(restored.get().subscribers, [userId]);
  assert.throws(() => store.update((s) => { s.pollSeconds = 1; }));
  assert.equal(store.get().pollSeconds, 120);
  const path = join(directory, 'settings.json');
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, '{broken');
  assert.throws(() => new Store(directory));
  assert.equal(readFileSync(path, 'utf8'), '{broken');
  writeFileSync(path, original);
});

test('all screens and commands serialize within Discord limits', () => {
  const settings = defaults();
  for (const page of ['home', 'notifications', 'channels', 'monitor', 'dm', 'emojis', 'players', 'guilds', 'methods', 'settings', 'tests']) {
    const view = renderDashboard(settings, userId, true, page, '', true);
    assert.ok(view.components.length <= 5);
    for (const row of view.components) {
      const json = row.toJSON(); assert.ok(json.components.length <= 5);
      if (json.components[0].type === 3) assert.ok(json.components[0].options.length <= 25);
    }
    for (const embed of view.embeds) assert.ok(embed.toJSON().description.length <= 4096);
  }
  assert.equal(commands.length, 5);
  assert.equal(commands.find((c) => c.name === 'notifications').options[0].required, true);
  const personal = renderDashboard(settings, userId, false, 'notifications');
  assert.equal(personal.components[0].toJSON().components[0].type, 2);
  assert.equal(personal.embeds[0].toJSON().title, 'My DMs');
});

test('forged components cannot change server settings without authorization', async (t) => {
  const { store } = setup(t);
  for (const action of ['toggle:notificationsEnabled', 'channels', 'add-submit:players', 'source:html', 'emoji-submit', 'reset-emojis', 'check']) {
    const i = interaction(`dash:${action}`);
    await handleDashboard(i, { store, config });
    assert.match(i.response.content, /Only the owner/);
    assert.deepEqual(store.get(), defaults());
  }
});

test('members can subscribe and unsubscribe only themselves', async (t) => {
  const { store } = setup(t);
  const i = interaction('dash:subscribe');
  await handleDashboard(i, { store, config });
  assert.deepEqual(store.get().subscribers, [userId]);
  i.customId = 'dash:unsubscribe';
  await handleDashboard(i, { store, config });
  assert.deepEqual(store.get().subscribers, []);
});

test('player, guild, and emoji modals serialize correctly', async (t) => {
  const { store } = setup(t);
  for (const action of ['add:players', 'add:guilds', 'emoji']) {
    const i = interaction(`dash:${action}`, [PermissionFlagsBits.ManageGuild]);
    await handleDashboard(i, { store, config });
    assert.ok(i.modal.components.length > 0);
  }
});

test('channels without permissions preserve the previous list', async (t) => {
  const { store } = setup(t);
  store.update((s) => { s.channelIds = ['456789012345678901']; });
  const i = interaction('dash:channels', [PermissionFlagsBits.ManageGuild]);
  i.values = ['567890123456789012'];
  i.client = { user: {} };
  i.guild = { channels: { fetch: async () => ({ guildId: config.guildId, type: ChannelType.GuildText, permissionsFor: () => new PermissionsBitField() }) } };
  await handleDashboard(i, { store, config });
  assert.deepEqual(store.get().channelIds, ['456789012345678901']);
});

test('delivery tests are hidden from moderators and reject forged clicks', async (t) => {
  const { store } = setup(t); let called = 0;
  const moderator = interaction('dash:test:message:channels', [PermissionFlagsBits.ManageGuild]);
  assert.equal(canManage(moderator, config), true); assert.equal(canTest(moderator, config), false);
  await handleDashboard(moderator, { store, config, monitor: { testSend: async () => { called++; } } });
  assert.equal(called, 0); assert.match(moderator.response.content, /Administrator/);
  const settingsView = renderDashboard(store.get(), userId, true, 'settings', '', false);
  assert.equal(JSON.stringify(settingsView.components.map((r) => r.toJSON())).includes('view:tests'), false);
  const admin = interaction('dash:test:message:dm', [PermissionFlagsBits.Administrator]);
  await handleDashboard(admin, { store, config, monitor: { testSend: async (...args) => { assert.deepEqual(args, ['message', 'dm', userId]); called++; return 'ok'; } } });
  assert.equal(called, 1);
});

test('button navigation, HTML-only interval, footer, and large lists serialize correctly', (t) => {
  const { store } = setup(t); addTargets(store, 'players', 'Test Knight\nOther Knight'); addTargets(store, 'guilds', 'Test Guild\nOther Guild');
  store.update((s) => { s.guilds[0].members = Array.from({ length: 412 }, (_, n) => ({ name: `Member ${n}`, status: n % 2 ? 'online' : 'offline', level: n + 1, vocation: 'Elder Druid' })); });
  const settings = store.get();
  const api = renderDashboard(settings, userId, true, 'monitor');
  const html = renderDashboard({ ...settings, source: 'html' }, userId, true, 'monitor');
  assert.equal(JSON.stringify(api.components.map((r) => r.toJSON())).includes('dash:interval'), false);
  assert.equal(JSON.stringify(html.components.map((r) => r.toJSON())).includes('dash:interval'), true);
  for (const section of ['home', 'players', 'guilds', `player:${settings.players[0].id}`, `guild:${settings.guilds[0].id}:20:all`, `guild:${settings.guilds[0].id}:0:online`]) {
    const view = renderDashboard(settings, userId, true, section);
    assert.equal(view.embeds[0].toJSON().footer.text, 'Tibia Watchtower');
    assert.ok(view.components.length <= 5); assert.ok(view.embeds[0].toJSON().description.length < 4096);
    assert.ok(view.components[0].toJSON().components.every((c) => c.type === 2));
    for (const r of view.components) r.toJSON();
  }
});

test('multiple targets are deduplicated and limits reject the complete update', (t) => {
  const { store } = setup(t);
  addTargets(store, 'players', 'Test Knight\ntest knight\nOther Knight'); assert.equal(store.get().players.length, 2);
  const before = store.get();
  assert.throws(() => addTargets(store, 'players', Array.from({ length: 26 }, (_, n) => `Knight ${String.fromCharCode(65 + n)}`).join('\n')), /Limit/);
  assert.deepEqual(store.get(), before);
});

test('v1 migration preserves player history, preferences, and backup', (t) => {
  const { directory } = setup(t);
  const old = { version: 1, player: 'Test Knight', world: 'Quelibra', guild: 'Quelibra Pune', monitor: { status: 'offline', history: [{ status: 'offline', at: '2026-11-04T10:00:00Z' }], lastLogin: '2026-11-03T10:00:00Z' }, channelIds: ['456789012345678901'], notificationsEnabled: true };
  writeFileSync(join(directory, 'settings.json'), JSON.stringify(old));
  const migrated = new Store(directory).get();
  assert.equal(migrated.version, 2); assert.equal(migrated.players[0].name, old.player);
  assert.deepEqual(migrated.players[0].monitor.history, old.monitor.history);
  assert.deepEqual(migrated.channelIds, old.channelIds); assert.equal(migrated.notificationsEnabled, true);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'settings.v1.backup.json'))), old);
});

test('an HTML interval modal is rejected after switching to TibiaData', async (t) => {
  const { store } = setup(t); const i = interaction('dash:interval-submit', [PermissionFlagsBits.ManageGuild]);
  i.fields = { getTextInputValue: () => '60' };
  await handleDashboard(i, { config, store }); assert.equal(store.get().pollSeconds, 120);
  assert.match(i.response.embeds[0].toJSON().fields.find((f) => f.name === 'Result').value, /no manual adjustment/);
});
