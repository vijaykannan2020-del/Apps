// v2.9 green-card track: documents, steps per visa and stage, tracking, EAD choice, rules G1–G6, planner.
// Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRecord, evaluateFamily, setToday, stepsFor, readDocument, gcTrackOf, workBasis, gcPlan, paceOf, interviewChecklist, RULES, docNote,
  type Document, type Person, type VisaBulletin,
} from '../src/core';
import { BULLETIN } from '../src/content/bulletin';
import { GC_SEARCH } from '../src/content/searchGc';
import { T, doc, person } from './helpers';

setToday('2026-11-19');

const G = {
  i140: (pd: string, pref = '203(b)(2)') => `I-797 | NOTICE OF ACTION\nReceipt Number               Case Type\nSRC2490012345                I140 - IMMIGRANT PETITION FOR ALIEN WORKER\nReceived Date   Priority Date   Petitioner\n03/04/2024      ${pd}      ACME TECH INC\nNotice Date     Page            Beneficiary\n06/10/2024      1 of 1          KUMAR, ARUN\nNotice Type: Approval Notice\nSection: Advanced degree ${pref}\nThe above petition has been approved.`,
  i485: (receipt: string, received: string) => T.receipt(receipt, received, 'I485 - APPLICATION TO REGISTER PERMANENT RESIDENCE OR ADJUST STATUS'),
  i765: (receipt: string, received: string) => T.receipt(receipt, received, 'I765 - APPLICATION FOR EMPLOYMENT AUTHORIZATION'),
  i131: (receipt: string, received: string) => T.receipt(receipt, received, 'I131 - APPLICATION FOR TRAVEL DOCUMENT'),
  combo: (from: string, to: string) => `${T.ead('C09', from, to)}\nSERVES AS I-512 ADVANCE PAROLE`,
  interview: (date: string) => `I-797C | NOTICE OF ACTION\nReceipt Number               Case Type\nMSC2690011111                I485 - APPLICATION TO REGISTER PERMANENT RESIDENCE OR ADJUST STATUS\nNotice Date     Page\n10/20/2026      1 of 1\nNotice Type: Interview Appointment Notice\nYou are scheduled for an interview.\nInterview date: ${date} at 9:00 AM`,
  bio: (date: string) => `I-797C | NOTICE OF ACTION\nReceipt Number               Case Type\nMSC2690022222                I485 - APPLICATION TO REGISTER PERMANENT RESIDENCE OR ADJUST STATUS\nNotice Date     Page\n10/01/2026      1 of 1\nNotice Type: ASC Appointment Notice\nApplication Support Center\nDate and Time: ${date} 10:00 AM`,
  perm: () => `U.S. Department of Labor\nETA Form 9089 - Application for Permanent Employment Certification\nFinal Determination: Certified\nCase Number: G-100-26001-123456\nFiling Date: 01/15/2026\nCertification Date: 10/01/2026\nExpiration Date: 03/30/2027\nEmployer Name: ACME TECH INC`,
  medical: () => `Report of Immigration Medical Examination and Vaccination Record\nUSCIS Form I-693\nPart 5. Civil Surgeon's Certification\nCivil surgeon signature date: 09/12/2026`,
};

// Indian passport with a machine-readable zone (nationality IND → India column of the Visa Bulletin).
const PASS_IND = `${T.passport('Z1234567', 'KUMAR', 'ARUN')}\nP<INDKUMAR<<ARUN<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nZ1234567<1IND8606143M3410059<<<<<<<<<<<<<<02`;

const run = (people: Person[], docs: Document[], bulletin: VisaBulletin = BULLETIN) =>
  evaluateFamily({ members: people.map((p) => ({ person: p, rec: deriveRecord(p, docs) })), docs, settings: { reminderLeadDays: [] }, bulletin });
const ids = (r: ReturnType<typeof run>, pid: string) => r[pid].findings.map((f) => f.id);
const who = (people: Person[], docs: Document[]) => people.map((p) => ({ person: p, rec: deriveRecord(p, docs) }));

