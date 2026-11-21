// Share with family (v2.9): an encrypted package (.iwshare) with chosen people and documents, sent
// phone to phone through the share sheet (AirDrop, Messages, WhatsApp…). Nothing goes to our server.
// Same crypto and file layout as the password backup (scrypt -> AES-256-GCM, see backup.ts), plus:
//  - the secret is a random 6-word code made on the sender's phone (about 65 bits), shown on screen
//    only; it is never written into the file, the message or storage;
//  - the header line (with the expiry date) is authenticated, so it can't be edited;
//  - the payload repeats the expiry date and the import refuses expired packages.
// Merge on the recipient's phone: by person, then by document; newer document wins; nothing of the
// recipient's is ever removed. Pure TypeScript (no React Native) so all of it is tested with tsx.
import type { DocFields, Document, Person, Relation } from './model';
import { KDF, openSealed, randomBytes, sealText, splitSealed, type Progress } from './backup';
import { matchPeople } from './merge';
import { SHARE_WORDS } from './sharewords';

export const SHARE_MAGIC = 'IMMIGRATION-WALLET-SHARE 1';
export const SHARE_EXT = 'iwshare';
export const SHARE_UTI = 'com.vijaykannan.casedesk.share';
export const SHARE_MIME = 'application/x-immigration-wallet-share';
export const CODE_WORDS = 6;
export const DEFAULT_EXPIRY_DAYS = 7;
export const MAX_EXPIRY_DAYS = 30;

const NOT_OURS = 'This isn’t an Immigration Wallet share file';
export const WRONG_CODE = 'That code doesn’t open this file. Check the 6 words — or the file was changed or damaged on the way.';

// ---------- codes ----------
/** 6 random words from SHARE_WORDS (uniform: rejection sampling on 16-bit values). */
export function newShareCode(rand: (n: number) => Uint8Array = randomBytes): string {
  const n = SHARE_WORDS.length, limit = Math.floor(65536 / n) * n;
  const out: string[] = [];
  while (out.length < CODE_WORDS) {
    const b = rand(2), v = (b[0] << 8) | b[1];
    if (v < limit) out.push(SHARE_WORDS[v % n]);
  }
  return out.join(' ');
}

const BY_PREFIX = (() => { const m = new Map<string, string>(); for (const w of SHARE_WORDS) m.set(w.slice(0, 4), w); return m; })();

/** What the person typed -> the canonical code ("word word word word word word"), or a reason.
 *  Case, spaces, dashes, numbering and autocorrect capitals don't matter; each word may be typed
 *  as its first 4 letters (every word is unique in its first 4 letters). */
export function readCode(input: string): { code: string } | { problem: string } {
  const parts = input.toLowerCase().replace(/[0-9.)]/g, ' ').split(/[^a-z]+/).filter(Boolean);
  if (!parts.length) return { problem: 'Type the 6-word code shown on the other phone' };
  const words: string[] = [];
  for (const p of parts) {
    const w = p.length >= 4 ? BY_PREFIX.get(p.slice(0, 4)) : SHARE_WORDS.find((x) => x === p);
    if (!w || (p.length > 4 && !w.startsWith(p) && p !== w)) return { problem: `“${p}” isn’t one of the code words — check the spelling` };
    words.push(w);
  }
  if (words.length !== CODE_WORDS) return { problem: `The code has ${CODE_WORDS} words — you typed ${words.length}` };
  return { code: words.join(' ') };
}

// ---------- package ----------
export type ShareFile = { name: string; mime: string; data: string };
export type SharePayload = {
  app: 'immigration-wallet'; kind: 'share'; v: 1;
  createdAt: string; expiresAt: string;
  from?: string; // sender's name as they call themselves in the app (inside the encryption)
  scans: boolean;
  people: Person[]; docs: Document[];
  files: Record<string, ShareFile>; // `${docId}#${index}` -> base64
};

export type ShareSelection = { people: string[]; docs?: string[]; scans: boolean; expiresInDays?: number; from?: string };

/** The people and documents that go into a package. Device preferences (reminders) stay behind;
 *  links to people who aren't shared are dropped. */
export function selectForShare(all: { people: Person[]; docs: Document[] }, sel: ShareSelection): { people: Person[]; docs: Document[] } {
  const ids = new Set(sel.people);
  const people = all.people.filter((p) => ids.has(p.id)).map(({ reminders: _r, ...p }) => {
    const facts = { ...p.facts };
    if (facts.dependentOf && !ids.has(facts.dependentOf)) delete facts.dependentOf;
    return { ...p, facts } as Person;
  });
  const want = sel.docs ? new Set(sel.docs) : null;
  const docs = all.docs.filter((d) => ids.has(d.ownerId) && (!want || want.has(d.id))).map((d) => (sel.scans ? d : { ...d, files: [] }));
  return { people, docs };
}

