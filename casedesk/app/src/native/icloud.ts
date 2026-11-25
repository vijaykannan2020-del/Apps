// iCloud Drive access for automatic backups (react-native-cloud-storage, app-private scope — the
// files live in CaseDesk's own iCloud container, like WhatsApp's chat backups). Every call is
// guarded: on a build without the native module, iCloudSupport() says why and nothing crashes.
import { Platform, TurboModuleRegistry } from 'react-native';
import { native } from './safe';
import { ICLOUD_DIR } from '../core/icloud';

export type Support = { ok: true } | { ok: false; reason: 'old-build' | 'not-ios' | 'signed-out' | 'connect-google' };

/** The native iCloud module is in this binary (TurboModuleRegistry.get never throws). */
export function hasICloudModule(): boolean {
  if (Platform.OS === 'android') return !!native.cloudStorage()?.CloudStorage && !!androidDrive.client();
  if (Platform.OS !== 'ios') return false;
  try { return !!TurboModuleRegistry.get('CloudStorageICloudDrive') && !!native.cloudStorage(); } catch { return false; }
}

// ---------- Android: the same backups in the app's private Google Drive folder (drive.appdata) ----------
// Signed in with Google (the app's Web client id); the access token is fetched before each request.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const androidDrive = {
  client(): string | null {
    try {
      const id = String(require('expo-constants').default?.expoConfig?.extra?.googleWebClientId || '').trim();
      if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) return null;
      if (!TurboModuleRegistry.get('RNGoogleSignin')) return null;
      return id;
    } catch { return null; }
  },
  gs(): any {
    const id = androidDrive.client(); if (!id) return undefined;
    try { const { GoogleSignin } = require('@react-native-google-signin/google-signin'); GoogleSignin.configure({ webClientId: id, scopes: [DRIVE_SCOPE] }); return GoogleSignin; } catch { return undefined; }
  },
  async token(): Promise<string | null> {
    const G = androidDrive.gs(); if (!G) return null;
    try {
      if (!G.getCurrentUser?.()) { const r = await G.signInSilently(); if (r?.type === 'noSavedCredentialFound') return null; }
      const u = G.getCurrentUser?.();
      if (u && !(u.scopes ?? []).includes(DRIVE_SCOPE)) return null;
      return (await G.getTokens()).accessToken ?? null;
    } catch { return null; }
  },
  /** Asks the person to pick a Google account and allow the app's private Drive folder. */
  async connect(): Promise<boolean> {
    const G = androidDrive.gs(); if (!G) return false;
    try {
      await G.hasPlayServices({ showPlayServicesUpdateDialog: true });
      let u = G.getCurrentUser?.();
      if (!u) { const r = await G.signIn(); if (r?.type === 'cancelled') return false; u = G.getCurrentUser?.(); }
      if (u && !(u.scopes ?? []).includes(DRIVE_SCOPE)) { const r = await G.addScopes({ scopes: [DRIVE_SCOPE] }); if (!r) return false; }
      return !!(await androidDrive.token());
    } catch { return false; }
  },
  async disconnect(): Promise<void> { try { await androidDrive.gs()?.revokeAccess?.(); } catch {} try { await androidDrive.gs()?.signOut?.(); } catch {} },
};

function api(): any {
  const M = native.cloudStorage();
  const CS = M?.CloudStorage;
  if (!CS) return undefined;
  const want = Platform.OS === 'android' ? M.CloudStorageProvider?.GoogleDrive : M.CloudStorageProvider?.ICloud;
  try { if (want && CS.getProvider?.() !== want) CS.setProvider(want); } catch {}
  if (Platform.OS === 'android') { try { CS.setProviderOptions({ accessToken: () => androidDrive.token(), timeout: 60000 }); } catch {} }
  return CS;
}
const scope = () => native.cloudStorage()?.CloudStorageScope?.AppData ?? 'app_data';

export async function iCloudSupport(): Promise<Support> {
  if (Platform.OS === 'android') {
    if (!hasICloudModule()) return { ok: false, reason: 'old-build' };
    return (await androidDrive.token()) ? { ok: true } : { ok: false, reason: 'connect-google' };
  }
  if (Platform.OS !== 'ios') return { ok: false, reason: 'not-ios' };
  if (!hasICloudModule()) return { ok: false, reason: 'old-build' };
  try { return (await api()?.isCloudAvailable?.()) ? { ok: true } : { ok: false, reason: 'signed-out' }; } catch { return { ok: false, reason: 'signed-out' }; }
}
export const supportText = (s: Support) => (s.ok ? '' : s.reason === 'connect-google' ? 'Tap to connect your Google account — backups go to a private app folder in your Google Drive'
  : s.reason === 'old-build' ? (Platform.OS === 'android' ? 'Google Drive backup is coming soon on Android' : 'Needs the latest app version from the App Store') : s.reason === 'not-ios' ? 'iCloud backup is for iPhone and iPad' : 'Sign in to iCloud in iOS Settings, and turn on iCloud Drive for Immigration Wallet');

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
  if (Platform.OS === 'ios') { try { await CS.triggerSync?.(path, scope()); } catch {} } // make sure it's on this phone (new phone: still in the cloud)
  return CS.readFile(path, scope());
}
export async function removeBackup(name: string): Promise<void> {
  const CS = api(); if (!CS) return;
  try { await CS.unlink(`${ICLOUD_DIR}/${name}`, scope()); } catch {}
}
