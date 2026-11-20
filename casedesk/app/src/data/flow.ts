// The document step flow (setup from Home, add a family member, add / renew, "continue adding").
// In-memory draft until Save (or Home, which saves what's done so far — owner change, Nov 18).
import { useSyncExternalStore } from 'react';
import { diag } from '../native/diag';
import type { DocType, Document, Person } from '../core/model';
import { readDocument } from '../core/read';
import { identityOf, belongsElsewhere } from '../core/identity';
import { fillsStep, stepKeys, stepMeta, stepOf, type StepKey } from '../core/steps';
import { FIELDS, docHasData } from '../core/docs';
import { migrateFile } from '../core/files';
import type { FamilyState } from './FamilyProvider';
import { newId } from './store';
import { keepFile, pick, deleteFile, fileUri, type Source } from '../native/files';
import { readText } from '../native/ocr';

export type Upload = {
  state: 'reading' | 'done' | 'error' | 'skipped';
  doc?: Document;
  misfile?: string; // person id the document looks like it belongs to
  wrongStep?: StepKey; // the document is a different type than this step
  typedIn?: boolean;
  error?: string;
  movedFrom?: string;
};
export type FlowMode = 'family' | 'add' | 'renew' | 'missing';
export type Flow = {
  mode: FlowMode;
  pids: string[];
  only?: StepKey[];
  missingOnly?: boolean;
  up: Record<string, Partial<Record<StepKey, Upload>>>;
  where: Record<string, { v?: 'US' | 'Outside'; c: string }>;
  misDone: boolean;
  returnTo?: string;
  quick?: boolean; // v3.0 onboarding: one document, then save and go back to the screen that opened it (no Review)
};

let flow: Flow | null = null;
const subs = new Set<() => void>();
let persist: ((f: Flow | null) => void) | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const emit = () => {
  subs.forEach((f) => f());
  // The draft survives the app being closed (cd2.draft); written shortly after each change.
  // A flow with nothing read or answered yet is not kept (no empty draft after Home / Save).
  if (persist) { if (persistTimer) clearTimeout(persistTimer); const snap = hasContent(flow) ? flow : null; persistTimer = setTimeout(() => persist?.(snap), snap ? 250 : 0); }
};
/** Something worth keeping: an upload (read, typed, skipped, error) or a "where are they" answer. */
export function hasContent(f: Flow | null): f is Flow {
  if (!f) return false;
  return Object.values(f.up ?? {}).some((per) => Object.values(per ?? {}).some(Boolean)) || Object.values(f.where ?? {}).some((w) => w?.v);
}
let draftLoaded = false;
let endedCount = 0;
/** True once the saved draft has been looked at (restoreDraft ran, with or without one). */
export const draftReady = () => draftLoaded;
export function useDraftReady(): boolean {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => draftLoaded, () => draftLoaded);
}
/** Bumped every time a flow is saved or ended — a step screen never restarts a flow after that. */
export const flowEpoch = () => endedCount;
/** Storage for the in-progress draft (FamilyProvider binds it to cd2.draft). */
export function bindDraft(save: (f: Flow | null) => void) { persist = save; }
/** Bring back a draft saved before the app was closed. Readings that were cut off become "try again". */
export function restoreDraft(d: Flow | null) {
  draftLoaded = true;
  if (!hasContent(d) || flow) { subs.forEach((f) => f()); return; }
  const up: Flow['up'] = {};
  for (const [pid, per] of Object.entries(d.up ?? {})) {
    up[pid] = {};
    for (const [k, u0] of Object.entries(per ?? {})) {
      if (!u0) continue;
      const u: Upload = u0.doc ? { ...u0, doc: { ...u0.doc, files: (u0.doc.files ?? []).map(migrateFile) } } : u0;
      up[pid][k as StepKey] = u.state === 'reading' ? { state: 'error', error: 'Reading was interrupted. Try again, or type the details.', doc: u.doc } : u;
    }
  }
  flow = { ...d, up, where: d.where ?? {} };
  subs.forEach((f) => f());
}
/** Files referenced by the draft (kept by the orphan sweep). */
export const draftFiles = () => Object.values(flow?.up ?? {}).flatMap((per) => Object.values(per).flatMap((u) => u?.doc?.files ?? []));
/** Unanswered "this looks like someone else's" warnings. */
export const pendingMisfiles = () => Object.entries(flow?.up ?? {}).flatMap(([pid, per]) => Object.entries(per).filter(([, u]) => u?.state === 'done' && u.misfile).map(([k, u]) => ({ pid, k: k as StepKey, to: u!.misfile!, doc: u!.doc! })));
/** Read in this flow but not saved yet. */
export const unsavedCount = () => Object.values(flow?.up ?? {}).reduce((n, per) => n + Object.values(per).filter((u) => u?.state === 'done').length, 0);
export const getFlow = () => flow;
export function useFlow(): Flow | null {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => flow, () => flow);
}
function set(fn: (f: Flow) => Flow) { if (!flow) return; flow = fn(flow); emit(); }

