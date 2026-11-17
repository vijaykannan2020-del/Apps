// Downloads the official data files and rebuilds wages.json and employers.json.
// Runs every Sunday (cron) and once after the first install.
// Download links are found automatically on the official pages; set them in .env only to override:
//   OFLC_WAGES_URL  (zip)        from https://flag.dol.gov/wage-data/wage-data-downloads
//   H1B_HUB_URLS    (csv, comma) from the USCIS H-1B Employer Data Hub "files" page
//   PERM_URLS / LCA_URLS (xlsx)  from https://www.dol.gov/agencies/eta/foreign-labor/performance
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const errors = [];
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

const PAGES = {
  wages: 'https://flag.dol.gov/wage-data/wage-data-downloads',
  h1b: 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub/h-1b-employer-data-hub-files',
  dol: 'https://www.dol.gov/agencies/eta/foreign-labor/performance',
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

// Status file for /api/health
fs.writeFileSync('data/update-status.json', JSON.stringify({ at: new Date().toISOString(), wagesUrl, h1b, perm, lca, errors }, null, 2));
log('done');
