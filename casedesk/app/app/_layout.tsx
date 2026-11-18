import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { setupNotificationHandling, applyAlerts } from '../src/lib/alerts';
import { registerBackground } from '../src/lib/background';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function Root() {
  const t = useTheme();
  useEffect(() => {
    setupNotificationHandling();
    registerBackground();
    applyAlerts(); // refresh reminders on every launch
    import('../src/lib/pd').then((m) => m.checkPriorityDate(true)).catch(() => {});
    if (Platform.OS === 'web') return;
    const N = require('expo-notifications');
    const open = (r: any) => { const url = r?.notification?.request?.content?.data?.url; if (url) router.push(url); };
    N.getLastNotificationResponseAsync?.().then(open).catch(() => {});
    const sub = N.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="case/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="status/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tools/i9-record" options={{ presentation: 'modal' }} />
        <Stack.Screen name="alerts" />
      </Stack>
    </SafeAreaProvider>
  );
}
