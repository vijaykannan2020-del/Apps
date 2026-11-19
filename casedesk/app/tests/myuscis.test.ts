// v2.6 myUSCIS sync + Live check: parser, snapshots, diff, silent updates, checklist.
// Every fixture is synthetic (made-up receipts IOE0000000001 / IOE0000000002 / WAC0000000003).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMyuscis, parsePayload, parsePageText, buildSnapshot, diffSnapshots, applySync, mergedTimeline, noticeChecklist,
  liveToPart, statusFromSnapshot, touchedAfterLastEvent, syncDue, nextSyncReminder, liveDue, changeAlert, myuscisUrls, isIOE,
  maskReceipt, NO_DATA_MESSAGE, egovToPart, type ParseOk, type MySnapshot,
} from '../src/core/myuscis';
import { decodeEvent, eventLabel, MYUSCIS_CODES } from '../src/core/myuscisCodes';
import type { Case } from '../src/core/model';

const R = 'IOE0000000001';
const caseJSON = (o: Record<string, unknown> = {}) => ({
  data: {
    receiptNumber: R, submissionDate: '2026-03-02', submissionTimestamp: '2026-03-02T14:11:09.120Z', formType: 'I485', formName: 'Application to Register Permanent Residence',
    updatedAt: '2026-05-20T10:00:00.000Z', updatedAtTimestamp: '2026-05-20', cmsFailure: false, closed: false, ackedByAdjudicatorAndCms: false,
    applicantName: 'TEST APPLICANT', concurrentCases: [{ receiptNumber: 'IOE0000000002' }], documents: [], evidenceRequests: [], notices: [],
    events: [
      { eventId: 'e1', eventCode: 'IAF', eventDateTime: '2026-03-02', eventTimestamp: '2026-03-02T14:20:00.000Z', createdAt: '2026-03-02T14:20:00.000Z' },
      { eventId: 'e2', eventCode: 'FTA0', eventDateTime: '2026-04-11', eventTimestamp: '2026-04-11T09:00:00.000Z' },
    ],
    addendums: [], error: null, ...o,
  },
  error: null,
});
const ok = (r: ReturnType<typeof parseMyuscis>): ParseOk => { assert.ok(r.ok, `expected ok, got ${JSON.stringify(r)}`); return r as ParseOk; };
const snapOf = (parts: ParseOk[], prev?: MySnapshot, at = '2026-05-21T08:00:00.000Z') => { const b = buildSnapshot(parts, R, prev, at); assert.ok(b.ok); return (b as any).snap as MySnapshot; };
const baseCase = (): Case => ({ id: 'c1', receipt: R, ownerId: 'me', keyDates: [], history: [{ date: '2026-03-05', text: 'Case Was Received' }] });

test('links: four myUSCIS JSON links per receipt, IOE detection, masked receipts', () => {
  const l = myuscisUrls(' ioe0000000001 ');
  assert.equal(l.length, 4);
  assert.equal(l[0].url, 'https://my.uscis.gov/account/case-service/api/cases/IOE0000000001');
  assert.equal(l[1].url, 'https://my.uscis.gov/account/case-service/api/case_status/IOE0000000001');
  assert.equal(l[2].url, 'https://my.uscis.gov/secure-messaging/api/case-service/receipt_info/IOE0000000001');
  assert.equal(l[3].url, 'https://my.uscis.gov/account/case-service/api/cases/IOE0000000001/documents');
  assert.ok(isIOE(R)); assert.ok(!isIOE('WAC0000000003'));
  assert.equal(maskReceipt(R), 'IOE••••••0001');
});

test('valid IOE case JSON: form, receipt, events decoded, dates, updatedAt, flags, concurrent cases', () => {
  const p = ok(parseMyuscis(JSON.stringify(caseJSON(), null, 2)));
  assert.equal(p.kind, 'case');
  assert.equal(p.receipt, R);
  assert.equal(p.part.form, 'I-485');
  assert.equal(p.part.events!.length, 2);
  assert.equal(p.part.events![0].code, 'IAF');
  assert.equal(p.part.events![0].src, 'myuscis');
  assert.equal(p.part.stamps!.myuscis!.updatedAt, '2026-05-20T10:00:00.000Z', 'full timestamp preferred over date-only');
  assert.equal(p.part.flags!.acked, false);
  assert.deepEqual(p.part.concurrent, ['IOE0000000002']);
});