export function startFlow(f: Omit<Flow, 'up' | 'where' | 'misDone'>, fam: FamilyState): { pid: string; k: StepKey } | null {
  flow = { ...f, up: {}, where: {}, misDone: false };
  emit();
  for (const pid of flow.pids) { const s = stepsOf(pid, fam); if (s.length) return { pid, k: s[0] }; }
  flow = null; emit();
  return null;
}
export function endFlow() {
  // files read but never saved are removed from the phone
  if (flow) for (const per of Object.values(flow.up)) for (const u of Object.values(per)) if (u?.doc && u.state !== 'done') for (const fl of u.doc.files ?? []) deleteFile(fl);
  endedCount++;
  flow = null; emit();
}

export const personOf = (pid: string, fam: FamilyState): Person | undefined => fam.people.find((p) => p.id === pid);

/** The steps this flow walks for a person (only the missing ones in "continue adding"). */
export function stepsOf(pid: string, fam: FamilyState): StepKey[] {
  if (!flow) return [];
  if (flow.only) return flow.only;
  const p = personOf(pid, fam);
  if (!p) return [];
  const rec = fam.records[pid];
  const keys = stepKeys(p, rec);
  if (!flow.missingOnly) return keys;
  if (flow.mode === 'missing' && fam.missing[pid]) {
    const missing = new Set(fam.missing[pid].map((s) => s.key));
    return keys.filter((k) => missing.has(k));
  }
  // family / add: every step that has no saved document yet (optional ones too)
  const mine = fam.docs.filter((d) => d.ownerId === pid);
  return keys.filter((k) => !mine.some((d) => fillsStep(stepMeta(p, k, rec), d)));
}

export const uploadOf = (pid: string, k: StepKey) => flow?.up[pid]?.[k];

export function nextOf(pid: string, k: StepKey, fam: FamilyState): { pid: string; k: StepKey } | null {
  if (!flow) return null;
  const u = uploadOf(pid, 'i94');
  if (k === 'i94' && (!u || u.state === 'skipped') && !flow.only && !fam.records[pid]?.i94) return { pid, k: 'where' };
  const s = stepsOf(pid, fam);
  const i = s.indexOf(k === 'where' ? 'i94' : k);
  if (i > -1 && i < s.length - 1) return { pid, k: s[i + 1] };
  const pi = flow.pids.indexOf(pid);
  for (let j = pi + 1; j < flow.pids.length; j++) { const n = flow.pids[j]; const ns = stepsOf(n, fam); if (ns.length) return { pid: n, k: ns[0] }; }
  return null;
}

export function progressOf(pid: string, k: StepKey, fam: FamilyState) {
  let total = 0, at = 0, pi = 0;
  const pids = flow?.pids ?? [];
  pids.forEach((id, j) => {
    const s = stepsOf(id, fam);
    if (id === pid) { at = total + Math.max(0, s.indexOf(k === 'where' ? 'i94' : k)) + 1; pi = j; }
    total += s.length;
  });
  const s = stepsOf(pid, fam);
  const n = Math.max(0, s.indexOf(k === 'where' ? 'i94' : k)) + 1;
  return { value: Math.round((at / Math.max(1, total)) * 100), label: `${personOf(pid, fam)?.name ?? ''} · ${n} of ${s.length}`, right: pids.length > 1 ? `Person ${pi + 1} of ${pids.length}` : undefined };
}

