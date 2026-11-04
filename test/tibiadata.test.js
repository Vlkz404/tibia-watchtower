import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiCharacter, parseApiWorld, requestJson, lookupApiPlayer } from '../src/tibiadata.js';
import { lookupPlayer, buildRequest } from '../src/tibia.js';
import { tibiaSearch } from '../config/tibia.js';

const info = () => ({ api: { version: 5 }, status: { http_code: 200 }, timestamp: new Date().toISOString() });
const character = (extra = {}) => ({ information: info(), character: { character: {
  name: 'Test Knight', world: 'Quelibra', guild: { name: 'Quelibra Pune' }, ...extra,
} } });
const world = (names = []) => ({ information: info(), world: {
  name: 'Quelibra', status: 'online', players_online: names.length, online_players: names.map((name) => ({ name })),
} });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const settings = { world: 'Quelibra', guild: 'Quelibra Pune' };

test('character records can omit status and Last Login while retaining available login dates', () => {
  assert.equal(parseApiCharacter(character(), 'Test Knight').lastLogin, null);
  assert.equal(parseApiCharacter(character({ last_login: '2026-11-03T10:19:58Z' }), 'Test Knight').lastLogin, '2026-11-03T10:19:58.000Z');
  assert.throws(() => parseApiCharacter(character({ last_login: 'invalid' }), 'Test Knight'), /invalid date/);
});

test('default API detects online and offline through the world list', async () => {
  for (const online of [true, false]) {
    const fetcher = async (url) => json(url.pathname.includes('/character/') ? character() : world(online ? ['Test Knight'] : ['Other Knight']));
    const result = await lookupPlayer('Test Knight', settings, fetcher);
    assert.equal(result.status, online ? 'online' : 'offline');
    assert.equal(result.lastLogin, null);
    assert.equal(result.source, 'tibiadata');
    assert.ok(result.observedAt);
  }
});

test('incomplete lists, unavailable worlds, and stale samples are not offline', () => {
  const incomplete = world(['Test Knight']); incomplete.world.players_online = 2;
  assert.throws(() => parseApiWorld(incomplete, 'Quelibra'), /Incomplete|incomplete/);
  const duplicate = world(['Test Knight', 'test knight']);
  assert.throws(() => parseApiWorld(duplicate, 'Quelibra'), /duplicated/);
  const unavailable = world(); unavailable.world.status = 'offline';
  assert.throws(() => parseApiWorld(unavailable, 'Quelibra'), /unavailable/);
  const stale = world(); stale.information.timestamp = new Date(Date.now() - 11 * 60000).toISOString();
  assert.throws(() => parseApiWorld(stale, 'Quelibra'), /outdated/);
  assert.deepEqual(parseApiWorld(world(), 'Quelibra').players, []);
});

test('API paths encode names and HTML POST remains available', () => {
  const api = buildRequest(tibiaSearch.api.character, { name: 'Test Knight' });
  assert.equal(api.url.hostname, 'api.tibiadata.com');
  assert.equal(api.url.pathname, '/v5/character/Test%20Knight');
  assert.equal(buildRequest(tibiaSearch.character, { name: 'Test Knight' }).options.method, 'POST');
  assert.throws(() => buildRequest({ url: 'https://evil.example/{name}', method: 'GET' }, { name: 'Test Knight' }));
});

test('HTTP and API errors are not offline responses', async () => {
  const fetchError = async () => json({}, 503);
  await assert.rejects(() => requestJson(tibiaSearch.api.character, { name: 'Test Knight' }, fetchError), /HTTP 503/);
  const logicalError = character(); logicalError.information.status.http_code = 404;
  await assert.rejects(() => requestJson(tibiaSearch.api.character, { name: 'Test Knight' }, async () => json(logicalError)), /reported an error/);
  await assert.rejects(() => lookupApiPlayer('Test Knight', settings, async () => json(character({ guild: undefined }))), /guild/);
});
