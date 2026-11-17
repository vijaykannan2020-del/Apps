// CaseDesk API — plain Node (no dependencies). Run: npm start
import http from 'node:http';
import fs from 'node:fs';
import { caseStatus } from './uscis.mjs';
import { getNews, refreshNews } from './news.mjs';
import { searchSoc, searchArea, wage, wageStatus, states, counties } from './wages.mjs';
import { top, employer, h1bStatus } from './h1b.mjs';
import { getBulletin } from './bulletin.mjs';
import { guides, processingTimes } from './content.mjs';

const PORT = Number(process.env.PORT) || 8787;
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Simple per-IP rate limit: 60 requests/minute
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  h.push(now); hits.set(ip, h);
  return h.length > 60;
};

const routes = {
  '/api/health': () => ({ ok: true, uscis: !!process.env.USCIS_CLIENT_ID, wages: wageStatus(), employers: h1bStatus(), lastDataUpdate: (() => { try { return JSON.parse(fs.readFileSync('data/update-status.json', 'utf8')).at; } catch { return null; } })(), time: new Date().toISOString() }),
  '/api/news': () => getNews(),
  '/api/wage': (q) => wage(q.get('soc') || '', q.get('area') || ''),
  '/api/wage/soc': (q) => searchSoc(q.get('q') || ''),
  '/api/wage/areas': (q) => searchArea(q.get('q') || ''),
  '/api/wage/states': () => states(),
  '/api/wage/counties': (q) => counties((q.get('state') || '').toUpperCase()),
  '/api/employer': (q) => employer(q.get('q') || ''),
  '/api/h1b/top': (q) => top(q.get('fy') || '2025', q.get('type') || 'initial', Number(q.get('n')) || 10),
  '/api/visa-bulletin': () => getBulletin(),
  '/api/processing-times': () => processingTimes(),
  '/api/content/guides': () => guides(),
};

const server = http.createServer(async (req, res) => {
  const send = (status, body, cache = 'no-store') => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': cache,
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, {});
  if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return send(429, { error: 'Too many requests — slow down.' });

  const url = new URL(req.url, 'http://x');
  try {
    const m = url.pathname.match(/^\/api\/case\/([A-Za-z0-9]{13})$/);
    if (m) return send(200, await caseStatus(m[1]));
    const fn = routes[url.pathname];
    if (!fn) return send(404, { error: 'Not found' });
    const cache = url.pathname.startsWith('/api/health') ? 'no-store' : 'public, max-age=300';
    return send(200, await fn(url.searchParams), cache);
  } catch (e) {
    console.error(url.pathname, e.message);
    return send(e.status || 500, { error: e.status ? e.message : 'Something went wrong.' });
  }
});

server.listen(PORT, () => {
  console.log(`CaseDesk API on :${PORT}`);
  refreshNews().catch((e) => console.error('initial news load failed:', e.message));
  setInterval(() => refreshNews().catch(() => {}), (Number(process.env.NEWS_REFRESH_MINUTES) || 60) * 60_000);
});