test('wrapped vs flat vs array payloads read the same', () => {
  const wrapped = ok(parseMyuscis(JSON.stringify(caseJSON())));
  const flat = ok(parseMyuscis(JSON.stringify(caseJSON().data)));
  const twice = ok(parsePayload({ data: caseJSON() }));
  const arr = ok(parsePayload([caseJSON().data]));
  for (const p of [flat, twice, arr]) { assert.equal(p.kind, 'case'); assert.deepEqual(p.part.events, wrapped.part.events); }
});

test('words around the JSON (browser viewer) and whitespace trimmed by Safari still parse', () => {
  const squashed = JSON.stringify(caseJSON());
  assert.equal(ok(parseMyuscis(`Raw Data\n${squashed}\n`)).kind, 'case');
  assert.equal(ok(parseMyuscis(`   \n\t${squashed}   `)).kind, 'case');
});

test('missing fields: no events, no updatedAt, unknown extra keys → still a case, nothing invented', () => {
  const p = ok(parsePayload({ data: { receiptNumber: R, formType: 'I-765', somethingNew: { x: 1 } } }));
  assert.equal(p.kind, 'case');
  assert.deepEqual(p.part.events, []);
  assert.equal(p.part.stamps!.myuscis!.updatedAt, undefined);
});

test('data:null envelope (real-world shape) → noData with requestId; never a change', () => {
  const env = { data: null, error: { userMessage: null, developerMessage: null, failureCode: null, details: null, requestId: '00000000-1111-2222-3333-444444444444' } };
  const r = parseMyuscis(JSON.stringify(env));
  assert.equal(r.ok, false);
  assert.equal((r as any).kind, 'noData');
  assert.equal((r as any).requestId, '00000000-1111-2222-3333-444444444444');
  assert.equal((r as any).message, NO_DATA_MESSAGE);
  const r401 = parsePayload({ data: null, error: { userMessage: 'Unauthorized', requestId: 'abc' } });
  assert.equal((r401 as any).kind, 'notSignedIn');
  assert.equal((r401 as any).requestId, 'abc');
});

test('malformed, empty, HTML login page, other HTML, random text', () => {
  const cut = JSON.stringify(caseJSON()).slice(0, 120);
  assert.equal((parseMyuscis(cut) as any).kind, 'malformed');
  assert.equal((parseMyuscis('') as any).kind, 'empty');
  assert.equal((parseMyuscis('   ') as any).kind, 'empty');
  assert.equal((parseMyuscis(null) as any).kind, 'empty');
  assert.equal((parseMyuscis('<!DOCTYPE html><html><body><form>Sign In to myUSCIS Password</form></body></html>') as any).kind, 'notSignedIn');
  assert.equal((parseMyuscis('<html><body><div>Hello</div></body></html>') as any).kind, 'html');
  assert.equal((parseMyuscis('Groceries: milk, eggs, bread') as any).kind, 'notMyuscis');
  assert.equal((parseMyuscis('{"hello": "world"}') as any).kind, 'notMyuscis');
  assert.equal((parseMyuscis('42') as any).kind, 'notMyuscis');
});

