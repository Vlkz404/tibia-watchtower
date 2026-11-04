import { lookupPlayer, TibiaError } from './tibia.js';
import { sendNotification } from './notifications.js';
export const timestamp = (value) => value ? `<t:${Math.floor(Date.parse(value) / 1000)}:F>` : 'not available';
export function statusText(s) { return `Player: ${s.player || 'not configured'}\nStatus: ${s.monitor.status}\nLast successful query: ${timestamp(s.monitor.checkedAt)}\nLast Login: ${timestamp(s.monitor.lastLogin)}\n${s.monitor.error || 'Change times are approximate detections between queries.'}`; }
export class Monitor {
  constructor(client, config, store, lookup = lookupPlayer, clock = Date.now) { Object.assign(this,{client,config,store,lookup,clock}); this.lastAttempt = null; this.busy = false; this.stopped = false; }
  start() { const tick = async () => { if (this.stopped) return; try { await this.check(); } catch { console.error('Monitoring failed.'); } if (!this.stopped) this.timer = setTimeout(tick,5000); }; void tick(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  async check() {
    const s = this.store.get();
    if (this.stopped || this.busy || !s.player || !s.monitorEnabled || (this.lastAttempt !== null && this.clock()-this.lastAttempt < s.pollSeconds*1000)) return;
    this.busy = true; this.lastAttempt = this.clock();
    try {
      const observation = await this.lookup(s.player,s); const current = this.store.get();
      if (this.stopped || current.monitorRevision !== s.monitorRevision || !current.monitorEnabled) return;
      const now = new Date(this.clock()).toISOString();
      const changed = current.monitor.status !== 'unknown' && current.monitor.status !== observation.status;
      this.store.update((next) => { next.monitor = {...current.monitor,...observation,checkedAt:now,error:null,history:changed ? [...current.monitor.history,{status:observation.status,at:now,from:current.monitor.checkedAt}].slice(-100) : current.monitor.history}; });
      if (changed && current.notificationsEnabled) await sendNotification(this.client,{guildId:this.config.guildId,channelIds:current.channelEnabled ? current.channelIds : [],dmEnabled:current.dmEnabled,dmUserIds:current.subscribers},`${observation.name}: ${observation.status}\nDetected: ${timestamp(now)}\nPrevious observation: ${timestamp(current.monitor.checkedAt)}`);
    } catch(error) { if (!this.stopped && this.store.get().monitorRevision === s.monitorRevision) this.store.update((next) => { next.monitor.error = error instanceof TibiaError ? error.message : 'Query failed; last status preserved.'; }); }
    finally { this.busy = false; }
  }
}
