// Official USCIS form statistics: parse fixture workbooks (written as real .xlsx files) and build form-stats.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import XLSX from 'xlsx';
import { parseAllForms, parseRfe, num, periodFromName, quarterDates, recentQuarters, classKey } from '../src/formstats.mjs';

const FIX = path.join(import.meta.dirname, 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
export function writeXlsx(dir, name, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n.slice(0, 31));
  XLSX.writeFile(wb, path.join(dir, name));
}

test('numbers: commas, dash, suppressed', () => {
  assert.equal(num('1,234'), 1234); assert.equal(num(4.6), 4.6); assert.equal(num('4.6'), 4.6);
  assert.equal(num('-'), 0); assert.equal(num('D'), null); assert.equal(num('N/A'), null); assert.equal(num(''), null);
});

test('periods and fiscal quarters', () => {
  assert.deepEqual(periodFromName('quarterly_all_forms_fy2026_q3_v1.xlsx'), { fy: 2026, q: 3 });
  assert.deepEqual(periodFromName('i129_quarterly_request_for_evidence_fy2026_q3_v1.xlsx'), { fy: 2026, q: 3 });
  assert.deepEqual(quarterDates(2026, 1), { start: '2025-10-01', end: '2025-12-31' });
  assert.deepEqual(quarterDates(2026, 3), { start: '2026-04-01', end: '2026-06-30' });
  assert.deepEqual(recentQuarters(new Date('2026-11-18T00:00:00Z'), 3), [{ fy: 2026, q: 4 }, { fy: 2026, q: 3 }, { fy: 2026, q: 2 }]);
  assert.deepEqual(recentQuarters(new Date('2026-02-01T00:00:00Z'), 2), [{ fy: 2026, q: 1 }, { fy: 2025, q: 4 }]);
});

test('all-forms workbook: rows, categories, FYTD, merged form cells, suppressed values', () => {
  const p = parseAllForms(load('quarterly_all_forms_fy2026_q3_v1.json'), 'quarterly_all_forms_fy2026_q3_v1.xlsx');
  assert.equal(p.label, 'FY2026 Q3'); assert.equal(p.start, '2026-04-01');
  const i130 = p.rows.filter((r) => r.form === 'I-130');
  assert.equal(i130.length, 2, 'continuation row keeps the form number');
  assert.equal(i130[0].category, 'Immediate Relative'); assert.equal(i130[1].category, 'All Other Relative');
  assert.equal(i130[0].approved, 82636); assert.equal(i130[0].medianMonths, 13); assert.equal(i130[0].approvalRate, 83.2);
  assert.equal(i130[0].fytd.received, 399808);
  const eb485 = p.rows.find((r) => r.form === 'I-485' && /employment/i.test(r.category));
  assert.equal(eb485.medianMonths, 6); assert.equal(eb485.section, 'Lawful Permanent Residence');
  const i129 = p.rows.find((r) => r.form === 'I-129');
  assert.equal(i129.medianMonths, 4.6); assert.equal(i129.section, 'Employment-Based'); assert.equal(i129.category, '');
  assert.equal(p.rows.find((r) => r.form === 'I-539').medianMonths, null, 'D = suppressed');
  assert.equal(p.rows.find((r) => r.form === 'I-924').approved, 0);
  assert.ok(!p.rows.some((r) => /total/i.test(r.form)), 'stops at the total line');
});

test('I-129 RFE workbook: TOTAL rows, latest fiscal year, sums months when TOTAL is blank', () => {
  const r = parseRfe(load('i129_quarterly_request_for_evidence_fy2026_q3_v1.json'), 'i129_quarterly_request_for_evidence_fy2026_q3_v1.xlsx');
  assert.equal(r.label, 'FY2026 Q3');
  assert.deepEqual(Object.keys(r.classes).sort(), ['H1B', 'L1A', 'L1B']);
  const h = r.classes.H1B.latest;
  assert.equal(h.fy, 2026); assert.equal(h.completions, 278650); assert.equal(h.approvalRate, 97); assert.equal(h.rfeRate, 8.5);
  assert.equal(r.classes.H1B.previous.fy, 2025);
  const l = r.classes.L1A.latest;
  assert.equal(l.approvalRate, 91.2); assert.equal(l.rfeRate, 25.9); assert.equal(l.approvalAfterRfe, 77);
  const b = r.classes.L1B.latest;
  assert.equal(b.completions, 10263); assert.equal(b.approvalRate, 91.3); assert.equal(b.months, 9);
  assert.equal(classKey('Blanket L'), 'LBLANKET'); assert.equal(classKey('O-1A'), 'O1A');
});

test('ingest script: xlsx files → data/form-stats.json with trend, RFE and H-1B hub', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-'));
  const raw = path.join(tmp, 'raw'); const hub = path.join(tmp, 'h1b'); fs.mkdirSync(raw); fs.mkdirSync(hub);
  writeXlsx(raw, 'quarterly_all_forms_fy2026_q3_v1.xlsx', { 'FY26Q3_All_Forms': load('quarterly_all_forms_fy2026_q3_v1.json') });
  writeXlsx(raw, 'quarterly_all_forms_fy2026_q2_v1.xlsx', { 'FY26Q2_All_Forms': load('quarterly_all_forms_fy2026_q2_v1.json') });
  writeXlsx(raw, 'i129_quarterly_request_for_evidence_fy2026_q3_v1.xlsx', load('i129_quarterly_request_for_evidence_fy2026_q3_v1.json'));
  fs.copyFileSync(path.join(FIX, 'h1b_datahubexport-2025.csv'), path.join(hub, 'h1b_datahubexport-2025.csv'));
  fs.writeFileSync(path.join(raw, 'urls.json'), JSON.stringify({ 'quarterly_all_forms_fy2026_q3_v1.xlsx': 'https://www.uscis.gov/sites/default/files/document/data/quarterly_all_forms_fy2026_q3_v1.xlsx' }));
  const out = path.join(tmp, 'form-stats.json');
  execFileSync(process.execPath, [path.join(import.meta.dirname, '../scripts/ingest-form-stats.mjs'), raw, out], { env: { ...process.env, H1B_RAW_DIR: hub }, stdio: 'pipe' });
  const s = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(s.allForms.label, 'FY2026 Q3');
  const i129 = s.allForms.rows.find((r) => r.form === 'I-129');
  assert.deepEqual(i129.trend.map((t) => [t.period, t.medianMonths]), [['FY2026 Q2', 3.9], ['FY2026 Q3', 4.6]]);
  assert.equal(s.rfe.classes.L1A.latest.rfeRate, 25.9);
  assert.equal(s.h1bHub['2025'].initialApproval, 150); assert.equal(s.h1bHub['2025'].initialDenial, 5);
  assert.equal(s.h1bHub['2025'].continuingApprovalRate, 98.3);
  assert.equal(s.sources[0].url, 'https://www.uscis.gov/sites/default/files/document/data/quarterly_all_forms_fy2026_q3_v1.xlsx');
  fs.rmSync(tmp, { recursive: true, force: true });
});
