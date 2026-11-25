// Writes the widget snapshot to the shared App Group and asks WidgetKit to reload (v2.5).
// Uses @bacons/apple-targets' ExtensionStorage native module. Guarded: on builds without the module
// (every TestFlight build before v2.5, Android, web) widgetsAvailable() is false and nothing is written.
import { Platform } from 'react-native';
import { WIDGET_GROUP, WIDGET_KEY, type WidgetSnapshot } from '../core/widgets';

function nativeStorage(): any {
  if (Platform.OS !== 'ios') return undefined;
  try { return (globalThis as any).expo?.modules?.ExtensionStorage; } catch { return undefined; }
}

// Android: react-native-android-widget (the snapshot goes to AsyncStorage; the widget task reads it).
function androidWidgets(): any {
  if (Platform.OS !== 'android') return undefined;
  try { if (!require('react-native').TurboModuleRegistry?.get?.('AndroidWidget')) return undefined; } catch { return undefined; }
  try { return require('react-native-android-widget'); } catch { return undefined; }
}
function writeAndroid(snap: WidgetSnapshot | null): boolean {
  const W = androidWidgets();
  if (!W?.requestWidgetUpdate) return false;
  try {
    const AS = require('@react-native-async-storage/async-storage').default;
    const { ANDROID_WIDGET, ANDROID_WIDGET_KEY } = require('../widgets/androidTask');
    const { AndroidFamilyWidget } = require('../widgets/AndroidFamilyWidget');
    const React = require('react');
    (snap ? AS.setItem(ANDROID_WIDGET_KEY, JSON.stringify(snap)) : AS.removeItem(ANDROID_WIDGET_KEY))
      .then(() => W.requestWidgetUpdate({ widgetName: ANDROID_WIDGET, renderWidget: () => React.createElement(AndroidFamilyWidget, { snap }), widgetNotFound: () => {} }))
      .catch(() => {});
    return true;
  } catch { return false; }
}

/** The widget extension's storage module is in this binary. */
export function widgetsAvailable(): boolean {
  if (Platform.OS === 'android') return !!androidWidgets();
  const M = nativeStorage();
  return !!M && typeof M.setString === 'function';
}

/** Write the snapshot as one JSON string (Snapshot.swift decodes it) and reload every widget timeline. */
export function writeWidgetSnapshot(snap: WidgetSnapshot): boolean {
  if (Platform.OS === 'android') return writeAndroid(snap);
  const M = nativeStorage();
  if (!M || typeof M.setString !== 'function') return false;
  try {
    M.setString(WIDGET_KEY, JSON.stringify(snap), WIDGET_GROUP);
    try { M.reloadWidget?.(null); } catch { try { M.reloadWidget?.(); } catch {} }
    return true;
  } catch { return false; }
}

/** Remove the snapshot (e.g. after "Delete all data"). */
export function clearWidgetSnapshot(): void {
  if (Platform.OS === 'android') { writeAndroid(null); return; }
  const M = nativeStorage();
  try { M?.remove?.(WIDGET_KEY, WIDGET_GROUP); M?.reloadWidget?.(null); } catch {}
}
