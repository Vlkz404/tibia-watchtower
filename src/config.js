import { fileURLToPath } from 'node:url';
export class ConfigError extends Error {}

export function loadConfig(env = process.env) {
  const required = (key) => {
    const value = env[key]?.trim();
    if (!value) throw new ConfigError(`${key}: required.`);
    return value;
  };
  const id = (key, value) => {
    if (!/^[1-9]\d{16,19}$/.test(value)) {
      throw new ConfigError(`${key}: enter a valid Discord ID.`);
    }
    return value;
  };
  const token = required('DISCORD_TOKEN');
  if (/\s/.test(token)) throw new ConfigError('DISCORD_TOKEN: remove spaces and line breaks.');
  return {
    token,
    clientId: id('DISCORD_CLIENT_ID', required('DISCORD_CLIENT_ID')),
    guildId: id('DISCORD_GUILD_ID', required('DISCORD_GUILD_ID')),
    ownerId: id('DISCORD_OWNER_ID', required('DISCORD_OWNER_ID')),
    dataDir: env.DATA_DIR?.trim() || fileURLToPath(new URL('../data', import.meta.url)),
  };
}
