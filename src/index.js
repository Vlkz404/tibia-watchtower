import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { Store } from './store.js';
import { Monitor } from './monitor.js';
import { canManage, canTest, handleDashboard, renderDashboard, renderStatus, setSubscription } from './dashboard.js';
let client; let monitor;
try {
  const config = loadConfig(); const store = new Store(config.dataDir);
  client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] } });
  monitor = new Monitor(client, config, store);
  client.once(Events.ClientReady, () => { console.log('Bot connected. Dashboard and monitoring are ready.'); monitor.start(); });
  client.on(Events.Error, () => console.error('Discord connection error.'));
  client.on(Events.InteractionCreate, async (i) => {
    if (i.guildId !== config.guildId) return;
    try {
      if (await handleDashboard(i, {config,store,monitor})) return;
      if (!i.isChatInputCommand()) return;
      if (i.commandName === 'ping') await i.reply({content:'Pong! Bot online.',flags:MessageFlags.Ephemeral});
      else if (i.commandName === 'dashboard') await i.reply({...renderDashboard(store.get(),i.user.id,canManage(i,config),'home','',canTest(i,config)),flags:MessageFlags.Ephemeral});
      else if (i.commandName === 'notifications') {
        const action = i.options.getString('action',true); if (action !== 'status') setSubscription(store,i.user.id,action === 'enable');
        await i.reply({...renderDashboard(store.get(),i.user.id,canManage(i,config),'dm','',canTest(i,config)),flags:MessageFlags.Ephemeral});
      } else if (['player','status'].includes(i.commandName)) await i.reply({...renderStatus(store.get(),i.options.getString('name')),flags:MessageFlags.Ephemeral});
    } catch { console.error('Failed to respond to interaction.'); }
  });
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{monitor.stop();client.destroy();});
  await client.login(config.token);
} catch(error) { console.error(error instanceof ConfigError ? error.message : 'Startup failed. Check credentials and persistent storage.'); monitor?.stop(); client?.destroy(); process.exitCode=1; }
