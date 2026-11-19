// react-native-webview, guarded. It is in package.json since 17 Nov 2026 and autolinked into native
// builds made after that; an OTA bundle on an older binary must not crash, so the module is checked
// (TurboModule RNCWebViewModule) before the JS is required. Web preview: not available (the screens
// show the Safari and paste fallbacks instead).
import { Platform, TurboModuleRegistry } from 'react-native';

let cached: any | null | undefined;
export function webViewModule(): any | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === 'web') return cached;
  try {
    const tm = (TurboModuleRegistry as any)?.get?.('RNCWebViewModule');
    if (!tm) return cached;
    const mod = require('react-native-webview');
    cached = mod?.WebView ?? mod?.default ?? null;
  } catch { cached = null; }
  return cached;
}
export const webViewAvailable = () => !!webViewModule();