export const setUpload = (pid: string, k: StepKey, u: Upload | undefined) => set((f) => ({ ...f, up: { ...f.up, [pid]: { ...(f.up[pid] ?? {}), [k]: u } } }));
export const setWhere = (pid: string, v: 'US' | 'Outside', c?: string) => set((f) => ({ ...f, where: { ...f.where, [pid]: { v, c: c ?? f.where[pid]?.c ?? 'India' } } }));
export const setCountry = (pid: string, c: string) => set((f) => ({ ...f, where: { ...f.where, [pid]: { ...(f.where[pid] ?? {}), c } } }));
export const skip = (pid: string, k: StepKey) => { for (const f of uploadOf(pid, k)?.doc?.files ?? []) deleteFile(f); setUpload(pid, k, { state: 'skipped' }); };
/** Drop one upload without saving it (and its file). */
export const discard = (pid: string, k: StepKey) => { for (const f of uploadOf(pid, k)?.doc?.files ?? []) deleteFile(f); setUpload(pid, k, undefined); };

/** Everyone's documents (saved + read in this flow) — used to tell whose a new document is. */
function identities(fam: FamilyState) {
  const drafts = Object.entries(flow?.up ?? {}).flatMap(([pid, per]) => Object.values(per).filter((u) => u?.state === 'done' && u.doc).map((u) => ({ ...u!.doc!, ownerId: pid })));
  const all = [...fam.docs, ...drafts];
  return fam.people.map((p) => identityOf(p.id, all.filter((d) => d.ownerId === p.id), { passportNos: fam.records[p.id]?.passportNos, legalName: fam.records[p.id]?.legalName, displayName: p.name }));
}

function analyse(pid: string, k: StepKey, doc: Document, fam: FamilyState): Upload {
  const p = personOf(pid, fam)!;
  const step = stepMeta(p, k, fam.records[pid]);
  let wrongStep: StepKey | undefined;
  if (k !== 'where' && !fillsStep(step, doc)) wrongStep = stepOf(doc.type, doc.fields);
  const other = flow?.misDone ? undefined : belongsElsewhere(doc.fields, pid, identities(fam));
  return { state: 'done', doc, misfile: other?.id, wrongStep: wrongStep !== k ? wrongStep : undefined };
}

/** Upload one document into a step: pick → private copy → read on the phone → typed fields. */
export async function upload(pid: string, k: StepKey, source: Source, fam: FamilyState) {
  const picked = await pick(source).catch((e: Error) => { setUpload(pid, k, { state: 'error', error: e.message }); return null; });
  diag(`upload ${k} from ${source}: ${picked ? `${picked.mime} ${picked.size ?? '?'} bytes` : 'cancelled'}`);
  if (!picked) return;
  setUpload(pid, k, { state: 'reading' });
  const id = newId('doc');
  try {
    const file = await keepFile(picked, id);
    diag(`kept file for ${k}`);
    const text = await readText(fileUri(file), file.mime);
    diag(`read ${k}: ${text ? text.length + ' chars' : 'no text'}`);
    if (!text) { setUpload(pid, k, { state: 'error', error: 'Reading works in the Immigration Wallet app on your phone. You can type the details instead.', doc: draftDoc(id, pid, k, fam, file) }); return; }
    const r = readDocument(text);
    if (!r.type) { setUpload(pid, k, { state: 'error', error: 'Couldn’t read this one. Try a flatter, brighter photo — or type the dates yourself.', doc: draftDoc(id, pid, k, fam, file) }); return; }
    const doc: Document = { id, ownerId: pid, type: r.type, fields: r.fields, addedAt: new Date().toISOString(), files: [file] };
    setUpload(pid, k, analyse(pid, k, doc, fam));
    diag(`read ${k} as ${r.type}`);
  } catch (e: any) {
    diag(`upload ${k} failed: ${e?.message ?? e}`);
    setUpload(pid, k, { state: 'error', error: 'Couldn’t read this one. Try again, or type the details yourself.' });
  }
}

