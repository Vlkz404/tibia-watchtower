import { tibiaSearch } from '../config/tibia.js';
import { TibiaError, normalize, sameName } from './tibia-common.js';
import { requestBytes } from './search-request.js';

export function apiTimestamp(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TibiaError(`${label}: invalid date in API response.`);
  }
  return new Date(value).toISOString();
}

export async function requestJson(spec, values, fetcher = fetch, config = tibiaSearch) {
  const { bytes, contentType } = await requestBytes(spec, values, fetcher, config);
  if (!contentType.includes('application/json')) throw new TibiaError('TibiaData did not return valid JSON.');
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new TibiaError('Incomplete or invalid TibiaData JSON.'); }
  if (data?.information?.status?.http_code !== 200 || data?.information?.api?.version !== 5) {
    throw new TibiaError('TibiaData reported an error or unexpected API version.');
  }
  return data;
}

export function parseApiCharacter(data, expected) {
  const character = data?.character?.character;
  if (!character || typeof character.name !== 'string' || !sameName(character.name, expected) || typeof character.world !== 'string' || !character.world.trim()) {
    throw new TibiaError('TibiaData character record is missing, invalid, or belongs to another character.');
  }
  const guild = character.guild?.name;
  if (guild !== undefined && typeof guild !== 'string') throw new TibiaError('Invalid guild in TibiaData response.');
  return {
    name: normalize(character.name), world: normalize(character.world), guild: normalize(guild || ''),
    lastLogin: apiTimestamp(character.last_login, 'Last Login'),
  };
}

export function parseApiWorld(data, expected) {
  const world = data?.world;
  if (!world || typeof world.name !== 'string' || !sameName(world.name, expected)) throw new TibiaError('The world returned by TibiaData does not match the requested world.');
  if (world.status !== 'online') throw new TibiaError('World unavailable in TibiaData; this does not determine an individual player status.');
  if (!Number.isInteger(world.players_online) || world.players_online < 0 || !Array.isArray(world.online_players)) throw new TibiaError('TibiaData online list is missing or invalid.');
  if (world.online_players.some((player) => typeof player?.name !== 'string' || !player.name.trim())) throw new TibiaError('Online list contains invalid names.');
  const players = world.online_players.map((player) => normalize(player.name));
  if (players.length !== world.players_online || new Set(players.map((name) => name.toLowerCase())).size !== players.length) {
    throw new TibiaError('Incomplete or duplicated TibiaData online list; previous status preserved.');
  }
  const observedAt = apiTimestamp(data.information?.timestamp, 'Sample time');
  if (!observedAt) throw new TibiaError('TibiaData sample is missing its update timestamp.');
  // Cache or maintenance failures must not turn old samples into current alerts.
  const age = Date.now() - Date.parse(observedAt);
  if (age > 10 * 60 * 1000 || age < -5 * 60 * 1000) throw new TibiaError('TibiaData sample is outdated or the local clock is incorrect.');
  return { players, observedAt };
}

export async function lookupApiPlayer(name, settings, fetcher = fetch) {
  const character = parseApiCharacter(await requestJson(tibiaSearch.api.character, { name }, fetcher), name);
  if (settings.world && !sameName(character.world, settings.world)) throw new TibiaError('The character does not belong to Quelibra.');
  if (settings.guild && !sameName(character.guild, settings.guild)) throw new TibiaError('The character does not belong to the Quelibra Pune guild.');
  const world = parseApiWorld(await requestJson(tibiaSearch.api.world, { world: character.world }, fetcher), character.world);
  return {
    ...character, status: world.players.some((player) => sameName(player, character.name)) ? 'online' : 'offline',
    source: 'tibiadata', observedAt: world.observedAt,
  };
}

export function parseApiGuild(data, expected) {
  const g = data?.guild;
  if (!g || typeof g.name !== 'string' || !sameName(g.name, expected) || typeof g.world !== 'string' || !g.world) throw new TibiaError('Guild record is missing or unexpected.');
  if (g.active !== true || !Array.isArray(g.members) || !Number.isInteger(g.members_total) || g.members.length !== g.members_total) throw new TibiaError('Inactive guild or incomplete member list.');
  if (g.members.some((m) => typeof m.name !== 'string' || !m.name.trim() || !['online', 'offline'].includes(m.status))) throw new TibiaError('Member status is missing or invalid in TibiaData.');
  if (new Set(g.members.map((m) => m.name.toLowerCase())).size !== g.members.length || g.members.filter((m) => m.status === 'online').length !== g.players_online) throw new TibiaError('Inconsistent member count.');
  const observedAt = apiTimestamp(data.information?.timestamp, 'Sample time');
  if (!observedAt || Date.now() - Date.parse(observedAt) > 600000 || Date.parse(observedAt) - Date.now() > 300000) throw new TibiaError('Guild sample has no valid timestamp or is outdated.');
  return { name: g.name, world: g.world, members: g.members.map((m) => ({ name: normalize(m.name), status: m.status, level: m.level ?? null, vocation: m.vocation || '', rank: m.rank || '' })), source: 'tibiadata', observedAt };
}
