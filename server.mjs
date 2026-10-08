import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { findReferences, referenceImage } from './references.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.DREAM_WORLD_PORT || 5179);
const model = 'reactor/lingbot-world-2';
function apiKey() {
  if (process.env.REACTOR_API_KEY) return process.env.REACTOR_API_KEY;
  for (const file of [path.join(root, '.env.local'), path.join(root, '../.env.local')]) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(x => /^\s*REACTOR_API_KEY\s*=/.test(x));
    const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  }
  return '';
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
const local = req => [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin);
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/references?') && req.method === 'GET') {
    const q = new URL(req.url, `http://127.0.0.1:${port}`).searchParams;
    try { return json(res, 200, await findReferences({ name: q.get('name'), year: Number(q.get('year')), lat: q.has('lat') ? Number(q.get('lat')) : NaN, lon: q.has('lon') ? Number(q.get('lon')) : NaN })); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (req.url.startsWith('/api/reference-image?') && req.method === 'GET') {
    const id = new URL(req.url, `http://127.0.0.1:${port}`).searchParams.get('id');
    try { const image = await referenceImage(id); if (!image) return json(res, 404, { error: 'Reference expired. Search again.' }); res.writeHead(200, { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=3600' }); return res.end(image.buffer); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (req.url.startsWith('/api/places?') && req.method === 'GET') {
    const name = new URL(req.url, `http://127.0.0.1:${port}`).searchParams.get('name')?.slice(0, 120) || '';
    if (name.length < 2) return json(res, 200, { results: [] });
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error('Search failed.');
      const data = await response.json();
      return json(res, 200, { results: (data.results || []).map(({ name, latitude, longitude, country, admin1 }) => ({ name, latitude, longitude, country, admin1 })) });
    } catch { return json(res, 502, { error: 'Place search is temporarily unavailable.' }); }
  }
  if (req.url === '/api/status' && req.method === 'GET') return json(res, 200, { hasKey: Boolean(apiKey()), model });
  if (req.url === '/api/token') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST required.' });
    if (!local(req)) return json(res, 403, { error: 'Open the local app to start a world.' });
    const key = apiKey();
    if (!key) return json(res, 409, { error: 'Add REACTOR_API_KEY to the shared .env.local file.' });
    try {
      const upstream = await fetch('https://api.reactor.inc/tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Reactor-API-Key': key },
        body: JSON.stringify({ expires_after: 600, authorization_details: [{ type: 'session', resources: { models: { match: [model] } }, constraints: { max_sessions: 1, max_session_duration_seconds: 300 } }] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!upstream.ok) return json(res, upstream.status, { error: `Reactor could not create a session (HTTP ${upstream.status}).` });
      const data = await upstream.json();
      if (!data.jwt) return json(res, 502, { error: 'Reactor did not return a session token.' });
      return json(res, 200, { jwt: data.jwt, model });
    } catch { return json(res, 502, { error: 'Could not reach Reactor. Try again.' }); }
  }
  if (req.url === '/api/clip') {
    if (req.method !== 'POST' || !local(req)) return json(res, 403, { error: 'Use the local app.' });
    const buffers = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 40000000) return json(res, 413, { error: 'Clip is too large. Record a shorter clip.' }); buffers.push(part); }
    const buffer = Buffer.concat(buffers);
    if (buffer.subarray(0, 4).toString('hex') !== '1a45dfa3') return json(res, 400, { error: 'WebM video required.' });
    const name = `clip-${Date.now()}.webm`;
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', name), buffer);
    return json(res, 200, { path: `artifacts/${name}` });
  }
  if (req.url === '/api/capture') {
    if (req.method !== 'POST' || !local(req)) return json(res, 403, { error: 'Use the local app.' });
    const buffers = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 6000000) return json(res, 413, { error: 'Image is too large.' }); buffers.push(part); }
    const buffer = Buffer.concat(buffers);
    if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return json(res, 400, { error: 'PNG required.' });
    const name = `world-${Date.now()}.png`;
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', name), buffer);
    return json(res, 200, { path: `artifacts/${name}` });
  }
  vite.middlewares(req, res);
});
const vite = await createViteServer({
  root, configFile: false, appType: 'spa',
  optimizeDeps: { exclude: ['@reactor-team/js-sdk'], include: ['awaitqueue', 'react', 'react/jsx-runtime', 'hls.js', 'mp4box'] },
  server: { middlewareMode: true, hmr: { server }, watch: { ignored: ['**/artifacts/**', '**/scripts/**', '**/*.md', '**/.browser-cache/**'] }, fs: { strict: true, allow: [root] } },
});
server.listen(port, '127.0.0.1', () => console.log(`Dream World: http://127.0.0.1:${port}`));
async function stop() { await vite.close(); server.close(); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
