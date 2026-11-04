import { TibiaError } from './tibia.js';
import { SearchService } from './search-service.js';
import { sendNotification } from './notifications.js';
import { iconText } from './icons.js';
import { translator, errorText } from './i18n.js';

export const timestamp = (date, style = 'F', settings = {}) => date ? `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>` : translator(settings)('not recorded yet');

export function applyObservation(previous, observation, now) {
  if (previous.source === observation.source && previous.observedAt && observation.observedAt && Date.parse(observation.observedAt) <= Date.parse(previous.observedAt)) return { next: { ...previous, checkedAt: now, error: null }, event: null };
  const sourceChanged = observation.source && previous.source !== observation.source;
  const changed = previous.status !== 'unknown' && !sourceChanged && previous.status !== observation.status;
  const event = changed ? { status: observation.status, from: previous.checkedAt, at: now, lastLogin: observation.lastLogin } : null;
  const next = {
    ...previous, status: observation.status, lastLogin: observation.lastLogin,
    checkedAt: now, error: null,
    source: observation.source || previous.source || null,
    observedAt: observation.observedAt || null,
    changedAt: event ? now : previous.changedAt,
    // The first sample is a baseline, not a detected login or logout.
    lastOnline: event?.status === 'online' ? now : previous.lastOnline,
    lastOffline: event?.status === 'offline' ? now : previous.lastOffline,
    history: event ? [...previous.history, event].slice(-100) : previous.history,
  };
  return { next, event };
}

export function playerText(target, settings = {}) {
  const tr = translator(settings);
  const m = target.monitor;
  const time = (date, style = 'F') => timestamp(date, style, settings);
  return [
    tr`**Status:** ${m.status === 'unknown' ? tr('⚪ no sample') : m.status === 'online' ? '🟢 online' : '🔴 offline'}`,
    tr`**World / guild:** ${m.world || tr('waiting for a query')} / ${m.guild || tr('not provided')}`,
    tr`**Checked:** ${time(m.checkedAt)} ${m.checkedAt ? `(${time(m.checkedAt, 'R')})` : ''}`,
    tr`**Last Login:** ${m.lastLogin ? `${time(m.lastLogin)} (${time(m.lastLogin, 'R')})` : tr('not provided')}`,
    tr`**Login detected:** ${m.lastOnline ? time(m.lastOnline) : tr('no transition observed')}`,
    tr`**Logout detected:** ${m.lastOffline ? time(m.lastOffline) : tr('no transition observed')}`,
    m.observedAt ? tr`**Source sample:** ${time(m.observedAt)}` : '',
    m.error ? tr`⚠️ ${errorText(settings, m.error)} Last status may be outdated.` : '',
    tr('Login/logout times are detections between queries, subject to source caching.'),
  ].filter(Boolean).join('\n');
}
export function statusText(settings) {
  const tr = translator(settings);
  return [
    tr`**Source:** ${settings.source === 'html' ? tr('Official HTML') : 'TibiaData'}. Monitoring ${tr(settings.monitorEnabled ? 'active' : 'paused')}.`,
    tr`**Players:** ${settings.players.length} • **Guilds:** ${settings.guilds.length}`,
    ...settings.players.slice(0, 10).map((p) => `${p.monitor.status === 'online' ? '🟢' : p.monitor.status === 'offline' ? '🔴' : '⚪'} **${p.name}**${p.monitor.error ? tr(' ⚠️ query unavailable') : ''}`),
    ...settings.guilds.slice(0, 5).map((g) => tr`🏰 **${g.name}**: ${g.members.filter((m) => m.status === 'online').length} online / ${g.members.length} members${g.error ? tr(' ⚠️ query unavailable') : ''}`),
    tr('Open /dashboard → Monitoring for details and full lists.'),
  ].join('\n');
}

export function applyGuildObservation(previous, observation, now) {
  const comparable = previous.source === observation.source && previous.checkedAt;
  if (comparable && previous.observedAt && observation.observedAt && Date.parse(observation.observedAt) <= Date.parse(previous.observedAt)) return { next: { ...previous, checkedAt: now, error: null }, events: [] };
  const old = new Map(previous.members.map((m) => [m.name.toLowerCase(), m]));
  const events = [];
  const members = observation.members.map((m) => {
    const prior = old.get(m.name.toLowerCase());
    const changed = comparable && prior && prior.status !== m.status;
    const event = changed ? { name: m.name, status: m.status, from: previous.checkedAt, at: now, guild: observation.name } : null;
    if (event) events.push(event);
    return { ...m, lastOnline: event?.status === 'online' ? now : prior?.lastOnline || null, lastOffline: event?.status === 'offline' ? now : prior?.lastOffline || null };
  });
  return { next: { ...previous, name: observation.name, world: observation.world, members, source: observation.source, observedAt: observation.observedAt, checkedAt: now, error: null, history: [...previous.history, ...events].slice(-100) }, events };
}

