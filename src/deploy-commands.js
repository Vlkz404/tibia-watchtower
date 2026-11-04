import { REST, Routes } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { commands } from './commands.js';

try {
  const config = loadConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Comandos /ping e /status registrados no servidor configurado.');
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Falha ao registrar comandos. Confira credenciais, servidor e instalação do bot.');
  process.exitCode = 1;
}
