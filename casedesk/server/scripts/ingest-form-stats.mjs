// Build data/form-stats.json from official USCIS spreadsheets downloaded by update-data.mjs:
//   data/raw/formstats/quarterly_all_forms_fy*_q*.xlsx            (service-wide forms by quarter, status, processing time)
//   data/raw/formstats/i129_quarterly_request_for_evidence_*.xlsx (I-129 RFE and approval rates by classification)
//   data/raw/h1b/*.csv                                            (H-1B Employer Data Hub, already downloaded for employers)
// Usage: node scripts/ingest-form-stats.mjs [rawDir] [outFile] [urls.json]
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { parseAllForms, parseRfe, addHubRow, hubSummary, buildFormStats, periodFromName } from '../src/formstats.mjs';
import { readRows } from '../src/csv.mjs';

const dir = process.argv[2] || 'data/raw/formstats';
const out = process.argv[3] || 'data/form-stats.json';
const urls = (() => { try { return JSON.parse(fs.readFileSync(process.argv[4] || path.join(dir, 'urls.json'), 'utf8')); } catch { return {}; } })();
const hubDir = process.env.H1B_RAW_DIR || 'data/raw/h1b';

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.xlsx$/i.test(f)) : [];
const sheets = (f) => {
  const wb = XLSX.readFile(path.join(dir, f), { cellDates: false });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, blankrows: false, defval: '' })]));
};

const allForms = [];
for (const f of files.filter((x) => /all_forms/i.test(x))) {
  try {
    const s = sheets(f);
    const first = Object.values(s)[0];
    const parsed = parseAllForms(first, f);
    allForms.push({ parsed, file: f, url: urls[f] });
    console.log(`all forms ${f}: ${parsed.rows.length} rows (${parsed.label || 'period unknown'})`);
  } catch (e) { console.error(`all forms ${f} failed: ${e.message}`); }
}

let rfe = null;
const rfeFiles = files.filter((x) => /request_for_evidence|rfe/i.test(x)).sort((a, b) => { const p = (x) => { const q = periodFromName(x); return q ? q.fy * 10 + q.q : 0; }; return p(b) - p(a); });
for (const f of rfeFiles) {
  try {
    const parsed = parseRfe(sheets(f), f);
    if (!Object.keys(parsed.classes).length) throw new Error('no classification tabs found');
    rfe = { parsed, file: f, url: urls[f] };
    console.log(`I-129 RFE ${f}: ${Object.keys(parsed.classes).join(', ')}`);
    break;
  } catch (e) { console.error(`I-129 RFE ${f} failed: ${e.message}`); }
}

let hub = null;
if (fs.existsSync(hubDir)) {
  const acc = {};
  for (const f of fs.readdirSync(hubDir).filter((x) => /\.(csv|tsv|txt)$/i.test(x))) {
    try {
      const fy = f.match(/(20\d{2})/)?.[1] || '';
      for await (const r of readRows(path.join(hubDir, f))) addHubRow(acc, r, fy);
    } catch (e) { console.error(`H-1B hub ${f} failed: ${e.message}`); }
  }
  hub = hubSummary(acc);
}

if (!allForms.length && !rfe) { console.error('No USCIS form statistics parsed — keeping the previous form-stats.json'); process.exit(1); }
const result = buildFormStats({ allForms, rfe, hub });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result));
console.log(`Saved ${out}: ${result.allForms?.rows.length || 0} form rows (${result.allForms?.label || '-'}), RFE classes ${Object.keys(result.rfe?.classes || {}).length}, hub years ${Object.keys(result.h1bHub || {}).length}`);
