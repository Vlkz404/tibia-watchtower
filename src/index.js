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
    console.log(`Bot conectado como ${readyClient.user.tag}. Monitoramento Tibia ainda não implementado.`);
  });
  client.on(Events.Error, () => console.error('Erro na conexão com o Discord.'));
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) return;
    try {
      if (interaction.commandName === 'ping') {
        await interaction.reply({ content: 'Pong! Bot online.', flags: MessageFlags.Ephemeral });
      } else if (interaction.commandName === 'status') {
        await interaction.reply({
          content: `Bot online.\nCanais configurados: ${config.channelIds.length}.\nDMs: ${config.dmEnabled ? 'ativadas' : 'desativadas'}.\nMonitoramento Tibia: ainda não implementado.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      console.error('Falha ao responder comando.');
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      console.log('Encerrando bot.');
      client.destroy();
    });
  }
  await client.login(config.token);
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Falha ao iniciar o bot. Confira token e conexão com o Discord.');
  client?.destroy();
  process.exitCode = 1;
}
