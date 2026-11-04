import { ConfigError, loadConfig } from './config.js';

try {
  loadConfig();
  console.log('Configuration is valid. Credentials have not been verified with Discord.');
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : 'Failed to validate configuration.');
  process.exitCode = 1;
}
