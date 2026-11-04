import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { sendNotification } from '../src/notifications.js';

const env = {
  DISCORD_TOKEN: 'test-secret-never-log',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  DISCORD_OWNER_ID: '456789012345678901',
};

test('validates required fields without exposing the token', () => {
  assert.throws(() => loadConfig({ ...env, DISCORD_CLIENT_ID: env.DISCORD_TOKEN }), (error) => {
    assert.equal(error.message.includes(env.DISCORD_TOKEN), false);
    return true;
  });
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => loadConfig({ ...env, DISCORD_OWNER_ID: '' }), /DISCORD_OWNER_ID/);
});

test('legacy environment preferences are not treated as consent', () => {
  const config = loadConfig({ ...env, DISCORD_CHANNEL_IDS: '345678901234567890,345678901234567890' });
  assert.equal(config.dmEnabled, undefined);
  assert.equal(config.channelIds, undefined);
  assert.equal(config.ownerId, env.DISCORD_OWNER_ID);
});

test('deliveries isolate failures and block mentions and foreign channels', async () => {
  const sent = [];
  const config = { guildId: env.DISCORD_GUILD_ID, channelIds: ['blocked', 'foreign', 'valid'], dmEnabled: true, dmUserIds: ['closed', 'open'] };
  const client = {
    guilds: { fetch: async () => ({ members: { fetch: async () => ({}) } }) },
    channels: { fetch: async (id) => {
      if (id === 'blocked') throw new Error('Forbidden');
      return { guildId: id === 'foreign' ? 'another' : config.guildId, isSendable: () => true, send: async (payload) => sent.push(payload) };
    } },
    users: { fetch: async (id) => ({ send: async (payload) => {
      if (id === 'closed') throw new Error('DM closed');
      sent.push(payload);
    } }) },
  };
  const results = await sendNotification(client, config, '@everyone teste');
  assert.deepEqual(results.map((item) => item.ok), [false, false, true, false, true]);
  assert.equal(sent.length, 2);
  for (const payload of sent) assert.deepEqual(payload.allowedMentions, { parse: [] });
  config.dmEnabled = false;
  config.channelIds = [];
  assert.deepEqual(await sendNotification(client, config, 'teste'), []);
  await assert.rejects(() => sendNotification(client, config, 'x'.repeat(2001)));
});
