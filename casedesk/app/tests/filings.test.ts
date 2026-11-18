// QA v4 P2/P3: next filing knows what's already filed (PS11-style spouse and parent), and STEM OPT
// gets its validation-report dates. Made-up people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRecord, evaluateFamily, setToday, type Document, type Person } from '../src/core';
import { nextFilings, markFiled } from '../src/core/filings';
import { T, doc, person } from './helpers';

setToday('2026-11-18');
const facts = (p: Person, docs: Document[]) => evaluateFamily({ members: [{ person: p, rec: deriveRecord(p, docs) }], docs, settings: { reminderLeadDays: [] } })[p.id].facts;
const N400 = 'N400 - APPLICATION FOR NATURALIZATION';
const I90 = 'I90 - APPLICATION TO REPLACE PERMANENT RESIDENT CARD';

test('green card + N-400 receipt on file: the N-400 shows as filed (pending), never “you can file now”', () => {
  const sp = person('sp', 'spouse', { status: 'green-card' });
  const docs = [doc('sp', T.greenCard('E37', '01/20/2032', '01/20/2022')), doc('sp', T.receipt('IOE0926000001', '10/25/2026', N400))];
  const rec = deriveRecord(sp, docs);
  assert.ok(rec.cases.some((c) => c.form === 'N-400'), 'N-400 receipt read');
  const f = nextFilings(sp, rec, facts(sp, docs)).find((x) => x.form === 'N-400')!;
  assert.ok(f.filed, 'marked as filed');
  assert.equal(f.filed!.received, '2026-10-25');
});

test('expired card + I-90 receipt: the I-90 shows as filed — no “deadline passed”', () => {
  const par = person('par', 'parent', { status: 'green-card' });
  const docs = [doc('par', T.greenCard('IR5', '10/05/2026', '07/07/2016')), doc('par', T.receipt('IOE0926000002', '09/01/2026', I90))];
  const rec = deriveRecord(par, docs);
  const list = nextFilings(par, rec, facts(par, docs));
  const i90 = list.find((x) => x.form === 'I-90')!;
  assert.ok(i90.filed, 'I-90 filed');
  // N-400 not filed yet → still offered
  assert.ok(list.find((x) => x.form === 'N-400' && !x.filed));
});

test('same for any form: a pending or approved case from Cases; old cases outside the window do not count', () => {
  const base = [{ personId: 'me', form: 'I-129', title: 'H-1B extension', earliest: '2026-12-28', deadline: '2027-06-28', why: '' }];
  assert.ok(markFiled(base, [{ form: 'I-129', status: 'Pending', received: '2027-01-10' }])[0].filed);
  assert.equal(markFiled(base, [{ form: 'I-129', status: 'Approved', received: '2027-01-10' }]).length, 0, 'filed and approved → done');
  assert.ok(!markFiled(base, [{ form: 'I-129', status: 'Approved', received: '2024-01-10' }])[0].filed, 'the old approval is not this filing');
  assert.ok(!markFiled(base, [{ form: 'I-129', status: 'Denied', received: '2027-01-10' }])[0].filed);
});

test('STEM OPT: validation reports at 6/12/18/24 months and the STEM EAD end', () => {
  const p = person('s', 'self', { status: 'STEM OPT' });
  const f = nextFilings(p, { visa: 'STEM OPT', ead: { category: 'C3C', validFrom: '2026-06-01', expires: '2028-05-31' }, location: 'US', cases: [] } as never, undefined);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'report');
  assert.deepEqual(f[0].dates!.map((d) => d.date), ['2026-12-01', '2027-06-01', '2027-12-01', '2028-05-31', '2028-05-31']);
  assert.equal(f[0].earliest, '2026-12-01', 'next report due');
  assert.ok(/self-evaluation/.test(f[0].dates![1].label));
});
