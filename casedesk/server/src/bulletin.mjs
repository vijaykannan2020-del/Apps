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

export async function refreshBulletin() {
  const r0 = await fetch(INDEX, UA);
  if (!r0.ok) throw new Error(`HTTP ${r0.status}`);
  const idx = await r0.text();
  const link = idx.match(/href="([^"]*visa-bulletin-for-[a-z]+-\d{4}\.html)"/i)?.[1];
  if (!link) throw new Error('Visa Bulletin link not found');
  const url = link.startsWith('http') ? link : `https://travel.state.gov${link}`;
  const html = await (await fetch(url, UA)).text();
  const final = parseTable(html, /FINAL ACTION DATES FOR EMPLOYMENT-BASED/i);
  const filing = parseTable(html, /DATES FOR FILING OF EMPLOYMENT-BASED/i);
  if (!final) throw new Error('Could not parse Final Action table');
  const month = url.match(/visa-bulletin-for-([a-z]+)-(\d{4})/i);
  const prev = state;
  const rows = CATS.filter(([, k]) => final[k]).map(([, cat, label]) => ({ cat, label, final: final[cat], filing: filing?.[cat] ?? Object.fromEntries(COLS.map((c) => [c, null])) }));
  state = {
    month: `${month[1][0].toUpperCase()}${month[1].slice(1)} ${month[2]}`,
    uscisChart: process.env.USCIS_EB_CHART || state?.uscisChart || 'filing', // USCIS announces this monthly at uscis.gov/visabulletininfo
    source: url,
    rows,
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  notifyBulletin(prev, state).catch((e) => console.error('notify bulletin', e.message));
  return state;
}

export async function getBulletin() {
  if (!state || Date.now() - (fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0) > 24 * 3600e3) {
    try { await refreshBulletin(); lastError = null; } catch (e) { lastError = e.message; console.error('bulletin:', e.message); }
  }
  if (!state) throw Object.assign(new Error('Visa Bulletin not loaded yet'), { status: 503 });
  return state;
}