test('reads PERM, I-693, I-140 (priority date + category), I-485, interview and biometrics notices, C9 combo card', () => {
  const perm = readDocument(G.perm());
  assert.equal(perm.type, 'perm');
  assert.equal(perm.fields.caseNumber, 'G-100-26001-123456');
  assert.equal(perm.fields.priorityDate, '2026-01-15');
  assert.equal(perm.fields.noticeDate, '2026-10-01');
  assert.equal(perm.fields.dueDate, '2027-03-30');
  assert.equal(perm.fields.validTo, undefined); // never counted as an expiring document
  const med = readDocument(G.medical());
  assert.equal(med.type, 'medical');
  assert.equal(med.fields.signedDate, '2026-09-12');
  const i140 = readDocument(G.i140('01/15/2020'));
  assert.equal(i140.type, 'approval');
  assert.equal(i140.fields.form, 'I-140');
  assert.equal(i140.fields.priorityDate, '2020-01-15');
  assert.equal(i140.fields.preferenceCategory, 'EB2');
  assert.equal(readDocument(G.i485('MSC2690000001', '03/01/2026')).fields.form, 'I-485');
  const iv = readDocument(G.interview('12/15/2026'));
  assert.equal(iv.type, 'notice');
  assert.equal(iv.fields.noticeKind, 'interview');
  assert.equal(iv.fields.appointmentDate, '2026-12-15');
  const bio = readDocument(G.bio('12/01/2026'));
  assert.equal(bio.fields.noticeKind, 'biometrics');
  const combo = readDocument(G.combo('01/10/2026', '01/09/2031'));
  assert.equal(combo.type, 'ead');
  assert.equal(combo.fields.category, 'C9');
  assert.equal(combo.fields.comboAP, true);
  assert.match(docNote(perm as never)?.text ?? '', /I-140 by Mar 30, 2027/);
});

test('document steps depend on visa type and stage; families saved before v2.9 keep the same steps', () => {
  const key = (p: Person, docs: Document[] = []) => stepsFor(p, deriveRecord(p, docs)).map((s) => s.key);
  // no green card started: unchanged lists
  assert.deepEqual(key(person('h', 'self', { status: 'H-1B' })), ['passport', 'visa', 'i94', 'approval', 'receipt']);
  assert.deepEqual(key(person('l', 'self', { status: 'L-1B' })), ['passport', 'visa', 'i94', 'approval', 'receipt']);
  assert.deepEqual(key(person('s', 'spouse', { status: 'L-2' })), ['passport', 'visa', 'i94', 'ead']);
  assert.deepEqual(key(person('k', 'child', { status: 'L-2' })), ['passport', 'visa', 'i94']);
  // H-1B principal with an I-140: PERM and I-140 added
  const me = person('me', 'self', { status: 'H-1B' });
  assert.deepEqual(key(me, [doc('me', G.i140('01/15/2020'))]), ['passport', 'visa', 'i94', 'approval', 'receipt', 'perm', 'i140']);
  // H-4 spouse with her own I-485: her own green-card documents, never the principal's PERM / I-140
  const sp = person('sp', 'spouse', { status: 'H-4' });
  assert.deepEqual(key(sp, [doc('sp', G.i485('MSC2690000002', '03/01/2026'))]), ['passport', 'visa', 'i94', 'approval', 'receipt', 'ead', 'i485', 'combo', 'ap', 'bio', 'medical', 'interview']);
  // citizen path: N-400 then the interview notice
  assert.deepEqual(key(person('c', 'self', { status: 'citizenship-applicant' })), ['gc', 'passport', 'travel', 'n400', 'interview']);
  // every new step is optional: nothing new shows as missing
  const r = run([me], [doc('me', T.passport('Z1', 'KUMAR', 'ARUN')), doc('me', G.i140('01/15/2020'))]);
  assert.ok(!r.me.missingSteps.some((s) => ['perm', 'i485', 'combo', 'ap', 'bio', 'medical', 'interview'].includes(s.key)));
});

