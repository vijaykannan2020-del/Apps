// v2.8 Edit Widget: per-person items for every Show option, Current status in and outside the US,
// Whole family picks, green card fields read defensively. Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deriveRecord, setToday, type Document, type Person } from '../src/core';
import { DEFAULT_SETTINGS } from '../src/core/model';
import type { PersonRecord } from '../src/core/record';
import { buildWidgetSnapshot, familyItems, gcStage, personItems, WIDGET_KINDS } from '../src/core/widgets';
import { doc, person, T } from './helpers';

const TODAY = '2026-11-18';
const PASSPORT = 'Z9876543', PASSPORT2 = 'Y1234567', RECEIPT = 'EAC2690012345';

function base() {
  setToday(TODAY);
  const me: Person = person('me', 'self', { name: 'Test Person', status: 'H-1B' });
  const sp: Person = person('sp', 'spouse', { name: 'Sample Spouse', status: 'H-4' });
  const docs: Document[] = [
    doc('me', T.passport(PASSPORT, 'PERSON', 'TEST', '11/05/2024', '10/05/2034')),
    doc('me', T.i94('09/30/2027', '10/02/2025', 'H1B', PASSPORT)),
    doc('sp', T.passport(PASSPORT2, 'SPOUSE', 'SAMPLE', '01/02/2018', '01/01/2027')),
  ];
  return { me, sp, docs, rme: deriveRecord(me, docs), rsp: deriveRecord(sp, docs) };
}
const opts = (rec: PersonRecord) => ({ rec, cases: [], who: 'TP', whoInitials: 'TP', today: TODAY });

test('v2.8 widget: Show options match the Swift enum, Current status first (the default)', () => {
  assert.equal(WIDGET_KINDS[0], 'status');
  assert.deepEqual([...WIDGET_KINDS], ['status', 'deadline', 'passport', 'visa', 'i94', 'ead', 'ap', 'gc', 'case', 'pd']);
  const swift = readFileSync(path.join(__dirname, '../targets/widget/Intent.swift'), 'utf8');
  const raw = [...swift.matchAll(/^\s*case (\w+)(?: = "(\w+)")?$/gm)].map((m) => m[2] ?? m[1]);
  assert.deepEqual(raw, [...WIDGET_KINDS], 'Swift ShowItem raw values in the same order');
  assert.match(swift, /@Parameter\(title: "Show", default: \.status\)/);
  assert.match(swift, /WidgetConfigurationIntent/);
  assert.match(swift, /func suggestedEntities\(\)/, 'Person options come from the snapshot');
});

test('v2.8 widget: Current status in the US = latest I-94 admit-until date', () => {
  const { me, rme } = base();
  const items = personItems(me, opts(rme));
  const st = items.find((x) => x.kind === 'status')!;
  assert.equal(st.place, 'US');
  assert.equal(st.date, '2027-09-30');
  assert.equal(st.mode, 'until');
  assert.equal(st.text, 'H-1B');
  assert.equal(st.stamp, undefined, 'stamp only outside the US');
  assert.equal(st.url, 'casedesk://person/me');
  assert.equal(items.find((x) => x.kind === 'i94')!.date, '2027-09-30');
  assert.equal(items.find((x) => x.kind === 'passport')!.date, '2034-05-10');
  assert.ok(!items.some((x) => x.kind === 'ead' || x.kind === 'ap'), 'not added → left out (widget says Not added yet)');
});

test('v2.8 widget: Current status outside the US = I-797 expiry, visa stamp yes/no', () => {
  const { me, rme } = base();
  const out: PersonRecord = { ...rme, location: 'Outside', i94: undefined, currentApproval: { docId: 'd1', form: 'I-129', validTo: '2027-03-31', superseded: false }, approvals: [], visaStamp: { expires: '2027-01-15' } };
  const st = personItems(me, opts(out)).find((x) => x.kind === 'status')!;
  assert.deepEqual([st.place, st.label, st.date, st.stamp], ['Outside', 'I-797 valid until', '2027-03-31', true]);
  const expired = personItems(me, opts({ ...out, visaStamp: { expires: '2026-01-15' } })).find((x) => x.kind === 'status')!;
  assert.equal(expired.stamp, false);
  const none = personItems(me, opts({ ...out, visaStamp: undefined })).find((x) => x.kind === 'status')!;
  assert.equal(none.stamp, false, 'no stamp saved = No');
});

test('v2.8 widget: EAD, advance parole and green card stage read defensively (before and after v2.9-gc)', () => {
  const { me, rme } = base();
  const gcRec: PersonRecord = { ...rme, ead: { expires: '2027-06-01', category: 'C9' }, advanceParole: { expires: '2027-06-01', from: 'combo-card' }, cases: [{ docId: 'x', form: 'I-485', status: 'pending' }] };
  const items = personItems(me, opts(gcRec));
  assert.equal(items.find((x) => x.kind === 'ead')!.date, '2027-06-01');
  assert.equal(items.find((x) => x.kind === 'ap')!.date, '2027-06-01');
  assert.equal(items.find((x) => x.kind === 'gc')!.text, 'I-485 pending');
  // A v2.9 stage label wins; odd shapes are ignored; records without cases do not throw.
  assert.equal(gcStage({ ...rme, gc: { stageLabel: 'Interview scheduled' } } as PersonRecord), 'Interview scheduled');
  assert.equal(gcStage({ ...rme, gc: { stage: 42 } } as unknown as PersonRecord), undefined);
  assert.doesNotThrow(() => personItems(me, opts({ ...rme, cases: undefined, approvals: undefined } as unknown as PersonRecord)));
  assert.equal(gcStage({ ...rme, greenCard: { expires: '2034-01-01', conditional: false } }), 'Green card holder');
});

test('v2.8 widget: Whole family picks the nearest date; snapshot has items, no numbers, locked has none', () => {
  const { me, sp, docs, rme, rsp } = base();
  const all = [...personItems(me, opts(rme)), ...personItems(sp, { ...opts(rsp), who: 'SS', whoInitials: 'SS' })];
  const fam = familyItems(all, TODAY);
  assert.equal(fam.find((x) => x.kind === 'passport')!.personId, 'sp', 'spouse passport ends first');
  const input = { people: [me, sp], records: { me: rme, sp: rsp }, results: {}, caseList: [], settings: DEFAULT_SETTINGS, today: TODAY };
  const s = buildWidgetSnapshot(input);
  assert.ok(s.items!.length && s.familyItems!.length);
  const json = JSON.stringify(s);
  for (const n of [PASSPORT, PASSPORT2, RECEIPT, 'Test Person', 'Sample Spouse']) assert.ok(!json.includes(n), n);
  const locked = buildWidgetSnapshot({ ...input, settings: { ...DEFAULT_SETTINGS, faceId: true } });
  assert.equal(locked.locked, true);
  assert.equal(locked.items, undefined);
  assert.equal(locked.people.length, 0, 'locked: Edit Widget offers only Whole family');
  void docs;
});
