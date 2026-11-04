import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { sendNotification } from '../src/notifications.js';

const env = {
  DISCORD_TOKEN: 'test-secret-never-log',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
};

test('validates required fields without exposing the token', () => {
  assert.throws(() => loadConfig({ ...env, DISCORD_CLIENT_ID: env.DISCORD_TOKEN }), (error) => {
    assert.equal(error.message.includes(env.DISCORD_TOKEN), false);
    return true;
  });
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => loadConfig({ ...env, DISCORD_DM_ENABLED: 'yes' }), /true or false/);
  assert.throws(() => loadConfig({ ...env, DISCORD_DM_ENABLED: 'true' }), /recipients/);
});

test('DMs are disabled by default and IDs remain deduplicated strings', () => {
  const config = loadConfig({ ...env, DISCORD_CHANNEL_IDS: '345678901234567890,345678901234567890' });
  assert.equal(config.dmEnabled, false);
  assert.deepEqual(config.channelIds, ['345678901234567890']);
});

test('deliveries isolate failures and block mentions and channels from other servers', async () => {
  const sent = [];
  const config = { guildId: env.DISCORD_GUILD_ID, channelIds: ['blocked', 'foreign', 'valid'], dmEnabled: true, dmUserIds: ['closed', 'open'] };
  const client = {
    channels: { fetch: async (id) => {
      if (id === 'blocked') throw new Error('Forbidden');
      return { guildId: id === 'foreign' ? 'another' : config.guildId, isSendable: () => true, send: async (payload) => sent.push(payload) };
    } },
    users: { fetch: async (id) => ({ send: async (payload) => {
      if (id === 'closed') throw new Error('DM closed');
      sent.push(payload);
    } }) },
  };
  const results = await sendNotification(client, config, '@everyone test');
  assert.deepEqual(results.map((item) => item.ok), [false, false, true, false, true]);
  assert.equal(sent.length, 2);
  for (const payload of sent) assert.deepEqual(payload.allowedMentions, { parse: [] });
  config.dmEnabled = false;
  config.channelIds = [];
  assert.deepEqual(await sendNotification(client, config, 'test'), []);
  await assert.rejects(() => sendNotification(client, config, 'x'.repeat(2001)));
});
