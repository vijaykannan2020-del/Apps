// Visa Bulletin from travel.state.gov — refreshed daily, parsed into the app's format.
// If parsing fails (page layout changed), the last good copy or data/content/bulletin.json is served.
import fs from 'node:fs';
import path from 'node:path';
import { notifyBulletin } from './push.mjs';

const INDEX = 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html';
const FILE = path.resolve(process.env.BULLETIN_FILE || 'data/content/bulletin.json');
const COLS = ['all', 'china', 'india', 'mexico', 'philippines'];
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const CATS = [
  [/^1st/i, 'EB-1', 'Priority workers'],
  [/^2nd/i, 'EB-2', 'Advanced degree'],
  [/^3rd/i, 'EB-3', 'Skilled workers & professionals'],
  [/^other workers/i, 'EB-3 OW', 'Other workers'],
  [/^5th unreserved/i, 'EB-5', 'Investors (unreserved)'],
];

let state = null;
let lastError = null;
// travel.state.gov's CDN refuses unknown clients (HTTP 403), so look like a normal browser.
const UA_HEADERS = { headers: {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} };
// Backup copy: a daily GitHub job (casedesk-bulletin.yml) reads the bulletin from GitHub's network and saves
// it in casedesk/site/visa-bulletin.json, which auto-update.sh keeps current on this server. Used when our
// own fetch is blocked, and whenever it holds a newer month than ours.
const SEED = path.resolve(process.env.BULLETIN_SEED || 'site/visa-bulletin.json');
let seedSeen = 0;
// Every fetch gets its own 20 s timeout so a hanging travel.state.gov never stalls /api/visa-bulletin.
const ua = () => ({ ...UA_HEADERS, signal: AbortSignal.timeout(20000) });
export const bulletinStatus = () => ({ loaded: !!state, month: state?.month || null, historyMonths: state?.history?.length ?? 0, error: lastError });
try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

const cell = (s) => {
  s = s.replace(/&nbsp;|\s/g, '').toUpperCase();
  if (s === 'C') return 'C';
  if (s === 'U') return 'U';
  const m = s.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  return m ? `20${m[3]}-${MONTHS[m[2]]}-${m[1]}` : null;
};

function parseTable(html, heading) {
  const at = html.search(heading);
  if (at < 0) return null;
  const table = html.slice(at).match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return null;
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, '').trim()));
  const out = {};
  for (const r of rows) {
    const cat = CATS.find(([re]) => re.test(r[0] || ''));
    if (!cat || r.length < 6) continue;
    out[cat[1]] = Object.fromEntries(COLS.map((c, i) => [c, cell(r[i + 1] || '')]));
  }
  return Object.keys(out).length ? out : null;
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const HISTORY_MAX = 24;

/** travel.state.gov URL of one month's bulletin (folders are by fiscal year: October starts the next year). */
export function bulletinUrl(monthName, year) {
  const i = MONTH_NAMES.indexOf(String(monthName).toLowerCase());
  if (i < 0) throw new Error(`bad month ${monthName}`);
  const fy = +year + (i >= 9 ? 1 : 0);
  return `https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/${fy}/visa-bulletin-for-${MONTH_NAMES[i]}-${year}.html`;
}
const monthKey = (m) => { const x = String(m || '').toLowerCase().match(/^([a-z]+)\s+(\d{4})$/); const i = x ? MONTH_NAMES.indexOf(x[1]) : -1; return i < 0 ? '' : `${x[2]}-${String(i + 1).padStart(2, '0')}`; };
const label = (name, year) => `${name[0].toUpperCase()}${name.slice(1).toLowerCase()} ${year}`;

/** One bulletin page → { month, rows } (null if the employment tables can't be read). */
export function parseBulletin(html, url) {
  const final = parseTable(html, /FINAL ACTION DATES FOR EMPLOYMENT-BASED/i);
  const filing = parseTable(html, /DATES FOR FILING OF EMPLOYMENT-BASED/i);
  if (!final) return null;
  const m = String(url).match(/visa-bulletin-for-([a-z]+)-(\d{4})/i);
  const rows = CATS.filter(([, k]) => final[k]).map(([, cat, lbl]) => ({ cat, label: lbl, final: final[cat], filing: filing?.[cat] ?? Object.fromEntries(COLS.map((c) => [c, null])) }));
  return { month: m ? label(m[1], m[2]) : null, rows };
}

