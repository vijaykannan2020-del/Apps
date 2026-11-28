// Backup & Restore (Profile → Data). One password-protected .casedesk file with every person,
// document (including the images / PDFs kept in the app) and case. Saved through the share sheet so
// the user picks Files, iCloud Drive, Google Drive or AirDrop. Nothing is sent anywhere by the app.
import { Platform } from 'react-native';
import type { Case, Document, Person, Settings } from '../core/model';
import { DEFAULT_SETTINGS } from '../core/model';
import { BACKUP_PICKER_TYPES, backupFileName, decryptBackup, encryptBackup, readHeader, type BackupPayload, type Progress } from '../core/backup';
import { SCHEMA, newId, type Store } from './store';
import { migrateFile } from '../core/files';
import { matchPeople } from '../core/merge';
import { deleteFile, fileUri, readBase64, readText, share, writeBase64, writeCacheText } from '../native/files';
import { native } from '../native/safe';
import { forgetPassword } from '../native/secret';

export type BackupResult = { uri?: string; shared: boolean; files: number; missingFiles: number };

export async function buildPayload(store: Store): Promise<{ payload: BackupPayload; missing: number }> {
  const snap = await store.snapshot();
  const files: BackupPayload['files'] = {};
  let missing = 0;
  for (const d of snap.docs) for (const [i, f] of (d.files ?? []).entries()) {
    const key = `${d.id}#${i}`;
    const data = Platform.OS === 'web' ? null : await readBase64(fileUri(f));
    if (data) files[key] = { name: f.name, mime: f.mime, data }; else missing++;
  }
  const { faceId: _f, icloud: _i, icloudAsk: _a, ...settings } = snap.settings; // device settings stay on the device
  return { payload: { app: 'casedesk', schema: SCHEMA, exportedAt: new Date().toISOString(), people: snap.people, docs: snap.docs, cases: snap.cases, settings, files }, missing };
}

export async function backUpNow(store: Store, password: string, onProgress?: Progress): Promise<BackupResult> {
  const { payload, missing } = await buildPayload(store);
  const text = await encryptBackup(JSON.stringify(payload), password, onProgress);
  const d = new Date();
  const name = backupFileName(d);
  const uri = await writeCacheText(name, text);
  let shared = false;
  if (uri) shared = await share(uri, 'application/octet-stream', 'Save your Immigration Wallet backup');
  // The share sheet doesn't say whether the file was saved: the screen asks, then calls markBackedUp().
  return { uri: uri ?? undefined, shared, files: Object.keys(payload.files).length, missingFiles: missing };
}
export async function markBackedUp(store: Store) {
  await store.updateSettings({ lastBackupAt: new Date().toISOString(), backupReminderSnoozed: undefined });
}

