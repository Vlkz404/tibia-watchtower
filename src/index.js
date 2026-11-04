import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { chmodSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config.js';
import { Store } from './store.js';
import { Monitor } from './monitor.js';
import { acquireInstance, InstanceError } from './instance-lock.js';
import { InteractionGuard, configureOutbound } from './security.js';
import { canManage, canTest, handleDashboard, renderDashboard, renderStatus, setSubscription } from './dashboard.js';

let client; let monitor; let lease; let closing = false; let shutdownTask;
const guard = new InteractionGuard();
async function shutdown(code = 0) {
  if (code) process.exitCode = code;
  if (shutdownTask) return shutdownTask;
  closing = true; monitor?.stop(); client?.destroy();
  shutdownTask = (async () => { await lease?.release(); })();
  return shutdownTask;
}
// Fixed messages prevent unhandled errors from exposing payloads, headers, or credentials.
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, () => {
  console.error('Internal error; shutting down safely.');
  void shutdown(1);
  setTimeout(() => process.exit(1), 1000).unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { console.log('Shutting down bot.'); void shutdown(); });

try {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envPath) && (statSync(envPath).mode & 0o077)) chmodSync(envPath, 0o600);
  const config = loadConfig();
  delete process.env.DISCORD_TOKEN;
  lease = await acquireInstance({ dataDir: config.dataDir, clientId: config.clientId, onCompromised: () => {
    console.error('Instance lock lost; queries, deliveries, and writes blocked.'); void shutdown(1);
  } });
  if (closing) { await lease.release(); throw new InstanceError('Startup cancelled.'); }
  const store = new Store(config.dataDir, { canWrite: () => lease.valid && !closing });
  client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] }, rest: { timeout: 15000, retries: 2 } });
  configureOutbound(client, () => lease.valid && !closing);
  monitor = new Monitor(client, config, store);
  client.once(Events.ClientReady, (readyClient) => {
    if (readyClient.user.id !== config.clientId) {
      console.error('Application ID and token identity do not match. Startup blocked.'); void shutdown(1); return;
    }
    if (closing || !lease.valid) return;
    console.log('Bot connected. Protections, dashboard, and monitoring are ready.'); monitor.start();
  });
  client.on(Events.Error, () => console.error('Discord connection error.'));
  client.on(Events.InteractionCreate, async (i) => {
    if (closing || !lease.valid || i.guildId !== config.guildId || (!i.isChatInputCommand() && !i.customId?.startsWith('dash:'))) return;
    const ticket = guard.enter(i.user.id, i.customId === 'dash:panic' && canTest(i, config));
    if (!ticket.allowed) {
      if (ticket.notify) try { await i.reply({ content: 'Too many consecutive actions. Wait a few seconds.', flags: MessageFlags.Ephemeral }); } catch { /* expired interaction */ }
      return;
    }
    try {
      if (await handleDashboard(i, { config, store, monitor })) return;
      if (!i.isChatInputCommand()) return;
      if (i.commandName === 'ping') await i.reply({ content: 'Pong! Bot online.', flags: MessageFlags.Ephemeral });
      else if (i.commandName === 'dashboard') await i.reply({ ...renderDashboard(store.get(), i.user.id, canManage(i, config), 'home', '', canTest(i, config)), flags: MessageFlags.Ephemeral });
      else if (i.commandName === 'notifications') {
        const action = i.options.getString('action', true);
        if (action !== 'status') setSubscription(store, i.user.id, action === 'enable');
        await i.reply({ ...renderDashboard(store.get(), i.user.id, canManage(i, config), 'dm', '', canTest(i, config)), flags: MessageFlags.Ephemeral });
      } else if (['status', 'player'].includes(i.commandName)) await i.reply({ ...renderStatus(store.get(), i.options.getString('name')), flags: MessageFlags.Ephemeral });
    } catch {
      console.error('Failed to respond to interaction.');
      try {
        const payload = { content: 'Could not complete the action. Open /dashboard again.', flags: MessageFlags.Ephemeral };
        if (i.deferred || i.replied) await i.followUp(payload); else await i.reply(payload);
      } catch { /* handle the error without exposing the raw response */ }
    } finally { ticket.release(); }
  });
  await client.login(config.token);
} catch (error) {
  console.error(error instanceof ConfigError || error instanceof InstanceError ? error.message : 'Startup blocked. Check environment configuration, storage, and data integrity.');
  await shutdown(1);
}
