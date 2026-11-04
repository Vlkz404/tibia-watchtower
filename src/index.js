import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';

let client;
try {
  const config = loadConfig();
  client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot connected as ${readyClient.user.tag}. Tibia monitoring is not implemented yet.`);
  });
  client.on(Events.Error, () => console.error('Discord connection error.'));
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) return;
    try {
      if (interaction.commandName === 'ping') {
        await interaction.reply({ content: 'Pong! Bot online.', flags: MessageFlags.Ephemeral });
      } else if (interaction.commandName === 'status') {
        await interaction.reply({
          content: `Bot online.\nConfigured channels: ${config.channelIds.length}.\nDMs: ${config.dmEnabled ? 'enabled' : 'disabled'}.\nTibia monitoring: not implemented yet.`,
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
