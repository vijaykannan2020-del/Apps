// Stored document files are referenced by NAME only (relative to the app's documents folder,
// cd2-docs/). iOS moves the app container (…/Application/<UUID>/Documents) on updates and
// reinstalls, so a saved absolute path goes stale; the full path is rebuilt at runtime
// (src/native/files.ts fileUri). Earlier builds stored absolute `uri`s: migrateFile converts them.
import type { DocFile, Document } from './model';

export const VAULT_DIR = 'cd2-docs';

/** Last path segment, URL-decoded (file:///…/cd2-docs/doc_a-passport.jpg → doc_a-passport.jpg). */
export function baseName(ref: string): string {
  const s = ref.split(/[?#]/)[0].replace(/\/+$/, '');
  const last = s.slice(s.lastIndexOf('/') + 1);
  try { return decodeURIComponent(last); } catch { return last; }
}

/** True when the reference is a full URI / absolute path rather than a stored file name. */
export const isAbsoluteRef = (ref: string) => /^[a-z][\w+.-]*:/i.test(ref) || ref.startsWith('/');

/** Turn any reference into what is stored: a file inside cd2-docs becomes its name; a reference
 *  outside it (the web preview's blob:/http URIs) is kept as it is. */
export function storedRef(ref: string): string {
  if (!ref) return ref;
  if (!isAbsoluteRef(ref)) return ref;
  return ref.includes(`/${VAULT_DIR}/`) ? baseName(ref) : ref;
}

/** Key used to compare references (orphan sweep): the bare file name. */
export const refKey = (ref: string) => baseName(storedRef(ref));

/** Upgrade a stored file entry ({uri} from earlier builds → {file}). */
export function migrateFile(f: any): DocFile {
  const { uri, ...rest } = f ?? {};
  const ref = typeof rest.file === 'string' && rest.file ? rest.file : typeof uri === 'string' ? uri : '';
  return { ...rest, file: storedRef(ref) } as DocFile;
}

const needsMigration = (f: any) => !f || typeof f.uri === 'string' || typeof f.file !== 'string' || isAbsoluteRef(f.file) && f.file.includes(`/${VAULT_DIR}/`);

/** Migrate every document's files. `changed` says whether anything had to be rewritten. */
export function migrateDocs(docs: Document[]): { docs: Document[]; changed: boolean } {
  let changed = false;
  const out = docs.map((d) => {
    if (!d?.files?.some(needsMigration)) return d;
    changed = true;
    return { ...d, files: d.files.map(migrateFile) };
  });
  return { docs: out, changed };
}

/** Files that may be deleted by the orphan sweep: not referenced, and older than minAgeMs.
 *  Never returns anything when the reference list is empty (storage may have failed to load). */
export function orphanNames(
  present: { name: string; modifiedMs?: number | null }[],
  referenced: Iterable<string>,
  now = Date.now(),
  minAgeMs = 24 * 3600e3,
): string[] {
  const keep = new Set<string>();
  for (const r of referenced) if (r) keep.add(refKey(r));
  if (!keep.size) return [];
  return present
    .filter((p) => !keep.has(refKey(p.name)))
    .filter((p) => p.modifiedMs != null && now - p.modifiedMs >= minAgeMs) // unknown age: keep (safer)
    .map((p) => p.name);
}

/** Every stored file name referenced by saved documents and the in-progress draft. */
export function referencedFiles(docs: Document[], draft: DocFile[] = []): string[] {
  return [...docs.flatMap((d) => (d.files ?? []).map((f) => migrateFile(f).file)), ...draft.map((f) => migrateFile(f).file)].filter(Boolean);
}
