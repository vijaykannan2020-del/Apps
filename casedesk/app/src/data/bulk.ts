// v3.0 fix8 / bulk2 (owner): Add several documents at once. Each picked photo or PDF is read on the
// phone exactly like a single document (same readText + readDocument: text layer, page OCR, passport
// MRZ, visa and I-94 fields) and filed by core/match (passport number, date of birth, tolerant name).
// Nothing is uploaded.
import type { Document } from '../core/model';
import { readDocument } from '../core/read';
import { planBulk, type BulkEntry, type Member } from '../core/match';
import type { FamilyState } from './FamilyProvider';
import { newId } from './store';
import { deleteFile, fileUri, keepFile, pickMany } from '../native/files';
import { readText } from '../native/ocr';
import { diag } from '../native/diag';

/** unread = not added; noText = of those, no readable text at all (blurry, dark, not a document); the rest had text but aren't a document the app knows. */
export type BulkResult = { picked: number; added: BulkEntry[]; unread: number; noText: number; pending: Document[] };

/** Family members as the matcher sees them (typed name, legal name, passport numbers, birth date). */
export const membersOf = (fam: Pick<FamilyState, 'people' | 'records'>): Member[] => fam.people.map((p) => ({ id: p.id, relation: p.relation, name: p.name, legalName: fam.records[p.id]?.legalName, passportNos: fam.records[p.id]?.passportNos ?? [], birthDate: p.facts.birthDate ?? fam.records[p.id]?.birthDate }));

export async function importMany(source: 'photos' | 'files', fam: FamilyState, onProgress?: (done: number, total: number) => void): Promise<BulkResult> {
  const picked = await pickMany(source);
  if (!picked.length) return { picked: 0, added: [], unread: 0, noText: 0, pending: [] };
  const read: Document[] = [];
  let unread = 0;
  let noText = 0;
  for (let i = 0; i < picked.length; i++) {
    onProgress?.(i, picked.length);
    const id = newId('doc');
    let file: Document['files'] extends (infer F)[] | undefined ? F : never;
    try { file = await keepFile(picked[i], id); } catch { unread++; noText++; continue; }
    const text = await readText(fileUri(file), file.mime).catch(() => null);
    const hasText = !!text && text.replace(/\s/g, '').length >= 20;
    const r = text ? readDocument(text) : { type: undefined, fields: {} };
    if (!r.type) { unread++; if (!hasText) noText++; deleteFile(file); continue; }
    read.push({ id, ownerId: '', type: r.type, fields: r.fields, addedAt: new Date().toISOString(), files: [file], seq: i });
  }
  onProgress?.(picked.length, picked.length);
  const self = (fam.people.find((p) => p.relation === 'self') ?? fam.people.find((p) => p.isMain) ?? fam.people[0])?.id;
  const plan = planBulk(read, membersOf(fam), fam.docs, { fallback: self });
  const docs = read.map((d, i) => ({ ...d, ownerId: plan[i].ownerId ?? '' })).filter((d) => d.ownerId);
  await fam.actions.addDocs(docs);
  diag(`bulk: ${picked.length} picked, ${docs.length} added, ${plan.filter((x) => x.why.length).length} matched, ${unread} unread (${noText} no text)`);
  return { picked: picked.length, added: plan, unread, noText, pending: [] };
}