test('GC track: the family follows the principal’s I-140; each person has their own I-485; Visa Bulletin compared', () => {
  const me = person('me', 'self', { status: 'H-1B' });
  const sp = person('sp', 'spouse', { status: 'H-4' });
  const docs = [doc('me', PASS_IND), doc('me', G.i140('01/15/2020')), doc('sp', T.passport('Z2', 'KUMAR', 'PRIYA'))];
  const all = who([me, sp], docs);
  const t = gcTrackOf(all[0], all, BULLETIN)!;
  assert.equal(t.stage, 'waiting');
  assert.equal(t.category, 'EB-2');
  assert.equal(t.country, 'india'); // from the passport (IND)
  assert.equal(t.bulletin?.canFile, false); // EB-2 India filing cut-off 2015-01-15 in the built-in Nov 2026 bulletin
  const ts = gcTrackOf(all[1], all, BULLETIN)!;
  assert.equal(ts.derivative, true);
  assert.equal(ts.ownerId, 'me');
  assert.equal(ts.priorityDate, '2020-01-15');
  // country of chargeability picked (e.g. born outside India): uses that column
  const me2 = { ...me, facts: { ...me.facts, gc: { chargeability: 'all' as const } } };
  const all2 = who([me2, sp], docs);
  assert.equal(gcTrackOf(all2[0], all2, BULLETIN)!.bulletin?.canFile, true); // 2020 < 2026-03-15 (EB-2 all, filing)
  // the spouse files her own I-485 → her stage moves on, the principal's doesn't
  const docs3 = [...docs, doc('sp', G.i485('MSC2690000003', '03/01/2026'))];
  const all3 = who([me, sp], docs3);
  assert.equal(gcTrackOf(all3[1], all3, BULLETIN)!.stage, 'i485');
  assert.equal(gcTrackOf(all3[0], all3, BULLETIN)!.stage, 'waiting');
  // interview notice → interview stage
  const all4 = who([me, sp], [...docs3, doc('sp', G.interview('12/15/2026'))]);
  assert.equal(gcTrackOf(all4[1], all4, BULLETIN)!.stage, 'interview');
});

test('EAD choice: on the EAD the status is the card date and the I-94 checks stop; on H-1B they keep running', () => {
  const base = [doc('me', T.passport('Z1', 'KUMAR', 'ARUN')), doc('me', T.i94('02/15/2027', '03/01/2025', 'H1B', 'Z1')), doc('me', G.i140('01/15/2020')),
    doc('me', G.i485('MSC2690000004', '01/10/2026')), doc('me', G.combo('03/01/2026', '02/28/2031'))];
  const me = person('me', 'self', { status: 'H-1B' });
  const wb = workBasis({ person: me, rec: deriveRecord(me, base) });
  assert.equal(wb.pending485, true);
  assert.equal(wb.workOn, 'status'); // a valid H-1B I-94: status by default
  let r = run([me], base);
  assert.equal(r.me.facts.statusUntil, '2027-02-15');
  assert.ok(ids(r, 'me').includes('gc-hl-ends')); // G4: I-94 ends within 180 days → extend or switch
  assert.ok(!r.me.findings.some((f) => f.rule === 'C4')); // G4 replaces the plain I-94 reminder
  const onEad = { ...me, facts: { ...me.facts, gc: { workOn: 'ead' as const } } };
  const rec = deriveRecord(onEad, base);
  assert.equal(rec.visa, 'Green card pending');
  assert.equal(rec.gcOnEad, true);
  r = run([onEad], base);
  assert.equal(r.me.facts.statusUntil, '2031-02-28');
  assert.equal(r.me.facts.visaLabel, 'EAD (C9) · I-485 pending');
  assert.ok(!r.me.findings.some((f) => ['C3', 'C4', 'gc-hl-ends'].includes(f.rule ?? f.id)));
  assert.ok(ids(r, 'me').includes('gc-on-ead'));
});