test('documents payload: list and wrapped list; notice checklist links to wallet', () => {
  const docs = { data: [
    { documentId: 'n1', documentTitle: 'I-797C Receipt Notice', noticeType: 'RECEIPT', dateIssued: '2026-03-03' },
    { documentId: 'n2', documentTitle: 'Biometrics Appointment Notice', dateIssued: '2026-03-20' },
    { documentId: 'n3', documentTitle: 'Approval Notice', noticeType: 'I-797', dateIssued: '2026-06-01' },
  ] };
  const p = ok(parseMyuscis(JSON.stringify(docs), 'documents'));
  assert.equal(p.kind, 'documents');
  assert.equal(p.part.documents!.length, 3);
  assert.equal(ok(parsePayload(docs.data)).part.documents!.length, 3);
  const snap = snapOf([p]);
  const list = noticeChecklist(snap, R, [{ type: 'receipt', fields: { receipt: R } }]);
  assert.deepEqual(list.map((x) => [x.title, x.docType, x.attached]), [
    ['Receipt notice — attach PDF', 'receipt', true],
    ['Biometrics Appointment Notice — attach PDF', 'notice', false],
    ['Approval notice — attach PDF', 'approval', false],
  ]);
  assert.equal(list[2].step, 'approval');
  assert.equal(noticeChecklist(snap, R, [], [list[1].key]).length, 2, 'dismissed entries hidden');
  assert.equal(ok(parsePayload({ data: [] }, 'documents')).part.documents!.length, 0, 'empty documents list is fine');
});

test('receipt info → location', () => {
  const p = ok(parsePayload({ data: { receiptNumber: R, officeCode: 'NBC', serviceCenter: 'National Benefits Center' } }, 'receipt'));
  assert.equal(p.kind, 'receipt');
  assert.equal(p.part.location!.serviceCenter, 'National Benefits Center');
  assert.equal(p.part.location!.code, 'NBC');
  const nested = ok(parsePayload({ data: { receiptNumber: R, fieldOffice: { name: 'Example Field Office', code: 'XYZ' } } }, 'receipt'));
  assert.equal(nested.part.location!.fieldOffice, 'Example Field Office');
});

test('snapshot diff: first sync is a baseline; new events, flags, location and documents are reported', () => {
  const s1 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON()))), ok(parsePayload({ data: { receiptNumber: R, officeCode: 'NBC' } }, 'receipt'))]);
  const d1 = diffSnapshots(undefined, s1);
  assert.equal(d1.first, true); assert.equal(d1.any, false);
  const next = caseJSON({ updatedAt: '2026-06-02T12:00:00.000Z', ackedByAdjudicatorAndCms: true, documents: [{ documentId: 'n9', documentTitle: 'Approval Notice', dateIssued: '2026-06-02' }],
    events: [...(caseJSON().data.events as any[]), { eventCode: 'IEA', eventDateTime: '2026-06-02' }] });
  const s2 = snapOf([ok(parseMyuscis(JSON.stringify(next))), ok(parsePayload({ data: { receiptNumber: R, officeCode: 'XYZ', fieldOffice: 'Example Field Office' } }, 'receipt'))], s1, '2026-06-03T08:00:00.000Z');
  const d2 = diffSnapshots(s1, s2);
  const kinds = d2.changes.map((c) => c.kind);
  assert.ok(kinds.includes('event')); assert.ok(kinds.includes('flag')); assert.ok(kinds.includes('location')); assert.ok(kinds.includes('document'));
  assert.ok(!kinds.includes('silent'), 'a public event (approval notice) is not a silent update');
  assert.ok(d2.changes.some((c) => c.text === 'Approval notice sent'));
});

test('silent update: updatedAt moved, no public event, no status change', () => {
  const s1 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON())))]);
  const touched = caseJSON({ updatedAt: '2026-06-10T15:30:00.000Z' });
  const s2 = snapOf([ok(parseMyuscis(JSON.stringify(touched)))], s1, '2026-06-11T08:00:00.000Z');
  const d = diffSnapshots(s1, s2);
  assert.ok(d.silent); assert.equal(d.silent!.at, '2026-06-10T15:30:00.000Z');
  assert.match(d.changes[0].text, /^Silent update on Jun 10, 2026 — USCIS touched your case without a public status change$/);
  // non-public event (background check) + timestamp → still silent
  const s3 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON({ updatedAt: '2026-06-20T09:00:00.000Z', events: [...(caseJSON().data.events as any[]), { eventCode: 'FTA1', eventDateTime: '2026-06-20' }] }))))], s2);
  const d3 = diffSnapshots(s2, s3);
  assert.ok(d3.silent); assert.ok(d3.changes.some((c) => c.kind === 'event'));
  // same day, date-only vs full stamp → not a change
  const s4 = snapOf([ok(parsePayload({ data: { ...caseJSON().data, updatedAt: undefined, updatedAtTimestamp: '2026-06-20' } }))], s3);
  assert.equal(diffSnapshots(s3, s4).silent, undefined);
  // applySync adds a silent-update history line and the events
  const c = applySync(baseCase(), s2, d);
  assert.ok(c.history.some((h) => h.text === 'myUSCIS: Silent update (no public status change)' && h.date === '2026-06-10'));
  assert.ok(c.history.some((h) => h.text.startsWith('myUSCIS: Likely: Receipt notice emailed')));
  assert.equal(c.form, 'I-485'); assert.equal(c.receivedDate, '2026-03-02');
});

