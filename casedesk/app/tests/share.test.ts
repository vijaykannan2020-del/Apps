// Share with family (.iwshare): code, crypto round trip, wrong code, tampering, expiry, merge rules.
// Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Document, Person } from '../src/core';
import {
  CODE_WORDS, SHARE_MAGIC, ShareExpired, WRONG_CODE, checkPayload, docKey, expiryFrom, guessMe, isShareFile, newShareCode, openShare,
  planShareMerge, previewShare, readCode, readShareHeader, relationFrom, resolveWrites, sealShare, selectForShare, shareFileName, type SharePayload,
} from '../src/core/share';
import { SHARE_WORDS } from '../src/core/sharewords';
import { sealText } from '../src/core/backup';

const FAST = { N: 2 ** 10, r: 8, p: 1, dkLen: 32 };
const NOW = new Date('2026-11-19T12:00:00Z');
let ids = 0;
const newId = (p: string) => `${p}_new${++ids}`;

const P = (id: string, name: string, relation: Person['relation'], extra: Partial<Person> = {}): Person => ({ id, name, relation, facts: { location: 'US' }, createdAt: '2026-01-01', ...extra });
const D = (id: string, ownerId: string, type: Document['type'], fields: Document['fields'], extra: Partial<Document> = {}): Document => ({ id, ownerId, type, fields, addedAt: '2026-02-01T00:00:00Z', ...extra });

// Sender's phone: Alex (self, H-1B), Sam (spouse, H-4), Kit (child)
const alex = P('p_alex', 'Alex', 'self', { isMain: true, reminders: { on: true, lead: [90] } });
const sam = P('p_sam', 'Sam', 'spouse', { facts: { location: 'US', dependentOf: 'p_alex' } });
const kit = P('p_kit', 'Kit', 'child', { facts: { location: 'US', dependentOf: 'p_alex' } });
const sender = {
  people: [alex, sam, kit],
  docs: [
    D('d_ap', 'p_alex', 'passport', { name: 'DOE ALEX', passportNo: 'Z1000001', birthDate: '1985-01-01', validTo: '2034-01-01' }, { files: [{ file: 'd_ap-pp.jpg', name: 'pp.jpg', mime: 'image/jpeg' }] }),
    D('d_a797', 'p_alex', 'approval', { receipt: 'WAC2600000001', validTo: '2028-09-30' }),
    D('d_sp', 'p_sam', 'passport', { name: 'DOE SAM', passportNo: 'Z2000002', birthDate: '1987-02-02', validTo: '2033-02-02' }, { files: [{ file: 'd_sp-pp.jpg', name: 'sam.jpg', mime: 'image/jpeg' }] }),
    D('d_s94', 'p_sam', 'i94', { entryDate: '2026-01-10', classOfAdmission: 'H4', validTo: '2028-09-30' }),
    D('d_kp', 'p_kit', 'passport', { name: 'DOE KIT', passportNo: 'Z3000003', birthDate: '2018-03-03' }),
  ],
};
const FILES = { 'd_ap#0': { name: 'pp.jpg', mime: 'image/jpeg', data: 'QUFBQQ==' }, 'd_sp#0': { name: 'sam.jpg', mime: 'image/jpeg', data: 'QkJCQg==' } };

function payload(sel = { people: ['p_alex', 'p_sam', 'p_kit'], scans: true }, over: Partial<SharePayload> = {}): SharePayload {
  const { people, docs } = selectForShare(sender, sel);
  const files = sel.scans ? FILES : {};
  return { app: 'immigration-wallet', kind: 'share', v: 1, createdAt: NOW.toISOString(), expiresAt: expiryFrom(NOW), from: 'Alex', scans: sel.scans, people, docs, files, ...over };
}