test('G4 dependent: the principal works on the EAD — an H-4 that follows them is flagged', () => {
  const me = person('me', 'self', { status: 'H-1B', facts: { location: 'US', gc: { workOn: 'ead' } } });
  const sp = person('sp', 'spouse', { status: 'H-4' });
  const docs = [doc('me', T.i94('02/15/2028', '03/01/2025', 'H1B', 'Z1')), doc('me', G.i485('MSC2690000005', '01/10/2026')),
    doc('sp', T.i94('02/15/2028', '03/01/2025', 'H4', 'Z2'))];
  const r = run([me, sp], docs);
  const f = r.sp.findings.find((x) => x.id === 'gc-dep-hl');
  assert.equal(f?.severity, 'act'); // no own I-485
  const r2 = run([me, sp], [...docs, doc('sp', G.i485('MSC2690000006', '01/10/2026'))]);
  assert.equal(r2.sp.findings.find((x) => x.id === 'gc-dep-hl')?.severity, 'review');
});

test('G1 EAD (C9): file the renewal up to 180 days before; renewal on file; G2 advance parole; sources on every G rule', () => {
  const me = person('me', 'self', { status: 'green-card-applicant' });
  const ead = doc('me', G.combo('03/01/2022', '03/01/2027')); // ends in ~100 days
  const docs = [doc('me', G.i485('MSC2690000007', '01/10/2022')), ead];
  let r = run([me], docs);
  const g1 = r.me.findings.find((f) => f.rule === 'G1');
  assert.equal(g1?.id, 'gc-ead-renew');
  assert.equal(g1?.severity, 'review');
  assert.ok(g1?.notLegalAdvice);
  assert.ok(!r.me.findings.some((f) => f.rule === 'C12')); // G1 replaces the generic EAD rule
  assert.ok(r.me.findings.some((f) => f.id === 'gc-ap-renew')); // combo card is the advance parole too
  r = run([me], [...docs, doc('me', G.i765('MSC2690000008', '11/01/2026')), doc('me', G.i131('MSC2690000009', '11/01/2026'))]);
  assert.ok(!r.me.findings.some((f) => f.id === 'gc-ead-renew'));
  assert.ok(!r.me.findings.some((f) => f.id === 'gc-ap-renew'));
  for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
    assert.ok(RULES[id].source.url.startsWith('https://www.ecfr.gov/') || RULES[id].source.url.startsWith('https://www.uscis.gov/') || RULES[id].source.url.startsWith('https://travel.state.gov/'), id);
    assert.equal(RULES[id].checked, '2026-11-19');
  }
});

test('G3 final action date and R21 for the family; G5 interview reminder date; G6 PERM → I-140 within 180 days', () => {
  const me = person('me', 'self', { status: 'H-1B', facts: { location: 'US', gc: { chargeability: 'all' } } });
  const sp = person('sp', 'spouse', { status: 'H-4' });
  const docs = [doc('me', T.i94('02/15/2028', '03/01/2025', 'H1B', 'Z1')), doc('me', G.i140('01/15/2020')), doc('sp', T.i94('02/15/2028', '03/01/2025', 'H4', 'Z2'))];
  let r = run([me, sp], docs);
  assert.ok(r.me.findings.some((f) => f.rule === 'R21' && f.id === 'pd-current'));
  const spNote = r.sp.findings.find((f) => f.id === 'pd-current');
  assert.ok(spNote && !spNote.rule && spNote.source); // the spouse sees it as a note (with source), not a pill
  assert.match(spNote!.title, /with me/);
  r = run([me, sp], [...docs, doc('me', G.i485('MSC2690000010', '03/01/2026')), doc('me', G.interview('12/15/2026'))]);
  assert.ok(r.me.findings.some((f) => f.id === 'gc-final')); // 2020 < EB-2 all final action 2025-04-01
  const iv = r.me.findings.find((f) => f.rule === 'G5');
  assert.equal(iv?.date, '2026-12-15');
  const r6 = run([person('p', 'self', { status: 'H-1B' })], [doc('p', G.perm())]);
  const g6 = r6.p.findings.find((f) => f.id.startsWith('gc-perm'));
  assert.ok(g6);
  assert.equal(g6!.date, '2027-03-30');
});

