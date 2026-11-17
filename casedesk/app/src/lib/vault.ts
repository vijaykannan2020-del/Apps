// Document vault — files stay on this phone only (app's private Documents folder). Nothing is uploaded.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Directory, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';

export const DOC_TYPES = ['Receipt (I-797C)', 'Approval (I-797A/B)', 'I-94', 'Visa stamp', 'Passport', 'EAD card', 'LCA', 'Green card', 'Pay stub / W-2', 'Other'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type VaultDoc = {
  id: string;
  title: string;
  type: DocType;
  expires?: string;
  receipt?: string;
  fileName: string;
  mime: string;
  size: number;
  uri: string; // native file uri, or "web:<id>" for the browser preview
  added: string;
};

const KEY = 'cd.vault.v1';
const LOCK = 'cd.vault.lock';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function list(): Promise<VaultDoc[]> {
  try { const r = await AsyncStorage.getItem(KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
async function write(docs: VaultDoc[]) { try { await AsyncStorage.setItem(KEY, JSON.stringify(docs)); } catch {} emit(); }

export function useVault(): [VaultDoc[], boolean] {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [ready, setReady] = useState(false);
  const load = useCallback(() => { list().then((d) => { setDocs(d); setReady(true); }); }, []);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  return [docs, ready];
}

const vaultDir = () => {
  const dir = new Directory(Paths.document, 'vault');
  if (!dir.exists) (dir as any).create();
  return dir;
};

export async function pickFile(): Promise<{ name: string; mime: string; size: number; uri: string; webFile?: Blob } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0] as any;
  return { name: a.name, mime: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0, uri: a.uri, webFile: a.file };
}

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); });

export async function addDoc(meta: Omit<VaultDoc, 'id' | 'uri' | 'added'>, picked: { uri: string; webFile?: Blob }) {
  const id = String(Date.now());
  let uri: string;
  if (Platform.OS === 'web') {
    if (meta.size > 3_000_000) throw new Error('In the web preview, files must be under 3 MB. The phone app has no such limit.');
    const data = picked.webFile ? await toDataUrl(picked.webFile) : picked.uri;
    await AsyncStorage.setItem(`cd.vaultfile.${id}`, data);
    uri = `web:${id}`;
  } else {
    const safe = meta.fileName.replace(/[^\w.\-]+/g, '_');
    const dest = new File(vaultDir(), `${id}-${safe}`);
    (new File(picked.uri) as any).copy(dest);
    uri = dest.uri;
  }
  const docs = await list();
  await write([{ ...meta, id, uri, added: new Date().toISOString().slice(0, 10) }, ...docs]);
}

export async function updateDoc(doc: VaultDoc) {
  const docs = await list();
  await write(docs.map((d) => (d.id === doc.id ? doc : d)));
}

export async function deleteDoc(doc: VaultDoc) {
  try {
    if (doc.uri.startsWith('web:')) await AsyncStorage.removeItem(`cd.vaultfile.${doc.id}`);
    else { const f = new File(doc.uri); if (f.exists) (f as any).delete(); }
  } catch {}
  const docs = await list();
  await write(docs.filter((d) => d.id !== doc.id));
}

export async function webData(doc: VaultDoc) {
  return AsyncStorage.getItem(`cd.vaultfile.${doc.id}`);
}

// Open with iOS Quick Look / Android viewer; falls back to the share sheet.
export async function openDoc(doc: VaultDoc) {
  const f = new File(doc.uri) as any;
  try { if (typeof f.preview === 'function') { await f.preview(); return; } } catch {}
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(doc.uri, { mimeType: doc.mime, dialogTitle: doc.title });
}

export async function shareDoc(doc: VaultDoc) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(doc.uri, { mimeType: doc.mime, dialogTitle: doc.title });
}

export const getLock = async () => (await AsyncStorage.getItem(LOCK).catch(() => null)) === '1';
export const setLock = (on: boolean) => AsyncStorage.setItem(LOCK, on ? '1' : '0').catch(() => {});
