// Document files on the phone: pick (camera / photos / files), keep a private copy in the app's
// documents folder, read / write for backups, share. Native modules are required lazily (see safe.ts).
import { Platform } from 'react-native';
import { native } from './safe';
import type { DocFile } from '../core/model';
import { VAULT_DIR, isAbsoluteRef, orphanNames } from '../core/files';

export type Picked = { uri: string; name: string; mime: string; size?: number };
export type Source = 'camera' | 'photos' | 'files';

const FS = () => native.fileSystem();

function vaultDir(): any {
  const fs = FS();
  if (!fs?.Directory || !fs?.Paths) return undefined;
  const dir = new fs.Directory(fs.Paths.document, VAULT_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function pick(source: Source): Promise<Picked | null> {
  if (source === 'files') {
    const DP = native.documentPicker();
    if (!DP?.getDocumentAsync) throw new Error('Files aren’t available in this build.');
    const r = await DP.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    return { uri: a.uri, name: a.name ?? 'document.pdf', mime: a.mimeType ?? 'application/octet-stream', size: a.size };
  }
  const IP = native.imagePicker();
  if (!IP?.launchImageLibraryAsync) throw new Error('Photos aren’t available in this build.');
  if (source === 'camera') {
    const perm = await IP.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow camera access in Settings to scan documents.');
  }
  const opts = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false };
  const r = source === 'camera' ? await IP.launchCameraAsync(opts) : await IP.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? `scan-${Date.now()}.jpg`, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize };
}

/** v3.0 fix8: several photos or files at once (Add several documents at once). Both pickers already
 *  support multiple selection in the installed native modules (no new native code); a build whose
 *  picker ignores the option simply returns one. */
export async function pickMany(source: 'photos' | 'files'): Promise<Picked[]> {
  if (source === 'files') {
    const DP = native.documentPicker();
    if (!DP?.getDocumentAsync) throw new Error('Files aren’t available in this build.');
    const r = await DP.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: true });
    if (r.canceled || !r.assets?.length) return [];
    return r.assets.map((a: any, i: number) => ({ uri: a.uri, name: a.name ?? `document-${i + 1}.pdf`, mime: a.mimeType ?? 'application/octet-stream', size: a.size }));
  }
  const IP = native.imagePicker();
  if (!IP?.launchImageLibraryAsync) throw new Error('Photos aren’t available in this build.');
  const r = await IP.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: 20, orderedSelection: true });
  if (r.canceled || !r.assets?.length) return [];
  return r.assets.map((a: any, i: number) => ({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}-${i + 1}.jpg`, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize }));
}

/** Full URI of a kept file, rebuilt from its stored name and today's documents folder. */
export function fileUri(f: Pick<DocFile, 'file'> | undefined | null): string {
  const ref = f?.file ?? '';
  if (!ref || isAbsoluteRef(ref)) return ref;
  const dir = vaultDir();
  if (!dir?.uri) return ref;
  return dir.uri.endsWith('/') ? dir.uri + ref : `${dir.uri}/${ref}`;
}

/** Copy a picked file into the app's private folder. On the web preview the picked URI is kept. */
export async function keepFile(p: Picked, id: string): Promise<DocFile> {
  if (Platform.OS === 'web') return { file: p.uri, name: p.name, mime: p.mime, size: p.size };
  const fs = FS();
  const dir = vaultDir();
  if (!fs || !dir) return { file: p.uri, name: p.name, mime: p.mime, size: p.size };
  const safe = p.name.replace(/[^\w.\-]+/g, '_').slice(-60);
  const dest = new fs.File(dir, `${id}-${safe}`);
  const src = new fs.File(p.uri);
  if (typeof src.copySync === 'function') src.copySync(dest); else await src.copy(dest);
  return { file: `${id}-${safe}`, name: p.name, mime: p.mime, size: p.size };
}

export function deleteFile(f: DocFile) {
  if (Platform.OS === 'web') return;
  try { const fs = FS(); const u = fileUri(f); if (!u) return; const x = new fs.File(u); if (x.exists) x.delete(); } catch {}
}

export async function readBase64(uri: string): Promise<string | null> {
  try { const fs = FS(); const f = new fs.File(uri); return f.exists ? await f.base64() : null; } catch { return null; }
}

/** Write a document file from a backup into the private folder. Returns the stored file NAME. */
export async function writeBase64(name: string, data: string, id: string): Promise<string | null> {
  try {
    const fs = FS(); const dir = vaultDir();
    if (!fs || !dir) return null;
    const stored = `${id}-${name.replace(/[^\w.\-]+/g, '_').slice(-60)}`;
    const f = new fs.File(dir, stored);
    if (f.exists) f.delete();
    f.create();
    await f.write(data, { encoding: 'base64' });
    return stored;
  } catch { return null; }
}

export async function writeCacheText(name: string, text: string): Promise<string | null> {
  try {
    const fs = FS();
    const f = new fs.File(fs.Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    await f.write(text);
    return f.uri;
  } catch { return null; }
}

export async function readText(uri: string): Promise<string | null> {
  try { const fs = FS(); return await new fs.File(uri).text(); } catch {
    try { const r = await fetch(uri); return await r.text(); } catch { return null; }
  }
}

export async function share(uri: string, mime: string, title: string): Promise<boolean> {
  const S = native.sharing();
  try {
    if (S?.isAvailableAsync && (await S.isAvailableAsync())) { await S.shareAsync(uri, { mimeType: mime, dialogTitle: title, UTI: mime === 'application/pdf' ? 'com.adobe.pdf' : undefined }); return true; }
  } catch {}
  return false;
}

/** Quick Look preview of a stored file (PDFs). Falls back to the share sheet. */
export async function preview(f: DocFile) {
  const uri = fileUri(f);
  try { const fs = FS(); const x = new fs.File(uri); if (typeof x.preview === 'function') { await x.preview(); return; } } catch {}
  await share(uri, f.mime, f.name);
}

/** Remove files in the app's document folder that no document or draft refers to.
 *  `referenced` holds stored names (full URIs are reduced to their names, so a moved container
 *  never makes a kept file look unreferenced). Nothing is deleted when the list is empty (the
 *  caller passes null when storage failed to load), and only files older than 24 h are deleted. */
export function sweepOrphans(referenced: Iterable<string> | null, now = Date.now()): number {
  if (Platform.OS === 'web' || !referenced) return 0;
  let n = 0;
  try {
    const dir = vaultDir();
    const items: any[] = (dir?.list?.() ?? []).filter((it: any) => it?.uri && typeof it.delete === 'function' && !it.list);
    const present = items.map((it) => ({ name: it.name ?? it.uri, modifiedMs: modifiedMs(it), it }));
    const del = new Set(orphanNames(present, referenced, now));
    for (const p of present) if (del.has(p.name)) { try { p.it.delete(); n++; } catch {} }
  } catch {}
  return n;
}

function modifiedMs(it: any): number | null {
  let t: any = it?.modificationTime;
  if (t == null && typeof it?.info === 'function') { try { t = it.info()?.modificationTime; } catch {} }
  if (typeof t !== 'number' || !isFinite(t)) return null;
  return t < 1e11 ? t * 1000 : t; // seconds or milliseconds
}
