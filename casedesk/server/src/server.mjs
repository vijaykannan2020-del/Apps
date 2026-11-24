// CaseDesk API — plain Node (no dependencies). Run: npm start
// launch-reset first: it may clear data/ before the modules below load it (see the file)
import './launch-reset.mjs';
import http from 'node:http';
import fs from 'node:fs';
import { caseStatus, uscisMode, redactPath } from './uscis.mjs';
import { getNews, refreshNews } from './news.mjs';
import { searchSoc, searchArea, wage, wageStatus, states, counties } from './wages.mjs';
import { top, employer, h1bStatus } from './h1b.mjs';
import { getBulletin } from './bulletin.mjs';
import { guides, processingTimes } from './content.mjs';
import { subscribe, unsubscribe, pushStatus } from './push.mjs';
import { getWaits, waitsStatus } from './waits.mjs';
import { submit as communitySubmit, remove as communityRemove, stats as communityStats, communityStatus } from './community.mjs';
import { bulletinStatus, ensureBulletinHistory } from './bulletin.mjs';
import { expectFor, formStatsStatus } from './expect.mjs';
import { sendPush } from './push.mjs';
import { createForum, isForumPath } from './forum.mjs';
import { appleVerifier, googleVerifier, appleExchangeCode, appleRevoke } from './auth.mjs';
import { supportPage } from './support.mjs';
import { handleSite } from './site.mjs';
import { moderatePage } from './moderate.mjs';
import { createWallet, ensureKeyAndCsr, ensureWwdr } from './wallet.mjs';

// Community Q&A + sign in (src/forum.mjs). Data in data/forum.json, flushed every 10 s and on shutdown.
const forum = createForum({ file: 'data/forum.json', notify: sendPush, verifyApple: appleVerifier(), verifyGoogle: googleVerifier(), exchangeAppleCode: appleExchangeCode, revokeApple: appleRevoke });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { forum.close(); } catch {} process.exit(0); });

// Apple Wallet status card (src/wallet.mjs): the server makes its own key + CSR once (data/wallet/), so the
// private key never leaves it. Signing turns on when the Pass Type ID certificate (wallet/pass.cer) is in place.
try { ensureKeyAndCsr(); } catch (e) { console.error('wallet key/CSR:', e.message); }
const wallet = createWallet();
ensureWwdr().then((got) => { if (got) wallet.reload(); }).catch((e) => console.error('wallet WWDR:', e.message));

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
  '/api/health': () => ({ ok: true, uscis: !!process.env.USCIS_CLIENT_ID, uscisMode: uscisMode(), wages: wageStatus(), employers: h1bStatus(), push: pushStatus(), waits: waitsStatus(), bulletin: bulletinStatus(), community: communityStatus(), formStats: formStatsStatus(), forum: forum.status(), wallet: wallet.status().enabled, data: (() => { try { const d = JSON.parse(fs.readFileSync('data/update-status.json', 'utf8')); return { at: d.at, h1bFiles: d.h1b?.length || 0, permFiles: d.perm?.length || 0, errors: d.errors || [] }; } catch { return null; } })(), time: new Date().toISOString() }),
  '/api/news': () => getNews(),
  '/api/wage': (q) => wage(q.get('soc') || '', q.get('area') || ''),
  '/api/wage/soc': (q) => searchSoc(q.get('q') || ''),
  '/api/wage/areas': (q) => searchArea(q.get('q') || ''),
  '/api/wage/states': () => states(),
  '/api/wage/counties': (q) => counties((q.get('state') || '').toUpperCase()),
  '/api/employer': (q) => employer(q.get('q') || ''),
  '/api/h1b/top': (q) => top(q.get('fy') || '2025', q.get('type') || 'initial', Number(q.get('n')) || 10),
  '/api/visa-bulletin': () => getBulletin(),
  '/api/visa-waits': () => getWaits(),
  '/api/community/stats': (q) => communityStats(q),
  '/api/expect': (q) => expectFor(q),
  '/api/processing-times': () => processingTimes(),
  '/api/content/guides': () => guides(),
};

