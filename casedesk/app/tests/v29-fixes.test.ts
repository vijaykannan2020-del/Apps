// v2.9 fixes (round 7, section A). Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, belongsElsewhere, identityOf, setToday, supersededIds } from '../src/core';
import { T, doc, person } from './helpers';

setToday('2026-11-18');

test('a spouse passport saved under the principal does not supersede the principal passport', () => {
  const me = person('me', 'self', { name: 'Arun Kumar' });
  const mine = doc('me', T.passport('K1111111', 'KUMAR', 'ARUN', '06/02/2017', '05/02/2027'));
  const hers = doc('me', T.passport('Z2222222', 'RAO', 'PRIYA', '02/05/2023', '01/05/2033'));
  const r = deriveRecord(me, [mine, hers]);
  assert.equal(r.passportNo, 'K1111111');
  assert.match(r.legalName ?? '', /arun/i);
  const sup = supersededIds(r, [mine, hers]);
  assert.equal(sup.has(mine.id), false);
  assert.equal(sup.has(hers.id), false);
});

test('an older passport with the same name is still superseded', () => {
  const me = person('me', 'self', { name: 'Arun Kumar' });
  const oldP = doc('me', T.passport('K1111111', 'KUMAR', 'ARUN', '12/08/2015', '11/08/2025'));
  const newP = doc('me', T.passport('Z3333333', 'KUMAR', 'ARUN'));
  const r = deriveRecord(me, [oldP, newP]);
  assert.equal(supersededIds(r, [oldP, newP]).has(oldP.id), true);
});

test('moving the misfiled passport away makes the own passport current again', () => {
  const me = person('me', 'self', { name: 'Arun Kumar' });
  const wife = person('sp', 'spouse', { name: 'Priya Rao' });
  const mine = doc('me', T.passport('K1111111', 'KUMAR', 'ARUN', '06/02/2017', '05/02/2027'));
  const hers = { ...doc('me', T.passport('Z2222222', 'RAO', 'PRIYA', '02/05/2023', '01/05/2033')), ownerId: 'sp' };
  const r = deriveRecord(me, [mine, hers]);
  assert.equal(r.passportNo, 'K1111111');
  assert.equal(deriveRecord(wife, [mine, hers]).passportNo, 'Z2222222');
});

test('the name typed at setup tells whose document it is when no passport of theirs is saved yet', () => {
  const hers = doc('me', T.passport('Z2222222', 'RAO', 'PRIYA'));
  const ids = [
    identityOf('me', [doc('me', T.passport('K1111111', 'KUMAR', 'ARUN'))], { displayName: 'Arun Kumar' }),
    identityOf('sp', [], { displayName: 'Priya Rao' }),
    identityOf('kid', [], { displayName: 'Kid' }),
  ];
  assert.equal(belongsElsewhere(hers.fields, 'me', ids)?.id, 'sp');
  // their own document is never flagged
  assert.equal(belongsElsewhere(hers.fields, 'sp', ids), undefined);
  // a short nickname never matches
  const ids2 = [ids[0], identityOf('sp', [], { displayName: 'Mom' })];
  assert.equal(belongsElsewhere(hers.fields, 'me', ids2), undefined);
});
