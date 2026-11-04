import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InteractionGuard, containsSecret, configureOutbound, reserveSend } from '../src/security.js';
import { loadConfig } from '../src/config.js';
import { acquireInstance, LOCK_STALE_MS } from '../src/instance-lock.js';
import { Store } from '../src/store.js';
import { sendNotification } from '../src/notifications.js';
import { handleDashboard } from '../src/dashboard.js';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

function directory(t) { const path = mkdtempSync(join(tmpdir(), 'tibia-security-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
const owner = '123456789012345678'; const guildId = '234567890123456789';

test('configuration omits tokens and blocks credential delivery and persistence', async (t) => {
  const secret = ['unique', 'fake', 'secret', 'for', 'testing'].join('-');
  const config = loadConfig({ DISCORD_TOKEN: secret, DISCORD_CLIENT_ID: owner, DISCORD_OWNER_ID: owner, DISCORD_GUILD_ID: guildId });
  assert.equal(config.token, secret); assert.equal(JSON.stringify(config).includes(secret), false); assert.equal(inspect(config).includes(secret), false);
  assert.equal(containsSecret(`prefix ${secret}`), true);
  assert.equal(containsSecret(['A'.repeat(24), 'B'.repeat(6), 'C'.repeat(38)].join('.')), true);
  const store = new Store(directory(t)); const before = store.get();
  assert.throws(() => store.update((s) => { s.testMessage = secret; }), (e) => { assert.equal(e.message.includes(secret), false); return true; });
  assert.deepEqual(store.get(), before);
  await assert.rejects(() => sendNotification({}, { channelIds: [] }, secret), /credential/);
});

test('revoked write access prevents changes after shutdown or lock loss', (t) => {
  let allowed = true; const store = new Store(directory(t), { canWrite: () => allowed });
  allowed = false; assert.throws(() => store.update((s) => { s.dmEnabled = true; }), /valid lock/);
  assert.equal(store.get().dmEnabled, false);
});

test('locks block the same bot in another directory and other bots in the same volume', async (t) => {
  const root = directory(t); const hostLockDir = join(root, 'host');
  const first = await acquireInstance({ dataDir: join(root, 'one'), hostLockDir, clientId: owner });
  try {
    await assert.rejects(() => acquireInstance({ dataDir: join(root, 'two'), hostLockDir, clientId: owner }), /instance is already active/);
    await assert.rejects(() => acquireInstance({ dataDir: join(root, 'one'), hostLockDir, clientId: guildId }), /instance is already active/);
    assert.equal(first.valid, true);
  } finally { await first.release(); }
  const next = await acquireInstance({ dataDir: join(root, 'one'), hostLockDir, clientId: owner });
  assert.equal(next.valid, true); await next.release(); await next.release(); assert.equal(next.valid, false);
});

test('abandoned locks are recovered only after the stale window', async (t) => {
  const root = directory(t); const dataDir = join(root, 'data'); const hostLockDir = join(root, 'host');
  const hostLock = join(hostLockDir, owner, '.instance.lock');
  const dataLock = join(dataDir, '.instance.lock');
  // Abrupt shutdown fixture: lock directories exist without a process renewing them.
  mkdirSync(hostLock, { recursive: true }); mkdirSync(dataLock, { recursive: true });
  await assert.rejects(() => acquireInstance({ dataDir, hostLockDir, clientId: owner }), /30 seconds/);
  const past = new Date(Date.now() - LOCK_STALE_MS - 3000);
  for (const path of [hostLock, dataLock]) utimesSync(path, past, past);
  const recovered = await acquireInstance({ dataDir, hostLockDir, clientId: owner });
  assert.equal(recovered.valid, true); await recovered.release();
});

test('interaction limits preserve authorized emergency access', () => {
  let now = 1000; const guard = new InteractionGuard(() => now);
  const pending = guard.enter(owner); assert.equal(guard.enter(owner).allowed, false); pending.release();
  for (let n = 0; n < 4; n++) { const ticket = guard.enter(owner); assert.equal(ticket.allowed, true); ticket.release(); }
  assert.equal(guard.enter(owner).allowed, false);
  assert.equal(guard.enter(owner, true).allowed, true);
  now += 10001; const next = guard.enter(owner); assert.equal(next.allowed, true); next.release();
  const concurrent = Array.from({ length: 20 }, (_, n) => guard.enter(`user${n}`));
  assert.equal(guard.enter('extra').allowed, false); concurrent.forEach((ticket) => ticket.release?.());
});

test('delivery limits and instance checks apply before Discord sends', async () => {
  const client = {}; let enabled = true; configureOutbound(client, () => enabled);
  assert.equal(reserveSend(client, 'dm', owner, 1000), true); assert.equal(reserveSend(client, 'dm', owner, 1000), true);
  assert.equal(reserveSend(client, 'dm', owner, 1000), false);
  assert.equal(reserveSend(client, 'dm', owner, 61001), true);
  enabled = false; assert.equal(reserveSend(client, 'channel', guildId, 61001), false);
  const global = {}; configureOutbound(global, () => true);
  for (let n = 0; n < 120; n++) assert.equal(reserveSend(global, 'channel', String(n), 1000), true);
  assert.equal(reserveSend(global, 'channel', 'overflow', 1000), false);
  let sent = 0;
  const api = { channels: { fetch: async () => ({ guildId, isSendable: () => true, send: async () => { sent++; } }) } };
  configureOutbound(api, () => false);
  const results = await sendNotification(api, { guildId, channelIds: [owner], dmEnabled: false }, 'test');
  assert.equal(sent, 0); assert.equal(results[0].ok, false);
});

test('emergency stop is owner/admin only and preserves data while disabling outputs', async (t) => {
  const store = new Store(directory(t)); store.update((s) => { s.monitorEnabled = true; s.notificationsEnabled = true; s.dmEnabled = true; });
  const config = { ownerId: owner, guildId };
  const make = (permissions) => {
    const i = { customId: 'dash:panic', user: { id: guildId }, memberPermissions: new PermissionsBitField(permissions), isModalSubmit: () => false,
      deferUpdate: async () => {}, reply: async (p) => { i.response = p; }, editReply: async (p) => { i.response = p; } };
    return i;
  };
  await handleDashboard(make([PermissionFlagsBits.ManageGuild]), { config, store }); assert.equal(store.get().notificationsEnabled, true);
  const admin = make([PermissionFlagsBits.Administrator]); await handleDashboard(admin, { config, store });
  const s = store.get(); for (const key of ['monitorEnabled', 'notificationsEnabled', 'channelEnabled', 'dmEnabled']) assert.equal(s[key], false);
  assert.equal(s.monitorRevision, 1); assert.equal(admin.response.embeds[0].toJSON().title, 'Security');
});
