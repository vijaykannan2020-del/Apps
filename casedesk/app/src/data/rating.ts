// App Store rating prompt (launch, Nov 2026). Asks once, the iOS way, when the app has clearly been
// useful: 3+ documents saved and the app opened on 4+ different days. Builds made before the module
// was added (TestFlight build 10 and older) don't have it: the native module is checked first and the
// JS package is only loaded when it exists, so those builds simply never ask.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type Fam = {
  docs: unknown[];
  settings: { openDays?: string[]; ratingAskedAt?: string };
  actions: { updateSettings: (s: Record<string, unknown>) => Promise<unknown> | unknown };
};

export async function noteOpenAndMaybeAsk(f: Fam, today: string): Promise<void> {
  const days = f.settings.openDays ?? [];
  const next = days.includes(today) ? days : [...days, today].slice(-10);
  if (next !== days) await f.actions.updateSettings({ openDays: next });
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || f.settings.ratingAskedAt) return; // Android: Play in-app review
  if (f.docs.length < 3 || next.length < 4) return;
  if (!requireOptionalNativeModule('ExpoStoreReview')) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SR = require('expo-store-review') as { isAvailableAsync: () => Promise<boolean>; requestReview: () => Promise<void> };
    if (!(await SR.isAvailableAsync())) return;
    await f.actions.updateSettings({ ratingAskedAt: today });
    await SR.requestReview();
  } catch { /* never block the app over a rating prompt */ }
}
