// Loads the example family (Profile → Help → Example family, or /demo in the web preview for review).
import { useEffect } from 'react';
import { View } from 'react-native';
import { appStore } from '../src/data/FamilyProvider';
import { loadDemo } from '../src/data/demo';
import { replace } from '../src/screens/common';
import { Spinner, useTheme } from '../src/ui';
export default function Demo() {
  const t = useTheme();
  useEffect(() => { loadDemo(appStore()).then(() => replace('/(tabs)')); }, []);
  return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
}
