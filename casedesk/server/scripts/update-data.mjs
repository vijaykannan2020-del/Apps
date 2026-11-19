// Downloads the official data files and rebuilds wages.json and employers.json.
// Runs every Sunday (cron) and once after the first install.
// Download links are found automatically on the official pages; set them in .env only to override:
//   OFLC_WAGES_URL  (zip)        from https://flag.dol.gov/wage-data/wage-data-downloads
//   H1B_HUB_URLS    (csv, comma) from the USCIS H-1B Employer Data Hub "files" page
//   PERM_URLS / LCA_URLS (xlsx)  from https://www.dol.gov/agencies/eta/foreign-labor/performance
//   FORM_STATS_URLS (xlsx, comma) from https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data
//     (quarterly_all_forms_fyYYYY_qN*.xlsx and i129_quarterly_request_for_evidence_fyYYYY_qN*.xlsx)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recentQuarters } from '../src/formstats.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const errors = [];
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

const PAGES = {
  wages: 'https://flag.dol.gov/wage-data/wage-data-downloads',
  h1b: 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub/h-1b-employer-data-hub-files',
  dol: 'https://www.dol.gov/agencies/eta/foreign-labor/performance',
  forms: 'https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data',
};

async function links(page, re) {
  const r = await fetch(page, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} on ${page}`);
  const html = await r.text();
  const base = new URL(page);
  return [...new Set([...html.matchAll(/href="([^"]+)"/gi)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), base).href).filter((u) => re.test(u)))];
}

// Latest wage-year zip, e.g. OFLC_Wages_2026-27_Updated.zip
async function findWages() {
  const urls = await links(PAGES.wages, /OFLC_Wages_\d{4}-\d{2}[^/]*\.zip$/i);
  return urls.sort((a, b) => (b.match(/(\d{4})-\d{2}/)?.[1] || '').localeCompare(a.match(/(\d{4})-\d{2}/)?.[1] || ''))[0];
}
// Data Hub CSVs, newest 5 fiscal years
async function findH1B() {
  const urls = await links(PAGES.h1b, /\.csv(\?|$)/i);
  const fy = (u) => +(u.match(/(?:FY)?(20\d{2})/i)?.[1] || 0);
  return urls.sort((a, b) => fy(b) - fy(a)).slice(0, 5);
}
// DOL disclosure files are cumulative per fiscal year → take the latest quarter of the newest N years
async function findDol(prefix, years) {
  const urls = await links(PAGES.dol, new RegExp(`${prefix}_Disclosure_Data_FY\\d{4}[^/]*\\.xlsx$`, 'i'));
  const byFy = {};
  for (const u of urls) {
    const fy = u.match(/FY(\d{4})/i)[1];
    const q = +(u.match(/_Q(\d)/i)?.[1] || 0);
    if (!byFy[fy] || q > byFy[fy].q) byFy[fy] = { u, q };
  }
  return Object.keys(byFy).sort().reverse().slice(0, years).map((fy) => byFy[fy].u);
}

// USCIS form statistics: the data page lists files 10 per page and filters by topic, so look on a few filtered
// views; if the page can't be read, try the predictable file names for the last 8 quarters.
const FILE_BASE = 'https://www.uscis.gov/sites/default/files/document/data/';
const fyq = (u) => { const m = u.match(/fy(\d{4})_q(\d)/i); return m ? +m[1] * 10 + +m[2] : 0; };
async function exists(u) {
  try { const r = await fetch(u, { method: 'HEAD', headers: UA }); return r.ok && !/text\/html/i.test(r.headers.get('content-type') || ''); } catch { return false; }
}
async function findFormStats() {
  const views = ['?topic_id%5B%5D=33700&items_per_page=100', '?query=all+forms&items_per_page=100', '?query=request+for+evidence&items_per_page=100', ''];
  let found = [];
  for (const v of views) {
    try { found.push(...(await links(PAGES.forms + v, /(quarterly_all_forms_fy\d{4}_q\d|i129_quarterly_request_for_evidence_fy\d{4}[^/]*_q\d)[^/]*\.xlsx$/i))); } catch (e) { log(`forms page${v ? ' ' + v : ''}: ${e.message}`); }
  }
  found = [...new Set(found)];
  const pick = (re, k) => { const seen = new Set(); return found.filter((u) => re.test(u)).sort((a, b) => fyq(b) - fyq(a) || a.length - b.length).filter((u) => !seen.has(fyq(u)) && seen.add(fyq(u))).slice(0, k); };
  let all = pick(/quarterly_all_forms/i, 4), rfe = pick(/request_for_evidence/i, 1);
  if (!all.length || !rfe.length) {
    const suffixes = ['_v1', '', '_0', '_v2'];
    for (const { fy, q } of recentQuarters()) {
      if (all.length < 4 && !all.some((u) => fyq(u) === fy * 10 + q)) for (const s of suffixes) { const u = `${FILE_BASE}quarterly_all_forms_fy${fy}_q${q}${s}.xlsx`; if (await exists(u)) { all.push(u); break; } }
      if (!rfe.length) for (const s of suffixes) { const u = `${FILE_BASE}i129_quarterly_request_for_evidence_fy${fy}_q${q}${s}.xlsx`; if (await exists(u)) { rfe.push(u); break; } }
      if (all.length >= 4 && rfe.length) break;
    }
  }
  return [...all, ...rfe];
}

async function download(url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const name = decodeURIComponent(url.split('/').pop().split('?')[0]);
  const dest = path.join(dir, name);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  log(`downloaded ${name} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
  return dest;
}
// Run a step in its own Node process with a bigger memory limit; keep the end of its error output for /api/health
const run = (script, args = []) => {
  try { execFileSync(process.execPath, ['--max-old-space-size=4500', '--expose-gc', script, ...args], { stdio: ['ignore', 'inherit', 'pipe'], maxBuffer: 1e7 }); }
  catch (e) { throw new Error(`${path.basename(script)} failed: ${String(e.stderr || e.message).trim().split('\n').slice(-3).join(' | ').slice(0, 300)}`); }
};
const tryIt = async (label, fn) => { try { return await fn(); } catch (e) { log(`${label}: ${e.message}`); errors.push(`${label}: ${e.message}`.slice(0, 200)); return null; } };

