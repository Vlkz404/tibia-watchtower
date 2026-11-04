const secrets = new Set();
const tokenPattern = /\b(?:mfa\.[\w-]{20,}|[\w-]{20,30}\.[\w-]{6}\.[\w-]{25,})\b/;
export class SecurityError extends Error {}
export function registerSecret(value) { if (typeof value === 'string' && value.length >= 8) secrets.add(value); }
export function containsSecret(value) {
  return typeof value === 'string' && (tokenPattern.test(value) || [...secrets].some((secret) => value.includes(secret)));
}
export function assertSafeText(value) {
  if (containsSecret(value)) throw new SecurityError('Content blocked because it contains a sensitive credential.');
}

// Limit commands, buttons, memory, and concurrency. Authorized emergency actions
// remain available during a burst so the owner or Administrator can stop the bot.
export class InteractionGuard {
  constructor(clock = Date.now) { this.clock = clock; this.users = new Map(); this.global = []; this.notices = []; this.active = 0; }
  enter(userId, priority = false) {
    if (priority) return { allowed: true, release() {} };
    const now = this.clock();
    for (const [id, entry] of this.users) if (!entry.busy && now - entry.seen > 60000) this.users.delete(id);
    this.global = this.global.filter((time) => now - time < 10000);
    this.notices = this.notices.filter((time) => now - time < 10000);
    let entry = this.users.get(userId);
    if (!entry && this.users.size >= 2000) return { allowed: false, notify: false };
    if (!entry) { entry = { requests: [], seen: now, notified: -Infinity, busy: false }; this.users.set(userId, entry); }
    entry.seen = now; entry.requests = entry.requests.filter((time) => now - time < 10000);
    if (entry.busy || entry.requests.length >= 5 || this.global.length >= 60 || this.active >= 20) {
      const notify = now - entry.notified >= 15000 && this.notices.length < 5;
      if (notify) { entry.notified = now; this.notices.push(now); }
      return { allowed: false, notify };
    }
    entry.requests.push(now); this.global.push(now); entry.busy = true; this.active++;
    let released = false;
    return { allowed: true, release: () => { if (!released) { released = true; entry.busy = false; this.active--; } } };
  }
}

const clients = new WeakMap();
export function configureOutbound(client, allowed) { clients.set(client, { allowed, global: [], targets: new Map() }); }
export function reserveSend(client, kind, id, now = Date.now()) {
  let state = clients.get(client);
  if (!state) { state = { allowed: () => true, global: [], targets: new Map() }; clients.set(client, state); }
  if (!state.allowed()) return false;
  state.global = state.global.filter((time) => now - time < 60000);
  for (const [key, times] of state.targets) if (times.every((time) => now - time >= 60000)) state.targets.delete(key);
  const key = `${kind}:${id}`;
  const times = (state.targets.get(key) || []).filter((time) => now - time < 60000);
  if (state.global.length >= 120 || times.length >= (kind === 'dm' ? 2 : 3) || (!state.targets.has(key) && state.targets.size >= 2000)) return false;
  state.global.push(now); times.push(now); state.targets.set(key, times); return true;
}