test('noData never reaches the snapshot: nothing changes, no silent update', () => {
  const s1 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON())))]);
  const r = parseMyuscis('{"data":null,"error":{"userMessage":null,"developerMessage":null,"failureCode":null,"details":null,"requestId":"x"}}');
  assert.equal(r.ok, false);
  assert.equal(buildSnapshot([], R, s1, '2026-06-01T00:00:00Z').ok, false);
});

test('a payload for another receipt is refused', () => {
  const other = ok(parsePayload({ data: { ...caseJSON().data, receiptNumber: 'IOE0000000002' } }));
  const b = buildSnapshot([other], R, undefined, '2026-06-01T00:00:00Z');
  assert.equal(b.ok, false);
  assert.match((b as any).message, /IOE••••••0002/);
});

test('unknown codes fall back to the raw code; uncertain ones say Likely', () => {
  const d = decodeEvent('ZZ9');
  assert.equal(d.known, false); assert.equal(d.text, 'USCIS update (code ZZ9)');
  assert.equal(eventLabel(decodeEvent('fta0')), 'Likely: Background or fingerprint checks done');
  assert.equal(eventLabel(decodeEvent('LDA')), 'Card produced');
  for (const k of ['IAF', 'FTA0', 'LDA', 'H008', 'SA', 'PRE', 'IKA', 'IEA']) assert.ok(MYUSCIS_CODES[k], k);
  const p = ok(parsePayload({ data: { receiptNumber: R, formType: 'I-765', events: [{ eventCode: 'QQ7', eventDateTime: '2026-05-01' }] } }));
  assert.equal(p.part.events![0].text, 'USCIS update (code QQ7)');
  const c = applySync(baseCase(), snapOf([p]), { first: true, changes: [], any: false, statusChanged: false });
  assert.ok(c.history.some((h) => h.text === 'myUSCIS: USCIS update (code QQ7)' && h.date === '2026-05-01'));
});

test('status from events: only well-established codes decide', () => {
  const approved = snapOf([ok(parsePayload({ data: { receiptNumber: R, events: [{ eventCode: 'IAA', eventDateTime: '2026-03-01' }, { eventCode: 'IEA', eventDateTime: '2026-06-01' }] } }))]);
  assert.equal(statusFromSnapshot(approved), 'approved');
  const likelyOnly = snapOf([ok(parsePayload({ data: { receiptNumber: R, events: [{ eventCode: 'SA', eventDateTime: '2026-06-01' }] } }))]);
  assert.equal(statusFromSnapshot(likelyOnly), undefined, 'SA is only "likely" approved');
  const rfe = snapOf([ok(parsePayload({ data: { receiptNumber: R, events: [{ eventCode: 'IKA', eventDateTime: '2026-04-01' }] } }))]);
  assert.equal(statusFromSnapshot(rfe), 'rfe');
});

// ---- Live check (server/src/uscis.mjs normalize() shape) ----
const live = (o: Record<string, unknown> = {}) => ({
  receipt: R, form: 'I-485', status: 'Case Was Received', detail: 'On March 2, 2026, we received your Form I-485…', submitted: '2026-03-02', updated: '2026-03-05',
  history: [{ date: '2026-03-05', status: 'Case Was Received' }], ...o,
});

