// N3: ONE list of documents still to add — Home / "Continue adding" (missingSteps) and the engine's
// `missing` (checked by the QA runner) come from the same function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, evaluateFamily, missingSteps, setToday, type Document, type Person } from '../src/core';
import { doc, person, T } from './helpers';

setToday('2026-11-18');
const keys = (p: Person, docs: Document[]) => missingSteps(p, deriveRecord(p, docs), docs).map((s) => s.key);
const engine = (people: Person[], docs: Document[]) => evaluateFamily({ members: people.map((p) => ({ person: p, rec: deriveRecord(p, docs) })), docs });

test('green-card applicants: no I-94 while the I-485 is pending; dependents are not asked for the I-140', () => {
  const me = person('me', 'self', { status: 'green-card-applicant' });
  const sp = person('sp', 'spouse', { status: 'green-card-applicant' });
  const docs = [doc('me', T.passport('X1000001', 'KUMAR', 'ARUN')), doc('sp', T.passport('X1000002', 'KUMAR', 'PRIYA'))];
  assert.deepEqual(keys(me, docs), ['i140'], 'the principal is asked for their own I-140');
  assert.deepEqual(keys(sp, docs), []);
});

test('a US-citizen spouse is not asked for a passport; a TN worker is not asked for an approval notice', () => {
  assert.deepEqual(keys(person('sp', 'spouse', { status: 'citizen' }), []), []);
  const tn = person('me', 'self', { status: 'TN', facts: { location: 'US' } });
  const docs = [doc('me', T.passport('X1000003', 'KUMAR', 'ARUN')), doc('me', T.i94('2028-01-01', '2025-01-01', 'TN', 'X1000003'))];
  assert.ok(!keys(tn, docs).includes('approval'));
});

test('an H-1B worker in the US without an approval is asked for it; the engine reports the very same list', () => {
  const me = person('me', 'self', { status: 'H-1B' });
  const sp = person('sp', 'spouse', { status: 'H-4' });
  const docs = [doc('me', T.passport('X1000004', 'KUMAR', 'ARUN')), doc('me', T.i94('2027-10-01', '2025-01-01', 'H1B', 'X1000004'))];
  assert.ok(keys(me, docs).includes('approval'));
  const r = engine([me, sp], docs);
  for (const p of [me, sp]) assert.deepEqual(r[p.id].missingSteps.map((s) => s.key), keys(p, docs));
  assert.equal(r.me.missing.length, r.me.missingSteps.length);
});

test('combo card: two dated badges, work permit and travel document', async () => {
  const { docBadges } = await import('../src/core');
  const combo = { type: 'ead' as const, fields: { comboAP: true, validTo: '2027-08-09' } };
  assert.deepEqual(docBadges(combo).map((b) => b.label), ['Work permit until', 'Travel document until']);
  assert.ok(docBadges(combo).every((b) => /2027/.test(b.value)));
  assert.equal(docBadges({ type: 'ead', fields: { validTo: '2027-08-09' } }).length, 1);
});
