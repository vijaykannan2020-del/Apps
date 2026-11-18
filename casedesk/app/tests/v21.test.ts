// v2.1 owner feedback: updates by visa type, grouped Needs attention, next filing + processing,
// USCIS paste-back, light-mode contrast, help topics. Made-up people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, evaluateFamily, setToday, type Case, type Document, type Person } from '../src/core';
import { needsAttention, listNames } from '../src/core/rules/engine';
import { familyTags, forFamily, orderTags, updateAlerts } from '../src/core/updates';
import { nextFilings, decisionWindow, planDate } from '../src/core/filings';
import { parseCaseText, applyCaseText, statusOf } from '../src/core/uscis';
import { DARK, LIGHT, contrast, tintOf } from '../src/ui/tokens';
import { HELP, TAB_HELP, helpTopic } from '../src/content/help';
import { T, doc, person } from './helpers';

setToday('2026-11-18');
const run = (people: Person[], docs: Document[]) => evaluateFamily({ members: people.map((p) => ({ person: p, rec: deriveRecord(p, docs) })), docs, settings: { reminderLeadDays: [] } });

// ---------- updates by visa type ----------
test('family tags: L-1A → L-1, L-2 → L-2 (+L-1), H-4 → H-4 (+H-1B), STEM OPT → STEM OPT + OPT, green card → Green card + Citizenship', () => {
  const ppl = [person('a', 'self', { status: 'L-1A' }), person('b', 'spouse', { status: 'L-2' })];
  assert.deepEqual(familyTags(ppl, {}).sort(), ['L-1', 'L-2']);
  assert.deepEqual(familyTags([person('c', 'self', { status: 'H-4' })], {}).sort(), ['H-1B', 'H-4']);
  assert.deepEqual(familyTags([person('d', 'self', { status: 'STEM OPT' })], {}).sort(), ['OPT', 'STEM OPT']);
  assert.deepEqual(familyTags([person('e', 'self', { status: 'green-card' })], {}).sort(), ['Citizenship', 'Green card']);
  // documents win over the picked status
  assert.deepEqual(familyTags([person('f', 'self', { status: 'unsure' })], { f: { visa: 'TN' } as never }), ['TN']);
});

const N = [
  { id: 'n1', date: '2026-11-01', title: 'L-1 fee', impact: 'high' as const, tags: ['L-1', 'Fees'] },
  { id: 'n2', date: '2026-10-20', title: 'H-1B change', impact: 'high' as const, tags: ['H-1B'] },
  { id: 'n3', date: '2026-10-10', title: 'L-2 EAD note', impact: 'medium' as const, tags: ['L-2'] },
  { id: 'n4', date: '2026-03-01', title: 'Old L-1 item', impact: 'high' as const, tags: ['L-1'] },
];
test('"For my family" keeps only matching items; alerts are high-impact, recent, not dismissed', () => {
  const tags = familyTags([person('a', 'self', { status: 'L-1A' }), person('b', 'spouse', { status: 'L-2' })], {});
  assert.deepEqual(forFamily(N, tags).map((n) => n.id), ['n1', 'n3', 'n4']);
  assert.deepEqual(updateAlerts(N, tags, [], '2026-11-18').map((n) => n.id), ['n1']);
  assert.deepEqual(updateAlerts(N, tags, ['n1'], '2026-11-18'), []);
  assert.deepEqual(forFamily(N, []).length, 4, 'no visa types yet → everything');
});

// ---------- Needs attention: one item for all dependents ----------
test('"Principal’s I-94 ends first" is one item listing every dependent', () => {
  const me = person('me', 'self', { name: 'Arun', status: 'H-1B' });
  const sp = person('sp', 'spouse', { name: 'Priya', status: 'H-4' });
  const c1 = person('c1', 'child', { name: 'Kavi', status: 'H-4' });
  const docs = [
    doc('me', T.i94('2027-06-28', '2025-01-01', 'H1B', 'X1000001')),
    doc('sp', T.i94('2027-07-21', '2025-01-01', 'H4', 'X1000002')),
    doc('c1', T.i94('2027-07-21', '2025-01-01', 'H4', 'X1000003')),
  ];
  const r = run([me, sp, c1], docs);
  const all = needsAttention(r, 99);
  const pf = all.filter((x) => x.finding.id === 'principal-first');
  assert.equal(pf.length, 1);
  assert.deepEqual(pf[0].people.sort(), ['c1', 'sp']);
  assert.equal(listNames(['Priya', 'Kavi', 'Mira']), 'Priya, Kavi and Mira');
  assert.equal(listNames(['Priya']), 'Priya');
});

