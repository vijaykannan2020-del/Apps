// Visa Bulletin from travel.state.gov — refreshed daily, parsed into the app's format.
// If parsing fails (page layout changed), the last good copy or data/content/bulletin.json is served.
import fs from 'node:fs';
import path from 'node:path';
import { notifyBulletin } from './push.mjs';

const INDEX = 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html';
const FILE = path.resolve('data/content/bulletin.json');
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
const UA = { headers: { 'User-Agent': 'CaseDesk/1.0 (immigration info app; +https://casedeskapp.duckdns.org)', Accept: 'text/html' } };
export const bulletinStatus = () => ({ loaded: !!state, month: state?.month || null, error: lastError });
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

export async function refreshBulletin() {
  const r0 = await fetch(INDEX, UA);
  if (!r0.ok) throw new Error(`HTTP ${r0.status}`);
  const idx = await r0.text();
  const link = idx.match(/href="([^"]*visa-bulletin-for-[a-z]+-\d{4}\.html)"/i)?.[1];
  if (!link) throw new Error('Visa Bulletin link not found');
  const url = link.startsWith('http') ? link : `https://travel.state.gov${link}`;
  const html = await (await fetch(url, UA)).text();
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

/** v2.9: fill up to `n` earlier months from travel.state.gov (official pages only), once a day at most. */
let lastBackfill = 0;
export async function backfillHistory(n = 13, fetcher = (u) => fetch(u, UA)) {
  if (!state?.month) return 0;
  lastBackfill = Date.now();
  const [name, year] = state.month.split(' ');
  let i = MONTH_NAMES.indexOf(name.toLowerCase()), y = +year;
  const have = new Set([state.month, ...(state.history || []).map((h) => h.month)]);
  const add = [];
  for (let k = 0; k < n; k++) {
    i -= 1; if (i < 0) { i = 11; y -= 1; }
    const m = label(MONTH_NAMES[i], y);
    if (have.has(m)) continue;
    try {
      const r = await fetcher(bulletinUrl(MONTH_NAMES[i], y));
      if (!r.ok) continue;
      const p = parseBulletin(await r.text(), bulletinUrl(MONTH_NAMES[i], y));
      if (p?.month) add.push(p);
    } catch { /* one month missing is fine */ }
  }
  if (add.length) {
    state.history = mergeHistory(state.history, add, state.month);
    state.previous = state.history[state.history.length - 1];
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  }
  return add.length;
}

export async function getBulletin() {
  if (!state || Date.now() - (fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0) > 24 * 3600e3) {
    try { await refreshBulletin(); lastError = null; } catch (e) { lastError = e.message; console.error('bulletin:', e.message); }
  }
  if (!state) throw Object.assign(new Error('Visa Bulletin not loaded yet'), { status: 503 });
  if ((state.history?.length ?? 0) < 6 && Date.now() - lastBackfill > 24 * 3600e3) backfillHistory().catch((e) => console.error('bulletin history:', e.message));
  return state;
}