/** Earlier months, oldest first, without the current month and without duplicates (v2.9 planner pace). */
export function mergeHistory(prev, add, currentMonth) {
  const by = new Map();
  for (const s of [...(prev || []), ...(add || [])]) if (s?.month && s.rows?.length && s.month !== currentMonth) by.set(monthKey(s.month), { month: s.month, rows: s.rows });
  return [...by.entries()].filter(([k]) => k).sort(([a], [b]) => a.localeCompare(b)).slice(-HISTORY_MAX).map(([, v]) => v);
}

// The same pages are published on other state.gov hostnames, which travel.state.gov's bot filter doesn't cover.
const HOSTS = ['travel.state.gov', 'adoption.state.gov', 'childabduction.state.gov'];
let goodHost = HOSTS[0];
/** GET a travel.state.gov page, trying the other state.gov hostnames when one refuses. */
async function stateGet(url) {
  let last = null;
  for (const h of [goodHost, ...HOSTS.filter((x) => x !== goodHost)]) {
    try {
      const r = await fetch(url.replace(/^https:\/\/[^/]+/, `https://${h}`), ua());
      if (r.ok) { goodHost = h; return r; }
      last = r;
      if (r.status === 404) return r;
    } catch (e) { last = { ok: false, status: 0, error: e }; }
  }
  return last;
}

export async function refreshBulletin() {
  const r0 = await stateGet(INDEX);
  if (!r0?.ok) throw new Error(`HTTP ${r0?.status ?? 'error'}`);
  const idx = await r0.text();
  const link = idx.match(/href="([^"]*visa-bulletin-for-[a-z]+-\d{4}\.html)"/i)?.[1];
  if (!link) throw new Error('Visa Bulletin link not found');
  const url = link.startsWith('http') ? link : `https://travel.state.gov${link}`;
  const r1 = await stateGet(url);
  if (!r1?.ok) throw new Error(`HTTP ${r1?.status ?? 'error'} for ${url}`);
  const html = await r1.text();
  const parsed = parseBulletin(html, url);
  if (!parsed?.month) throw new Error('Could not parse Final Action table');
  const prev = state;
  const sameMonth = prev?.month === parsed.month;
  const history = mergeHistory(prev?.history, prev && !sameMonth ? [{ month: prev.month, rows: prev.rows }] : [], parsed.month);
  state = {
    month: parsed.month,
    uscisChart: process.env.USCIS_EB_CHART || state?.uscisChart || 'filing', // USCIS announces this monthly at uscis.gov/visabulletininfo
    source: url,
    rows: parsed.rows,
    previous: history[history.length - 1],
    history,
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  notifyBulletin(prev, state).catch((e) => console.error('notify bulletin', e.message));
  return state;
}

