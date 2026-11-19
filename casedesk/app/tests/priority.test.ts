// v2.7 Home priority: the hero is the family's single most urgent item, the two tiles are the next
// two most useful facts (picked by score, not fixed), and the Status view sorts by urgency.
// Made-up people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barFill, docState, heroLine, homeHero, homeTiles, shortSpan, statusSummary, tileCandidates, toneForDays, upcoming, walletFacts, HERO_HORIZON_DAYS, type PriorityInput } from '../src/core/priority';
import type { Finding } from '../src/core/rules/types';

const TODAY = '2026-11-19';
const fd = (id: string, severity: Finding['severity'], title: string, date?: string, detail = 'Do the thing. More words.'): Finding => ({ id, severity, title, detail, date, notLegalAdvice: true, talkToAttorney: severity === 'act' });
const base = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  today: TODAY,
  people: [{ id: 'a', name: 'Alex' }, { id: 'p', name: 'Priya' }],
  results: {
    a: { findings: [], facts: { visaLabel: 'L-1A', statusUntil: '2027-06-28' } },
    p: { findings: [], facts: { visaLabel: 'L-2S', statusUntil: '2027-07-21' } },
  },
  starts: { a: '2025-06-29' },
  filings: [{ personId: 'a', form: 'I-129', title: 'L-1A extension', earliest: '2026-12-28', deadline: '2027-06-28' }],
  cases: [],
  docs: { saved: 11, missing: 1, expiring: 0 },
  backup: { due: false },
  ...over,
});

test('hero: the nearest deadline — who, what, days left, what to do next, progress toward the date', () => {
  const h = homeHero(base());
  assert.equal(h.kind, 'deadline');
  assert.equal(h.who, 'Alex');
  assert.equal(h.days, 221);
  assert.equal(h.big, '221 days');
  assert.equal(h.chip, 'L-1A');
  assert.equal(h.what, 'status ends Jun 28, 2027');
  assert.equal(h.next, 'file the I-129 from Dec 28, 2026');
  assert.equal(heroLine(h), 'Alex · status ends Jun 28, 2027 · file the I-129 from Dec 28, 2026');
  assert.deepEqual(h.target, { to: 'person', id: 'a' });
  assert.ok(h.progress! > 0.65 && h.progress! < 0.72, `progress from the start of the stay: ${h.progress}`);
  assert.equal(h.tone, 'sage', 'more than 180 days: good');
});

test('hero: an act-now finding beats every date; the earliest dated one first; tap opens that person', () => {
  const i = base();
  i.results.p!.findings = [fd('i94-exp', 'act', 'I-94 ended', '2026-11-01', 'Talk to an attorney now. Other words here.')];
  i.results.a!.findings = [fd('pp-soon', 'review', 'Passport expires soon', '2027-01-10')];
  const h = homeHero(i);
  assert.equal(h.kind, 'act');
  assert.equal(h.tone, 'blush');
  assert.equal(h.who, 'Priya');
  assert.equal(h.big, 'Act now', 'the date has passed: no countdown');
  assert.equal(h.next, 'Talk to an attorney now');
  assert.deepEqual(h.target, { to: 'person', id: 'p' });
  i.results.a!.findings.push(fd('rfe-1', 'act', 'RFE response due', '2026-12-01'));
  const h2 = homeHero(i);
  assert.equal(h2.who, 'Priya', 'earlier date first');
  i.results.p!.findings = [];
  const h3 = homeHero(i);
  assert.equal(h3.big, '12 days');
  assert.equal(h3.label, 'Act now');
});

