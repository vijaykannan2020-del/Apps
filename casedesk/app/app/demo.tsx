// Loads the example family (Settings → Developer → Example family, or /demo in the web preview for
// review and store screenshots). v3.0: on a phone a /demo link only works with developer tools on,
// so a stray link can never replace someone's real family.
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
    if (Platform.OS !== 'web' && !f.settings.devTools) { replace('/(tabs)'); return; }
    loadDemo(appStore()).then(() => replace('/(tabs)'));
  }, [f.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
}
