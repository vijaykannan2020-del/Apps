// iCloud automatic backup (v2.2, WhatsApp-style): the same password-protected .casedesk file as
// "Back up now", written to CaseDesk's private iCloud container daily and a little after changes,
// keeping the newest 3. The password lives in the iOS keychain (expo-secure-store); without it,
// backups to iCloud ask for the password each time and nothing runs automatically.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { encryptBackup, type Progress } from '../core/backup';
import { backupDueNow, backupName, ICLOUD_DEFAULT, sortBackups, toPrune, backupTime, type ICloudSettings } from '../core/icloud';
import type { Store } from './store';
import { buildPayload } from './backupIO';
import { hasICloudModule, iCloudSupport, listBackups, readBackup, removeBackup, writeBackup } from '../native/icloud';
import { hasKeychain, loadPassword } from '../native/secret';
import { onWifi } from '../native/net';
import { diag } from '../native/diag';

export const icloudSettings = (s: { icloud?: Partial<ICloudSettings> }): ICloudSettings => ({ ...ICLOUD_DEFAULT, ...(s.icloud ?? {}) });

let running = false;
let dirtyAt: string | undefined; // data changed since the last iCloud backup (this session)
let lastPrint = '';

/** Back up to iCloud now. `auto` = the scheduler; a manual Back up now resets the back-off. */
export async function backUpToICloud(store: Store, password?: string, onProgress?: Progress, auto = false): Promise<{ ok: boolean; error?: string; name?: string }> {
  if (running) return { ok: false, error: 'A backup is already running' };
  running = true;
  try {
    const sup = await iCloudSupport();
    if (!sup.ok) throw new Error(sup.reason === 'old-build' ? 'Needs the latest app version from TestFlight' : 'iCloud isn’t available — sign in to iCloud and turn on iCloud Drive');
    const pw = password ?? (await loadPassword());
    if (!pw) throw new Error('Type your backup password to back up to iCloud');
    const { payload } = await buildPayload(store);
    const text = await encryptBackup(JSON.stringify(payload), pw, onProgress);
    const name = backupName(new Date());
    await writeBackup(name, text);
    for (const old of toPrune(await listBackups())) await removeBackup(old);
    const s = await store.settings();
    await store.updateSettings({ icloud: { ...icloudSettings(s), lastAt: new Date().toISOString(), lastError: undefined, failures: 0, lastAttemptAt: undefined } });
    dirtyAt = undefined;
    diag(`iCloud backup ok (${name})`);
    return { ok: true, name };
  } catch (e: any) {
    const error = e?.message ?? String(e);
    try {
      const s = icloudSettings(await store.settings());
      await store.updateSettings({ icloud: { ...s, lastError: error, lastAttemptAt: new Date().toISOString(), failures: auto ? (s.failures ?? 0) + 1 : 1 } });
    } catch {}
    diag(`iCloud backup failed: ${error}`);
    return { ok: false, error };
  } finally { running = false; }
}

export type ICloudFile = { name: string; at?: string };
export async function iCloudBackups(): Promise<ICloudFile[]> {
  return sortBackups(await listBackups()).map((name) => ({ name, at: backupTime(name) }));
}
export const readICloudBackup = (name: string) => readBackup(name);

/** Fingerprint of the data (not settings) so our own "last backup" write doesn't count as a change. */
async function fingerprint(store: Store) {
  const [p, d, c] = await Promise.all([store.people(), store.docs(), store.cases()]);
  const s = JSON.stringify([p, d, c]);
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/** Runs automatic iCloud backups while the app is open: on launch / return, every minute, after changes. */
export function useICloudAuto(store: Store) {
  useEffect(() => {
    if (!hasICloudModule() || !hasKeychain()) return; // older build: nothing to schedule
    let alive = true;
    const check = async () => {
      if (!alive || running) return;
      const s = icloudSettings(await store.settings());
      if (!s.on) return;
      const due = backupDueNow({ ...s, changedAt: dirtyAt }, new Date(), { wifi: s.wifiOnly ? await onWifi() : undefined });
      if (due) await backUpToICloud(store, undefined, undefined, true);
    };
    fingerprint(store).then((f) => { lastPrint = f; }).catch(() => {});
    const unsub = store.subscribe(() => { fingerprint(store).then((f) => { if (lastPrint && f !== lastPrint) dirtyAt = new Date().toISOString(); lastPrint = f; }).catch(() => {}); });
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    const first = setTimeout(check, 8_000); // after launch settles
    return () => { alive = false; unsub(); clearInterval(timer); clearTimeout(first); sub.remove(); };
  }, [store]);
}
