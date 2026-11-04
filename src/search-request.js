import { TibiaError } from './tibia-common.js';
import { tibiaSearch } from '../config/tibia.js';

// Shared JSON/HTML request executor. Endpoints belong in configuration.
export function buildRequest(spec, values, config = tibiaSearch) {
  const substitute = (value, encode = false) => String(value).replace(/\{(\w+)\}/g, (_, key) => {
    if (values[key] === undefined) throw new TibiaError('Search parameter is not configured.');
    return encode ? encodeURIComponent(values[key]) : values[key];
  });
  const url = new URL(substitute(spec.url, true));
  if (url.protocol !== 'https:' || !['www.tibia.com', 'api.tibiadata.com'].includes(url.hostname) || url.username || url.password || url.port) {
    throw new TibiaError('Endpoint must use HTTPS on the official Tibia website or public TibiaData API.');
  }
  for (const [key, value] of Object.entries(spec.query || {})) url.searchParams.set(key, substitute(value));
  const method = spec.method.toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw new TibiaError('Method must be GET or POST.');
  const options = { method, headers: { ...config.headers }, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs) };
  if (method === 'POST') {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(Object.entries(spec.form || {}).map(([key, value]) => [key, substitute(value)])).toString();
  }
  return { url, options };
}

export async function requestBytes(spec, values, fetcher = fetch, config = tibiaSearch) {
  const { url, options } = buildRequest(spec, values, config);
  let response;
  try { response = await fetcher(url, options); }
  catch { throw new TibiaError('Network error or timeout while querying the data source.'); }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* preserve the HTTP error */ }
    throw new TibiaError(`Query returned HTTP ${response.status}. The previous status was preserved.`);
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > config.maxBytes) throw new Error('size');
      chunks.push(chunk);
    }
  } catch { throw new TibiaError('Search response is incomplete or exceeds the size limit.'); }
  return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type') || '' };
}
