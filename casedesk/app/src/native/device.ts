// Small device services: open links in Safari, clipboard, haptics, Face ID. All guarded.
import { Linking, Platform } from 'react-native';
import { native } from './safe';

export async function openUrl(url: string) {
  const WB = native.webBrowser();
  try { if (WB?.openBrowserAsync) { await WB.openBrowserAsync(url); return; } } catch {}
  try { await Linking.openURL(url); } catch {}
}
export async function copy(text: string) {
  const C = native.clipboard();
  try { if (C?.setStringAsync) { await C.setStringAsync(text); return true; } } catch {}
  try { if (Platform.OS === 'web') { await (globalThis as any).navigator?.clipboard?.writeText(text); return true; } } catch {}
  return false;
}
export function tap() { try { native.haptics()?.selectionAsync?.(); } catch {} }
export function success() { try { const H = native.haptics(); H?.notificationAsync?.(H.NotificationFeedbackType?.Success); } catch {} }

export async function canUseBiometrics() {
  const LA = native.localAuth();
  try { return !!LA && (await LA.hasHardwareAsync()) && (await LA.isEnrolledAsync()); } catch { return false; }
}
export async function authenticate(reason = 'Unlock CaseDesk'): Promise<boolean> {
  const LA = native.localAuth();
  if (!LA?.authenticateAsync) return true; // no module: never lock the user out
  try { const r = await LA.authenticateAsync({ promptMessage: reason, fallbackLabel: 'Use passcode' }); return !!r.success; } catch { return false; }
}
