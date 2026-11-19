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

import { parsePlace, metroOfZip, placeText } from '../src/core';

test('work location from a city, City ST or a ZIP code gives the metro', () => {
  assert.equal(parsePlace('Austin, TX')?.metro, 'Austin');
  assert.equal(parsePlace('Plano TX')?.metro, 'Dallas–Fort Worth');
  assert.equal(parsePlace('75038')?.metro, 'Dallas–Fort Worth');
  assert.equal(parsePlace('Irving, TX 75038')?.city, 'Irving');
  assert.equal(metroOfZip('94085'), 'San Francisco Bay Area');
  assert.equal(metroOfZip('07302'), 'New York');
  assert.equal(metroOfZip('59001'), undefined);
  assert.equal(parsePlace(''), undefined);
  assert.equal(placeText({ zip: '75038' }), 'ZIP 75038');
});

test('Outside the US set in Edit details wins over an older I-94; birth date and employer typed are used when documents have none', () => {
  const i94 = doc('me', T.i94('2027 July 21', '2026 March 10', 'H1B', 'Z1'));
  const me = person('me', 'self', { name: 'Arun Kumar', facts: { location: 'Outside', country: 'India', locationOn: '2026-11-01', birthDate: '1990-01-02', employer: 'Acme Tech Inc' } });
  const r = deriveRecord(me, [i94]);
  assert.equal(r.location, 'Outside');
  assert.equal(r.birthDate ?? '', '1990-01-02');
  assert.equal(r.employer, 'Acme Tech Inc');
  // without a date the I-94 still says In the US (old answers)
  const old = person('me', 'self', { facts: { location: 'Outside' } });
  assert.equal(deriveRecord(old, [i94]).location, 'US');
});
