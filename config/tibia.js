// Search endpoints, methods, and fields are configured only here.
// The executor safely encodes {name} and {world} placeholders.
export const tibiaSearch = {
  // Use 'tibiadata' for public JSON or 'html' for the official website.
  source: 'tibiadata',
  api: {
    cacheSeconds: { character: 300, world: 60, guild: 120 },
    character: { url: 'https://api.tibiadata.com/v5/character/{name}', method: 'GET' },
    world: { url: 'https://api.tibiadata.com/v5/world/{world}', method: 'GET' },
    guild: { url: 'https://api.tibiadata.com/v5/guild/{guild}', method: 'GET' },
  },
  character: {
    url: 'https://www.tibia.com/community/',
    method: 'POST',
    query: { subtopic: 'characters' },
    form: { name: '{name}' },
  },
  world: {
    url: 'https://www.tibia.com/community/',
    method: 'GET',
    query: { subtopic: 'worlds', world: '{world}' },
  },
  guild: {
    url: 'https://www.tibia.com/community/', method: 'GET',
    query: { subtopic: 'guilds', page: 'view', GuildName: '{guild}', onlyshowonline: '0' },
  },
  timeoutMs: 15000,
  maxBytes: 3000000,
  headers: {
    'User-Agent': 'TibiaDiscordMonitor/0.2 (public character status)',
    Accept: 'application/json, text/html',
    'Accept-Language': 'en',
  },
};