test('hero: a review finding counts down in butter; a date inside 30 days beats it', () => {
  const i = base();
  i.results.a!.findings = [fd('pp-soon', 'review', 'Passport expires soon', '2027-03-18')];
  const h = homeHero(i);
  assert.equal(h.kind, 'review');
  assert.equal(h.tone, 'butter');
  assert.equal(h.big, '119 days');
  i.cases = [{ id: 'c1', ownerId: 'p', form: 'I-539', status: 'Pending', keyDates: [{ label: 'Biometrics', date: '2026-11-25' }] }];
  const h2 = homeHero(i);
  assert.equal(h2.kind, 'deadline');
  assert.equal(h2.big, '6 days');
  assert.equal(h2.tone, 'blush');
  assert.equal(h2.what, 'biometrics Nov 25, 2026');
  assert.deepEqual(h2.target, { to: 'case', id: 'c1' });
});

test('hero: nothing urgent → All good · next date; no documents yet → add documents', () => {
  const far = base({ results: { a: { findings: [], facts: { visaLabel: 'Green card', statusUntil: '2034-02-01' } }, p: { findings: [], facts: {} } }, filings: [] });
  const h = homeHero(far);
  assert.equal(h.kind, 'allgood');
  assert.equal(h.big, 'All good');
  assert.equal(h.tone, 'sage');
  assert.match(heroLine(h), /^Next date Feb 1, 2034/);
  assert.equal(h.progress, undefined);
  const none = homeHero(base({ results: { a: { findings: [], facts: {} }, p: { findings: [], facts: {} } }, filings: [] }));
  assert.equal(heroLine(none), 'Nothing needs attention');
  const edge = base();
  edge.results.a!.facts.statusUntil = '2027-08-16'; edge.results.p!.facts.statusUntil = '2027-09-01'; // 270 days
  assert.equal(homeHero(edge).kind, 'deadline', `inside ${HERO_HORIZON_DAYS} days`);
  edge.results.a!.facts.statusUntil = '2027-08-17';
  assert.equal(homeHero(edge).kind, 'allgood');
  const fresh = homeHero(base({ docs: { saved: 0, missing: 6, expiring: 0 } }));
  assert.equal(fresh.kind, 'setup');
  assert.deepEqual(fresh.target, { to: 'docs' });
});

test('tiles: the two highest-scoring facts, never the hero’s own subject, never a fixed pair', () => {
  const i = base();
  // default family: documents missing (70); the hero already says when Alex can file, so the
  // "Filing opens" tile is skipped and the next fact is shown instead
  assert.deepEqual(homeTiles(i).map((t) => t.key), ['docs', 'cases']);
  assert.deepEqual(homeTiles({ ...i, filings: [{ ...i.filings[0], personId: 'p', form: 'I-539' }] }).map((t) => t.key), ['docs', 'filing:p:I-539']);
  assert.equal(homeTiles(i)[0].big, '11 of 12');
  // an RFE and a filing window that is open now outrank them
  i.cases = [{ id: 'c9', ownerId: 'p', form: 'I-539', status: 'RFE', updated: '2026-11-10', keyDates: [] }];
  i.filings = [{ personId: 'p', form: 'I-765', title: 'H-4 EAD renewal', earliest: '2026-10-01', deadline: '2027-04-01' }];
  const t = homeTiles(i);
  assert.deepEqual(t.map((x) => x.label), ['Evidence requested', 'Filing window open']);
  assert.equal(t[0].tone, 'blush');
  assert.deepEqual(t[0].target, { to: 'case', id: 'c9' });
  // backup overdue shows when nothing more urgent is there
  const b = base({ docs: { saved: 12, missing: 0, expiring: 0 }, backup: { due: true, lastAt: '2026-09-20T10:00:00Z' }, filings: [] });
  const bt = homeTiles(b);
  assert.equal(bt[0].label, 'Backup overdue');
  assert.equal(bt[0].big, '60 days');
  assert.equal(bt[1].label, 'Documents');
  assert.equal(bt[1].tone, 'sage');
  // a case that changed in the last two weeks
  const c = base({ cases: [{ id: 'c2', ownerId: 'a', form: 'I-129', status: 'Approved', updated: '2026-11-17', keyDates: [] }] });
  assert.equal(homeTiles(c)[0].label, 'Case update');
  assert.equal(homeTiles(c)[0].tone, 'sage');
  // scores are sorted and every candidate has a way to open it
  const all = tileCandidates(i);
  for (let k = 1; k < all.length; k++) assert.ok(all[k - 1].score >= all[k].score);
  for (const x of all) assert.ok(x.target.to && x.big && x.label);
});

