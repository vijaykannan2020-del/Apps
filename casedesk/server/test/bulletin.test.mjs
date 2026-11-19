// Visa Bulletin parsing and the v2.9 history kept for the planner's pace estimate. Synthetic page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bulletinUrl, parseBulletin, mergeHistory, missingMonths } from '../src/bulletin.mjs';

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

// ---- v2.9: backfill the last 24 months, politely; quiet when travel.state.gov blocks or is down ----
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/visa-bulletin-employment.html'), 'utf8');
const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** A fresh copy of the module with its own saved file (the module keeps one state per process). */
let n = 0;
async function load(saved) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'));
  const file = path.join(dir, 'bulletin.json');
  if (saved) fs.writeFileSync(file, JSON.stringify(saved));
  process.env.BULLETIN_FILE = file;
  const m = await import(`../src/bulletin.mjs?case=${++n}`);
  delete process.env.BULLETIN_FILE;
  return { m, file };
}
const current = () => ({ month: 'November 2026', uscisChart: 'filing', source: 'x', rows: parseBulletin(FIXTURE.replace('__EB2_IN__', '01JAN14'), bulletinUrl('november', 2026)).rows, history: [] });
/** Fixture pages: EB-2 India moves one month per bulletin, so the order can be checked. */
const sitePage = (url) => {
  const [, name, year] = url.match(/visa-bulletin-for-([a-z]+)-(\d{4})/);
  const k = (+year - 2024) * 12 + MON.indexOf(name);
  const d = new Date(Date.UTC(2011, k, 1));
  const cell = `01${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}`;
  return FIXTURE.replace('__EB2_IN__', cell);
};
const ok = (html) => ({ ok: true, status: 200, text: async () => html });
const status = (s) => ({ ok: false, status: s, text: async () => '' });

test('missing months: 24 earlier months, newest first, skipping the ones kept', () => {
  const m = missingMonths('November 2026', [{ month: 'October 2026' }, { month: 'January 2025' }]);
  assert.equal(m.length, 22);
  assert.equal(m[0].month, 'September 2026');
  assert.equal(m.at(-1).month, 'November 2024');
  assert.ok(!m.some((x) => x.month === 'January 2025'));
  assert.equal(m.find((x) => x.month === 'October 2025').url, bulletinUrl('october', 2025)); // fiscal-year folder 2026
  assert.deepEqual(missingMonths('', []), []);
});

test('first run: fills 24 months one page at a time with a pause between pages, saves them oldest first', async () => {
  const { m, file } = await load(current());
  const calls = [], pauses = [];
  const got = await m.backfillHistory({ fetcher: async (u) => { calls.push(u); return ok(sitePage(u)); }, sleep: async (ms) => { pauses.push(ms); }, delayMs: 10 });
  assert.equal(got, 24);
  assert.equal(calls.length, 24);
  assert.equal(pauses.length, 23); // a pause between every two pages, none before the first
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.history.length, 24);
  assert.equal(saved.history[0].month, 'November 2024');
  assert.equal(saved.history.at(-1).month, 'October 2026');
  assert.equal(saved.previous.month, 'October 2026');
  const eb2 = (h) => h.rows.find((r) => r.cat === 'EB-2').final.india;
  assert.ok(eb2(saved.history[0]) < eb2(saved.history.at(-1)));
  assert.equal(m.bulletinStatus().historyMonths, 24);
  // nothing missing any more → no requests
  calls.length = 0;
  assert.equal(await m.backfillHistory({ fetcher: async (u) => { calls.push(u); return ok(sitePage(u)); }, sleep: async () => {} }), 0);
  assert.equal(calls.length, 0);
});

test('retries a 503 or a dropped connection, skips months not published (404)', async () => {
  const { m } = await load({ ...current(), history: [] });
  const tries = new Map();
  const fetcher = async (u) => {
    tries.set(u, (tries.get(u) ?? 0) + 1);
    if (u.includes('october-2026') && tries.get(u) === 1) return status(503);
    if (u.includes('september-2026') && tries.get(u) < 3) throw new Error('ECONNRESET');
    if (u.includes('march-2025')) return status(404);
    return ok(sitePage(u));
  };
  const got = await m.backfillHistory({ fetcher, sleep: async () => {}, retries: 2 });
  assert.equal(got, 23);
  assert.equal(tries.get(bulletinUrl('october', 2026)), 2);
  assert.equal(tries.get(bulletinUrl('september', 2026)), 3);
  assert.equal(tries.get(bulletinUrl('march', 2025)), 1); // 404 is not retried
});

test('blocked (403) or unreachable: gives up quietly, keeps what it has, never throws', async () => {
  let { m, file } = await load({ ...current(), history: [] });
  const seen = [];
  const blocked = await m.backfillHistory({ fetcher: async (u) => { seen.push(u); return seen.length <= 2 ? ok(sitePage(u)) : status(403); }, sleep: async () => {} });
  assert.equal(blocked, 2);
  assert.equal(seen.length, 3); // stops at the first 403
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).history.length, 2);

  ({ m, file } = await load({ ...current(), history: [] }));
  let calls = 0;
  const down = await m.backfillHistory({ fetcher: async () => { calls++; throw new Error('ENOTFOUND travel.state.gov'); }, sleep: async () => {}, retries: 1, giveUpAfter: 3 });
  assert.equal(down, 0);
  assert.equal(calls, 6); // 3 months × (1 try + 1 retry), then it stops
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).history.length, 0);
});

test('first run with travel.state.gov unreachable and nothing saved: no crash, nothing to serve yet', async () => {
  const { m } = await load(null);
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ENOTFOUND'); };
  const log = console.error; console.error = () => {};
  try {
    assert.equal(await m.ensureBulletinHistory({ sleep: async () => {} }), 0);
    assert.equal(m.bulletinStatus().loaded, false);
    await assert.rejects(m.getBulletin({ backfill: false }), /not loaded/);
  } finally { globalThis.fetch = real; console.error = log; }
});

test('ensureBulletinHistory: a saved bulletin with a short history is filled; a full one is left alone', async () => {
  const { m } = await load(current());
  let calls = 0;
  assert.equal(await m.ensureBulletinHistory({ fetcher: async (u) => { calls++; return ok(sitePage(u)); }, sleep: async () => {} }), 24);
  calls = 0;
  assert.equal(await m.ensureBulletinHistory({ fetcher: async (u) => { calls++; return ok(sitePage(u)); }, sleep: async () => {} }), 0);
  assert.equal(calls, 0);
});