// ---------- codes ----------
test('codes: 6 words from the list, uniform enough, typed loosely', () => {
  assert.equal(SHARE_WORDS.length, new Set(SHARE_WORDS).size);
  assert.equal(new Set(SHARE_WORDS.map((w) => w.slice(0, 4))).size, SHARE_WORDS.length);
  for (const bad of ['visa', 'border', 'police']) assert.ok(!SHARE_WORDS.includes(bad));
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = newShareCode();
    const w = c.split(' ');
    assert.equal(w.length, CODE_WORDS);
    assert.ok(w.every((x) => SHARE_WORDS.includes(x)));
    seen.add(c);
  }
  assert.equal(seen.size, 200);
  assert.ok(CODE_WORDS * Math.log2(SHARE_WORDS.length) > 64);
  const c = 'abandon ability able about above absent';
  assert.deepEqual(readCode(' 1. Abandon  2. ABILITY - able,about\nabove absent '), { code: c });
  assert.deepEqual(readCode('aban abil able abou abov abse'), { code: c });
  assert.match((readCode('abandon ability able') as { problem: string }).problem, /6 words/);
  assert.match((readCode('abandon ability able about above zzzzzz') as { problem: string }).problem, /zzzzzz/);
  assert.match((readCode('abanxx ability able about above absent') as { problem: string }).problem, /abanxx/);
});

// ---------- crypto ----------
test('round trip: seal, read header, open with the code (also typed as prefixes), preview', async () => {
  const code = newShareCode();
  const p = payload();
  const file = await sealShare(p, code, { kdf: FAST });
  assert.ok(isShareFile(file));
  assert.ok(file.startsWith(SHARE_MAGIC + '\n'));
  assert.equal(readShareHeader(file).expiresAt, '2026-11-26T12:00:00.000Z');
  const typed = code.split(' ').map((w) => w.slice(0, 4).toUpperCase()).join('-');
  const back = await openShare(file, typed, NOW);
  assert.deepEqual(back, p);
  const v = previewShare(back);
  assert.equal(v.people.length, 3); assert.equal(v.docs, 5); assert.equal(v.files, 2);
  assert.deepEqual(v.people.map((x) => x.docs), [2, 2, 1]);
});

test('the code and the names are not in the file', async () => {
  const code = newShareCode();
  const file = await sealShare(payload(), code, { kdf: FAST });
  for (const w of code.split(' ')) assert.ok(!file.toLowerCase().includes(` ${w} `));
  assert.ok(!file.includes(code));
  for (const s of ['Alex', 'Z1000001', 'WAC2600000001', 'DOE']) assert.ok(!file.includes(s), s);
  assert.ok(!shareFileName(NOW).includes('Alex'));
  assert.match(shareFileName(NOW), /^Immigration Wallet share 2026-11-\d\d\.iwshare$/);
});

test('wrong code is refused', async () => {
  const file = await sealShare(payload(), 'abandon ability able about above absent', { kdf: FAST });
  await assert.rejects(openShare(file, 'abandon ability able about above absorb', NOW), (e: Error) => e.message === WRONG_CODE);
  await assert.rejects(openShare(file, 'abandon ability', NOW), /6 words/);
});

test('tampered file is refused: ciphertext, header expiry, magic, truncation', async () => {
  const code = 'zoo zone youth young year yellow';
  const file = await sealShare(payload(), code, { kdf: FAST });
  const [magic, head, body] = file.split('\n');
  const flip = body.slice(0, 40) + (body[40] === 'A' ? 'B' : 'A') + body.slice(41);
  await assert.rejects(openShare([magic, head, flip].join('\n'), code, NOW), (e: Error) => e.message === WRONG_CODE);
  // pushing the expiry date later in the (plain) header breaks the authentication
  const later = head.replace(/"expiresAt":"[^"]+"/, '"expiresAt":"2027-12-31T00:00:00.000Z"');
  assert.notEqual(later, head);
  await assert.rejects(openShare([magic, later, body].join('\n'), code, NOW), (e: Error) => e.message === WRONG_CODE);
  // a crafted header asking for a huge scrypt cost is refused before any work
  const huge = head.replace(/"N":\d+/, '"N":1073741824');
  await assert.rejects(openShare([magic, huge, body].join('\n'), code, NOW), /isn’t valid/);
  await assert.rejects(openShare(['CASEDESK-BACKUP 1', head, body].join('\n'), code, NOW), /backup file/);
  await assert.rejects(openShare('hello', code, NOW), /isn’t an Immigration Wallet share/);
  await assert.rejects(openShare(file.slice(0, file.length - 30), code, NOW), (e: Error) => e.message === WRONG_CODE);
});

