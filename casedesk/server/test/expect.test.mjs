// GET /api/expect logic: official stats first, processing range, premium clocks, community cohort (n ≥ 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAllForms, parseRfe, buildFormStats } from '../src/formstats.mjs';
import { expectFor, communityFor, addBusinessDays, federalHolidays, premiumClock, processingOffice, normClass, MIN_COMMUNITY } from '../src/expect.mjs';

const FIX = path.join(import.meta.dirname, 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const stats = buildFormStats({
  allForms: [{ parsed: parseAllForms(load('quarterly_all_forms_fy2026_q3_v1.json'), 'quarterly_all_forms_fy2026_q3_v1.xlsx'), file: 'q3.xlsx' }],
  rfe: { parsed: parseRfe(load('i129_quarterly_request_for_evidence_fy2026_q3_v1.json'), 'i129_quarterly_request_for_evidence_fy2026_q3_v1.xlsx'), file: 'rfe.xlsx' },
  hub: { 2025: { initialApproval: 95, initialDenial: 5, continuingApproval: 98, continuingDenial: 2, initialApprovalRate: 95, continuingApprovalRate: 98 } },
  builtAt: '2026-11-15T03:00:00Z',
});
const mk = (n, o) => Array.from({ length: n }, (_, i) => ({ form: 'I-129', office: 'EAC', received: '2026-03-10', decided: `2026-0${5 + (i % 3)}-1${i % 10}`, outcome: 'approved', premium: false, cls: 'L1A', ...o }));

test('business days skip weekends and federal holidays', () => {
  assert.ok(federalHolidays(2026).has('2026-11-26')); // Thanksgiving
  assert.ok(federalHolidays(2026).has('2026-07-03')); // July 4 on Saturday → Friday
  assert.equal(addBusinessDays('2026-11-18', 15), '2026-12-10'); // skips Nov 26
  assert.equal(addBusinessDays('2026-12-21', 5), '2026-12-29'); // skips Dec 25
});

test('premium clocks by form and class', () => {
  assert.equal(premiumClock('I-129', 'L1A'), 15);
  assert.equal(premiumClock('I-140', 'E13'), 45); assert.equal(premiumClock('I-140', 'EB2-NIW'), 45); assert.equal(premiumClock('I-140', 'E21'), 15);
  assert.equal(premiumClock('I-539', 'F1'), 30); assert.equal(premiumClock('I-539', 'H4'), null);
  assert.equal(premiumClock('I-765', 'C3'), 30); assert.equal(premiumClock('I-485'), null);
});

test('office logic: receipt prefix is intake, not the deciding office', () => {
  assert.match(processingOffice('I-129', 'EAC').name, /Service Center Operations/);
  assert.match(processingOffice('I-129', 'IOE').note, /any service center/);
  assert.match(processingOffice('N-400', 'IOE').name, /field office/);
  assert.equal(normClass('L-1A'), 'L1A'); assert.equal(normClass('h1b'), 'H1B'); assert.equal(normClass('C3'), 'F1');
});

test('official first: I-129 L-1A at EAC — service-wide median, L-1 processing range, RFE rate', () => {
  const r = expectFor({ form: 'I129', office: 'EAC', received: '2026-08-14', cls: 'L1A' }, { stats, rows: [], today: '2026-11-18' });
  assert.equal(r.query.form, 'I-129'); assert.equal(r.query.officeName, 'Vermont Service Center');
  assert.equal(r.official.medianMonths, 4.6); assert.equal(r.official.period, 'FY2026 Q3');
  assert.equal(r.processing.matched, 'class'); assert.equal(r.processing.maxMonths, 10.5);
  assert.deepEqual([r.window.fromMonths, r.window.toMonths], [4.6, 10.5]);
  assert.equal(r.window.from, '2027-01-01'); // 4.6 months ≈ 140 days
  assert.equal(r.rfe.classification, 'L-1A'); assert.equal(r.rfe.rfeRate, 25.9); assert.equal(r.rfe.approvalAfterRfe, 77);
  assert.equal(r.h1b, null); assert.equal(r.elapsedDays, 96);
  assert.equal(r.community.hidden, true);
  assert.match(r.disclaimer, /not a prediction/); assert.match(r.disclaimer, /not legal advice/);
  assert.ok(r.sources.some((s) => /Service-wide Forms/.test(s.name)));
});

test('premium: decision-by date replaces the regular window', () => {
  const r = expectFor({ form: 'I-129', office: 'WAC', received: '2026-11-18', premium: '1', cls: 'H1B' }, { stats, rows: [] });
  assert.equal(r.premium.businessDays, 15); assert.equal(r.premium.decisionBy, '2026-12-10'); assert.equal(r.window, null);
  assert.equal(r.h1b.fy, '2025'); assert.equal(r.rfe.rfeRate, 8.5);
  const n = expectFor({ form: 'I-485', office: 'MSC', received: '2026-01-05', premium: '1' }, { stats, rows: [] });
  assert.equal(n.premium.businessDays, null);
  assert.ok(n.window, 'falls back to the regular window when premium is not possible');
});

test('split forms pick the right official row', () => {
  assert.match(expectFor({ form: 'I-485', office: 'MSC' }, { stats, rows: [] }).official.category, /Employment/);
  assert.match(expectFor({ form: 'I-765', office: 'IOE', cls: 'C9' }, { stats, rows: [] }).official.category, /Adjustment/);
  assert.match(expectFor({ form: 'I-130', office: 'IOE', category: 'All Other Relative' }, { stats, rows: [] }).official.category, /All Other/);
});

test('no official data yet: processing range still answers', () => {
  const r = expectFor({ form: 'I-140', office: 'SRC', received: '2026-06-01' }, { stats: null, rows: [] });
  assert.equal(r.official, null); assert.ok(r.processing.maxMonths >= 30); assert.ok(r.window);
  assert.throws(() => expectFor({ form: 'xx' }, { stats, rows: [] }), /Missing form/);
});

test('community: hidden under 10 decided, narrowest cohort first, widens when needed', () => {
  assert.equal(communityFor({ form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'L1A' }, mk(MIN_COMMUNITY - 1)).hidden, true);
  const same = communityFor({ form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'L1A' }, [...mk(12), ...mk(3, { decided: null, outcome: 'rfe' })]);
  assert.equal(same.hidden, false); assert.equal(same.scope, 'same office, filed the same month');
  assert.equal(same.decided, 12); assert.equal(same.rfe, 3); assert.equal(same.approvalRate, 100);
  assert.ok(same.p25Days <= same.medianDays && same.medianDays <= same.p75Days);
  const wide = communityFor({ form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'L1A' }, mk(12, { office: 'WAC', received: '2026-04-01', decided: '2026-07-01' }));
  assert.equal(wide.scope, 'any office, filed within a month of yours');
  assert.equal(communityFor({ form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'H1B' }, mk(12)).hidden, true, 'other class does not count');
  assert.equal(communityFor({ form: 'I-129', office: 'EAC', received: '2026-03-02', premium: true, cls: 'L1A' }, mk(12)).hidden, true, 'premium and regular are not mixed');
});
