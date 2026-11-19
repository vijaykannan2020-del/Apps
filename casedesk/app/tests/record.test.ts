import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, belongsElsewhere, identityOf, setToday, stepsFor, missingSteps } from '../src/core';
import { T, doc, person } from './helpers';

setToday('2026-11-18');

test('the newest I-94 by issue date wins, even if it ends sooner (order-independent)', () => {
  const me = person('me', 'self');
  const cbp = doc('me', T.i94('2027 July 21', '2026 March 10', 'H1B', 'Z1'));
  const appr = doc('me', T.approval('WAC2590123456', '10/02/2025', '10/01/2025', '09/30/2028'));
  for (const docs of [[cbp, appr], [appr, cbp]]) {
    const r = deriveRecord(me, docs);
    assert.equal(r.i94?.until, '2027-07-21');
    assert.equal(r.petitionEnd, '2028-09-30');
    assert.equal(r.visa, 'H-1B');
  }
});

test('newer passport is current whichever is uploaded first', () => {
  const me = person('me', 'self');
  const oldP = doc('me', T.passport('K1111111', 'KUMAR', 'ARUN', '12/08/2015', '11/08/2025'));
  const newP = doc('me', T.passport('Z2222222', 'KUMAR', 'ARUN'));
  for (const docs of [[oldP, newP], [newP, oldP]]) {
    const r = deriveRecord(me, docs);
    assert.equal(r.passportNo, 'Z2222222');
    assert.deepEqual([...r.passportNos].sort(), ['K1111111', 'Z2222222']);
  }
});

test('an approval issued after a receipt clears the pending extension', () => {
  const me = person('me', 'self');
  const rec = doc('me', T.receipt('WAC2690000001', '04/01/2026'));
  const appr = doc('me', T.approval('WAC2690000001', '06/01/2026', '07/01/2026', '06/30/2029'));
  assert.ok(deriveRecord(me, [rec]).pending);
  assert.equal(deriveRecord(me, [rec, appr]).pending, undefined);
});

test('a misfiled document is matched by passport number', () => {
  const docs = [doc('me', T.passport('Z1000001', 'KUMAR', 'ARUN')), doc('kid', T.passport('W2000002', 'ARUN', 'LEELA'))];
  const stray = doc('me', T.i94('2028 May 31', '2026 January 05', 'H4', 'W2000002'));
  const ids = [identityOf('me', docs.filter((d) => d.ownerId === 'me')), identityOf('kid', docs.filter((d) => d.ownerId === 'kid'))];
  assert.equal(belongsElsewhere(stray.fields, 'me', ids)?.id, 'kid');
});

test('steps follow the status (prototype order)', () => {
  const key = (p: ReturnType<typeof person>) => stepsFor(p).map((s) => s.key);
  assert.deepEqual(key(person('s', 'self', { status: 'STEM OPT' })), ['passport', 'visa', 'i94', 'i20', 'ead']);
  assert.deepEqual(key(person('s', 'self', { status: 'H-1B' })), ['passport', 'visa', 'i94', 'approval', 'receipt']);
  assert.deepEqual(key(person('w', 'spouse', { status: 'H-4' })), ['passport', 'visa', 'i94', 'approval', 'receipt', 'ead']);
  assert.deepEqual(key(person('g', 'self', { status: 'green-card-applicant' })), ['passport', 'i94', 'perm', 'i140', 'i485', 'combo', 'ap']); // v2.9 green-card catalog
  assert.deepEqual(key(person('c', 'self', { status: 'conditional-green-card' })), ['gc', 'passport', 'travel', 'receipt']);
  assert.deepEqual(key(person('k', 'child', { status: 'citizen' })), ['passport']);
});

test('missing steps skip optional ones and the I-94 for someone outside the US', () => {
  const p = person('w', 'spouse', { status: 'H-4', facts: { location: 'Outside', country: 'India' } });
  const rec = deriveRecord(p, []);
  assert.deepEqual(missingSteps(p, rec, []).map((s) => s.key), ['passport', 'visa']);
});
