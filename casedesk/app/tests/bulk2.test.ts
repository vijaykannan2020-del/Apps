// bulk2: whose document is this (Add several documents at once). Made-up family and numbers only.
// Family: Ravi Kumar (you), his wife Lakshmi Sundara Narayanan, children Asha Meera Ravi and Dev Ravi
// (Indian style: the children's family name is their father's given name).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchDoc, nameScore, planBulk, editDistance, sharedParts, dupKey, whyText, type Member } from '../src/core/match';
import { readDocument } from '../src/core/read';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fam = (names: Partial<Record<'me' | 'sp' | 'a' | 'd', string>> = {}): Member[] => [
  { id: 'me', relation: 'self', name: names.me ?? 'Ravi Kumar', passportNos: [] },
  { id: 'sp', relation: 'spouse', name: names.sp ?? 'Lakshmi Narayanan', passportNos: [] },
  { id: 'a', relation: 'child', name: names.a ?? 'Asha Ravi', passportNos: [] },
  { id: 'd', relation: 'child', name: names.d ?? 'Dev Ravi', passportNos: [] },
];
const doc = (name: string, extra: Record<string, string> = {}) => ({ name, ...extra });

test('bulk2 names: case, spacing, order, missing middle names, joined parts', () => {
  for (const n of ['LAKSHMI SUNDARA NARAYANAN', 'Narayanan Lakshmi', 'lakshmi  narayanan', 'LAKSHMI SUNDARA NARA YANAN']) assert.equal(matchDoc(doc(n), fam()).id, 'sp', n);
  assert.equal(matchDoc(doc('LAKSHMI SUNDARANARAYANAN'), fam({ sp: 'Lakshmi Sundara Narayanan' })).id, 'sp', 'parts run together on the document');
  assert.equal(matchDoc(doc('LAKSHMI SUNDARA NARAYANAN'), fam({ sp: 'Lakshmi SundaraNarayanan' })).id, 'sp', 'parts run together in the app');
});
test('bulk2 names: 1–2 letter typos in the app or on the scan', () => {
  assert.equal(matchDoc(doc('RAVI KUMAR'), fam({ me: 'Ravi Kumaar' })).id, 'me');
  assert.equal(matchDoc(doc('LAKSHMI NARAYANAN'), fam({ sp: 'Lakshmy Narayanan' })).id, 'sp', 'one part spelled differently, the other exact');
  const lx = matchDoc(doc('LAKSHMI NARAYANAN'), fam({ sp: 'Laxmi Narayanan' }));
  assert.deepEqual([lx.id, lx.close], [undefined, 'sp'], 'a different spelling (3 letters off) with only the family name exact: ask, offering her first');
  assert.equal(matchDoc(doc('LAKSHMI NARAYANAN'), fam({ sp: 'Lakshmi Narayan' })).id, 'sp', 'a shortened family name');
  assert.equal(editDistance('NARAYANAN', 'NARAYNAN'), 1);
  assert.equal(editDistance('KUMAR', 'KUMAAR'), 1);
  assert.ok(editDistance('ASHA', 'USHA') === 1 && nameScore('Asha', 'USHA MENON').score < 0.5, 'short names need the exact spelling: Asha is not Usha');
  assert.equal(matchDoc(doc('USHA MENON'), fam()).id, undefined);
});
test('bulk2 names: first names only, and a short form of the given name', () => {
  const firsts = fam({ me: 'Ravi', sp: 'Lakshmi', a: 'Asha', d: 'Dev' });
  assert.equal(matchDoc(doc('LAKSHMI SUNDARA NARAYANAN'), firsts).id, 'sp');
  assert.equal(matchDoc(doc('ASHA MEERA RAVI'), firsts).id, 'a', 'the child, not the father whose given name is her family name');
  assert.equal(matchDoc(doc('RAVI KUMAR'), firsts).id, 'me');
  assert.equal(matchDoc(doc('RAVISHANKAR KUMAR'), fam({ me: 'Ravi' })).id, undefined, 'a 4-letter minimum for short forms: Ravi is too short to stand for Ravishankar');
  assert.equal(matchDoc(doc('VENKATESH KUMAR'), fam({ me: 'Venkat' })).id, 'me', 'Venkat for Venkatesh');
});
test('bulk2 children: a child whose family name is the father’s given name goes to the child', () => {
  assert.equal(matchDoc(doc('ASHA MEERA RAVI'), fam()).id, 'a');
  assert.equal(matchDoc(doc('DEV RAVI'), fam()).id, 'd');
  assert.equal(matchDoc(doc('RAVI KUMAR'), fam()).id, 'me');
});
test('bulk2 never decides on a shared family name alone', () => {
  assert.ok(sharedParts(fam()).has('RAVI'), 'RAVI is in three names');
  assert.equal(matchDoc(doc('RAVI'), fam()).id, undefined);
  assert.equal(matchDoc(doc('MEENA RAVI'), fam()).id, undefined, 'a stranger with the family name: ask');
  assert.equal(matchDoc(doc('JOHN SMITH'), fam()).id, undefined);
  assert.equal(matchDoc({}, fam()).id, undefined, 'nothing read: ask');
});
test('bulk2 passport numbers link a visa, I-94 or approval to the passport’s owner', () => {
  const m = fam(); m[1].passportNos = ['Z1234567'];
  const r = matchDoc({ passportNo: 'Z1234567' }, m);
  assert.deepEqual([r.id, r.why], ['sp', ['passport number']]);
  assert.equal(matchDoc({ oldPassportNo: 'Z1234567', name: 'SOMEONE ELSE' }, m).id, 'sp', 'an old number printed on a new passport');
  assert.deepEqual(matchDoc({ passportNo: 'Z1234567', name: 'LAKSHMI NARAYANAN' }, m).why, ['passport number', 'name']);
});
test('bulk2 date of birth: same date decides, a different date rules a person out', () => {
  const m = fam({ a: 'Asha', d: 'Dev' }); m[2].birthDate = '2019-04-02'; m[3].birthDate = '2022-01-15';
  const r = matchDoc({ name: 'DEV RAVI', birthDate: '2022-01-15' }, m);
  assert.deepEqual([r.id, r.why], ['d', ['name', 'date of birth']]);
  assert.equal(matchDoc({ birthDate: '2019-04-02' }, m).id, 'a', 'no name read, date of birth matches');
  assert.equal(matchDoc({ name: 'ASHA MEERA RAVI', birthDate: '2020-09-09' }, m).id, undefined, 'name fits but the date of birth is someone else’s: ask');
  assert.equal(whyText(['name', 'date of birth']), 'Matched by name and date of birth');
});
test('bulk2 batch: passports first teach numbers, legal names and birth dates to the rest; picked order kept', () => {
  const m = fam({ me: 'Ravi', sp: 'Lakshmi', a: 'Asha', d: 'Dev' });
  const read = [
    { id: 'v1', type: 'visa', fields: { passportNo: 'Y7654321', validTo: '2027-06-01' } }, // no name read (noisy foil)
    { id: 'p1', type: 'passport', fields: { name: 'Asha Meera Ravi', passportNo: 'Y7654321', birthDate: '2019-04-02', validTo: '2029-04-01' } },
    { id: 'i1', type: 'i94', fields: { birthDate: '2019-04-02', validTo: '2027-06-01', entryDate: '2024-07-01' } },
    { id: 'x1', type: 'passport', fields: { name: 'Meena Ravi', passportNo: 'Q1111111', validTo: '2030-01-01' } },
  ];
  const plan = planBulk(read, m, []);
  assert.deepEqual(plan.map((x) => x.id), ['v1', 'p1', 'i1', 'x1'], 'same order as picked');
  assert.deepEqual(plan.map((x) => [x.state, x.ownerId]), [['filed', 'a'], ['filed', 'a'], ['filed', 'a'], ['ask', undefined]]);
  assert.deepEqual(plan[0].why, ['passport number']);
  assert.deepEqual(plan[2].why, ['date of birth']);
  assert.equal(plan[1].name, 'Asha Meera Ravi', 'the name read is kept for the review row');
  // with a fallback (older behaviour) the unknown is filed under the installer but marked unsure
  assert.deepEqual(planBulk(read, m, [], { fallback: 'me' })[3], { id: 'x1', ownerId: 'me', state: 'filed', why: [], name: 'Meena Ravi', close: 'a' });
});
test('bulk2 duplicates: the same passport twice is Already added, not saved again', () => {
  const m = fam();
  const pass = { id: 'p1', type: 'passport', fields: { name: 'RAVI KUMAR', passportNo: 'K2222222', validTo: '2031-01-01' } };
  const again = { ...pass, id: 'p2' };
  const plan = planBulk([pass, again], m, []);
  assert.deepEqual(plan.map((x) => x.state), ['filed', 'duplicate']);
  assert.equal(plan[1].dupOf, 'me');
  assert.equal(planBulk([again], m, [{ ownerId: 'me', type: 'passport', fields: pass.fields }])[0].state, 'duplicate', 'already saved before');
  assert.equal(dupKey({ type: 'passport', fields: {} }), undefined, 'no number: never called a duplicate');
  assert.notEqual(dupKey({ type: 'visa', fields: { passportNo: 'K2222222', validTo: '2027-01-01' } }), dupKey({ type: 'visa', fields: { passportNo: 'K2222222', validTo: '2032-01-01' } }), 'a newer visa in the same passport is not a duplicate');
});
test('bulk2 typo in the app: a passport offers the spelling printed on it', () => {
  const m = fam({ me: 'Ravi Kumaar' });
  const plan = planBulk([{ id: 'p1', type: 'passport', fields: { name: 'Ravi Kumar', passportNo: 'K2222222' } }], m, []);
  assert.deepEqual(plan[0].rename, { id: 'me', to: 'Ravi Kumar' });
  assert.equal(planBulk([{ id: 'v1', type: 'visa', fields: { name: 'Ravi Kumar', validTo: '2027-01-01' } }], m, [])[0].rename, undefined, 'only a passport gives the legal spelling');
  assert.equal(planBulk([{ id: 'p1', type: 'passport', fields: { name: 'Ravi Kumar' } }], fam(), [])[0].rename, undefined, 'same spelling: nothing to offer');
  assert.equal(planBulk([{ id: 'p1', type: 'passport', fields: { name: 'Lakshmi Sundara Narayanan' } }], fam({ sp: 'Lakshmi' }), [])[0].rename, undefined, 'a first name only is not a typo');
});
test('bulk2 reading: visa foil names and numbers under OCR noise; passport MRZ names', () => {
  const foil = 'UNITED STATES OF AMERICA\nVISA\nIssuing Post Name Control Number\nCHENNAI 20240000000001\nSurname\nRe RAVI a’ Ni\nGiven Name nn (lass\nbe, ASHA MEERA “Rte\nPassport Number Sex Birth Date\nY7654321 F 02APR2019\nEntries Issue Date Expiration Date\nM 01JUL2024 01JUN2027\nAnnotation\nBLANKET L2, PA:KUMAR, RAVI';
  const v = readDocument(foil);
  assert.equal(v.type, 'visa');
  assert.equal(v.fields.name, 'Asha Meera Ravi', 'given + surname, scraps and the PA: principal ignored');
  assert.equal(v.fields.passportNo, 'Y7654321');
  const mrz = 'REPUBLIC OF INDIA\nPASSPORT\nP<INDNARAYANAN<<LAKSHMI<SUNDARA<<<<<<<<<<<<<<<\nZ1234567<0IND8805123F3001012<<<<<<<<<<<<<<00';
  const p = readDocument(mrz);
  assert.equal(p.type, 'passport');
  assert.ok(/LAKSHMI/i.test(p.fields.name ?? '') && /NARAYANAN/i.test(p.fields.name ?? ''), 'MRZ SURNAME<<GIVEN read as a name');
  assert.equal(matchDoc(p.fields, fam({ sp: 'Lakshmi' })).id, 'sp');
});
test('bulk2 bulk path reads exactly like one document, and the review row shows the name read', () => {
  const b = src('src/data/bulk.ts');
  assert.match(b, /readText\(fileUri\(file\), file\.mime\)/, 'same reader as the single-document flow');
  assert.match(src('src/data/flow.ts'), /readText\(fileUri\(file\), file\.mime\)/);
  assert.match(b, /legalName: fam\.records\[p\.id\]\?\.legalName/);
  const s = src('src/screens/setup.tsx');
  assert.match(s, /Name on document: \$\{read\}/);
  assert.match(s, /Filed under: /);
});
