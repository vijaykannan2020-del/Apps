// Share with family: build the encrypted .iwshare file on this phone and hand it to the share sheet;
// on the other phone read it (opened from Files / Messages / AirDrop, or picked in the app), check the
// code, merge. Nothing is sent to our server. Native modules are optional (see native/safe.ts).
import { Platform } from 'react-native';
import { newId, type Store } from './store';
import { expiryFrom, isShareFile, newShareCode, openShare, planShareMerge, readShareHeader, resolveWrites, sealShare, selectForShare, shareFileName, SHARE_EXT, SHARE_MIME, SHARE_UTI, type ShareReport, type SharePayload, type ShareSelection } from '../core/share';
import type { Progress } from '../core/backup';
import { fileUri, readBase64, readText, writeBase64, writeCacheText } from '../native/files';
import { native } from '../native/safe';

export type BuiltShare = { uri: string | null; name: string; code: string; expiresAt: string; people: number; docs: number; files: number; missingFiles: number };

/** Make the package. The code is returned to the screen to show once; it is not stored anywhere. */
export async function buildShare(store: Store, sel: ShareSelection, onProgress?: Progress, now = new Date()): Promise<BuiltShare> {
  clearOldShares();
  const snap = await store.snapshot();
  const { people, docs } = selectForShare(snap, sel);
  if (!people.length) throw new Error('Choose at least one person');
  const files: SharePayload['files'] = {};
  let missing = 0;
  if (sel.scans) for (const d of docs) for (const [i, f] of (d.files ?? []).entries()) {
    const data = Platform.OS === 'web' ? null : await readBase64(fileUri(f));
    if (data) files[`${d.id}#${i}`] = { name: f.name, mime: f.mime, data }; else missing++;
  }
  const expiresAt = expiryFrom(now, sel.expiresInDays);
  const payload: SharePayload = { app: 'immigration-wallet', kind: 'share', v: 1, createdAt: now.toISOString(), expiresAt, from: sel.from, scans: sel.scans, people, docs, files };
  const code = newShareCode();
  const text = await sealShare(payload, code, { onProgress });
  const name = shareFileName(now);
  const uri = await writeCacheText(name, text);
  return { uri, name, code, expiresAt, people: people.length, docs: docs.length, files: Object.keys(files).length, missingFiles: missing };
}

/** iOS share sheet (AirDrop, Messages, WhatsApp, Mail, Files…). False when sharing isn't available. */
export async function sendShare(uri: string): Promise<boolean> {
  const S = native.sharing();
  try {
    if (S?.isAvailableAsync && (await S.isAvailableAsync())) { await S.shareAsync(uri, { mimeType: SHARE_MIME, UTI: SHARE_UTI, dialogTitle: 'Send the share file' }); return true; }
  } catch {}
  return false;
}

/** Remove share files this phone made earlier (they are encrypted, but no need to keep them). */
export function clearOldShares() {
  if (Platform.OS === 'web') return;
  try {
    const fs = native.fileSystem();
    const dir = fs?.Paths?.cache && new fs.Directory(fs.Paths.cache);
    for (const it of dir?.list?.() ?? []) if (String(it?.name ?? it?.uri ?? '').endsWith(`.${SHARE_EXT}`) && typeof it.delete === 'function') { try { it.delete(); } catch {} }
  } catch {}
}

export type PickedShare = { text: string; name: string; uri?: string };

/** Settings → Import shared documents: works on every build (no file-type registration needed). */
export async function pickShareFile(): Promise<PickedShare | null> {
  const DP = native.documentPicker();
  if (!DP?.getDocumentAsync) throw new Error('Files aren’t available in this build.');
  const r = await DP.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const text = a.file && typeof a.file.text === 'function' ? await a.file.text() : await readText(a.uri);
  if (!text) throw new Error('Couldn’t open that file');
  readShareHeader(text); // friendly error if it isn't a share file
  return { text, name: a.name ?? `share.${SHARE_EXT}`, uri: a.uri };
}

/** Only local files: a link like casedesk://share-import?file=https://… must never make the app fetch. */
export function isLocalShareUrl(u: string): boolean {
  return /^file:\/\//i.test(u) && !/\.\.(\/|$)/.test(decodeURI(u)) && decodeURI(u).toLowerCase().endsWith(`.${SHARE_EXT}`);
}

/** A file iOS handed to the app ("Open in Immigration Wallet", AirDrop). */
export async function readShareUrl(url: string): Promise<PickedShare> {
  if (!isLocalShareUrl(url)) throw new Error('That isn’t a share file');
  const text = await readText(url);
  if (!text || !isShareFile(text)) throw new Error('Couldn’t open that file');
  readShareHeader(text);
  return { text, name: decodeURIComponent(url.split('/').pop() ?? `share.${SHARE_EXT}`), uri: url };
}

/** The copy iOS put in Documents/Inbox (or the picker's cache copy): delete after import. */
export function forgetIncoming(uri?: string) {
  if (!uri || Platform.OS === 'web' || !/^file:/i.test(uri)) return;
  try { const fs = native.fileSystem(); const f = new fs.File(uri); if (f.exists) f.delete(); } catch {}
}

export { openShare };

/** Merge into this phone: by person, then by document (newer wins); nothing here is removed. */
export async function importShare(store: Store, p: SharePayload, meId: string | null): Promise<ShareReport> {
  const snap = await store.snapshot();
  const plan = planShareMerge(snap, p, { meId, newId });
  const stored = new Map<string, string | null>();
  for (const w of plan.writes) {
    const blob = p.files[w.key];
    stored.set(`${w.docId}#${w.index}`, blob ? await writeBase64(blob.name, blob.data, newId('f')) : null);
  }
  const docs = resolveWrites(plan, stored);
  await store.savePeople(plan.people);
  await store.saveDocs(docs);
  const s = await store.settings();
  await store.updateSettings({ setupDone: true, tutorialSeen: true, firstDocAt: s.firstDocAt ?? (docs.length ? new Date().toISOString() : undefined), icloudAsk: !s.icloud?.on });
  return plan.report;
}
