import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../src/search-service.js';
import { parseApiGuild } from '../src/tibiadata.js';
import { parseHtmlGuild, guildName } from '../src/tibia.js';

const info = () => ({ api: { version: 5 }, status: { http_code: 200 }, timestamp: new Date().toISOString() });
const guild = () => ({ information: info(), guild: { name: 'Test Guild', world: 'Antica', active: true, members_total: 1, players_online: 0, members: [{ name: 'Test Knight', level: 100, vocation: 'Knight', status: 'offline' }] } });
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('multiple players share world requests and respect per-resource caches', async () => {
  let time = Date.now(); const calls = { character: 0, world: 0, guild: 0 };
  const fetcher = async (url) => {
    if (url.pathname.includes('/character/')) {
      calls.character++; return json({ information: info(), character: { character: { name: decodeURIComponent(url.pathname.split('/').at(-1)), world: 'Antica' } } });
    }
    if (url.pathname.includes('/guild/')) { calls.guild++; return json(guild()); }
    calls.world++; return json({ information: info(), world: { name: 'Antica', status: 'online', players_online: 1, online_players: [{ name: 'Test Knight' }] } });
  };
  const service = new SearchService(fetcher, () => time);
  const initial = await Promise.all([service.player('Test Knight', 'tibiadata'), service.player('Other Knight', 'tibiadata')]);
  assert.equal(initial[0].status, 'online'); assert.equal(initial[1].status, 'offline'); assert.deepEqual(calls, { character: 2, world: 1, guild: 0 });
  await service.guild('Test Guild', 'tibiadata'); time += 61000;
  await service.player('Test Knight', 'tibiadata'); await service.guild('Test Guild', 'tibiadata');
  assert.deepEqual(calls, { character: 2, world: 2, guild: 1 });
  time += 60000; await service.guild('Test Guild', 'tibiadata'); assert.equal(calls.guild, 2);
  time += 180000; await service.player('Test Knight', 'tibiadata'); assert.equal(calls.character, 3);
});

test('guild API requires complete counts and valid statuses', () => {
  assert.equal(parseApiGuild(guild(), 'Test Guild').members[0].status, 'offline');
  const partial = guild(); partial.guild.members_total = 2; assert.throws(() => parseApiGuild(partial, 'Test Guild'), /Incomplete|incomplete/);
  const missing = guild(); delete missing.guild.members[0].status; assert.throws(() => parseApiGuild(missing, 'Test Guild'), /status/);
  const badCount = guild(); badCount.guild.players_online = 1; assert.throws(() => parseApiGuild(badCount, 'Test Guild'), /count/);
});

test('guild HTML accepts empty status only in a complete row below a Status column', () => {
  const html = `<div class="BoxContent"><h1>Test Guild</h1>The guild was founded on Antica on Jan 01 2020. It is currently active.
  <div class="TableContainer"><div class="CaptionContainer"><div class="Text">Guild Members</div></div><table>
  <tr><td>Rank</td><td>Name</td><td>Vocation</td><td>Level</td><td>Joined</td><td>Status</td></tr>
  <tr><td>Member</td><td><a href="?subtopic=characters&amp;name=Test+Knight">Test Knight</a></td><td>Knight</td><td>100</td><td>Jan 01 2020</td><td></td></tr></table></div></div>`;
  assert.equal(parseHtmlGuild(html, 'Test Guild').members[0].status, 'offline');
  assert.throws(() => parseHtmlGuild(html.replace('<td>Status</td>', '<td>Other</td>'), 'Test Guild'), /column/);
  assert.throws(() => parseHtmlGuild(html.replace('<td></td></tr>', '<td>unknown</td></tr>'), 'Test Guild'), /unknown status/);
  assert.equal(guildName('https://www.tibia.com/community/?subtopic=guilds&page=view&GuildName=Test+Guild'), 'Test Guild');
  assert.throws(() => guildName('https://example.com/guild'));
});
