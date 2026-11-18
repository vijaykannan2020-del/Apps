// Small device services: open links in Safari, clipboard, haptics, Face ID. All guarded.
import { AppState, Linking, Platform } from 'react-native';
import { native } from './safe';

export async function openUrl(url: string) {
  const WB = native.webBrowser();
  try { if (WB?.openBrowserAsync) { await WB.openBrowserAsync(url); return; } } catch {}
  try { await Linking.openURL(url); } catch {}
}
/**
 * Open a page in Safari and resolve when the person is back in CaseDesk. With expo-web-browser this
 * is SFSafariViewController and the promise resolves when it is dismissed; otherwise the Safari app
 * opens and we wait for CaseDesk to become active again. Never call this while a sheet is opening —
 * open the sheet after it resolves (see README "Sheets and native screens").
 */
export async function openUrlAndWait(url: string): Promise<void> {
  if (Platform.OS === 'web') { try { (globalThis as any).open?.(url, '_blank'); } catch {} return; }
  const WB = native.webBrowser();
  try { if (WB?.openBrowserAsync) { await WB.openBrowserAsync(url, { dismissButtonStyle: 'done', readerMode: false }); return; } } catch {}
  await new Promise<void>((resolve) => {
    let left = false;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') left = true;
      else if (left) { sub.remove(); resolve(); }
    });
    Linking.openURL(url).catch(() => { sub.remove(); resolve(); });
    setTimeout(() => { sub.remove(); resolve(); }, 30 * 60_000);
  });
}

/** Is there something on the clipboard? (Doesn't trigger iOS's "Allow paste" prompt.) */
export async function clipboardHasText(): Promise<boolean | undefined> {
  const C = native.clipboard();
  try { if (C?.hasStringAsync) return await C.hasStringAsync(); } catch {}
  return undefined;
}
/** Read the clipboard (iOS may ask the person to allow paste). undefined = no clipboard in this build. */
export async function readClipboard(): Promise<string | undefined> {
  const C = native.clipboard();
  try { if (C?.getStringAsync) return (await C.getStringAsync()) ?? ''; } catch { return ''; }
  try { if (Platform.OS === 'web') return (await (globalThis as any).navigator?.clipboard?.readText()) ?? ''; } catch { return ''; }
  return undefined;
}
export const hasClipboard = () => !!native.clipboard()?.getStringAsync || Platform.OS === 'web';

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
