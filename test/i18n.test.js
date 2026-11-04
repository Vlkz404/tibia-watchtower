import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translator, errorText } from '../src/i18n.js';
import ptBR from '../src/locales/pt-BR.js';
import { defaults, playerTarget, guildTarget, Store } from '../src/store.js';
import { renderDashboard, renderStatus } from '../src/dashboard.js';
import { commands } from '../src/commands.js';

test('translations preserve interpolation and user data without recursive substitutions', () => {
  const tr = translator({ language: 'pt-BR' });
  const userText = 'Settings {1} @everyone';
  assert.equal(tr`Remove ${userText} and its monitoring history?`, `Remover ${userText} e seu histórico de monitoramento?`);
  assert.equal(translator({ language: 'en' })`Remove ${userText} and its monitoring history?`, `Remove ${userText} and its monitoring history?`);
  assert.equal(errorText({ language: 'pt-BR' }, 'HTTP 403'), 'HTTP 403');
  assert.equal(errorText({ language: 'pt-BR' }, 'Unknown internal error'), 'Consulta indisponível. Tente novamente mais tarde.');
  for (const [english, translated] of Object.entries(ptBR)) {
    assert.deepEqual(translated.match(/\{\d+\}/g)?.sort() ?? [], english.match(/\{\d+\}/g)?.sort() ?? [], english);
  }
});

test('Portuguese cards and guild pages translate UI text but preserve names and command definitions', () => {
  const s = { ...defaults(), language: 'pt-BR' };
  const p = playerTarget('Settings'); s.players = [p];
  const card = renderStatus(s, p.id).embeds[0].toJSON();
  assert.equal(card.title, '⚪ Settings');
  assert.match(card.description, /Mundo \/ guild/);
  assert.match(card.description, /Último login/);
  assert.match(card.description, /ainda não registrado/);
  assert.doesNotMatch(card.description, /not provided|Last Login|Checked/);
  const guild = guildTarget('Monitoring'); s.guilds = [guild];
  const view = renderDashboard(s, '123456789012345678', true, `guild:${guild.id}:0:all`, '', true);
  const payload = JSON.stringify(view.embeds.map((e) => e.toJSON()));
  assert.match(payload, /Aguardando consulta/);
  assert.match(payload, /membros/);
  assert.match(payload, /Monitoring/);
  assert.deepEqual(commands.map((command) => command.name), ['ping', 'status', 'dashboard', 'player', 'notifications']);
});

test('existing v2 settings without language remain compatible and invalid languages are rejected', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'tibia-i18n-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const original = defaults(); delete original.language;
  original.players = [playerTarget('Test Knight')]; original.subscribers = ['123456789012345678'];
  writeFileSync(join(directory, 'settings.json'), JSON.stringify(original));
  const store = new Store(directory);
  assert.equal(store.get().language, 'en');
  assert.deepEqual(store.get().players, original.players);
  assert.deepEqual(store.get().subscribers, original.subscribers);
  assert.throws(() => store.update((s) => { s.language = 'unknown'; }), /language/);
  store.update((s) => { s.language = 'pt-BR'; });
  assert.equal(new Store(directory).get().language, 'pt-BR');
});
