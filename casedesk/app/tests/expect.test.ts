// What to expect: receipts/offices, premium clocks, built-in summary, wording, sharing payload, offline fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays, describe, expectQuery, localExpect, officeOf, premiumClock, processingOffice, receivedOf, decidedOf, sharePayload, normClass, EXPECT_HELP, type ExpectResult } from '../src/core/expect';
import { loadExpect, toggleShare, getPrefs, _useKV } from '../src/data/expect';
import { memoryKV } from '../src/data/kv';
import { helpTopic } from '../src/content/help';
import type { CaseView } from '../src/core/cases';

const caseOf = (x: Partial<CaseView> = {}): CaseView => ({ id: 'me:EAC2690000001', receipt: 'EAC2690000001', form: 'I-129', name: 'Work petition', ownerId: 'me', status: 'Pending', filed: '2026-08-14', keyDates: [], history: [{ date: '2026-08-14', text: 'Case received' }], docIds: [], ...x });

test('receipt prefix → office; only real 13-character receipts', () => {
  assert.equal(officeOf('EAC2690000001'), 'EAC'); assert.equal(officeOf('IOE0927314561'), 'IOE');
  assert.equal(officeOf('EAC26900'), undefined); assert.equal(officeOf(undefined), undefined);
  assert.match(processingOffice('I-129', 'IOE').note, /any service center/);
  assert.match(processingOffice('I-485', 'MSC').name, /field office/);
  assert.equal(normClass('L-1A'), 'L1A'); assert.equal(normClass('H1B'), 'H1B');
});

test('premium clocks count business days, skipping weekends and federal holidays', () => {
  assert.equal(premiumClock('I-129'), 15); assert.equal(premiumClock('I-140', 'E13'), 45); assert.equal(premiumClock('I-485'), null);
  assert.equal(addBusinessDays('2026-11-18', 15), '2026-12-10');
  assert.equal(addBusinessDays('2026-12-31', 1), '2027-01-04'); // Jan 1 holiday, weekend
});

test('built-in summary: I-129 L-1A window, official rates, RFE share', () => {
  const r = localExpect({ form: 'I-129', office: 'EAC', received: '2026-08-14', cls: 'L1A' }, '2026-11-18');
  assert.equal(r.processing?.maxMonths, 10.5); assert.equal(r.processing?.matched, 'class');
  assert.equal(r.rfe?.rfeRate, 25.9); assert.equal(r.community.hidden, true);
  assert.equal(r.window?.toMonths, 10.5);
  const v = describe(r, { live: false, outcome: 'pending' });
  assert.match(v.headline, /I-129 L-1A/);
  assert.match(v.officeLine, /Vermont Service Center/);
  assert.match(v.disclaimer, /not a prediction/); assert.match(v.disclaimer, /not legal advice/);
  assert.ok(v.tiles.some((t) => /RFE/.test(t.label) && t.value === '26%'));
  assert.ok(v.chart && v.chart.todayDays === 96);
  assert.ok(v.sources.length >= 2);
});

test('I-485 uses the employment row by default and the official median', () => {
  const r = localExpect({ form: 'I-485', office: 'MSC', received: '2026-01-05' }, '2026-11-18');
  assert.equal(r.official?.category, 'Employment'); assert.equal(r.official?.medianMonths, 6);
  assert.equal(r.official?.approvalRate, 93);
  const fam = localExpect({ form: 'I-485', category: 'Family' });
  assert.equal(fam.official?.category, 'Family');
});

test('premium replaces the window with the decision-by date', () => {
  const r = localExpect({ form: 'I-129', office: 'WAC', received: '2026-11-18', premium: true, cls: 'H1B' });
  assert.equal(r.window, null); assert.equal(r.premium?.decisionBy, '2026-12-10');
  assert.match(describe(r).headline, /15 business days — by Dec 10, 2026/);
});