test('expired: refused after the date in the package; expiry is clamped to 1–30 days', async () => {
  const code = newShareCode();
  const file = await sealShare(payload(), code, { kdf: FAST });
  await openShare(file, code, new Date('2026-11-26T11:59:00Z'));
  await assert.rejects(openShare(file, code, new Date('2026-11-26T12:00:01Z')), (e: Error) => e instanceof ShareExpired && /expired on 2026-11-26/.test(e.message));
  assert.equal(expiryFrom(NOW, 90), '2026-12-19T12:00:00.000Z');
  assert.equal(expiryFrom(NOW, 0), '2026-11-20T12:00:00.000Z');
});

test('payload checks: document owner must be in the package; newer format asks for an update', async () => {
  const p = payload();
  assert.throws(() => checkPayload({ ...p, docs: [{ ...p.docs[0], ownerId: 'p_nobody' }] }), /isn’t valid/);
  assert.throws(() => checkPayload({ ...p, people: [{ ...p.people[0], relation: 'boss' as never }] }), /isn’t valid/);
  assert.throws(() => checkPayload({ ...p, v: 2 as never }), /newer/);
  // the payload's expiry must equal the authenticated header's
  const code = newShareCode();
  const odd = await sealText(SHARE_MAGIC, JSON.stringify({ ...p, expiresAt: '2030-01-01T00:00:00.000Z' }), code, { kdf: FAST, bindHeader: true, extra: { expiresAt: p.expiresAt } });
  await assert.rejects(openShare(odd, code, NOW), (e: Error) => e.message === WRONG_CODE);
});

// ---------- choosing what to share ----------
test('selectForShare: chosen people and documents only; no scans; device reminders stay behind', () => {
  const s = selectForShare(sender, { people: ['p_sam', 'p_kit'], docs: ['d_sp', 'd_kp', 'd_ap'], scans: false });
  assert.deepEqual(s.people.map((x) => x.id), ['p_sam', 'p_kit']);
  assert.deepEqual(s.docs.map((x) => x.id), ['d_sp', 'd_kp']); // Alex's passport: Alex isn't shared
  assert.ok(s.docs.every((d) => !d.files?.length));
  assert.equal(s.people[0].facts.dependentOf, undefined); // Alex isn't in the package
  const all = selectForShare(sender, { people: ['p_alex'], scans: true });
  assert.equal(all.people[0].reminders, undefined);
  assert.equal(all.docs.length, 2);
  assert.equal(sender.people[0].reminders?.on, true); // the sender's own data is untouched
});

// ---------- merge ----------
test('fresh phone, Which one is you = Sam: Sam becomes You, Alex the spouse, Kit the child; scans written', () => {
  const p = payload();
  const plan = planShareMerge({ people: [], docs: [] }, p, { meId: 'p_sam', newId });
  const rel = Object.fromEntries(plan.people.map((x) => [x.name, x.relation]));
  assert.deepEqual(rel, { Alex: 'spouse', Sam: 'self', Kit: 'child' });
  assert.equal(plan.people.find((x) => x.name === 'Sam')!.isMain, true);
  assert.equal(plan.people.find((x) => x.name === 'Kit')!.facts.dependentOf, 'p_alex');
  assert.equal(plan.report.docsAdded, 5);
  assert.deepEqual(plan.writes.map((w) => w.key).sort(), ['d_ap#0', 'd_sp#0']);
  const stored = new Map<string, string | null>([['d_ap#0', 'f1-pp.jpg'], ['d_sp#0', null]]); // second write failed
  const docs = resolveWrites(plan, stored);
  assert.equal(docs.find((d) => d.id === 'd_ap')!.files![0].file, 'f1-pp.jpg');
  assert.deepEqual(docs.find((d) => d.id === 'd_sp')!.files, []);
  assert.equal(relationFrom('child', 'self'), 'parent');
  assert.equal(relationFrom('spouse', 'parent'), 'other');
});

