export class ConfigError extends Error {}

export function loadConfig(env = process.env) {
  const required = (key) => {
    const value = env[key]?.trim();
    if (!value) throw new ConfigError(`${key}: obrigatório.`);
    return value;
  };
  const id = (key, value) => {
    if (!/^[1-9]\d{16,19}$/.test(value)) {
      throw new ConfigError(`${key}: informe um ID Discord válido.`);
    }
    return value;
  };
  const ids = (key) => {
    const value = env[key]?.trim();
    if (!value) return [];
    return [...new Set(value.split(',').map((item) => id(key, item.trim())))];
  };
  const token = required('DISCORD_TOKEN');
  if (/\s/.test(token)) throw new ConfigError('DISCORD_TOKEN: remova espaços e quebras de linha.');
  const dmEnabled = env.DISCORD_DM_ENABLED?.trim() || 'false';
  if (!['true', 'false'].includes(dmEnabled)) {
    throw new ConfigError('DISCORD_DM_ENABLED: use true ou false.');
  }
  const config = {
    token,
    clientId: id('DISCORD_CLIENT_ID', required('DISCORD_CLIENT_ID')),
    guildId: id('DISCORD_GUILD_ID', required('DISCORD_GUILD_ID')),
    channelIds: ids('DISCORD_CHANNEL_IDS'),
    dmEnabled: dmEnabled === 'true',
    dmUserIds: ids('DISCORD_DM_USER_IDS'),
  };
  if (config.dmEnabled && !config.dmUserIds.length) {
    throw new ConfigError('DISCORD_DM_USER_IDS: configure destinatários para ativar DMs.');
  }
  return config;
}
