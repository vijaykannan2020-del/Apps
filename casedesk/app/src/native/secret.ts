// The iCloud backup password, kept in the iOS keychain (expo-secure-store, this device only, not
// synced). Without the module (older build) nothing is stored and the password is asked each time.
import { native } from './safe';

const KEY = 'cd2.icloudBackupPassword';
export const hasKeychain = () => { const S = native.secureStore(); return !!S?.setItemAsync && !!S?.getItemAsync; };
export async function savePassword(pw: string): Promise<boolean> {
  const S = native.secureStore();
  try { await S.setItemAsync(KEY, pw, { keychainAccessible: S.WHEN_UNLOCKED_THIS_DEVICE_ONLY ?? S.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }); return true; } catch { return false; }
}
export async function loadPassword(): Promise<string | null> {
  const S = native.secureStore();
  try { return (await S?.getItemAsync?.(KEY)) ?? null; } catch { return null; }
}
export async function forgetPassword() { const S = native.secureStore(); try { await S?.deleteItemAsync?.(KEY); } catch {} }
