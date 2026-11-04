import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { Store } from './store.js';
import { canManage, handleDashboard, renderDashboard, setSubscription } from './dashboard.js';

let client;
try {
  const config = loadConfig();
  const store = new Store(config.dataDir);
  client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot connected as ${readyClient.user.tag}. Tibia monitoring is not implemented yet.`);
  });
  client.on(Events.Error, () => console.error('Discord connection error.'));
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.guildId !== config.guildId) return;
    try {
      if (await handleDashboard(interaction, { config, store })) return;
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === 'ping') {
        await interaction.reply({ content: 'Pong! Bot online.', flags: MessageFlags.Ephemeral });
      } else if (interaction.commandName === 'dashboard') {
        await interaction.reply({ ...renderDashboard(store.get(), interaction.user.id, canManage(interaction, config)), flags: MessageFlags.Ephemeral });
      } else if (interaction.commandName === 'notifications') {
        const action = interaction.options.getString('action', true);
        if (action !== 'status') setSubscription(store, interaction.user.id, action === 'enable');
        await interaction.reply({ ...renderDashboard(store.get(), interaction.user.id, canManage(interaction, config), 'dm'), flags: MessageFlags.Ephemeral });
      } else if (interaction.commandName === 'status') {
        await interaction.reply({
          content: `Bot online.\nConfigured channels: ${store.get().channelIds.length}.\nDMs: ${store.get().dmEnabled ? 'enabled' : 'disabled'}.\nTibia monitoring: not implemented yet.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      console.error('Failed to respond to command.');
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      console.log('Shutting down bot.');
      client.destroy();
    });
  }
  await client.login(config.token);
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Failed to start the bot. Check the token and Discord connection.');
  client?.destroy();
  process.exitCode = 1;
}