const server = http.createServer(async (req, res) => {
  const send = (status, body, cache = 'no-store') => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': cache,
    });
    res.end(JSON.stringify(body));
  };
  // Moderator page (works on every host): password stays in the browser, data comes from /api/admin/forum/*
  if (req.method === 'GET' && (req.url === '/moderate' || req.url.startsWith('/moderate?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    return res.end(moderatePage());
  }
  // Company website (tharamaya.com) by Host — see src/site.mjs
  if (handleSite(req, res)) return;
  if (req.method === 'OPTIONS') return send(204, {});
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return send(429, { error: 'Too many requests — slow down.' });

  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/support' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      return res.end(supportPage());
    }
    // Wallet status card: status, the server's CSR (public; only until a certificate is installed), and the pass.
    // The card body is used once to build the pass in memory and is never stored or logged.
    if (url.pathname === '/api/wallet/status' && req.method === 'GET') return send(200, wallet.status());
    if (url.pathname === '/api/wallet/csr' && req.method === 'GET') {
      const csr = wallet.csr();
      if (!csr) return send(404, { error: 'No CSR (signing is already set up, or the key is configured another way).' });
      res.writeHead(200, { 'Content-Type': 'application/pkcs10; charset=utf-8', 'Content-Disposition': 'attachment; filename="ImmigrationWallet-pass.certSigningRequest"', 'Cache-Control': 'no-store' });
      return res.end(csr);
    }
    if (url.pathname === '/api/wallet/pass' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(413, { error: 'Too large' }); }
      let body; try { body = JSON.parse(raw || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
      const out = wallet.handle(body, ip);
      if (out.status !== 200) return send(out.status, out.body);
      res.writeHead(200, { 'Content-Type': out.type, 'Content-Disposition': 'attachment; filename="Immigration-status-card.pkpass"', 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store' });
      return res.end(out.body);
    }
    // Community Q&A, sign in, account and moderation (src/forum.mjs). Bodies up to 16 KB.
    if (isForumPath(url.pathname)) {
      let body = {};
      if (req.method === 'POST' || req.method === 'DELETE') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 16384) return send(413, { error: 'Too large' }); }
        try { body = JSON.parse(raw || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
      }
      const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
      const out = await forum.route({ method: req.method, path: url.pathname, query: url.searchParams, body, token, ip });
      if (out) return send(200, out);
    }
    // Write endpoints: alerts sign-up (token + topics) and anonymous community timelines. Tiny JSON bodies.
    if ((url.pathname === '/api/alerts' || url.pathname === '/api/community') && (req.method === 'POST' || req.method === 'DELETE')) {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(413, { error: 'Too large' }); }
      let body; try { body = JSON.parse(raw || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
      if (url.pathname === '/api/community') return send(200, req.method === 'POST' ? communitySubmit(body) : communityRemove(body));
      return send(200, req.method === 'POST' ? subscribe(body) : unsubscribe(body));
    }
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
    const m = url.pathname.match(/^\/api\/case\/([A-Za-z0-9]{13})$/);
    if (m) return send(200, await caseStatus(m[1]));
    const fn = routes[url.pathname];
    if (!fn) return send(404, { error: 'Not found' });
    const cache = url.pathname.startsWith('/api/health') || url.pathname.startsWith('/api/community') ? 'no-store' : 'public, max-age=300';
    return send(200, await fn(url.searchParams), cache);
  } catch (e) {
    console.error(redactPath(url.pathname), e.message); // receipt numbers are never logged
    return send(e.status || 500, { error: e.status ? e.message : 'Something went wrong.', ...(e.code ? { code: e.code } : {}) });
  }
});

server.listen(PORT, () => {
  console.log(`CaseDesk API on :${PORT}`);
  refreshNews().catch((e) => console.error('initial news load failed:', e.message));
  // Visa Bulletin: first run (or fewer than 24 earlier months kept) → fill the planner's history, politely, in the background.
  setTimeout(() => ensureBulletinHistory().catch(() => {}), 5_000);
  setInterval(() => refreshNews().catch(() => {}), (Number(process.env.NEWS_REFRESH_MINUTES) || 60) * 60_000);
});