function draftDoc(id: string, pid: string, k: StepKey, fam: FamilyState, file?: Document['files'] extends (infer F)[] | undefined ? F : never): Document {
  const p = personOf(pid, fam)!;
  const step = stepMeta(p, k, fam.records[pid]);
  const type: DocType = step.accepts[0] ?? 'other';
  const fields: Document['fields'] = { ...(step.form ? { form: step.form } : {}), ...(step.noticeKind ? { noticeKind: step.noticeKind } : {}), ...(step.key === 'combo' ? { category: 'C9' } : {}) };
  return { id, ownerId: pid, type, fields, addedAt: new Date().toISOString(), files: file ? [file] : [] };
}

/** "Type it in": an empty document of this step's type; the user fills the fields. */
export function typeIn(pid: string, k: StepKey, fam: FamilyState) {
  const prev = uploadOf(pid, k);
  const doc = prev?.doc ?? draftDoc(newId('doc'), pid, k, fam);
  setUpload(pid, k, { state: 'done', doc: { ...doc, fields: { ...doc.fields } }, typedIn: true });
}
export function editField(pid: string, k: StepKey, patch: Document['fields']) {
  const u = uploadOf(pid, k);
  if (!u?.doc) return;
  setUpload(pid, k, { ...u, doc: { ...u.doc, fields: { ...u.doc.fields, ...patch } } });
}
export function retake(pid: string, k: StepKey) {
  const u = uploadOf(pid, k);
  for (const f of u?.doc?.files ?? []) deleteFile(f);
  setUpload(pid, k, undefined);
}
/** Misfile: move the document to the person it belongs to (into the same step there). */
export function moveTo(pid: string, k: StepKey, to: string) {
  const u = uploadOf(pid, k);
  if (!u?.doc) return;
  const target = stepOf(u.doc.type, u.doc.fields) ?? k;
  set((f) => {
    const up = { ...f.up, [pid]: { ...(f.up[pid] ?? {}) } };
    delete up[pid][k];
    up[to] = { ...(up[to] ?? {}), [target]: { state: 'done', doc: { ...u.doc!, ownerId: to }, movedFrom: pid } };
    return { ...f, up, misDone: true, pids: f.pids.includes(to) ? f.pids : [...f.pids, to] };
  });
}
export const keepHere = (pid: string, k: StepKey) => { const u = uploadOf(pid, k); if (u) setUpload(pid, k, { ...u, misfile: undefined }); set((f) => ({ ...f, misDone: true })); };
/** Wrong document type for this step: move it to its own step for the same person. */
export function moveToStep(pid: string, k: StepKey) {
  const u = uploadOf(pid, k);
  if (!u?.doc || !u.wrongStep) return;
  const target = u.wrongStep;
  set((f) => {
    const per = { ...(f.up[pid] ?? {}) };
    delete per[k];
    per[target] = { ...u, wrongStep: undefined };
    return { ...f, up: { ...f.up, [pid]: per } };
  });
  return target;
}

/** Save what's done: documents, and where people are when the I-94 was skipped. */
export async function commit(fam: FamilyState) {
  if (!flow) return { saved: 0 };
  const docs: Document[] = [];
  // A document with an unanswered "looks like someone else's" warning is never saved silently.
  // v3.0 fix8: an empty Type it in draft (opened, nothing typed) is never saved as a document.
  for (const [pid, per] of Object.entries(flow.up)) for (const u of Object.values(per)) if (u?.state === 'done' && u.doc && !u.misfile && docHasData(u.doc)) docs.push({ ...u.doc, ownerId: pid, addedAt: u.doc.addedAt || new Date().toISOString(), seq: docs.length, edited: u.typedIn ? (Object.keys(u.doc.fields) as never[]) : u.doc.edited });
  diag(`commit: saving ${docs.length} document(s)`);
  try { await fam.actions.addDocs(docs); } catch (e: any) { diag(`commit FAILED: ${e?.message ?? e}`); throw e; }
  for (const [pid, w] of Object.entries(flow.where)) if (w.v) await fam.actions.setFacts(pid, { location: w.v, country: w.v === 'Outside' ? w.c : undefined });
  const saved = docs.length;
  // files of readings that weren't saved (errors, skipped) are removed
  for (const per of Object.values(flow.up)) for (const u of Object.values(per)) if (u?.doc && (u.state !== 'done' || u.misfile)) for (const fl of u.doc.files ?? []) deleteFile(fl);
  endedCount++;
  flow = null; emit();
  return { saved };
}

export const fieldSpecsFor = (t: DocType) => FIELDS[t];
