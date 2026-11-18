import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, evaluateFamily, setToday, RULES, type Person, type Document } from '../src/core';
import { T, doc, person } from './helpers';

setToday('2026-11-18');
const run = (people: Person[], docs: Document[], settings = { reminderLeadDays: [] as number[] }) =>
  evaluateFamily({ members: people.map((p) => ({ person: p, rec: deriveRecord(p, docs) })), docs, settings });
const rules = (r: ReturnType<typeof run>, id: string) => r[id].findings.filter((f) => f.rule).map((f) => f.rule).sort();

test('all good → C20, with source and last-checked date', () => {
  const me = person('me', 'self');
  const r = run([me], [doc('me', T.passport('Z1', 'KUMAR', 'ARUN')), doc('me', T.approval('WAC2590123456', '10/02/2025', '10/01/2025', '09/30/2028'))]);
  assert.deepEqual(rules(r, 'me'), ['C20']);
  assert.equal(r.me.worst, 'good');
  assert.ok(RULES.C20.source.url.startsWith('https://'));
});

test('240-day rule: timely same-employer extension after the I-94 date', () => {
  const me = person('me', 'self');
  const r = run([me], [
    doc('me', T.approval('WAC2390000001', '10/02/2023', '11/01/2023', '10/31/2026')),
    doc('me', T.receipt('WAC2690000002', '09/20/2026')),
  ]);
  assert.ok(rules(r, 'me').includes('C6'));
  assert.equal(r.me.facts.coverUntil, '2027-06-28');
});

test('act-now findings carry "not legal advice" and "talk to an attorney"', () => {
  const me = person('me', 'self');
  const r = run([me], [doc('me', T.i94('2026 November 01', '2026 May 01', 'B2', 'Z1'))]);
  const f = r.me.findings.find((x) => x.rule === 'C2')!;
  assert.equal(f.severity, 'act');
  assert.equal(f.notLegalAdvice, true);
  assert.equal(f.talkToAttorney, true);
});

test('AR-11: review within 10 days of a move, act now after; not for citizens', () => {
  const gc = person('me', 'self');
  const us = person('sp', 'spouse', { status: 'citizen' });
  const docs = [doc('me', T.greenCard('IR1', '01/25/2034', '01/25/2024'))];
  const soon = run([gc, us], docs, { reminderLeadDays: [], address: { changedOn: '2026-11-12', ar11Done: [] } } as any);
  assert.equal(soon.me.findings.find((f) => f.rule === 'R9')?.severity, 'review');
  assert.deepEqual(rules(soon, 'sp'), []);
  const late = run([gc], docs, { reminderLeadDays: [], address: { changedOn: '2026-11-01', ar11Done: [] } } as any);
  assert.equal(late.me.findings.find((f) => f.rule === 'R9')?.severity, 'act');
});

test('conditional card in the I-751 window → R12 act now; status runs to the card date', () => {
  const me = person('me', 'self', { facts: { location: 'US', marriedToCitizen: true } });
  const r = run([me], [doc('me', T.greenCard('CR6', '01/25/2027', '01/25/2025'))]);
  assert.equal(r.me.findings.find((f) => f.rule === 'R12')?.severity, 'act');
  assert.equal(r.me.facts.statusUntil, '2027-01-25');
  assert.equal(r.me.facts.citizenship?.fileFrom, '2027-10-27');
});
