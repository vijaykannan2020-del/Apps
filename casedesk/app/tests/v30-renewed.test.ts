// v3.0: a renewed document replaces the old one in status, even when the name reads slightly differently.
// Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, setToday, supersededIds } from '../src/core';
import { T, doc, person } from './helpers';

setToday('2026-11-18');

test('an expired passport is superseded by the renewal when the scan misreads a letter', () => {
  const sp = person('sp', 'spouse', { name: 'Priya Rao' });
  const oldP = doc('sp', T.passport('K4444444', 'RAO', 'PRIYA', '03/03/2014', '02/03/2024'));
  const newP = doc('sp', T.passport('Z5555555', 'RAO', 'PRIYAA', '04/04/2024', '03/04/2034'));
  const r = deriveRecord(sp, [oldP, newP]);
  const sup = supersededIds(r, [oldP, newP]);
  assert.equal(sup.has(oldP.id), true);
  assert.equal(sup.has(newP.id), false);
});

test('a renewal with an added middle name still supersedes the old passport', () => {
  const sp = person('sp', 'spouse', { name: 'Priya Rao' });
  const oldP = doc('sp', T.passport('K4444444', 'RAO', 'PRIYA', '03/03/2014', '02/03/2024'));
  const newP = doc('sp', T.passport('Z5555555', 'RAO', 'PRIYA LAKSHMI', '04/04/2024', '03/04/2034'));
  const r = deriveRecord(sp, [oldP, newP]);
  assert.equal(supersededIds(r, [oldP, newP]).has(oldP.id), true);
});

test('a renewed EAD supersedes the old card', () => {
  const sp = person('sp', 'spouse', { name: 'Priya Kumar' });
  const oldE = doc('sp', T.ead('C09', '01/01/2023', '12/31/2024'));
  const newE = doc('sp', T.ead('C09', '01/01/2025', '12/31/2027'));
  const r = deriveRecord(sp, [oldE, newE]);
  const sup = supersededIds(r, [oldE, newE]);
  assert.equal(sup.has(oldE.id), true);
  assert.equal(sup.has(newE.id), false);
});