// Recipient's phone: Sam's own profile (with her own passport) and something only she has
const samHere = P('p_mine', 'Me', 'self', { isMain: true });
const mineOnly = D('d_mine_note', 'p_mine', 'other', { name: 'DOE SAM' }, { addedAt: '2026-03-01T00:00:00Z' });
const samPassHere = D('d_mine_pp', 'p_mine', 'passport', { name: 'DOE SAM', passportNo: 'Z2000002', birthDate: '1987-02-02', validTo: '2033-02-02' }, { addedAt: '2026-01-15T00:00:00Z' });
const recipient = { people: [samHere], docs: [samPassHere, mineOnly] };

test('recipient with her own profile: matched by passport, no duplicates, her data untouched', () => {
  const p = payload();
  assert.equal(guessMe(recipient, p), 'p_sam');
  const plan = planShareMerge(recipient, p, { meId: guessMe(recipient, p), newId });
  assert.deepEqual(plan.people.map((x) => x.name), ['Me', 'Alex', 'Kit']);
  assert.deepEqual(plan.report.peopleMatched, ['Sam']);
  assert.equal(plan.people[0], samHere); // her own profile object is unchanged
  assert.equal(plan.people.find((x) => x.name === 'Alex')!.relation, 'spouse');
  assert.equal(plan.people.find((x) => x.name === 'Alex')!.isMain, false);
  // her passport is the same document: the incoming copy is newer (added 2026-02-01) -> replaces details, keeps her id and owner
  const pp = plan.docs.filter((d) => d.type === 'passport' && d.ownerId === 'p_mine');
  assert.equal(pp.length, 1);
  assert.equal(pp[0].id, 'd_mine_pp');
  assert.equal(plan.report.docsUpdated, 1);
  assert.equal(plan.report.docsAdded, 4);
  // never removes: every document that was here is still here
  for (const d of recipient.docs) assert.ok(plan.docs.some((x) => x.id === d.id));
  assert.ok(plan.docs.includes(mineOnly));
  // Sam's I-94 lands on her own profile
  assert.equal(plan.docs.find((d) => d.type === 'i94')!.ownerId, 'p_mine');
});

test('importing the same package twice adds nothing', () => {
  const p = payload();
  const first = planShareMerge(recipient, p, { meId: 'p_sam', newId });
  const after = { people: first.people, docs: resolveWrites(first, new Map(first.writes.map((w) => [`${w.docId}#${w.index}`, `stored-${w.docId}`]))) };
  const again = planShareMerge(after, p, { meId: guessMe(after, p), newId });
  assert.equal(again.report.docsAdded, 0);
  assert.equal(again.report.docsUpdated, 0);
  assert.equal(again.report.peopleAdded.length, 0);
  assert.equal(again.people.length, after.people.length);
  assert.equal(again.docs.length, after.docs.length);
  assert.equal(again.writes.length, 0);
});