test('planner: pace from bulletin history, estimate only with enough months, gather now when current', () => {
  const me = person('me', 'self', { status: 'H-1B' });
  const docs = [doc('me', PASS_IND), doc('me', G.i140('01/15/2020'))];
  const all = who([me], docs);
  const t = gcTrackOf(all[0], all, BULLETIN)!;
  const procs = [{ form: 'I-485', category: 'Employment-based green card', months: 48 }, { form: 'I-140', category: 'EB-2 advanced degree', months: 6.5 }];
  let plan = gcPlan(t, BULLETIN, procs);
  assert.equal(plan.current.filing, false);
  assert.ok(plan.gapDays?.filing && plan.gapDays.filing > 1500);
  assert.equal(plan.eta?.filing, undefined); // built-in copy has no history
  assert.match(plan.etaNote ?? '', /Not enough Visa Bulletin history/);
  assert.deepEqual(plan.processing.map((p) => p.form), ['I-140', 'I-485']);
  // a year of history: EB-2 India filing date moved 6 months → about 182 days a year
  const rowsAt = (filing: string) => BULLETIN.rows.map((r) => (r.cat === 'EB-2' ? { ...r, filing: { ...r.filing, india: filing } } : r));
  const hist: VisaBulletin = { ...BULLETIN, history: [{ month: 'December 2025', rows: rowsAt('2014-07-15') }] };
  const pace = paceOf(hist, 'EB-2', 'india', 'filing')!;
  assert.equal(pace.months, 12);
  assert.ok(pace.daysPerYear > 150 && pace.daysPerYear < 200);
  plan = gcPlan(t, hist, procs);
  assert.ok(plan.eta?.filing && plan.eta.filing > '2035-01-01');
  assert.ok(plan.gatherFrom && plan.gatherFrom < plan.eta!.filing!);
  assert.match(plan.etaNote ?? '', /Estimate only/);
  // current → gather now
  const me2 = { ...me, facts: { ...me.facts, gc: { chargeability: 'all' as const } } };
  const all2 = who([me2], docs);
  assert.equal(gcPlan(gcTrackOf(all2[0], all2, BULLETIN)!, BULLETIN, procs).gatherNow, true);
});

test('interview checklist differs per person; search entries cover the GC screens with synonyms', () => {
  const me = person('me', 'self');
  const kid = person('kid', 'child');
  const a = interviewChecklist(me, undefined).map((x) => x.id);
  const b = interviewChecklist(kid, { derivative: true } as never).map((x) => x.id);
  assert.ok(a.includes('job') && a.includes('marriage'));
  assert.ok(!b.includes('job') && !b.includes('marriage'));
  assert.ok(GC_SEARCH.length >= 5);
  for (const e of GC_SEARCH) { assert.ok(e.title && e.route.startsWith('/')); assert.ok(e.synonyms.length > 0); }
  const all = GC_SEARCH.flatMap((e) => e.synonyms.map((s) => s.toLowerCase()));
  for (const s of ['gc', 'green card', 'i-485', 'i-140', 'perm', 'ead', 'work permit', 'advance parole', 'ap', 'priority date', 'visa bulletin']) assert.ok(all.includes(s), s);
});

test('old saved families load unchanged: no GC facts, same record and no G findings', () => {
  // a pre-v2.9 person as stored (no facts.gc), L-1B blanket style family without green-card documents
  const me: Person = JSON.parse(JSON.stringify({ id: 'me', name: 'Me', relation: 'self', status: 'L-1B', facts: { location: 'US' }, createdAt: '2025-01-01' }));
  const docs = [doc('me', T.passport('Z9', 'DOE', 'JOHN')), doc('me', T.i94('09/30/2027', '10/01/2024', 'L1B', 'Z9'))];
  const rec = deriveRecord(me, docs);
  assert.equal(rec.gcOnEad, undefined);
  assert.equal(rec.perm, undefined);
  const r = run([me], docs);
  assert.ok(!r.me.findings.some((f) => /^G\d$/.test(f.rule ?? '') || f.id.startsWith('gc-')));
  assert.equal(gcTrackOf({ person: me, rec }, [{ person: me, rec }], BULLETIN)?.stage, 'not-started');
});
