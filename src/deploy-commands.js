import { REST, Routes } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { commands } from './commands.js';

try {
  const config = loadConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Commands /ping and /status registered in the configured server.');
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Failed to register commands. Check credentials, server configuration, and bot installation.');
  process.exitCode = 1;
}
