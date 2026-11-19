// v2.9 gc2: country of birth (chargeability), EAD choice for the family, interview checklist to share,
// planner wording when the bulletin history is short. Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRecord, evaluateFamily, setToday, readDocument, gcTrackOf, gcPlan, interviewChecklist, eadDependents, crossChargeNote, checklistText, checklistHtml,
  birthCountryOf, birthCountryGuess, chargeabilityOf, countryFromPlace, placeAfter, BIRTH_NOTE,
  type Document, type Person,
} from '../src/core';
import { BULLETIN } from '../src/content/bulletin';
import { T, doc, person } from './helpers';

setToday('2026-11-19');

const I140 = (pd: string) => `I-797 | NOTICE OF ACTION\nReceipt Number               Case Type\nSRC2490099999                I140 - IMMIGRANT PETITION FOR ALIEN WORKER\nReceived Date   Priority Date   Petitioner\n03/04/2024      ${pd}      ACME TECH INC\nNotice Date     Page            Beneficiary\n06/10/2024      1 of 1          DOE, SAM\nNotice Type: Approval Notice\nSection: Advanced degree 203(b)(2)\nThe above petition has been approved.`;
const I485 = (receipt: string) => T.receipt(receipt, '01/10/2026', 'I485 - APPLICATION TO REGISTER PERMANENT RESIDENCE OR ADJUST STATUS');
// Indian passport with a machine-readable zone (nationality IND).
const PASS = (no: string) => `${T.passport(no, 'DOE', 'SAM')}\nP<INDDOE<<SAM<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n${no}<1IND8606143M3410059<<<<<<<<<<<<<<02`;
const who = (people: Person[], docs: Document[]) => people.map((p) => ({ person: p, rec: deriveRecord(p, docs) }));
const run = (people: Person[], docs: Document[]) => evaluateFamily({ members: who(people, docs), docs, settings: { reminderLeadDays: [] }, bulletin: BULLETIN });

test('place of birth is read from the passport and the EAD; Indian towns and states map to India', () => {
  const pass = `${T.passport('Z7000001', 'DOE', 'SAM')}\nPlace of Birth / जन्म स्थान\nPUNE, MAHARASHTRA\nPlace of Issue\nMUMBAI`;
  assert.equal(readDocument(pass).fields.birthPlace, 'PUNE, MAHARASHTRA');
  assert.equal(countryFromPlace('PUNE, MAHARASHTRA'), 'IND');
  assert.equal(readDocument(`${T.ead('C09', '03/01/2026', '02/28/2028')}\nCountry of Birth   Sex\nMexico             F`).fields.birthPlace, 'MEXICO');
  assert.equal(placeAfter('Country of Birth: Philippines', /country of birth/i), 'PHILIPPINES');
  assert.equal(placeAfter('Place of Birth\nDate of Issue', /place of birth/i), undefined); // the next label is not a place
  assert.equal(countryFromPlace('TAIPEI, TAIWAN'), 'TWN');
  assert.equal(countryFromPlace('SPRINGFIELD'), undefined);
  assert.equal(readDocument(T.passport('Z7000002', 'DOE', 'ALEX')).fields.birthPlace, undefined); // older saved passports: nothing new
});

test('country of birth: typed wins, then a document, then the nationality; China is mainland born only', () => {
  assert.deepEqual(birthCountryOf('MEX', { nationality: 'IND' }), { code: 'MEX', from: 'typed' });
  assert.deepEqual(birthCountryOf(undefined, { birthPlace: 'GUADALAJARA, MEXICO', nationality: 'IND' }), { code: 'MEX', from: 'document' });
  assert.deepEqual(birthCountryGuess({ nationality: 'IND' }), { code: 'IND', from: 'nationality' });
  assert.deepEqual(birthCountryGuess({ nationality: 'DEU' }), { code: 'OTH', from: 'nationality' });
  assert.equal(birthCountryGuess({}), undefined);
  assert.equal(chargeabilityOf('CHN'), 'china');
  assert.equal(chargeabilityOf('TWN'), 'all');
  assert.equal(chargeabilityOf('HKG'), 'all');
  assert.equal(chargeabilityOf('OTH'), 'all');
  assert.match(BIRTH_NOTE, /country of birth, not passport/);
});