export class Monitor {
  constructor(client, config, store, service = new SearchService(), clock = Date.now) {
    Object.assign(this, { client, config, store, service, clock });
    this.lastAttempt = new Map(); this.busy = false; this.stopped = false; this.testUntil = 0;
  }
  start() {
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) return;
      try { await this.check(); } catch { console.error('Failed to persist or run monitoring.'); }
      if (!this.stopped) this.timer = setTimeout(tick, 5000);
    };
    void tick();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  current(settings) { const s = this.store.get(); return !this.stopped && s.monitorEnabled && s.monitorRevision === settings.monitorRevision && s.source === settings.source; }
  due(kind, target, settings) {
    const key = `${settings.source}:${kind}:${target.id}`;
    const seconds = settings.source === 'tibiadata' ? (kind === 'guilds' ? 120 : 60) : settings.pollSeconds;
    if (this.lastAttempt.has(key) && this.clock() - this.lastAttempt.get(key) < seconds * 1000) return false;
    this.lastAttempt.set(key, this.clock()); return true;
  }
  deliveryConfig(active = true) {
    const s = this.store.get();
    return { guildId: this.config.guildId, channelIds: active && s.notificationsEnabled && s.channelEnabled ? s.channelIds : [], dmEnabled: active && s.notificationsEnabled && s.dmEnabled, dmUserIds: s.subscribers };
  }
  async check() {
    const settings = this.store.get();
    if (this.busy || this.stopped) return 'Query running or bot shutting down.';
    if (!settings.monitorEnabled) return 'Monitoring paused.';
    if (!settings.players.length && !settings.guilds.length) return 'Add players or guilds.';
    this.busy = true;
    const pending = new Map(); const individual = new Set();
    let checked = 0; let failures = 0;
    try {
      for (const kind of ['players', 'guilds']) for (const target of settings[kind]) {
        if (!this.current(settings)) return 'Method or monitoring changed; pending results discarded.';
        if (!this.store.get()[kind].some((t) => t.id === target.id) || !this.due(kind, target, settings)) continue;
        try {
          const observation = await this.service[kind === 'players' ? 'player' : 'guild'](target.name, settings.source);
          if (!this.current(settings) || !this.store.get()[kind].some((t) => t.id === target.id)) continue;
          const now = new Date(this.clock()).toISOString();
          let events = [];
          this.store.update((s) => {
            const index = s[kind].findIndex((t) => t.id === target.id);
            if (kind === 'players') {
              const { next, event } = applyObservation(s.players[index].monitor, observation, now);
              s.players[index].monitor = { ...next, world: observation.world, guild: observation.guild };
              individual.add(observation.name.toLowerCase());
              if (event) events = [{ ...event, name: observation.name, world: observation.world, kind, id: target.id }];
            } else {
              const result = applyGuildObservation(s.guilds[index], observation, now);
              s.guilds[index] = result.next;
              events = result.events.filter((event) => !individual.has(event.name.toLowerCase())).map((event) => ({ ...event, world: observation.world, kind, id: target.id }));
            }
          });
          for (const event of events) if (!pending.has(event.name.toLowerCase())) pending.set(event.name.toLowerCase(), event);
          checked++;
        } catch (error) {
          failures++;
          if (this.current(settings) && this.store.get()[kind].some((t) => t.id === target.id)) this.store.update((s) => {
            const t = s[kind].find((t) => t.id === target.id);
            (kind === 'players' ? t.monitor : t).error = error instanceof TibiaError ? error.message : 'Query failed; last status preserved.';
          });
        }
      }
      const latest = this.store.get();
      const events = [...pending.values()].filter((event) => latest[event.kind].some((t) => t.id === event.id) && (event.status === 'online' ? latest.onlineAlerts : latest.offlineAlerts));
      if (events.length && this.current(settings) && latest.notificationsEnabled) {
        const tr = translator(latest);
        const lines = events.map((e) => tr`${iconText(latest, e.status)} **${e.name}** ${tr(e.status)} • ${e.guild || e.world} • detected ${timestamp(e.at, 't', latest)}`);
        let text = tr('**Changes detected in Tibia**\n'); let shown = 0;
        for (const line of lines) { if (text.length + line.length > 1650) break; text += `${line}\n`; shown++; }
        if (shown < lines.length) text += tr`+ ${lines.length - shown} changes; see dashboard history.\n`;
        text += tr('Approximate times between queries; data is subject to source caching.');
        const current = () => this.deliveryConfig(this.current(settings));
        const results = await sendNotification(this.client, current(), text, current);
        if (this.current(settings)) this.store.update((s) => { s.delivery = { at: new Date(this.clock()).toISOString(), sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length }; });
      }
      this.service.prune?.();
      const activeIds = new Set([...this.store.get().players, ...this.store.get().guilds].map((t) => t.id));
      for (const key of this.lastAttempt.keys()) if (!activeIds.has(key.split(':').at(-1))) this.lastAttempt.delete(key);
      return checked || failures ? `Queries completed: ${checked} valid, ${failures} failed.` : 'Cached data; waiting for the next source update.';
    } finally { this.busy = false; }
  }
  async testSend(kind, destination, userId) {
    if (this.stopped) throw new TibiaError('Bot shutting down; delivery blocked.');
    if (this.clock() < this.testUntil) throw new TibiaError('Wait 30 seconds between delivery tests.');
    const settings = this.store.get();
    if (destination === 'channels' && !settings.channelIds.length) throw new TibiaError('Configure at least one channel before testing.');
    this.testUntil = this.clock() + 30000;
    const tr = translator(settings);
    const message = kind === 'status' ? statusText(settings) : settings.testMessage === 'Bot test message. Notification destinations are working.' ? tr(settings.testMessage) : settings.testMessage;
    const text = (tr('[TEST — no actual status change]\n') + message).slice(0, 2000);
    const current = () => ({ guildId: this.config.guildId, channelIds: !this.stopped && destination === 'channels' ? this.store.get().channelIds : [], dmEnabled: !this.stopped && destination === 'dm', dmUserIds: destination === 'dm' ? [userId] : [] });
    const results = await sendNotification(this.client, current(), text, current);
    return tr`Test: ${results.filter((r) => r.ok).length} sent, ${results.filter((r) => !r.ok).length} failed. ${destination === 'dm' ? tr('The test DM was addressed only to you.') : ''}`;
  }
}
