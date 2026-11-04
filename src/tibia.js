import { lookupApiPlayer } from './tibiadata.js';
import { load } from 'cheerio';
import { tibiaSearch } from '../config/tibia.js';

import { TibiaError, normalize, sameName } from './tibia-common.js';
import { requestBytes } from './search-request.js';
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
  if ((settings.source || tibiaSearch.source) === 'tibiadata') return lookupApiPlayer(name, settings, fetcher);
  return lookupHtmlPlayer(name, settings, fetcher);
}
