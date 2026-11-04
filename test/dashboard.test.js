import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { renderDashboard, setSubscription, canManage } from '../src/dashboard.js';
import { PermissionsBitField } from 'discord.js';
test('settings persist and each user controls their own subscription', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'watchtower-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir); setSubscription(store, '123456789012345678', true); setSubscription(store, '123456789012345678', true);
  assert.deepEqual(new Store(dir).get().subscribers, ['123456789012345678']);
  for (const page of ['home','notifications','channels','monitor','dm','emojis']) {
    const view = renderDashboard(store.get(), '123456789012345678', true, page);
    for (const r of view.components) r.toJSON(); view.embeds[0].toJSON();
  }
  assert.equal(canManage({user:{id:'member'},memberPermissions:new PermissionsBitField()}, {ownerId:'owner'}), false);
});
