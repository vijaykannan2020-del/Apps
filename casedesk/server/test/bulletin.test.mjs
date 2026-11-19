// Visa Bulletin parsing and the v2.9 history kept for the planner's pace estimate. Synthetic page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bulletinUrl, parseBulletin, mergeHistory } from '../src/bulletin.mjs';

const table = (title, rows) => `<p>${title}</p><table><tr><td>Employment-based</td><td>All Chargeability Areas Except Those Listed</td><td>CHINA-mainland born</td><td>INDIA</td><td>MEXICO</td><td>PHILIPPINES</td></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const PAGE = table('A. FINAL ACTION DATES FOR EMPLOYMENT-BASED PREFERENCE CASES', [
  ['1st', 'C', '01AUG23', '01FEB23', 'C', 'C'], ['2nd', '01APR25', '01OCT21', '01NOV13', '01APR25', '01APR25'], ['3rd', '15JUN24', '22JAN22', '22JAN14', '15JUN24', '15AUG23'],
]) + table('B. DATES FOR FILING OF EMPLOYMENT-BASED VISA APPLICATIONS', [
  ['1st', 'C', '01JUL24', '01JUL24', 'C', 'C'], ['2nd', '15MAR26', '01JAN23', '15JAN15', '15MAR26', '15MAR26'], ['3rd', '01AUG24', '01APR24', '15JAN15', 'U', '01JAN24'],
]);

test('bulletin URL uses the fiscal-year folder', () => {
  assert.equal(bulletinUrl('november', 2026), 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-november-2026.html');
  assert.equal(bulletinUrl('September', 2026), 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2026/visa-bulletin-for-september-2026.html');
});

test('parses both employment tables from one page', () => {
  const b = parseBulletin(PAGE, bulletinUrl('november', 2026));
  assert.equal(b.month, 'November 2026');
  const eb2 = b.rows.find((r) => r.cat === 'EB-2');
  assert.equal(eb2.final.india, '2013-11-01');
  assert.equal(eb2.filing.india, '2015-01-15');
  assert.equal(b.rows.find((r) => r.cat === 'EB-3').filing.mexico, 'U');
  assert.equal(parseBulletin('<p>nothing</p>', 'x'), null);
});

test('history: oldest first, no duplicates, never the current month, at most 24', () => {
  const rows = [{ cat: 'EB-2', final: {}, filing: {} }];
  const h = mergeHistory([{ month: 'October 2026', rows }, { month: 'August 2026', rows }], [{ month: 'September 2026', rows }, { month: 'October 2026', rows }, { month: 'November 2026', rows }], 'November 2026');
  assert.deepEqual(h.map((x) => x.month), ['August 2026', 'September 2026', 'October 2026']);
  const many = Array.from({ length: 30 }, (_, i) => ({ month: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i % 12]} ${2023 + Math.floor(i / 12)}`, rows }));
  assert.equal(mergeHistory(many, [], 'December 2026').length, 24);
});
