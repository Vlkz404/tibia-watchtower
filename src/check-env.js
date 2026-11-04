import { ConfigError, loadConfig } from './config.js';

try {
  loadConfig();
  console.log('Configuração válida. Credenciais não foram verificadas no Discord.');
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Falha ao validar configuração.');
  process.exitCode = 1;
}