// 1) Prevailing wages
const wagesUrl = process.env.OFLC_WAGES_URL || (await tryIt('find wages', findWages));
if (wagesUrl) {
  await tryIt('wages', async () => {
    const zip = await download(wagesUrl, 'data/raw/wages');
    fs.rmSync('data/raw/oflc', { recursive: true, force: true });
    execFileSync('unzip', ['-o', '-j', zip, '-d', 'data/raw/oflc'], { stdio: 'ignore' });
    run('scripts/ingest-wages.mjs', ['data/raw/oflc', process.env.OFLC_WAGE_YEAR || wagesUrl.match(/(20\d{2}-\d{2})/)?.[1] || '']);
  });
} else log('wages: no download link found — set OFLC_WAGES_URL in .env');

// 2) Employers: H-1B Data Hub + PERM (+ LCA if enabled)
const h1b = list(process.env.H1B_HUB_URLS).length ? list(process.env.H1B_HUB_URLS) : (await tryIt('find H-1B', findH1B)) || [];
const perm = process.env.INGEST_PERM !== '1' ? [] : list(process.env.PERM_URLS).length ? list(process.env.PERM_URLS) : (await tryIt('find PERM', () => findDol('PERM', 3))) || [];
const lca = process.env.INGEST_LCA === '1' ? (list(process.env.LCA_URLS).length ? list(process.env.LCA_URLS) : (await tryIt('find LCA', () => findDol('LCA', 1))) || []) : [];
for (const u of h1b) await tryIt('H-1B', () => download(u, 'data/raw/h1b'));
for (const u of perm) await tryIt('PERM', () => download(u, 'data/raw/perm'));
for (const u of lca) await tryIt('LCA', () => download(u, 'data/raw/lca'));
if (h1b.length || perm.length || lca.length) await tryIt('employers', () => run('scripts/ingest-employers.mjs'));
else log('employers: no download links found');

// 3) USCIS form statistics (approval rates, median processing time, I-129 RFE rates) → data/form-stats.json
const formStats = list(process.env.FORM_STATS_URLS).length ? list(process.env.FORM_STATS_URLS) : (await tryIt('find form stats', findFormStats)) || [];
if (formStats.length) {
  await tryIt('form stats', async () => {
    fs.rmSync('data/raw/formstats', { recursive: true, force: true });
    const urls = {};
    for (const u of formStats) { const f = await tryIt('form stats file', () => download(u, 'data/raw/formstats')); if (f) urls[path.basename(f)] = u; }
    fs.writeFileSync('data/raw/formstats/urls.json', JSON.stringify(urls));
    run('scripts/ingest-form-stats.mjs');
  });
} else log('form stats: no download links found — set FORM_STATS_URLS in .env');

// Status file for /api/health
fs.writeFileSync('data/update-status.json', JSON.stringify({ at: new Date().toISOString(), wagesUrl, h1b, perm, lca, formStats, errors }, null, 2));
log('done');