test('GC chargeability: the principal’s country of birth beats the passport; the override still wins; the family follows', () => {
  const docs = [doc('me', PASS('Z7000003')), doc('me', I140('01/15/2020'))]; // Indian passport
  const me = person('me', 'self', { status: 'H-1B' });
  let all = who([me], docs);
  let t = gcTrackOf(all[0], all, BULLETIN)!;
  assert.equal(t.country, 'india');
  assert.equal(t.countryFrom, 'passport');
  const bornUK = { ...me, facts: { ...me.facts, birthCountry: 'GBR' } };
  const sp = person('sp', 'spouse', { status: 'H-4', facts: { location: 'US', birthCountry: 'IND' } });
  all = who([bornUK, sp], docs);
  t = gcTrackOf(all[0], all, BULLETIN)!;
  assert.equal(t.country, 'all');
  assert.equal(t.countryFrom, 'birth');
  assert.equal(gcTrackOf(all[1], all, BULLETIN)!.country, 'all'); // the spouse is charged to the principal's country
  const over = { ...bornUK, facts: { ...bornUK.facts, gc: { chargeability: 'india' as const } } };
  all = who([over, sp], docs);
  t = gcTrackOf(all[0], all, BULLETIN)!;
  assert.equal(t.country, 'india');
  assert.equal(t.countryFrom, 'picked');
  // cross-chargeability: only a short note, no logic
  all = who([bornUK, sp], docs);
  assert.match(crossChargeNote(gcTrackOf(all[0], all, BULLETIN)!, all[0], all) ?? '', /cross-chargeability/);
  const spSame = { ...sp, facts: { ...sp.facts, birthCountry: 'CAN' } };
  all = who([bornUK, spSame], docs);
  assert.equal(crossChargeNote(gcTrackOf(all[0], all, BULLETIN)!, all[0], all), undefined); // both use the all-countries column
});

test('EAD choice for the family: dependents with a pending I-485 are asked; yes = EAD until their card, no = H-4 with the warning', () => {
  const me = person('me', 'self', { status: 'H-1B', facts: { location: 'US', gc: { workOn: 'ead' } } });
  const sp = person('sp', 'spouse', { status: 'H-4' });
  const kid = person('kid', 'child', { status: 'H-4' });
  const docs = [
    doc('me', T.i94('02/15/2028', '03/01/2025', 'H1B', 'Z1')), doc('me', I140('01/15/2020')), doc('me', I485('MSC2690000101')),
    doc('sp', T.i94('02/15/2028', '03/01/2025', 'H4', 'Z2')), doc('sp', I485('MSC2690000102')),
    doc('kid', T.i94('02/15/2028', '03/01/2025', 'H4', 'Z3')), // no I-485 of their own → not asked
  ];
  const ask = eadDependents(who([me, sp, kid], docs)[0], who([me, sp, kid], docs));
  assert.deepEqual(ask.map((x) => x.person.id), ['sp']);
  assert.equal(ask[0].depClass, 'H-4');
  assert.equal(ask[0].hasEad, false); // → ask them to add the card
  // No: stays on H-4, flagged because it depends on the principal's H / L status
  let r = run([me, sp, kid], docs);
  assert.equal(r.sp.findings.find((f) => f.id === 'gc-dep-hl')?.severity, 'review');
  // Yes: the spouse works on their own EAD (C9) — status is the EAD until their card, the H-4 warning goes
  const spEad = { ...sp, facts: { ...sp.facts, gc: { workOn: 'ead' as const } } };
  const withCard = [...docs, doc('sp', T.ead('C09', '03/01/2026', '02/28/2029'))];
  r = run([me, spEad, kid], withCard);
  assert.equal(r.sp.facts.visaLabel, 'EAD (C9) · I-485 pending');
  assert.equal(r.sp.facts.statusUntil, '2029-02-28');
  assert.ok(!r.sp.findings.some((f) => f.id === 'gc-dep-hl'));
  assert.equal(eadDependents(who([me, spEad], withCard)[0], who([me, spEad], withCard))[0].workOn, 'ead');
});

test('interview checklist to share: plain text and printable HTML, ticks kept, nothing unescaped', () => {
  const me = person('me', 'self');
  const items = interviewChecklist(me, undefined);
  const share = [{ name: 'Sam <A&B>', items, ticks: ['notice', 'passport'], interview: '2026-12-03' }];
  const txt = checklistText(share);
  assert.match(txt, /^Green card interview checklist · Dec 3, 2026/);
  assert.match(txt, /\[x\] The interview notice/);
  assert.match(txt, /\[ \] Government photo ID/);
  assert.match(txt, new RegExp(`2 of ${items.length} ready`));
  const html = checklistHtml(share);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('Sam &lt;A&amp;B&gt;'));
  assert.ok(!html.includes('<A&B>'));
  assert.equal((html.match(/class="on"/g) ?? []).length, 2);
});

test('planner: with too few months of bulletins it says it needs more months', () => {
  const docs = [doc('me', PASS('Z7000004')), doc('me', I140('01/15/2020'))];
  const all = who([person('me', 'self', { status: 'H-1B' })], docs);
  const plan = gcPlan(gcTrackOf(all[0], all, BULLETIN)!, { ...BULLETIN, history: [] }, []);
  assert.match(plan.etaNote ?? '', /needs more months/);
});
