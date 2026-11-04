import test from 'node:test';
import assert from 'node:assert/strict';
import { tibiaSearch } from '../config/tibia.js';
import { buildRequest, characterName, parseCharacter, parseWorld, parseLogin, requestPage, lookupHtmlPlayer } from '../src/tibia.js';

// Synthetic structural fixtures. Tests do not query services or use real characters.
export const characterHtml = (name = 'Test Knight', guild = 'Quelibra Pune', world = 'Quelibra') => `
  <div class="CaptionContainer"><div class="Text">Character Information</div></div>
  <table><tr><td>Name:</td><td>${name}</td></tr><tr><td>World:</td><td>${world}</td></tr>
  <tr><td>Guild Membership:</td><td>Member of the <a>${guild}</a></td></tr>
  <tr><td>Last Login:</td><td>Nov 04 2026, 10:00:00 CET</td></tr></table>`;
export const worldHtml = (online = true, count = online ? 1 : 0) => `
  <select name="world"><option selected>Quelibra</option></select>
  <table><tr><td>Status:</td><td>Online</td></tr><tr><td>Players Online:</td><td>${count}</td></tr></table>
  <div class="TableContainer"><div class="CaptionContainer"><div class="Text">Players Online [ A B C ]</div></div>
  <table><tr><td>Name</td><td>Level</td><td>Vocation</td></tr>
  ${online ? '<tr><td><a href="?subtopic=characters&amp;name=Test+Knight">Test Knight</a></td><td>100</td><td>Knight</td></tr>' : ''}</table></div>`;
const response = (html, status = 200) => new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

test('accepts names and official URLs and rejects endpoint injection', () => {
  assert.equal(characterName(' Test  Knight '), 'Test Knight');
  assert.equal(characterName('https://www.tibia.com/community/?subtopic=characters&name=Test+Knight'), 'Test Knight');
  for (const value of ['https://example.com/?name=Test', 'https://www.tibia.com.evil/community/?subtopic=characters&name=Test', 'https://user@www.tibia.com/community/?subtopic=characters&name=Test', 'file:///tmp/test', '@everyone']) assert.throws(() => characterName(value));
});

test('POST form is encoded and endpoint changes require only configuration', () => {
  const { url, options } = buildRequest(tibiaSearch.character, { name: 'Test Knight' });
  assert.equal(url.searchParams.get('subtopic'), 'characters');
  assert.equal(url.searchParams.has('name'), false);
  assert.equal(options.method, 'POST');
  assert.equal(options.body, 'name=Test+Knight');
  assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const changed = buildRequest({ url: 'https://www.tibia.com/new-search/', method: 'GET', query: { char: '{name}' } }, { name: 'Test Knight' });
  assert.equal(changed.url.pathname, '/new-search/');
  assert.equal(changed.url.searchParams.get('char'), 'Test Knight');
  assert.equal(changed.options.body, undefined);
});

test('Last Login converts CET and CEST independently of local timezone', () => {
  assert.equal(parseLogin('Nov 04 2026, 10:00:00 CET'), '2026-11-04T09:00:00.000Z');
  assert.equal(parseLogin('Jul 04 2026, 10:00:00 CEST'), '2026-07-04T08:00:00.000Z');
  assert.equal(parseLogin('Never logged in.'), null);
  assert.throws(() => parseLogin('unknown'));
});

test('character and complete world lists parse; failures do not mean offline', () => {
  assert.equal(parseCharacter(characterHtml(), 'test knight').guild, 'Quelibra Pune');
  assert.deepEqual(parseWorld(worldHtml(), 'Quelibra'), ['Test Knight']);
  assert.deepEqual(parseWorld(worldHtml(false), 'Quelibra'), []);
  assert.throws(() => parseWorld(worldHtml(true, 2), 'Quelibra'), /Incomplete|incomplete/);
  assert.throws(() => parseWorld(worldHtml(), 'Antica'), /world/);
  assert.throws(() => parseWorld(worldHtml().replace('<td>Online</td>', '<td>Offline</td>'), 'Quelibra'), /unavailable/);
  assert.throws(() => parseWorld('<html>maintenance</html>', 'Quelibra'));
  assert.throws(() => parseCharacter(characterHtml(), 'Other Knight'));
  const noLoginOrStatus = characterHtml().replace(/<tr><td>Last Login:<\/td><td>.*?<\/td><\/tr>/, '');
  assert.equal(parseCharacter(noLoginOrStatus, 'Test Knight').lastLogin, null);
});

test('HTTP errors, challenges, and partial responses are query errors', async () => {
  await assert.rejects(() => requestPage(tibiaSearch.character, { name: 'Test Knight' }, async () => response('blocked', 403)), /HTTP 403/);
  await assert.rejects(() => requestPage(tibiaSearch.character, { name: 'Test Knight' }, async () => response('Just a moment')), /blocked/);
  await assert.rejects(() => requestPage(tibiaSearch.character, { name: 'Test Knight' }, async () => response('long response'), { ...tibiaSearch, maxBytes: 2 }), /limit/);
});

test('HTML lookup uses character POST and official world list and validates scope', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push(options); return response(url.searchParams.get('subtopic') === 'characters' ? characterHtml() : worldHtml()); };
  const settings = { world: 'Quelibra', guild: 'Quelibra Pune' };
  assert.equal((await lookupHtmlPlayer('Test Knight', settings, fetcher)).status, 'online');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].method, 'GET');
  await assert.rejects(() => lookupHtmlPlayer('Test Knight', settings, async () => response(characterHtml('Test Knight', 'Another guild'))), /guild/);
  await assert.rejects(() => lookupHtmlPlayer('Test Knight', settings, async () => response(characterHtml('Test Knight', 'Quelibra Pune', 'Antica'))), /Quelibra/);
});
