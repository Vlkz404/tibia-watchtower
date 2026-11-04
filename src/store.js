import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tibiaSearch } from '../config/tibia.js';
import { assertSafeText, SecurityError } from './security.js';

export const emptyMonitor = () => ({ status: 'unknown', checkedAt: null, changedAt: null, lastLogin: null,
  lastOnline: null, lastOffline: null, error: null, history: [], source: null, observedAt: null });
export const playerTarget = (name, monitor = emptyMonitor()) => ({ id: randomUUID(), name, monitor });
export const guildTarget = (name) => ({ id: randomUUID(), name, world: null, members: [], checkedAt: null, observedAt: null, source: null, error: null, history: [] });
export const defaults = () => ({
  version: 2, source: tibiaSearch.source, monitorEnabled: true, notificationsEnabled: false,
  channelEnabled: true, dmEnabled: false, onlineAlerts: true, offlineAlerts: true,
  channelIds: [], subscribers: [], players: [], guilds: [], pollSeconds: 120,
  monitorRevision: 0, emojis: {}, delivery: null,
  testMessage: 'Bot test message. Notification destinations are working.',
});

function migrate(raw) {
  if (raw.version !== 1) return raw;
  const next = { ...defaults(), ...raw, version: 2,
    players: raw.player ? [playerTarget(raw.player, { ...emptyMonitor(), ...raw.monitor })] : [],
    guilds: [], delivery: raw.monitor?.delivery || null,
  };
  for (const key of ['player', 'world', 'guild', 'monitor']) delete next[key];
  return next;
}
function validate(data) {
  if (data.version !== 2 || !['html', 'tibiadata'].includes(data.source)) throw new Error('Unsupported data version or source.');
  for (const key of ['monitorEnabled', 'notificationsEnabled', 'channelEnabled', 'dmEnabled', 'onlineAlerts', 'offlineAlerts']) {
    if (typeof data[key] !== 'boolean') throw new Error('Invalid persisted settings.');
  }
  for (const key of ['channelIds', 'subscribers']) {
    if (!Array.isArray(data[key]) || data[key].some((id) => !/^[1-9]\d{16,19}$/.test(id))) throw new Error('Invalid persisted list.');
  }
  if (data.channelIds.length > 25 || data.subscribers.length > 1000) throw new Error('Destination limit exceeded.');
  for (const key of ['players', 'guilds']) {
    if (!Array.isArray(data[key]) || data[key].length > 25 || data[key].some((t) => !/^[\da-f-]{36}$/.test(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80)) throw new Error('Invalid persisted targets.');
    if (new Set(data[key].map((t) => t.name.toLowerCase())).size !== data[key].length || new Set(data[key].map((t) => t.id)).size !== data[key].length) throw new Error('Duplicate targets.');
  }
  for (const target of data.players) {
    const m = target.monitor;
    if (!m || !['unknown', 'online', 'offline'].includes(m.status) || !Array.isArray(m.history)) throw new Error('Invalid player history.');
  }
  if (data.guilds.some((g) => !Array.isArray(g.members) || !Array.isArray(g.history))) throw new Error('Invalid persisted guild.');
  if (!Number.isInteger(data.pollSeconds) || data.pollSeconds < 60 || data.pollSeconds > 900 || !Number.isSafeInteger(data.monitorRevision) || data.monitorRevision < 0) throw new Error('Invalid interval or revision.');
  if (!data.emojis || typeof data.emojis !== 'object' || Array.isArray(data.emojis) || typeof data.testMessage !== 'string' || data.testMessage.length > 1500) throw new Error('Invalid preferences.');
}

export class Store {
  constructor(directory, { canWrite = () => true } = {}) {
    this.canWrite = canWrite;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'settings.json');
    const raw = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : defaults();
    this.data = migrate(raw);
    assertSafeText(JSON.stringify(this.data));
    validate(this.data);
    if (raw.version === 1) {
      if (!this.canWrite()) throw new SecurityError('Writes blocked: instance is stopping or has no valid lock.');
      const backup = join(directory, 'settings.v1.backup.json');
      if (!existsSync(backup)) writeFileSync(backup, JSON.stringify(raw, null, 2), { mode: 0o600 });
    }
    if (!existsSync(this.path) || raw.version !== this.data.version) this.update(() => {});
  }
  get() { return structuredClone(this.data); }
  update(change) {
    if (!this.canWrite()) throw new SecurityError('Writes blocked: instance is stopping or has no valid lock.');
    const next = this.get(); change(next); validate(next);
    assertSafeText(JSON.stringify(next));
    writeFileSync(`${this.path}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path); this.data = next;
    return this.get();
  }
}
