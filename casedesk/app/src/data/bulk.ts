// v3.0 fix8 (owner): Add several documents at once. Each picked photo or PDF is read on the phone
// and filed under the person whose passport number or full name is printed on it (the v2.9
// identity check); anything that matches no one goes to the person setting up, flagged, so the
// review list can move it. Nothing is uploaded.
import type { Document } from '../core/model';
import { readDocument } from '../core/read';
import { assignAll } from '../core/identity';
import type { FamilyState } from './FamilyProvider';
import { newId } from './store';
import { deleteFile, fileUri, keepFile, pickMany } from '../native/files';
import { readText } from '../native/ocr';
import { diag } from '../native/diag';

export type BulkResult = { picked: number; added: { id: string; by: 'passport number' | 'name' | 'none' }[]; unread: number };

export async function importMany(source: 'photos' | 'files', fam: FamilyState, onProgress?: (done: number, total: number) => void): Promise<BulkResult> {
  const picked = await pickMany(source);
  if (!picked.length) return { picked: 0, added: [], unread: 0 };
  const read: Document[] = [];
  let unread = 0;
  for (let i = 0; i < picked.length; i++) {
    onProgress?.(i, picked.length);
    const id = newId('doc');
    let file: Document['files'] extends (infer F)[] | undefined ? F : never;
    try { file = await keepFile(picked[i], id); } catch { unread++; continue; }
    const text = await readText(fileUri(file), file.mime).catch(() => null);
    const r = text ? readDocument(text) : { type: undefined, fields: {} };
    if (!r.type) { unread++; deleteFile(file); continue; }
    read.push({ id, ownerId: '', type: r.type, fields: r.fields, addedAt: new Date().toISOString(), files: [file], seq: i });
  }
  onProgress?.(picked.length, picked.length);
  const known = Object.fromEntries(fam.people.map((p) => [p.id, { passportNos: fam.records[p.id]?.passportNos, legalName: fam.records[p.id]?.legalName }]));
  const who = assignAll(read, fam.people, fam.docs, known);
  const docs = read.map((d, i) => ({ ...d, ownerId: who[i].ownerId }));
  await fam.actions.addDocs(docs);
  diag(`bulk: ${picked.length} picked, ${docs.length} added, ${unread} unread`);
  return { picked: picked.length, added: who.map(({ id, by }) => ({ id, by })), unread };
}
