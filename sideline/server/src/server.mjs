// Sideline IPTV bridge. Runs next to My Inbox on the same server and is reached through
// My Inbox's Caddy at https://<inbox domain>/sideline/ . Logs in to a MAC-locked IPTV
// portal as the chosen STB box and turns channels into iPhone-friendly HLS.
import http from 'node:http';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createIptv } from './iptv.mjs';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const PORT = Number(process.env.PORT || 8791);
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const APP_ORIGIN = process.env.APP_ORIGIN || 'https://vijaykannan2020-del.github.io';
const TICKET_HOURS = Number(process.env.TICKET_HOURS || 6);
const MAX_IPTV = Number(process.env.MAX_IPTV || 1);

await fs.mkdir(DATA_DIR, { recursive: true });
let secret = process.env.SECRET || (await fs.readFile(path.join(DATA_DIR, 'secret'), 'utf8').catch(() => '')).trim();
if (!secret) { secret = crypto.randomBytes(32).toString('base64url'); await fs.writeFile(path.join(DATA_DIR, 'secret'), secret, { mode: 0o600 }).catch(() => {}); }

const signature = (id, index, expires) => crypto.createHmac('sha256', secret).update(`${id}:${index}:${expires}`).digest('base64url');
const equal = (a, b) => { try { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); } catch { return false; } };
const json = (res, status, obj) => { if (res.headersSent) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
async function body(req) { let d = ''; for await (const c of req) { d += c; if (d.length > 20000) throw new Error('Request too large.'); } return JSON.parse(d || '{}'); }

const config = { dataDir: DATA_DIR, publicURL: PUBLIC_URL, ticketMs: TICKET_HOURS * 3600000, ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg', maxIptv: MAX_IPTV };
const iptv = createIptv({ config, signature, equal, json, body });
await iptv.cleanStart();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Only the Sideline web app's origin may call this bridge.
  if (origin) {
    if (origin !== APP_ORIGIN) { json(res, 403, { error: 'This origin is not allowed.' }); return; }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Max-Age': '600' }); res.end(); return; }
  try {
    const url = new URL(req.url, 'http://local'), p = url.pathname;
    if (p === '/healthz' || p === '/api/info') { json(res, 200, { name: 'Sideline IPTV Bridge', version: '1.0.0', ok: true }); return; }
    if (p.startsWith('/api/iptv/') && await iptv.handleApi(req, res, p)) return;
    if (p.startsWith('/iptv/') && await iptv.handleMedia(req, res, url, p)) return;
    json(res, 404, { error: 'Not found.' });
  } catch (e) { if (!res.headersSent) json(res, 500, { error: 'Server could not complete the request.' }); else res.destroy(); }
});
server.requestTimeout = 0;      // live streams stay open
server.headersTimeout = 60000;
server.listen(PORT, '0.0.0.0', () => console.log('Sideline IPTV bridge on :' + PORT + ' public=' + (PUBLIC_URL || '(unset)')));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => iptv.close().then(() => process.exit(0)));