/** v2.9 planner: the earlier months the history still lacks, newest first (at most `n` months back). */
export function missingMonths(current, history, n = HISTORY_MAX) {
  const [name, year] = String(current || '').split(' ');
  let i = MONTH_NAMES.indexOf(String(name).toLowerCase()), y = +year;
  if (i < 0 || !y) return [];
  const have = new Set([current, ...(history || []).map((h) => h.month)]);
  const out = [];
  for (let k = 0; k < n; k++) {
    i -= 1; if (i < 0) { i = 11; y -= 1; }
    const m = label(MONTH_NAMES[i], y);
    if (!have.has(m)) out.push({ month: m, url: bulletinUrl(MONTH_NAMES[i], y) });
  }
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** One page, politely: retries network errors, 429 and 5xx with a growing pause. 404 = not published; 401 / 403 = blocked. */
async function politeGet(url, { fetcher, retries, delayMs, sleep }) {
  for (let attempt = 0; ; attempt++) {
    let res = null;
    try { res = await fetcher(url); } catch { res = null; }
    if (res?.ok) { try { return { html: await res.text() }; } catch { res = null; } }
    if (res && (res.status === 404 || res.status === 410)) return { missing: true };
    if (res && (res.status === 401 || res.status === 403)) return { blocked: true };
    if (attempt >= retries) return { failed: true };
    await sleep(delayMs * 2 ** (attempt + 1));
  }
}

/**
 * v2.9: fill the last 24 months of employment-based bulletins from travel.state.gov (official pages only).
 * Sequential with a pause between pages, a few retries, and it gives up quietly when the site blocks us or
 * stays unreachable — the planner then says it needs more months. Runs at most once a day.
 */
let lastBackfill = 0;
let backfilling = null;
export async function backfillHistory(opts = {}) {
  if (typeof opts === 'number') opts = { months: opts };
  const { months = HISTORY_MAX, fetcher = (u) => stateGet(u), delayMs = 1500, retries = 2, giveUpAfter = 3, sleep = wait } = opts;
  if (!state?.month) return 0;
  if (backfilling) return backfilling;
  lastBackfill = Date.now();
  backfilling = (async () => {
    const todo = missingMonths(state.month, state.history, months);
    const add = [];
    let failures = 0, stopped = '';
    for (let k = 0; k < todo.length; k++) {
      if (k) await sleep(delayMs);
      const r = await politeGet(todo[k].url, { fetcher, retries, delayMs, sleep });
      if (r.blocked) { stopped = 'blocked by travel.state.gov'; break; }
      if (r.failed) { if (++failures >= giveUpAfter) { stopped = 'travel.state.gov unreachable'; break; } continue; }
      failures = 0;
      if (r.missing) continue;
      const p = parseBulletin(r.html, todo[k].url);
      if (p?.month && p.rows.length) add.push(p);
    }
    if (add.length) {
      state.history = mergeHistory(state.history, add, state.month);
      state.previous = state.history[state.history.length - 1];
      try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch (e) { console.error('bulletin history save:', e.message); }
    }
    if (stopped) console.error(`bulletin history: ${stopped}; have ${state.history?.length ?? 0} of ${HISTORY_MAX} earlier months, will try again tomorrow`);
    return add.length;
  })();
  try { return await backfilling; } finally { backfilling = null; }
}

/** First run (and whenever fewer than 24 earlier months are kept): load the bulletin, then fill the history. Never throws. */
export async function ensureBulletinHistory(opts) {
  try { await getBulletin({ backfill: false }); } catch { return 0; }
  if ((state?.history?.length ?? 0) >= HISTORY_MAX) return 0;
  try { return await backfillHistory(opts); } catch (e) { console.error('bulletin history:', e.message); return 0; }
}

/** Take the GitHub copy when it is newer (new month, or the same month with more history). Never throws. */
export function adoptSeed({ file = SEED, force = false } = {}) {
  try {
    const mt = fs.statSync(file).mtimeMs;
    if (!force && mt === seedSeen) return false;
    seedSeen = mt;
    const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!seed?.month || !Array.isArray(seed.rows) || !seed.rows.length) return false;
    const a = monthKey(seed.month), b = monthKey(state?.month); // 'YYYY-MM' strings compare in order
    if (!a) return false;
    if (state && (a < b || (a === b && (seed.history?.length ?? 0) <= (state.history?.length ?? 0)))) return false;
    const prev = state;
    const history = mergeHistory(seed.history, prev && a > b ? [{ month: prev.month, rows: prev.rows }, ...(prev.history || [])] : prev?.history || [], seed.month);
    state = { ...seed, uscisChart: process.env.USCIS_EB_CHART || seed.uscisChart || prev?.uscisChart || 'filing', history, previous: history[history.length - 1] };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
    if (prev && a > b) notifyBulletin(prev, state).catch((e) => console.error('notify bulletin', e.message));
    lastError = null;
    return true;
  } catch { return false; }
}

export async function getBulletin({ backfill = true } = {}) {
  adoptSeed();
  if (!state || Date.now() - (fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0) > 24 * 3600e3) {
    try { await refreshBulletin(); lastError = null; } catch (e) { lastError = e.message; console.error('bulletin:', e.message); if (adoptSeed({ force: true })) lastError = `${e.message} (using the GitHub copy)`; }
  }
  if (!state) throw Object.assign(new Error('Visa Bulletin not loaded yet'), { status: 503 });
  if (backfill && (state.history?.length ?? 0) < HISTORY_MAX && !backfilling && Date.now() - lastBackfill > 24 * 3600e3) backfillHistory().catch((e) => console.error('bulletin history:', e.message));
  return state;
}
