// iCloud Drive access for automatic backups (react-native-cloud-storage, app-private scope — the
// files live in CaseDesk's own iCloud container, like WhatsApp's chat backups). Every call is
// guarded: on a build without the native module, iCloudSupport() says why and nothing crashes.
import { Platform, TurboModuleRegistry } from 'react-native';
import { native } from './safe';
import { ICLOUD_DIR } from '../core/icloud';

export type Support = { ok: true } | { ok: false; reason: 'old-build' | 'not-ios' | 'signed-out' };

/** The native iCloud module is in this binary (TurboModuleRegistry.get never throws). */
export function hasICloudModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  try { return !!TurboModuleRegistry.get('CloudStorageICloudDrive') && !!native.cloudStorage(); } catch { return false; }
}

function api(): any {
  const M = native.cloudStorage();
  const CS = M?.CloudStorage;
  if (!CS) return undefined;
  try { if (M.CloudStorageProvider?.ICloud && CS.getProvider?.() !== M.CloudStorageProvider.ICloud) CS.setProvider(M.CloudStorageProvider.ICloud); } catch {}
  return CS;
}
const scope = () => native.cloudStorage()?.CloudStorageScope?.AppData ?? 'app_data';

export async function iCloudSupport(): Promise<Support> {
  if (Platform.OS !== 'ios') return { ok: false, reason: 'not-ios' };
  if (!hasICloudModule()) return { ok: false, reason: 'old-build' };
  try { return (await api()?.isCloudAvailable?.()) ? { ok: true } : { ok: false, reason: 'signed-out' }; } catch { return { ok: false, reason: 'signed-out' }; }
}
export const supportText = (s: Support) => (s.ok ? '' : s.reason === 'old-build' ? 'Needs the latest app version from TestFlight' : s.reason === 'not-ios' ? 'iCloud backup is for iPhone and iPad' : 'Sign in to iCloud in iOS Settings, and turn on iCloud Drive for Immigration Wallet');

async function ensureDir() {
  const CS = api();
  try { if (!(await CS.exists(ICLOUD_DIR, scope()))) await CS.mkdir(ICLOUD_DIR, scope()); } catch {}
}
export async function listBackups(): Promise<string[]> {
  const CS = api(); if (!CS) return [];
  await ensureDir();
  try { return await CS.readdir(ICLOUD_DIR, scope()); } catch { return []; }
}
export async function writeBackup(name: string, text: string): Promise<void> {
  const CS = api(); if (!CS) throw new Error('iCloud isn’t available in this version');
  await ensureDir();
  await CS.writeFile(`${ICLOUD_DIR}/${name}`, text, scope());
}
export async function readBackup(name: string): Promise<string> {
  const CS = api(); if (!CS) throw new Error('iCloud isn’t available in this version');
  const path = `${ICLOUD_DIR}/${name}`;
  try { await CS.triggerSync?.(path, scope()); } catch {} // make sure it's on this phone (new phone: still in the cloud)
  return CS.readFile(path, scope());
}
export async function removeBackup(name: string): Promise<void> {
  const CS = api(); if (!CS) return;
  try { await CS.unlink(`${ICLOUD_DIR}/${name}`, scope()); } catch {}
}
