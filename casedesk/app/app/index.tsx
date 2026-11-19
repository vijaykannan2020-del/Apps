// First launch → onboarding (Welcome, then one question per screen). Afterwards straight to Home.
// Finish later also opens Home (Continue setup card there). Rule: core/onboarding startRoute.
import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useFamily } from '../src/data/FamilyProvider';
import { startRoute } from '../src/core/onboarding';
import { Spinner, useTheme } from '../src/ui';
export default function Start() {
  const { ready, settings, people, actions } = useFamily();
  const t = useTheme();
  // A Run setup again that was closed with the app: setup is done, so drop the leftover progress.
  const stale = ready && !!settings.setupDone && !!settings.setup;
  useEffect(() => { if (stale) actions.updateSettings({ setup: undefined }).catch(() => {}); }, [stale, actions]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  const to = startRoute(settings, people.length) === 'home' ? '/(tabs)' : '/welcome';
  try { require('../src/native/diag').diag(`open → ${to === '/welcome' ? `Setup (${settings.setup?.step ?? 'start'})` : 'Home'} (people ${people.length}, setupDone ${!!settings.setupDone})`); } catch {}
  return <Redirect href={to} />;
}
