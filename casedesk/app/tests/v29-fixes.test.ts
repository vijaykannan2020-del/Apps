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

import { reviewReasons, reasonLine, whatToDo, type Finding } from '../src/core';

test('Review always says why and what to do', () => {
  const f = (id: string, severity: Finding['severity'], title: string, date?: string): Finding => ({ id, rule: 'C5', severity, title, detail: 'd', notLegalAdvice: true, talkToAttorney: false, date });
  const list = [f('pp-soon', 'review', 'Passport expires in 78 days', '2027-02-05'), f('i94-short', 'review', 'I-94 ends before the I-129S period'), f('i94-30', 'act', 'I-94 ends in 20 days', '2026-12-08')];
  const r = reviewReasons(list, '2027-06-28');
  assert.equal(r[0].finding.id, 'i94-30'); // Act now first
  assert.equal(reasonLine(list, '2027-06-28'), 'I-94 ends in 20 days');
  assert.match(whatToDo(list[1], '2027-06-28'), /before Jun 2027/);
  assert.match(whatToDo(list[0]), /Feb 2027/);
  // a finding without a rule (info notes) never makes the chip
  assert.equal(reasonLine([{ ...list[0], rule: undefined }]), undefined);
  // unknown ids still get a plain next step
  assert.ok(whatToDo(f('zzz', 'review', 'x', '2027-01-01')).length > 5);
});

import { typeSetting, typesFor, reminderSummary, copyReminders } from '../src/core';
import Module from 'node:module';
import path from 'node:path';
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return req === 'react-native' ? path.join(__dirname, 'stubs/react-native.cjs') : orig.call(this, req, ...a); };
const { reminderItems } = require('../src/native/reminders') as typeof import('../src/native/reminders');

test('reminders: per-type lead times, only the types the person has, a type can be switched off', () => {
  const me = person('me', 'self', { name: 'Arun Kumar' });
  const pp = doc('me', T.passport('K1111111', 'KUMAR', 'ARUN', '06/02/2020', '05/02/2030'));
  const i94 = doc('me', T.i94('2028 July 21', '2026 March 10', 'H1B', 'K1111111'));
  const rec = deriveRecord(me, [pp, i94]);
  assert.deepEqual(typesFor(rec, false), ['passport', 'i94']);
  assert.deepEqual(typeSetting(undefined, 'passport').lead, [180, 90]);
  assert.deepEqual(typeSetting(undefined, 'i94').lead, [90, 30, 7]);
  // someone who changed the old single list keeps it for every type
  assert.deepEqual(typeSetting({ on: true, lead: [30] }, 'passport').lead, [30]);
  const rm = { on: true, lead: [180, 90, 30, 7], types: { passport: { on: false, lead: [180] } } };
  const items = reminderItems([{ ...me, reminders: rm }], { me: rec }, {}, []);
  assert.ok(!items.some((x) => /passport/.test(x.title)));
  assert.equal(items.filter((x) => /I-94 ends/.test(x.title)).length, 3);
  assert.equal(reminderSummary(rm, ['passport', 'i94']), 'On · I-94');
  assert.deepEqual(copyReminders(rm, undefined).types?.passport, { on: false, lead: [180] });
});

import { search, expandQuery, STATIC_ITEMS, type SearchItem } from '../src/core';

test('search: synonyms (GC, EAD, AP, stamping), grouped by section, people first', () => {
  const items: SearchItem[] = [
    ...STATIC_ITEMS,
    { id: 'p1', section: 'People', title: 'Arun Kumar', sub: 'You · H-1B', path: '/person/me' },
    { id: 'd1', section: 'Documents', title: 'EAD card', sub: 'Meera · ends Jan 1, 2027', path: '/document/x', keywords: ['ead', 'work permit'] },
    { id: 'd2', section: 'Documents', title: 'I-485 receipt', sub: 'Arun', path: '/document/y', keywords: ['receipt', 'I-485'] },
    { id: 'd3', section: 'Documents', title: 'Visa stamp', sub: 'Arun', path: '/document/z', keywords: ['visa'] },
    { id: 'd4', section: 'Documents', title: 'Advance Parole', sub: 'Meera', path: '/document/w', keywords: ['advance parole'] },
  ];
  assert.ok(expandQuery('GC').includes('i485'));
  const gc = search(items, 'gc');
  assert.ok(gc.some((g) => g.section === 'Documents' && g.items.some((i) => i.id === 'd2')));
  assert.ok(gc.some((g) => g.section === 'Tools' && g.items.some((i) => i.path === '/tools/vb')));
  assert.equal(search(items, 'work permit')[0].items[0].id, 'd1');
  assert.equal(search(items, 'AP').find((g) => g.section === 'Documents')?.items[0].id, 'd4');
  assert.equal(search(items, 'stamping').find((g) => g.section === 'Documents')?.items[0].id, 'd3');
  assert.equal(search(items, 'arun')[0].section, 'People');
  assert.deepEqual(search(items, ''), []);
  assert.ok(search(items, 'processing').some((g) => g.items.some((i) => i.path === '/tools/proc')));
});
