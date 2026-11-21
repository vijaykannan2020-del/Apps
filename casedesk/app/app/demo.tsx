// Loads the example family (Settings → Developer → Example family, or /demo in the web preview for
// review and store screenshots), or from the first screen. v3.0: on a phone that already has a family,
// a /demo link only works with developer tools on, so a stray link can never replace someone's family.
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { appStore, useFamily } from '../src/data/FamilyProvider';
import { loadDemo } from '../src/data/demo';
import { replace } from '../src/screens/common';
import { Spinner, useTheme } from '../src/ui';
export default function Demo() {
  const t = useTheme();
  const f = useFamily();
  useEffect(() => {
    if (!f.ready) return;
    // a phone with a family on it needs developer tools on; an empty phone (the first screen's
    // Look around with an example family, which App Review uses) can always load it
    if (Platform.OS !== 'web' && !f.settings.devTools && f.people.length > 0) { replace('/(tabs)'); return; }
    loadDemo(appStore()).then(() => replace('/(tabs)'));
  }, [f.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
}