export async function pickBackupFile(): Promise<{ text: string; name: string } | null> {
  const DP = native.documentPicker();
  if (!DP?.getDocumentAsync) throw new Error('Files aren’t available in this build.');
    // Only backup files where the picker can filter: the web preview by extension. iOS and Android
  // can't filter an extension the installed build hasn't declared, so they list all files and a
  // wrong one gets a friendly error below.
  const r = await DP.getDocumentAsync({ type: BACKUP_PICKER_TYPES[Platform.OS === 'web' ? 'web' : 'native'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const text = a.file && typeof a.file.text === 'function' ? await a.file.text() : await readText(a.uri);
  if (!text) throw new Error('Couldn’t open that file');
  readHeader(text); // throws a friendly error if it isn't an Immigration Wallet backup
  return { text, name: a.name ?? 'Immigration Wallet backup' };
}

export type RestorePreview = { payload: BackupPayload; people: number; docs: number; files: number; cases: number; exportedAt: string };

export async function openBackup(text: string, password: string, onProgress?: Progress): Promise<RestorePreview> {
  const json = await decryptBackup(text, password, onProgress);
  const payload = JSON.parse(json) as BackupPayload;
  if (payload.app !== 'casedesk') throw new Error('This isn’t an Immigration Wallet backup file');
  if (payload.schema > SCHEMA) throw new Error('This backup was made by a newer Immigration Wallet — update the app first');
  return { payload, people: payload.people.length, docs: payload.docs.length, files: Object.keys(payload.files).length, cases: payload.cases.length, exportedAt: payload.exportedAt };
}

export type MergeReport = { added: { people: string[]; docs: number; cases: number }; skipped: { people: string[]; docs: number; cases: number }; renamed: string[] };

/** Replace everything, or merge (add what isn't on this phone and say exactly what was added / skipped). */
export async function restore(store: Store, p: BackupPayload, mode: 'replace' | 'merge'): Promise<MergeReport> {
  const docsIn = p.docs as Document[];
  // iCloud backup, Face ID, the notification question and the server alert sign-up belong to the phone,
  // never to the backup (older backups may carry them). A restored "already asked about alerts" stopped a
  // new phone from ever asking, so iOS had no Notifications switch for the app at all.
  const { icloud: _ic, icloudAsk: _ask, faceId: _fid, notifAskedAt: _na, bulletinPush: _bp, ...fromBackup } = (p.settings ?? {}) as Settings;
  const peopleIn = p.people as Person[], casesIn = p.cases as Case[], settingsIn = { ...DEFAULT_SETTINGS, ...fromBackup };
  const snap = await store.snapshot();
  const report: MergeReport = { added: { people: [], docs: 0, cases: 0 }, skipped: { people: [], docs: 0, cases: 0 }, renamed: [] };

  // Merge: a person is "already here" when matchPeople finds them (same id and name/passport, then
  // passport number, then legal name + date of birth, then name). The backup's own profile is never
  // dropped: if "you" here is someone else, the backup's "you" is added as a family member.
  const idMap = new Map<string, string>();
  const peopleAdd: Person[] = [];
  if (mode === 'merge') {
    const found = matchPeople(peopleIn, docsIn, snap.people, snap.docs);
    for (const x of peopleIn) {
      const m = found.get(x.id);
      if (m) { report.skipped.people.push(x.name); idMap.set(x.id, m.id); continue; }
      const id = snap.people.some((y) => y.id === x.id) ? newId('p') : x.id;
      idMap.set(x.id, id);
      const selfClash = x.relation === 'self' && snap.people.some((y) => y.relation === 'self');
      if (id !== x.id || selfClash) report.renamed.push(x.name);
      peopleAdd.push({ ...x, id, relation: selfClash ? 'other' : x.relation, isMain: selfClash ? false : x.isMain });
      report.added.people.push(x.name);
    }
  } else for (const x of peopleIn) idMap.set(x.id, x.id);

  // documents: write the files back (only for documents that are added) with fresh paths
  const docsAdd: Document[] = [];
  for (const d of docsIn) {
    const owner = idMap.get(d.ownerId) ?? d.ownerId;
    const dup = mode === 'merge' && (snap.docs.some((y) => y.id === d.id) || snap.docs.some((y) => y.ownerId === owner && y.type === d.type && JSON.stringify(y.fields) === JSON.stringify(d.fields)));
    if (dup) { report.skipped.docs++; continue; }
    const files: NonNullable<Document['files']> = [];
    for (const [i, f] of (d.files ?? []).entries()) {
      const blob = p.files[`${d.id}#${i}`];
      if (!blob) continue;
      const stored = await writeBase64(blob.name, blob.data, newId('f'));
      if (stored) files.push({ ...migrateFile(f), file: stored });
    }
    docsAdd.push({ ...d, id: mode === 'merge' && snap.docs.some((y) => y.id === d.id) ? newId('doc') : d.id, ownerId: owner, files });
    report.added.docs++;
  }
  const casesAdd: Case[] = [];
  for (const c of casesIn) {
    if (mode === 'merge' && snap.cases.some((y) => y.id === c.id || (y.receipt === c.receipt && y.ownerId === (idMap.get(c.ownerId) ?? c.ownerId)))) { report.skipped.cases++; continue; }
    casesAdd.push({ ...c, ownerId: idMap.get(c.ownerId) ?? c.ownerId });
    report.added.cases++;
  }

  if (mode === 'replace') {
    for (const d of snap.docs) for (const f of d.files ?? []) deleteFile(f);
    await store.savePeople(peopleIn); await store.saveDocs(docsAdd); await store.saveCases(casesAdd);
    // After a restore iCloud backup is off on this phone until the person turns it on here (Home asks).
    const here = await store.settings();
    await store.saveSettings({ ...here, ...settingsIn, setupDone: true, tutorialSeen: true, icloud: here.icloud ? { ...here.icloud, on: false, lastAt: undefined, lastError: undefined, failures: 0, lastAttemptAt: undefined } : undefined, icloudAsk: true });
    await forgetPassword(); // this phone's iCloud password is set again when it's turned on here
    report.added.people = peopleIn.map((x) => x.name);
  } else {
    await store.savePeople([...snap.people, ...peopleAdd]);
    await store.saveDocs([...snap.docs, ...docsAdd]);
    await store.saveCases([...snap.cases, ...casesAdd]);
    // Merge copies no settings; this phone's own iCloud backup stays as it was (asked if it's off).
    const here = await store.settings();
    await store.updateSettings({ setupDone: true, tutorialSeen: true, icloudAsk: !here.icloud?.on });
  }
  return report;
}

/** Home reminder: documents saved, and no backup in the last 30 days (or ever, 30 days after the first document). */
export function backupDue(s: Settings, docCount: number, now = new Date()): boolean {
  if (!docCount) return false;
  if (s.backupReminderSnoozed && s.backupReminderSnoozed > now.toISOString()) return false;
  const last = [s.lastBackupAt, s.icloud?.on ? s.icloud.lastAt : undefined].filter(Boolean).sort().pop(); // iCloud backups count too
  const since = last ?? s.firstDocAt;
  if (!since) return false;
  return now.getTime() - new Date(since).getTime() > 30 * 864e5;
}