test('live check: API answer → snapshot; status change detected and written to history', () => {
  const p1 = ok(liveToPart(live()));
  assert.equal(p1.kind, 'live');
  const s1 = snapOf([p1]);
  assert.equal(s1.status, 'Case Was Received');
  const s2 = snapOf([ok(liveToPart(live({ status: 'Case Was Approved', updated: '2026-06-01', history: [{ date: '2026-06-01', status: 'Case Was Approved' }, { date: '2026-03-05', status: 'Case Was Received' }] })))], s1, '2026-06-01T12:00:00Z');
  const d = diffSnapshots(s1, s2);
  assert.equal(d.statusChanged, true);
  assert.ok(d.changes.some((c) => c.kind === 'status' && /Case Was Received.*Case Was Approved/.test(c.text)));
  assert.equal(d.silent, undefined);
  const c = applySync(baseCase(), s2, d);
  assert.equal(c.status, 'approved');
  assert.ok(c.history.some((h) => h.text === 'Case Was Approved' && h.date === '2026-06-01'));
  assert.equal(c.history.filter((h) => h.text === 'Case Was Received').length, 1, 'no duplicate of the pasted egov status');
  assert.equal(c.checkedAt, '2026-06-01T12:00:00Z');
  assert.equal(changeAlert(d, 'I-485')!.title, 'I-485: status changed');
});

test('live check: modified date moved with the same status → silent update', () => {
  const s1 = snapOf([ok(liveToPart(live()))]);
  const s2 = snapOf([ok(liveToPart(live({ updated: '2026-04-15' })))], s1);
  const d = diffSnapshots(s1, s2);
  assert.ok(d.silent); assert.equal(d.silent!.src, 'live'); assert.equal(d.changes.length, 1);
  assert.equal(changeAlert(d, 'I-485')!.title, 'I-485: silent update');
});

test('live check: unavailable status is noData; also accepted when pasted', () => {
  assert.equal((liveToPart({ receipt: R, status: 'Status unavailable', history: [] }) as any).kind, 'noData');
  assert.equal((liveToPart(null) as any).kind, 'noData');
  assert.equal(ok(parseMyuscis(JSON.stringify(live()))).kind, 'live');
});

test('sources are compared only with themselves (Live check after myUSCIS JSON reports nothing new)', () => {
  const s1 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON())))]);
  const s2 = snapOf([ok(liveToPart(live()))], s1);
  const d = diffSnapshots(s1, s2);
  assert.equal(d.any, false, 'first live read is a baseline');
  assert.equal(s2.events.filter((e) => e.src === 'myuscis').length, 2, 'myUSCIS events kept');
  const s3 = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON())))], s2);
  assert.equal(s3.events.filter((e) => e.src === 'live').length, 1, 'live events kept');
  assert.equal(diffSnapshots(s2, s3).any, false);
});

test('in-app uscis.gov check: parsed status → egov part, status change and history without a myUSCIS prefix', () => {
  const { parseCaseText } = require('../src/core/uscis');
  const t1 = parseCaseText(`Case Was Received\nOn March 2, 2026, we received your Form I-485, Receipt Number ${R}.`, R);
  const s1 = snapOf([ok(egovToPart(t1, '2026-03-10'))]);
  assert.equal(s1.status, 'Case Was Received');
  const t2 = parseCaseText(`Case Was Approved\nOn June 1, 2026, we approved your Form I-485, Receipt Number ${R}.`, R);
  const s2 = snapOf([ok(egovToPart(t2, '2026-06-02'))], s1);
  const d = diffSnapshots(s1, s2);
  assert.equal(d.statusChanged, true);
  const c = applySync(baseCase(), s2, d);
  assert.ok(c.history.some((h) => h.text === 'Case Was Approved' && h.date === '2026-06-01'));
  assert.equal(c.status, 'approved');
  assert.equal((egovToPart(null, '2026-06-02') as any).ok, false);
});

