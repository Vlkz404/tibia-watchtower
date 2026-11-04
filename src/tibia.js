import { load } from 'cheerio';
import { tibiaSearch } from '../config/tibia.js';

import { TibiaError, normalize, sameName } from './tibia-common.js';
import { requestBytes } from './search-request.js';
import { lookupApiPlayer } from './tibiadata.js';
export { TibiaError, normalize, sameName } from './tibia-common.js';
export { buildRequest } from './search-request.js';

export function characterName(input) {
  let name = input.trim();
  if (/^https?:/i.test(name)) {
    let url;
    try { url = new URL(name); } catch { throw new TibiaError('Invalid character URL.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.tibia.com' || url.port || url.username || url.password ||
        url.pathname !== '/community/' || url.searchParams.get('subtopic') !== 'characters') {
      throw new TibiaError('Use the official URL https://www.tibia.com/community/?subtopic=characters&name=Name.');
    }
    name = url.searchParams.get('name') || '';
  }
  name = normalize(name);
  if (!/^[a-zA-Z][a-zA-Z '\-]{1,28}$/.test(name)) throw new TibiaError('Enter a valid name (2 to 29 characters) or its official URL.');
  return name;
}

export async function requestPage(spec, values, fetcher = fetch, config = tibiaSearch) {
  const { bytes, contentType } = await requestBytes(spec, values, fetcher, config);
  if (!contentType.includes('text/html')) throw new TibiaError('Tibia did not return valid HTML.');
  const charset = `${contentType} ${bytes.subarray(0, 2000).toString('ascii')}`;
  const html = new TextDecoder(/(?:iso-8859-1|windows-1252)/i.test(charset) ? 'windows-1252' : 'utf-8').decode(bytes);
  if (/Just a moment|cf-chl-|challenge-platform|verify you are human/i.test(html)) throw new TibiaError('Tibia blocked the automated query. Previous status preserved.');
  return html;
}

function field($, label) {
  const row = $('tr').toArray().find((row) => normalize($(row).children('td').first().text()) === label);
  return row ? $(row).children('td').eq(1) : null;
}

export function parseLogin(value) {
  if (!value || /never/i.test(value)) return null;
  const match = normalize(value).match(/^([A-Z][a-z]{2}) (\d{1,2}) (\d{4}), (\d{2}):(\d{2}):(\d{2}) (CET|CEST)$/);
  if (!match) throw new TibiaError('Unrecognized Last Login format.');
  const [, month, day, year, hour, minute, second, zone] = match;
  const index = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
  if (index < 0) throw new TibiaError('Invalid Last Login date.');
  return new Date(Date.UTC(+year, index, +day, +hour - (zone === 'CEST' ? 2 : 1), +minute, +second)).toISOString();
}

export function parseCharacter(html, expected) {
  const $ = load(html);
  if (!$('.CaptionContainer .Text').toArray().some((e) => normalize($(e).text()) === 'Character Information')) throw new TibiaError('Character page is missing or its format has changed.');
  const name = normalize(field($, 'Name:')?.text() || '');
  const world = normalize(field($, 'World:')?.text() || '');
  const membership = field($, 'Guild Membership:');
  const guild = normalize(membership?.find('a').first().text() || '');
  const login = field($, 'Last Login:');
  if (!sameName(name, expected) || !world) throw new TibiaError('Missing or unexpected character name or world.');
  return { name, world, guild, lastLogin: parseLogin(login?.text() || '') };
}

export function parseWorld(html, world) {
  const $ = load(html);
  const selected = $('select[name="world"] option[selected]').text();
  const heading = $('h1, h2, .BoxContent b').toArray().some((e) => sameName($(e).text(), world));
  if (!sameName(selected || '', world) && !heading) throw new TibiaError('The world returned by Tibia could not be verified.');
  const status = normalize(field($, 'Status:')?.text() || '');
  const countText = normalize(field($, 'Players Online:')?.text() || '');
  if (status !== 'Online' || !/^\d[\d,.]*$/.test(countText)) throw new TibiaError('World unavailable or player count missing.');
  const container = $('.TableContainer').toArray().find((e) => /^Players Online\b/.test(normalize($(e).find('.CaptionContainer .Text').first().text())));
  if (!container) throw new TibiaError('Online player list is missing.');
  const players = [];
  $(container).find('tr').each((_, row) => {
    const cells = $(row).children('td');
    if (cells.length !== 3 || !/^\d+$/.test(normalize(cells.eq(1).text()))) return;
    const link = cells.first().find('a[href*="subtopic=characters"]');
    if (link.length !== 1) return;
    players.push(normalize(link.text()));
  });
  const count = Number(countText.replace(/[,.]/g, ''));
  if (new Set(players.map((p) => p.toLowerCase())).size !== count) throw new TibiaError('Incomplete online list; previous status preserved.');
  return players;
}

export async function lookupHtmlPlayer(name, settings, fetcher = fetch) {
  const character = parseCharacter(await requestPage(tibiaSearch.character, { name }, fetcher), name);
  if (settings.world && !sameName(character.world, settings.world)) throw new TibiaError('The character does not belong to Quelibra.');
  if (settings.guild && !sameName(character.guild, settings.guild)) throw new TibiaError('The character does not belong to the Quelibra Pune guild.');
  const players = parseWorld(await requestPage(tibiaSearch.world, { world: character.world }, fetcher), character.world);
  return { ...character, status: players.some((player) => sameName(player, character.name)) ? 'online' : 'offline', source: 'html', observedAt: null };
}

export async function lookupPlayer(name, settings, fetcher = fetch) {
  const source = settings.source || tibiaSearch.source;
  if (source === 'tibiadata') return lookupApiPlayer(name, settings, fetcher);
  if (source === 'html') return lookupHtmlPlayer(name, settings, fetcher);
  throw new TibiaError('Invalid search source in config/tibia.js.');
}

export function guildName(input) {
  let name = input.trim();
  if (/^https?:/i.test(name)) {
    let url;
    try { url = new URL(name); } catch { throw new TibiaError('Invalid guild URL.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.tibia.com' || url.port || url.username || url.password || url.pathname !== '/community/' || url.searchParams.get('subtopic') !== 'guilds') throw new TibiaError('Use the guild name or its official URL.');
    name = url.searchParams.get('GuildName') || '';
  }
  name = normalize(name);
  if (!/^[\p{L}\p{N} '\-]{2,80}$/u.test(name)) throw new TibiaError('Invalid guild name (2 to 80 characters).');
  return name;
}

export function parseHtmlGuild(html, expected) {
  const $ = load(html);
  const name = normalize($('.BoxContent h1,.BoxContent h2').first().text());
  const content = normalize($('.BoxContent').text());
  const world = content.match(/guild was founded on (\w+) on /i)?.[1];
  const container = $('.TableContainer').toArray().find((e) => normalize($(e).find('.CaptionContainer .Text').first().text()) === 'Guild Members');
  if (!sameName(name, expected) || !world || !container || !/currently active/i.test(content)) throw new TibiaError('Guild missing, inactive, or HTML format changed.');
  const header = $(container).find('tr').toArray().find((r) => $(r).children('td').last().text().trim() === 'Status');
  if (!header) throw new TibiaError('Guild status column is missing.');
  const members = [];
  $(container).find('tr').each((_, row) => {
    const link = $(row).find('a[href*="subtopic=characters"]');
    const cells = $(row).children('td');
    if (!link.length || cells.length > 6 || cells.length < 5) return;
    const index = cells.toArray().findIndex((c) => $(c).find('a[href*="subtopic=characters"]').length === 1);
    if (index < 0) return;
    const suffix = cells.slice(index + 1);
    const status = normalize(suffix.eq(3).text()).toLowerCase();
    if (suffix.length !== 4 || !/^\d+$/.test(normalize(suffix.eq(1).text())) || !['', 'online', 'offline'].includes(status)) throw new TibiaError('Incomplete member row or unknown status.');
    members.push({ name: normalize(link.text()), status: status || 'offline', level: Number(suffix.eq(1).text()), vocation: normalize(suffix.eq(0).text()), rank: index ? normalize(cells.first().text()) : '' });
  });
  if (!members.length || new Set(members.map((m) => m.name.toLowerCase())).size !== members.length) throw new TibiaError('Member list is missing or duplicated.');
  return { name, world, members, source: 'html', observedAt: null };
}
export async function lookupHtmlGuild(name, fetcher = fetch) {
  return parseHtmlGuild(await requestPage(tibiaSearch.guild, { guild: name }, fetcher), name);
}