test('tiles: the hero’s subject is not repeated', () => {
  const i = base({ filings: [{ personId: 'a', form: 'I-129', title: 'L-1A extension', earliest: '2026-10-01', deadline: '2027-06-28' }] });
  const h = homeHero(i);
  assert.equal(h.next, 'you can file the I-129 now');
  assert.ok(!homeTiles(i, h).some((t) => t.key.startsWith('filing:a')), 'the hero already says the window is open');
  const fresh = base({ docs: { saved: 0, missing: 6, expiring: 0 } });
  assert.ok(!homeTiles(fresh).some((t) => t.key === 'docs'));
  assert.equal(homeTiles(i).length, 2);
});

test('upcoming: every future date, nearest first, the principal first on a tie', () => {
  const i = base();
  i.results.p!.facts.statusUntil = '2027-06-28';
  i.results.p!.facts.workUntil = '2027-01-05';
  const u = upcoming(i);
  assert.deepEqual(u.map((x) => x.key), ['work:p', 'status:a', 'status:p']);
});

test('status view: counts for the ring and bars sorted by urgency', () => {
  const s = statusSummary([
    { id: 'pp', ownerId: 'a', label: 'Passport', until: '2029-02-05' },
    { id: 'visa', ownerId: 'a', label: 'Visa', until: '2027-06-18' },
    { id: 'i94', ownerId: 'a', label: 'I-94', until: '2027-03-01' },
    { id: 'ead', ownerId: 'p', label: 'EAD', until: '2026-10-01' },
    { id: 'ds', ownerId: 'p', label: 'I-94', until: undefined },
  ], 1, TODAY);
  assert.deepEqual([s.valid, s.expiring, s.expired, s.missing], [3, 1, 1, 1]);
  assert.deepEqual(s.bars.map((b) => b.id), ['ead', 'i94', 'visa', 'pp'], 'least time left first');
  assert.equal(s.bars[0].state, 'expired');
  assert.equal(docState(180), 'expiring');
  assert.equal(docState(181), 'valid');
  assert.equal(toneForDays(30), 'blush');
  assert.equal(toneForDays(31), 'butter');
  assert.equal(toneForDays(181), 'sage');
  assert.equal(shortSpan(221), '7m');
  assert.equal(shortSpan(45), '45d');
  assert.equal(shortSpan(808), '2.2y');
  assert.equal(shortSpan(-3), 'Ended');
  assert.ok(barFill(1000) === 1 && barFill(-5) > 0 && barFill(365) === 0.5);
});

test('wallet card: in status until, days left, and the word that goes with the colour', () => {
  const w = walletFacts({ today: TODAY, hasDocs: true, until: '2027-06-28', label: 'L-1A' });
  assert.deepEqual([w.caption, w.big, w.corner, w.word, w.wordTone], ['In status for', '221 days', '06/27', 'valid', 'green']);
  assert.equal(walletFacts({ today: TODAY, hasDocs: true, until: '2027-03-01' }).wordTone, 'amber');
  const ended = walletFacts({ today: TODAY, hasDocs: true, until: '2026-11-01' });
  assert.deepEqual([ended.caption, ended.big, ended.wordTone], ['Status ended', '18 days ago', 'red']);
  assert.equal(walletFacts({ today: TODAY, hasDocs: false }).big, 'Add documents');
  assert.equal(walletFacts({ today: TODAY, hasDocs: true, citizen: true }).big, 'US citizen');
  assert.equal(walletFacts({ today: TODAY, hasDocs: true, outside: true, until: '2027-01-01' }).big, 'Outside the US');
  assert.equal(walletFacts({ today: TODAY, hasDocs: true, resident: true }).big, 'Resident');
});