// ---------- next filing ----------
test('next filing: H-1B extension 6 months before the stay ends; decision window from the processing time', () => {
  const me = person('me', 'self', { status: 'H-1B' });
  const docs = [doc('me', T.approval('WAC2590123456', '10/02/2025', '10/01/2025', '06/28/2027')), doc('me', T.i94('2027-06-28', '2025-10-05', 'H1B', 'X1000001'))];
  const rec = deriveRecord(me, docs);
  const r = run([me], docs);
  const f = nextFilings(me, rec, r.me.facts);
  assert.equal(f[0].form, 'I-129');
  assert.equal(f[0].earliest, '2026-12-28');
  assert.equal(f[0].deadline, '2027-06-28');
  assert.equal(f[0].premium, '15 business days');
  assert.equal(planDate(f[0], '2026-11-18'), '2026-12-28');
  assert.equal(planDate(f[0], '2027-02-01'), '2027-02-01');
  const w = decisionWindow('2026-12-28', 12);
  assert.ok(w.from > '2027-06-01' && w.from < '2027-07-15' && w.to > '2027-12-01' && w.to < '2028-01-15');
});
test('next filing: STEM OPT 90 days before the OPT card ends; I-751 90 days before; citizens have none', () => {
  const opt = person('o', 'self', { status: 'F-1 OPT' });
  const f = nextFilings(opt, { visa: 'F-1 OPT', ead: { expires: '2027-06-30' }, location: 'US' } as never, undefined);
  assert.equal(f[0].title, 'STEM OPT extension');
  assert.equal(f[0].earliest, '2027-04-01');
  const cr = nextFilings(person('c', 'self'), { visa: 'Conditional green card', greenCard: { expires: '2027-03-01', conditional: true }, location: 'US' } as never, undefined);
  assert.equal(cr[0].form, 'I-751');
  assert.equal(cr[0].earliest, '2026-12-01');
  assert.deepEqual(nextFilings(person('u', 'self'), { visa: 'US citizen', location: 'US' } as never, undefined), []);
  const l2 = nextFilings(person('s', 'spouse'), { visa: 'L-2S', i94: { until: '2027-07-21' }, location: 'US' } as never, { statusUntil: '2027-07-21' } as never);
  assert.equal(l2[0].form, 'I-539');
});

// ---------- USCIS paste-back ----------
const COPIED = `Case Status Online
Request for Evidence Was Sent
On November 10, 2026, we sent a request for evidence for your Form I-129, Petition for a Nonimmigrant Worker, Receipt Number WAC2690000001. The request explains what we need from you. We will not take action on your case until we receive the evidence or the deadline to submit it expires.`;
test('paste-back: heading, date and form are read; the case gets status, history and no duplicates', () => {
  const p = parseCaseText(COPIED, 'WAC2690000001')!;
  assert.equal(p.status, 'Request for Evidence Was Sent');
  assert.equal(p.date, '2026-11-10');
  assert.equal(p.form, 'I-129');
  const c: Case = { id: 'c', receipt: 'WAC2690000001', ownerId: 'me', keyDates: [], history: [] };
  const c1 = applyCaseText(c, p, '2026-11-18');
  assert.equal(c1.status, 'rfe');
  assert.equal(c1.form, 'I-129');
  assert.deepEqual(c1.history[0], { date: '2026-11-10', text: 'Request for Evidence Was Sent' });
  assert.equal(applyCaseText(c1, p, '2026-11-18').history.length, 1, 'pasting twice adds no duplicate');
  assert.equal(parseCaseText('WAC2690000001', 'WAC2690000001'), null, 'still the receipt we copied');
  assert.equal(parseCaseText('hello'), null);
});
test('paste-back: approvals, card produced, denials and a future interview date', () => {
  assert.equal(statusOf('Case Was Approved'), 'approved');
  assert.equal(statusOf('New Card Is Being Produced'), 'approved');
  assert.equal(statusOf('Case Was Denied'), 'denied');
  assert.equal(statusOf('Case Was Received'), 'pending');
  const p = parseCaseText('Interview Was Scheduled\nOn November 12, 2026, we scheduled an interview for your Form I-485, Application to Register Permanent Residence, for January 20, 2027 at our Dallas office.')!;
  const c = applyCaseText({ id: 'c', receipt: 'IOE0900000001', ownerId: 'me', keyDates: [], history: [] }, p, '2026-11-18');
  assert.deepEqual(c.keyDates, [{ kind: 'interview', date: '2027-01-20' }]);
  // only the explanation copied → heading from the text
  assert.equal(parseCaseText('On October 1, 2026, we approved your Form I-765, Application for Employment Authorization. We will mail your card.')!.status, 'Case Was Approved');
});