test('newer document wins either way; scans only fill gaps unless newer', () => {
  const base = planShareMerge({ people: [], docs: [] }, payload(), { meId: 'p_sam', newId });
  const here = { people: base.people, docs: resolveWrites(base, new Map(base.writes.map((w) => [`${w.docId}#${w.index}`, `stored-${w.docId}`]))) };
  // recipient edits the approval later than the sender -> hers is kept
  here.docs = here.docs.map((d) => (d.id === 'd_a797' ? { ...d, fields: { ...d.fields, validTo: '2028-10-31' }, updatedAt: '2026-11-10T00:00:00Z' } : d));
  // sender then corrects the I-94 (newer) and the approval (older than her edit)
  const p = payload();
  p.docs = p.docs.map((d) => (d.id === 'd_s94' ? { ...d, fields: { ...d.fields, validTo: '2028-12-31' }, updatedAt: '2026-11-15T00:00:00Z' } : d.id === 'd_a797' ? { ...d, fields: { ...d.fields, validTo: '2028-09-01' }, updatedAt: '2026-11-05T00:00:00Z' } : d));
  const plan = planShareMerge(here, p, { meId: 'p_sam', newId });
  assert.equal(plan.docs.find((d) => d.id === 'd_s94')!.fields.validTo, '2028-12-31');
  assert.equal(plan.docs.find((d) => d.id === 'd_a797')!.fields.validTo, '2028-10-31');
  assert.equal(plan.report.docsUpdated, 1);
  // a newer copy without scans keeps the recipient's scans
  const p2 = payload({ people: ['p_alex', 'p_sam', 'p_kit'], scans: false });
  p2.docs = p2.docs.map((d) => (d.id === 'd_ap' ? { ...d, fields: { ...d.fields, validTo: '2035-01-01' }, updatedAt: '2026-11-18T00:00:00Z' } : d));
  const plan2 = planShareMerge(here, p2, { meId: 'p_sam', newId });
  const ap = plan2.docs.find((d) => d.id === 'd_ap')!;
  assert.equal(ap.fields.validTo, '2035-01-01');
  assert.equal(ap.files![0].file, 'stored-d_ap');
  assert.equal(plan2.writes.length, 0);
  // same version, recipient has no scan yet -> the scan is added, details kept
  const noScan = { people: here.people, docs: here.docs.map((d) => (d.id === 'd_sp' ? { ...d, files: [] } : d)) };
  const plan3 = planShareMerge(noScan, payload(), { meId: 'p_sam', newId });
  assert.equal(plan3.report.scansAdded, 1);
  assert.deepEqual(plan3.writes.map((w) => w.key), ['d_sp#0']);
});

test('id clashes and no Which one is you: nothing of the recipient is overwritten', () => {
  const stranger = P('p_alex', 'Robin', 'self', { isMain: true }); // same id by chance, different person
  const strangerDoc = D('d_ap', 'p_alex', 'passport', { name: 'ROE ROBIN', passportNo: 'Y9999999', birthDate: '1990-05-05' });
  const here = { people: [stranger], docs: [strangerDoc] };
  const plan = planShareMerge(here, payload(), { meId: null, newId });
  assert.equal(plan.people[0], stranger);
  const alexNow = plan.people.find((x) => x.name === 'Alex')!;
  assert.notEqual(alexNow.id, 'p_alex');
  assert.equal(alexNow.relation, 'other'); // this phone already has a different You
  assert.equal(alexNow.isMain, false);
  // same document id by chance, different person and number: Robin's passport is untouched, Alex's is added with a new id
  assert.ok(plan.docs.includes(strangerDoc));
  const alexPass = plan.docs.find((d) => d.fields.passportNo === 'Z1000001')!;
  assert.equal(alexPass.ownerId, alexNow.id);
  assert.notEqual(alexPass.id, 'd_ap');
  assert.equal(plan.report.docsAdded, 5);
  for (const d of here.docs) assert.ok(plan.docs.some((x) => x.id === d.id));
  assert.equal(plan.people.length, 4);
  assert.equal(plan.writes.find((w) => w.key === 'd_ap#0')!.docId, alexPass.id);
});

test('docKey: same document by number and dates, case and spaces ignored', () => {
  assert.equal(docKey({ type: 'passport', fields: { passportNo: 'z 1000001' } }), docKey({ type: 'passport', fields: { passportNo: 'Z1000001' } }));
  assert.equal(docKey({ type: 'approval', fields: {} }), null);
  assert.notEqual(docKey({ type: 'i94', fields: { entryDate: '2026-01-10', classOfAdmission: 'H4' } }), docKey({ type: 'i94', fields: { entryDate: '2026-05-10', classOfAdmission: 'H4' } }));
});

test('system links: only local .iwshare files go to the import screen', async () => {
  const { shareImportPath } = await import('../src/core/shareLink');
  const u = 'file:///private/var/mobile/Containers/Data/Application/X/Documents/Inbox/Immigration%20Wallet%20share%202026-11-19.iwshare';
  assert.equal(shareImportPath(u), `/share-import?file=${encodeURIComponent(u)}`);
  assert.equal(shareImportPath('casedesk://settings'), null);
  assert.equal(shareImportPath('https://example.com/x.iwshare'), null);
  assert.equal(shareImportPath('file:///tmp/backup.casedesk'), null);
});
