// Build data/employers.json: per employer, per fiscal year —
//   H-1B approvals/denials (USCIS H-1B Employer Data Hub CSVs in data/raw/h1b)
//   PERM certified/denied/withdrawn (DOL OFLC PERM disclosure .xlsx in data/raw/perm)
//   LCA certified (DOL OFLC LCA disclosure .xlsx in data/raw/lca — optional, large)
// Usage: node scripts/ingest-employers.mjs
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { readRows } from '../src/csv.mjs';
import { keyOf } from '../src/keys.mjs';

const RAW = 'data/raw';
const files = (dir, re) => (fs.existsSync(path.join(RAW, dir)) ? fs.readdirSync(path.join(RAW, dir)).filter((f) => re.test(f)).map((f) => path.join(RAW, dir, f)) : []);
const num = (s) => parseInt(String(s ?? '').replace(/[^0-9]/g, ''), 10) || 0;
const db = new Map();
const get = (name, state) => {
  const k = keyOf(name);
  if (!k) return null;
  let e = db.get(k);
  if (!e) { e = { name: String(name).trim().replace(/\s+/g, ' '), state: state || '', h1b: {}, perm: {}, lca: {} }; db.set(k, e); }
  if (!e.state && state) e.state = state;
  return e;
};
const fyOf = (date, fallback) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return fallback;
  return String(d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear()); // federal FY starts Oct 1
};
const fyFromName = (f) => f.match(/FY\s?(\d{4})/i)?.[1] || f.match(/(20\d{2})/)?.[1] || '';

// 1) H-1B Employer Data Hub
for (const f of files('h1b', /\.(csv|tsv|txt)$/i)) {
  let n = 0;
  for await (const r of readRows(f)) {
    const keys = Object.keys(r);
    const k = (re) => keys.find((h) => re.test(h));
    const fy = String(r[k(/fiscal year/i)] || '').trim() || fyFromName(f);
    const e = get(r[k(/employer|petitioner name/i)] || '', String(r[k(/petitioner state|^state$/i)] || '').trim());
    if (!fy || !e) continue;
    const y = (e.h1b[fy] ||= { initialApproval: 0, initialDenial: 0, continuingApproval: 0, continuingDenial: 0 });
    for (const h of keys) {
      const v = num(r[h]); if (!v) continue;
      const initial = /initial|new employment/i.test(h);
      if (/approv/i.test(h)) initial ? (y.initialApproval += v) : (y.continuingApproval += v);
      else if (/denial|denied/i.test(h)) initial ? (y.initialDenial += v) : (y.continuingDenial += v);
    }
    n++;
  }
  console.log(`H-1B ${path.basename(f)}: ${n.toLocaleString()} rows`);
}

// 2) & 3) DOL disclosure spreadsheets
function sheetRows(f) {
  const wb = XLSX.readFile(f, { dense: true, cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}
for (const f of files('perm', /\.xlsx$/i)) {
  const rows = sheetRows(f);
  const fyFile = fyFromName(path.basename(f));
  for (const r of rows) {
    const name = r.EMP_BUSINESS_NAME || r.EMPLOYER_NAME || r.EMPLOYER_BUSINESS_NAME || '';
    const e = get(name, r.EMP_STATE || r.EMPLOYER_STATE || '');
    if (!e) continue;
    const fy = fyFile || fyOf(r.DECISION_DATE, '');
    const y = (e.perm[fy] ||= { certified: 0, denied: 0, withdrawn: 0 });
    const s = String(r.CASE_STATUS || '').toLowerCase();
    if (s.startsWith('certified')) y.certified++; else if (s.startsWith('denied')) y.denied++; else if (s.startsWith('withdrawn')) y.withdrawn++;
  }
  console.log(`PERM ${path.basename(f)}: ${rows.length.toLocaleString()} rows`);
}
for (const f of files('lca', /\.xlsx$/i)) {
  const rows = sheetRows(f);
  const fyFile = fyFromName(path.basename(f));
  for (const r of rows) {
    if (!String(r.CASE_STATUS || '').toLowerCase().startsWith('certified')) continue;
    if (r.VISA_CLASS && !/H-1B/i.test(r.VISA_CLASS)) continue;
    const e = get(r.EMPLOYER_NAME || '', r.EMPLOYER_STATE || '');
    if (!e) continue;
    const fy = fyFile || fyOf(r.DECISION_DATE, '');
    (e.lca[fy] ||= { certified: 0 }).certified++;
  }
  console.log(`LCA ${path.basename(f)}: ${rows.length.toLocaleString()} rows`);
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/employers.json', JSON.stringify(Object.fromEntries(db)));
console.log(`Saved ${db.size.toLocaleString()} employers.`);
