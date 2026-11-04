import { fileURLToPath } from 'node:url';
import { registerSecret } from './security.js';
export class ConfigError extends Error {}
export function loadConfig(env = process.env) {
  const required = (key) => {
    const value = env[key]?.trim();
    if (!value) throw new ConfigError(`${key}: required.`);
    return value;
  };
  const id = (key) => {
    const value = required(key);
    if (!/^[1-9]\d{16,19}$/.test(value)) throw new ConfigError(`${key}: enter a valid Discord ID.`);
    return value;
  };
  const token = required('DISCORD_TOKEN');
  registerSecret(token);
  if (/\s/.test(token)) throw new ConfigError('DISCORD_TOKEN: remove spaces and line breaks.');
  const config = {
    clientId: id('DISCORD_CLIENT_ID'), guildId: id('DISCORD_GUILD_ID'), ownerId: id('DISCORD_OWNER_ID'),
    dataDir: env.DATA_DIR?.trim() || fileURLToPath(new URL('../data', import.meta.url)),
  };
  Object.defineProperty(config, 'token', { value: token, enumerable: false });
  return config;
}