export function expiryFrom(now: Date, days = DEFAULT_EXPIRY_DAYS): string {
  const d = Math.min(MAX_EXPIRY_DAYS, Math.max(1, Math.round(days)));
  return new Date(now.getTime() + d * 864e5).toISOString();
}

/** File name with no personal details in it. */
export function shareFileName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Immigration Wallet share ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${SHARE_EXT}`;
}

export async function sealShare(p: SharePayload, code: string, o: { kdf?: typeof KDF; onProgress?: Progress } = {}): Promise<string> {
  const c = readCode(code);
  if (!('code' in c)) throw new Error('Bad share code');
  return sealText(SHARE_MAGIC, JSON.stringify(p), c.code, { kdf: o.kdf, onProgress: o.onProgress, bindHeader: true, extra: { expiresAt: p.expiresAt } });
}

export function isShareFile(text: string): boolean { return text.startsWith(SHARE_MAGIC + '\n') || text.startsWith(SHARE_MAGIC + '\r\n'); }

/** Plain header (before the code is typed): only dates. Not trusted until the file opens. */
export function readShareHeader(text: string): { createdAt: string; expiresAt: string } {
  if (!isShareFile(text) && text.startsWith('CASEDESK-BACKUP')) throw new Error('This is a backup file, not a share. Use Settings → Backup → Restore.');
  const { header } = splitSealed(text, SHARE_MAGIC, NOT_OURS);
  return { createdAt: String(header.createdAt ?? ''), expiresAt: String(header.expiresAt ?? '') };
}

export class ShareExpired extends Error {
  constructor(public expiresAt: string) { super(`This share expired on ${expiresAt.slice(0, 10)}. Ask for a new one.`); }
}
const expired = (iso: string, now: Date) => { const t = Date.parse(iso); return !isFinite(t) || t <= now.getTime(); };

/** Code + file -> the checked payload. Wrong code and a changed file give the same message. */
export async function openShare(text: string, code: string, now = new Date(), onProgress?: Progress): Promise<SharePayload> {
  const c = readCode(code);
  if (!('code' in c)) throw new Error(c.problem);
  const h = readShareHeader(text);
  if (expired(h.expiresAt, now)) throw new ShareExpired(h.expiresAt); // (authenticated below; checked first to save time)
  const json = await openSealed(text, SHARE_MAGIC, c.code, { onProgress, bindHeader: true, notOurs: NOT_OURS, wrong: WRONG_CODE });
  let p: SharePayload;
  try { p = JSON.parse(json); } catch { throw new Error(WRONG_CODE); }
  checkPayload(p);
  if (p.expiresAt !== h.expiresAt) throw new Error(WRONG_CODE);
  if (expired(p.expiresAt, now)) throw new ShareExpired(p.expiresAt);
  return p;
}

const RELATIONS: Relation[] = ['self', 'spouse', 'child', 'parent', 'other'];
const isStr = (x: unknown): x is string => typeof x === 'string';
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Shape checks on what came out of the file (it was made by an app, but check anyway). */
export function checkPayload(p: SharePayload) {
  const bad = () => { throw new Error('This share file isn’t valid'); };
  if (!isObj(p) || p.app !== 'immigration-wallet' || p.kind !== 'share') bad();
  if (p.v !== 1) throw new Error('This share was made by a newer Immigration Wallet — update the app first');
  if (!Array.isArray(p.people) || !Array.isArray(p.docs) || !isObj(p.files) || !isStr(p.expiresAt)) bad();
  const ids = new Set<string>();
  for (const x of p.people) {
    if (!isObj(x) || !isStr(x.id) || !x.id || !isStr(x.name) || !RELATIONS.includes(x.relation) || !isObj(x.facts)) bad();
    ids.add(x.id);
  }
  for (const d of p.docs) {
    if (!isObj(d) || !isStr(d.id) || !d.id || !isStr(d.ownerId) || !ids.has(d.ownerId) || !isStr(d.type) || !isObj(d.fields)) bad();
    if (d.files !== undefined && !Array.isArray(d.files)) bad();
  }
  for (const f of Object.values(p.files)) if (!isObj(f) || !isStr(f.name) || !isStr(f.data) || !isStr(f.mime)) bad();
}

export type SharePreview = { createdAt: string; expiresAt: string; from?: string; scans: boolean; people: { id: string; name: string; relation: Relation; docs: number }[]; docs: number; files: number };
export function previewShare(p: SharePayload): SharePreview {
  return {
    createdAt: p.createdAt, expiresAt: p.expiresAt, from: p.from, scans: !!p.scans,
    people: p.people.map((x) => ({ id: x.id, name: x.name, relation: x.relation, docs: p.docs.filter((d) => d.ownerId === x.id).length })),
    docs: p.docs.length, files: Object.keys(p.files).length,
  };
}

// ---------- merge ----------
/** Which incoming person is the person holding this phone (matched to their own profile)? */
export function guessMe(here: { people: Person[]; docs: Document[] }, p: SharePayload): string | null {
  const self = here.people.find((x) => x.relation === 'self');
  if (!self) return null;
  for (const [inId, m] of matchPeople(p.people, p.docs, here.people, here.docs)) if (m.id === self.id) return inId;
  return null;
}

/** Relations in the package are as the sender sees them. Seen from `me` (one of the incoming people). */
export function relationFrom(meRel: Relation, x: Relation): Relation {
  if (meRel === 'self') return x;
  if (meRel === 'spouse') return x === 'self' ? 'spouse' : x === 'child' ? 'child' : 'other';
  if (meRel === 'child') return x === 'self' || x === 'spouse' ? 'parent' : 'other';
  if (meRel === 'parent') return x === 'self' ? 'child' : 'other';
  return 'other';
}

const KEY_FIELDS: Partial<Record<Document['type'], (keyof DocFields)[]>> = {
  passport: ['passportNo'],
  visa: ['passportNo', 'classOfAdmission', 'issueDate'],
  i94: ['entryDate', 'classOfAdmission'],
  approval: ['receipt'],
  receipt: ['receipt'],
  notice: ['receipt', 'noticeKind', 'noticeDate'],
  i129s: ['receipt'],
  ead: ['category', 'validFrom', 'validTo'],
  'green-card': ['uscisNumber', 'validTo'],
  'advance-parole': ['validFrom', 'validTo'],
  i20: ['sevisId', 'programStart'],
  ds2019: ['sevisId', 'programStart'],
};
const keyNorm = (v: unknown) => String(v).trim().toUpperCase().replace(/\s+/g, '');
/** A stable identity for "the same document" (type + its number / dates), or null when unknown. */
export function docKey(d: Pick<Document, 'type' | 'fields'>): string | null {
  const ks = KEY_FIELDS[d.type];
  if (!ks) return null;
  const vals = ks.map((k) => d.fields[k]);
  if (vals.some((v) => v === undefined || v === null || v === '')) return null;
  return `${d.type}|${vals.map(keyNorm).join('|')}`;
}
const stable = (o: unknown): string => (isObj(o) ? `{${Object.keys(o).sort().map((k) => `${k}:${stable(o[k])}`).join(',')}}` : Array.isArray(o) ? `[${o.map(stable).join(',')}]` : JSON.stringify(o));

type Versioned = Document & { updatedAt?: string };
/** When the document was last changed (edit time, else when it was added). */
export const docVersion = (d: Versioned): number => { const t = Date.parse(d.updatedAt ?? d.addedAt ?? ''); return isFinite(t) ? t : 0; };

const SAFE_MIME = /^(image\/(jpeg|png|heic|heif|webp|gif)|application\/pdf)$/;
const safeMime = (m: string) => (SAFE_MIME.test(m) ? m : 'application/octet-stream');

export type ShareReport = { peopleAdded: string[]; peopleMatched: string[]; docsAdded: number; docsUpdated: number; docsKept: number; scansAdded: number };
export type ShareMergePlan = {
  people: Person[]; // everyone after the merge (all of this phone's people first, unchanged)
  docs: Document[]; // every document after the merge
  writes: { docId: string; index: number; key: string }[]; // scans to write from payload.files
  report: ShareReport;
};

/** Pure merge plan. Never removes a person or document from `here`; a document that is on both
 *  phones is replaced only when the incoming copy is newer (its scans too, when the package has them). */
export function planShareMerge(here: { people: Person[]; docs: Document[] }, p: SharePayload, o: { meId?: string | null; newId: (prefix: string) => string }): ShareMergePlan {
  const report: ShareReport = { peopleAdded: [], peopleMatched: [], docsAdded: 0, docsUpdated: 0, docsKept: 0, scansAdded: 0 };
  const localSelf = here.people.find((x) => x.relation === 'self');
  const meIn = o.meId ? p.people.find((x) => x.id === o.meId) : undefined;

  // people: "me" first (it is this phone's own profile, when there is one), then matchPeople
  const idMap = new Map<string, string>();
  if (meIn && localSelf) { idMap.set(meIn.id, localSelf.id); report.peopleMatched.push(meIn.name); }
  const restIn = p.people.filter((x) => !idMap.has(x.id));
  const restHere = here.people.filter((x) => ![...idMap.values()].includes(x.id));
  const found = matchPeople(restIn, p.docs, restHere, here.docs);
  for (const x of restIn) { const m = found.get(x.id); if (m) { idMap.set(x.id, m.id); report.peopleMatched.push(x.name); } }

  const taken = new Set(here.people.map((x) => x.id));
  const hasMain = here.people.some((x) => x.relation === 'self' || x.isMain);
  const added: Person[] = [];
  for (const x of p.people) {
    if (idMap.has(x.id)) continue;
    const id = taken.has(x.id) ? o.newId('p') : x.id;
    taken.add(id); idMap.set(x.id, id);
    let relation: Relation;
    if (meIn) relation = x.id === meIn.id ? 'self' : relationFrom(meIn.relation, x.relation);
    else relation = x.relation === 'self' && localSelf ? 'other' : x.relation;
    if (relation === 'self' && added.some((a) => a.relation === 'self')) relation = 'other';
    added.push({ ...x, id, relation, isMain: hasMain ? false : relation === 'self' || (!meIn && !!x.isMain) });
    report.peopleAdded.push(x.name);
  }
  for (const a of added) {
    const dep = a.facts?.dependentOf;
    if (dep) { const facts = { ...a.facts }; const to = idMap.get(dep); if (to) facts.dependentOf = to; else delete facts.dependentOf; a.facts = facts; }
  }

  // documents
  const docs: Document[] = [...here.docs];
  const usedLocal = new Set<string>();
  const docIds = new Set(here.docs.map((d) => d.id));
  const writes: ShareMergePlan['writes'] = [];
  const scansFor = (d: Document, newDocId: string) => {
    const files: NonNullable<Document['files']> = [];
    for (const [i, f] of (d.files ?? []).entries()) {
      const key = `${d.id}#${i}`;
      const blob = p.files[key];
      if (!blob) continue;
      writes.push({ docId: newDocId, index: files.length, key });
      files.push({ file: '', name: String(f?.name ?? blob.name), mime: safeMime(String(f?.mime ?? blob.mime)), size: typeof f?.size === 'number' ? f.size : undefined });
    }
    return files;
  };
  for (const d of p.docs) {
    const owner = idMap.get(d.ownerId)!;
    const key = docKey(d), same = stable(d.fields);
    const free = (y: Document) => !usedLocal.has(y.id);
    // same id only counts for the same person or the same document number (ids never move a document)
    const m = here.docs.find((y) => free(y) && y.id === d.id && (y.ownerId === owner || (!!key && docKey(y) === key)))
      ?? (key ? here.docs.find((y) => free(y) && y.ownerId === owner && docKey(y) === key) : undefined)
      ?? here.docs.find((y) => free(y) && y.ownerId === owner && y.type === d.type && stable(y.fields) === same);
    if (!m) {
      const id = docIds.has(d.id) ? o.newId('doc') : d.id;
      docIds.add(id);
      docs.push({ ...d, id, ownerId: owner, files: scansFor(d, id) });
      report.docsAdded++;
      continue;
    }
    usedLocal.add(m.id);
    const idx = docs.findIndex((y) => y.id === m.id);
    const incomingScans = (d.files ?? []).some((_, i) => !!p.files[`${d.id}#${i}`]);
    if (docVersion(d) > docVersion(m)) {
      const files = incomingScans ? scansFor(d, m.id) : m.files;
      docs[idx] = { ...d, id: m.id, ownerId: m.ownerId, files };
      report.docsUpdated++;
    } else if (!(m.files ?? []).length && incomingScans) {
      docs[idx] = { ...m, files: scansFor(d, m.id) }; // same or older details: keep them, only add the missing scan
      report.scansAdded++;
    } else report.docsKept++;
  }
  return { people: [...here.people, ...added], docs, writes, report };
}

/** After the scans are written: put the stored names in, drop the ones that failed. */
export function resolveWrites(plan: ShareMergePlan, stored: Map<string, string | null>): Document[] {
  const byDoc = new Map<string, Map<number, string | null>>();
  for (const w of plan.writes) { const m = byDoc.get(w.docId) ?? new Map(); m.set(w.index, stored.get(`${w.docId}#${w.index}`) ?? null); byDoc.set(w.docId, m); }
  return plan.docs.map((d) => {
    const m = byDoc.get(d.id);
    if (!m) return d;
    const files = (d.files ?? []).map((f, i) => (m.has(i) ? { ...f, file: m.get(i) ?? '' } : f)).filter((f) => !!f.file);
    return { ...d, files };
  });
}
