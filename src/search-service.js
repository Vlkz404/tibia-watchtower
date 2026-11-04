import { tibiaSearch } from '../config/tibia.js';
import { TibiaError } from './tibia-common.js';
import { lookupPlayer, lookupHtmlGuild } from './tibia.js';
import { requestJson, parseApiGuild } from './tibiadata.js';

// Per-resource TTLs and shared promises avoid duplicate requests within a cycle.
export class SearchService {
  constructor(fetcher = fetch, clock = Date.now) { this.fetcher = fetcher; this.clock = clock; this.cache = new Map(); }
  cachedFetch(source) {
    return async (url, options) => {
      const key = `${source}:${options.method}:${url}:${options.body || ''}`;
      const kind = url.pathname.includes('/character/') ? 'character' : url.pathname.includes('/guild/') ? 'guild' : 'world';
      const ttl = source === 'tibiadata' ? tibiaSearch.api.cacheSeconds[kind] * 1000 : 60000;
      let entry = this.cache.get(key);
      if (!entry || this.clock() >= entry.expires) {
        const promise = this.fetcher(url, options).then(async (response) => {
          const declared = Number(response.headers.get('content-length') || 0);
          if (declared > tibiaSearch.maxBytes) { await response.body?.cancel(); throw new TibiaError('Response exceeds the size limit.'); }
          const chunks = []; let size = 0;
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > tibiaSearch.maxBytes) throw new TibiaError('Response exceeds the size limit.');
            chunks.push(chunk);
          }
          return { body: Buffer.concat(chunks), status: response.status, headers: Object.fromEntries(response.headers) };
        });
        entry = { promise, expires: this.clock() + ttl }; this.cache.set(key, entry);
        // Errors also have backoff so repeated clicks do not overload the source.
      }
      const value = await entry.promise;
      return new Response(value.body, { status: value.status, headers: value.headers });
    };
  }
  async player(name, source) { return lookupPlayer(name, { source }, this.cachedFetch(source)); }
  async guild(name, source) {
    const fetcher = this.cachedFetch(source);
    if (source === 'html') return lookupHtmlGuild(name, fetcher);
    if (source !== 'tibiadata') throw new TibiaError('Invalid source.');
    return parseApiGuild(await requestJson(tibiaSearch.api.guild, { guild: name }, fetcher), name);
  }
  // Prune expired targets to keep cache size bounded.
  prune() { for (const [key, entry] of this.cache) if (this.clock() >= entry.expires) this.cache.delete(key); }
}