// ---------- light mode contrast (WCAG AA ≥ 4.5:1) ----------
test('light mode: body, secondary, tertiary text and tone inks pass 4.5:1 on cards, page and tinted pills', () => {
  for (const bg of [LIGHT.card, LIGHT.bg, LIGHT.card2]) {
    for (const fg of [LIGHT.text, LIGHT.text2, LIGHT.text3, LIGHT.inkAccent, LIGHT.inkAmber, LIGHT.inkRed, LIGHT.inkGreen]) {
      assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
    }
  }
  // pills: dark ink on a tint of the tone colour, over a white card
  for (const [c, ink] of [[LIGHT.amber, LIGHT.inkAmber], [LIGHT.red, LIGHT.inkRed], [LIGHT.green, LIGHT.inkGreen], [LIGHT.accent, LIGHT.inkAccent]] as const) {
    const r = contrast(ink, tintOf(c, LIGHT.pillAlpha), LIGHT.card);
    assert.ok(r >= 4.5, `${ink} on ${c} pill: ${r.toFixed(2)}`);
  }
  // white text on the primary button
  assert.ok(contrast('#FFFFFF', LIGHT.inkAccent) >= 4.5);
  // secondary text is much darker than before (was rgba(60,60,67,0.6) ≈ 4.0:1 on the grey page)
  assert.ok(contrast(LIGHT.text2, LIGHT.bg) > 7);
  // dark mode unchanged
  assert.equal(DARK.text2, 'rgba(235,235,245,0.6)');
});

// ---------- help ----------
test('help: every tab card and "?" button points at a real topic; required topics exist', () => {
  for (const h of Object.values(TAB_HELP)) assert.ok(helpTopic(h.topic), h.topic);
  for (const id of ['overview', 'family-docs', 'statuses', 'cases', 'citizenship', 'i9', 'backups', 'privacy', 'priority-date', 'processing', 'travel', 'layoff']) assert.ok(helpTopic(id), id);
  assert.ok(HELP.find((h) => h.id === 'cases')!.steps!.some((s) => /Paste what USCIS says/.test(s)));
});

test('dark mode (v2.1.1): captions, pills and tinted buttons pass 4.5:1; primary stays Apple white-on-blue', () => {
  for (const bg of [DARK.card, DARK.bg, DARK.card2]) {
    for (const fg of [DARK.text, DARK.text2, DARK.inkAccent, DARK.inkAmber, DARK.inkRed, DARK.inkGreen]) assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
    assert.ok(contrast(DARK.inkAccent, tintOf(DARK.accent, 0.16), bg) >= 4.5, 'tinted button');
    assert.ok(contrast(DARK.inkRed, tintOf(DARK.red, 0.15), bg) >= 4.5, 'danger button');
  }
  for (const [c, ink] of [[DARK.amber, DARK.inkAmber], [DARK.red, DARK.inkRed], [DARK.green, DARK.inkGreen], [DARK.accent, DARK.inkAccent]] as const) {
    assert.ok(contrast(ink, tintOf(c, DARK.pillAlpha), DARK.card) >= 4.5, `${ink} pill`);
  }
  assert.equal(DARK.accent, '#0A84FF');
});

test('update rows show the family’s own tags first', () => {
  assert.deepEqual(orderTags(['H-1B', 'Fees', 'L-1'], ['L-1', 'L-2']), ['L-1', 'H-1B', 'Fees']);
  assert.deepEqual(orderTags(['Fees', 'STEM OPT'], ['OPT']), ['STEM OPT', 'Fees']);
  assert.deepEqual(orderTags(['H-1B', 'Fees'], []), ['H-1B', 'Fees']);
});
