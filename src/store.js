import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
export const defaults = () => ({ version: 1, notificationsEnabled: false, channelEnabled: true, dmEnabled: false,
  channelIds: [], subscribers: [], emojis: {}, player: '', world: 'Quelibra', guild: 'Quelibra Pune',
  monitorEnabled: true, pollSeconds: 120, monitorRevision: 0, monitor: { status: 'unknown', checkedAt: null, history: [], error: null } });
export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); this.path = join(directory, 'settings.json');
    this.data = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : defaults();
    if (this.data.version !== 1) throw new Error('Unsupported settings version.');
  }
  get() { return structuredClone(this.data); }
  update(change) {
    const next = this.get(); change(next);
    if (!Array.isArray(next.channelIds) || next.channelIds.length > 25 || !Array.isArray(next.subscribers) || next.subscribers.length > 1000) throw new Error('Invalid destination list.');
    writeFileSync(this.path + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); this.data = next; return this.get();
  }
}
