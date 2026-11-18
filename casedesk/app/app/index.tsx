// First launch → Welcome → About you → Home. Afterwards straight to Home.
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useFamily } from '../src/data/FamilyProvider';
import { Spinner, useTheme } from '../src/ui';
export default function Start() {
  const { ready, settings, people } = useFamily();
  const t = useTheme();
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  return <Redirect href={settings.setupDone && people.length ? '/(tabs)' : '/welcome'} />;
}