// ---- myUSCIS case page TEXT ----
const PAGE = `My Account
Form I-485, Application to Register Permanent Residence or Adjust Status
Receipt number ${R}
Case Was Received
On March 2, 2026, we received your Form I-485, Application to Register Permanent Residence or Adjust Status, Receipt Number ${R}.
Case history
Fingerprints Were Taken
April 11, 2026
Biometrics Appointment Was Scheduled
March 20, 2026
Case Was Received
March 2, 2026
Documents
Receipt Notice
March 3, 2026
View
Biometrics Appointment Notice
March 20, 2026
View`;

test('myUSCIS page text: status card, case history and documents', () => {
  const p = ok(parseMyuscis(PAGE));
  assert.equal(p.kind, 'page');
  assert.equal(p.receipt, R);
  assert.equal(p.part.form, 'I-485');
  assert.equal(p.part.stamps!.page!.status, 'Case Was Received');
  assert.deepEqual(p.part.events!.map((e) => [e.date, e.text]), [
    ['2026-03-02', 'Case Was Received'], ['2026-03-20', 'Biometrics Appointment Was Scheduled'], ['2026-04-11', 'Fingerprints Were Taken'],
  ]);
  assert.deepEqual(p.part.documents!.map((d) => [d.title, d.date]), [['Receipt Notice', '2026-03-03'], ['Biometrics Appointment Notice', '2026-03-20']]);
  // same-line layout "03/20/2026 · Biometrics…" works too
  const inline = parsePageText(`Case Was Received\nCase history\n04/11/2026 Fingerprints Were Taken\n03/02/2026 - Case Was Received\nForm I-485 ${R}`);
  assert.equal(inline!.part.events!.length, 2);
  assert.equal(parsePageText('hello\nworld'), null);
});

test('timeline merges uscis.gov statuses, pasted text and myUSCIS events without duplicates', () => {
  const s = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON()))), ok(parseMyuscis(PAGE))]);
  const c = applySync(baseCase(), s, { first: true, changes: [], any: false, statusChanged: false });
  const t = mergedTimeline(c.history, s);
  const keys = t.map((x) => `${x.date}|${x.text.toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(t.some((x) => x.source === 'uscis' && x.text === 'Case Was Received'));
  assert.ok(t.some((x) => x.source === 'myuscis' && /Receipt notice emailed/.test(x.text)));
  assert.ok(t[0].date >= t[t.length - 1].date, 'newest first');
});

test('touched after the last event is visible on any sync', () => {
  const s = snapOf([ok(parseMyuscis(JSON.stringify(caseJSON())))]);
  assert.equal(touchedAfterLastEvent(s), '2026-05-20T10:00:00.000Z');
});

test('weekly reminder and live-check timing', () => {
  const cases = [{ id: 'a', receipt: R, status: 'Pending' }, { id: 'b', receipt: 'WAC0000000003', status: 'Pending' }, { id: 'c', receipt: 'IOE0000000002', status: 'Approved' }];
  assert.deepEqual(syncDue(cases, {}, '2026-06-10T00:00:00Z'), ['a']);
  assert.deepEqual(syncDue(cases, { a: '2026-06-08T00:00:00Z' }, '2026-06-10T00:00:00Z'), []);
  assert.equal(nextSyncReminder(['a'], { a: '2026-06-08T00:00:00.000Z' }, '2026-06-10T00:00:00Z'), '2026-06-15T00:00:00.000Z');
  assert.equal(nextSyncReminder([], {}, '2026-06-10T00:00:00Z'), undefined);
  assert.equal(liveDue({ receipt: R, status: 'Pending' }, undefined, '2026-06-10T00:00:00Z'), true);
  assert.equal(liveDue({ receipt: R, status: 'Pending' }, '2026-06-09T23:00:00Z', '2026-06-10T00:00:00Z'), false);
  assert.equal(liveDue({ receipt: R, status: 'Approved' }, undefined, '2026-06-10T00:00:00Z'), false);
});

test('no real receipt numbers in fixtures', () => {
  const src = require('node:fs').readFileSync(__filename, 'utf8') as string;
  const receipts = [...src.matchAll(/\b[A-Z]{3}\d{10}\b/g)].map((m) => m[0]);
  for (const r of receipts) assert.match(r, /^(IOE|WAC)00000000\d\d$/, r);
});