const server: ExpectResult = { ...localExpect({ form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'L1A' }, '2026-11-18'),
  community: { hidden: false, scope: 'same office, filed the same month', minSample: 10, total: 15, decided: 12, approved: 11, denied: 1, rfe: 3, pending: 0, approvalRate: 92, p25Days: 61, medianDays: 90, p75Days: 122, histogram: [] } };

test('community line names office, month and count; decided case compares to the window', () => {
  const v = describe(server, { live: true, outcome: 'approved', decided: '2026-06-01' });
  assert.equal(v.communityLine, 'Most I-129 L-1A cases at EAC filed in Mar 2026 shared in the app were decided in 2–4 months (middle half of 12 decided)');
  assert.match(v.mine!, /Your case took/); assert.equal(v.chart?.todayDays, null); assert.equal(v.chart?.decidedDays, 91);
  assert.ok(v.chart?.community);
});

test('query and share payload never contain the receipt number', () => {
  const q = expectQuery({ form: 'I-129', office: 'EAC', received: '2026-08-14', premium: false, cls: 'L1A' });
  assert.equal(q, '/api/expect?form=I-129&office=EAC&received=2026-08-14&premium=0&cls=L1A');
  const p = sharePayload('abc', caseOf({ status: 'Approved', history: [{ date: '2026-10-01', text: 'Approved' }, { date: '2026-08-14', text: 'Case received' }] }), 'L-1A', true)!;
  assert.deepEqual(p, { id: 'abc', form: 'I-129', office: 'EAC', received: '2026-08-14', decided: '2026-10-01', outcome: 'approved', premium: true, cls: 'L1A' });
  assert.ok(!JSON.stringify(p).includes('2690000001'));
  assert.equal(sharePayload('x', caseOf({ receipt: undefined })), null);
  assert.equal(receivedOf(caseOf({ filed: undefined })), '2026-08-14');
  assert.equal(decidedOf(caseOf()), undefined);
});

test('offline: cached server answer with its date, else built-in summary', async () => {
  _useKV(memoryKV());
  const q = { form: 'I-129', office: 'EAC', received: '2026-03-02', cls: 'L1A' };
  const fresh = await loadExpect(q, async <T,>() => server as unknown as T);
  assert.equal(fresh.live, true);
  const cached = await loadExpect(q, async () => { throw new Error('offline'); });
  assert.equal(cached.live, false); assert.ok(cached.cachedAt); assert.equal(cached.result.community.hidden, false);
  const builtin = await loadExpect({ ...q, form: 'I-140' }, async () => { throw new Error('offline'); });
  assert.equal(builtin.cachedAt, undefined); assert.equal(builtin.result.query.form, 'I-140');
});

test('sharing: on posts the anonymous entry, off deletes it, same id kept', async () => {
  _useKV(memoryKV());
  const calls: [string, any][] = [];
  const post = async (m: 'POST' | 'DELETE', b: unknown) => { calls.push([m, b]); return true; };
  const c = caseOf();
  const p1 = await toggleShare(c, true, post);
  assert.equal(calls[0][0], 'POST'); assert.equal(calls[0][1].office, 'EAC'); assert.equal(calls[0][1].id, p1!.id);
  const p2 = await toggleShare(c, false, post);
  assert.deepEqual(calls[1], ['DELETE', { id: p1!.id }]); assert.equal(p2!.id, p1!.id);
  assert.equal((await getPrefs(c.receipt!))?.on, false);
});

test('help topic is registered', () => {
  assert.equal(helpTopic('expect')?.title, 'How expected timing works');
  assert.ok(EXPECT_HELP.body.some((b) => /receipt prefix/.test(b)));
});

test('only the 8-in-10 time known: says so instead of inventing a lower bound', () => {
  const r = localExpect({ form: 'I-129', office: 'EAC', received: '2026-08-14', cls: 'TN' }, '2026-11-18');
  assert.equal(r.window?.fromMonths, 0);
  assert.match(describe(r).headline, /^USCIS decides 8 in 10 I-129 TN cases within 7 months — for you, by/);
});
