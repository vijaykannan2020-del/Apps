import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, SheetProvider, ThemeProvider, ToastProvider, useTheme } from '../src/ui';
import { FamilyProvider, useFamily } from '../src/data/FamilyProvider';
import { AppLock } from '../src/screens/lock';
import { native } from '../src/native/safe';
import { diag, startDiag } from '../src/native/diag';
startDiag().catch(() => {});

function Themed({ children }: { children: React.ReactNode }) {
  const f = useFamily();
  return <ThemeProvider choice={f.settings.theme ?? 'system'}>{children}</ThemeProvider>;
}

function Nav() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: Platform.OS === 'android' ? 'slide_from_right' : 'default', fullScreenGestureEnabled: true }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="flow/summary" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function Root() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Apply a new over-the-air bundle straight away if it downloads within a few seconds of opening.
    (async () => {
      try {
        const U = native.updates();
        if (__DEV__ || !U?.isEnabled) return;
        const started = Date.now();
        const r = await U.checkForUpdateAsync();
        if (!r.isAvailable) return;
        diag('update available, downloading');
        await U.fetchUpdateAsync();
        const quick = Date.now() - started < 12000;
        diag(quick ? 'update downloaded, reloading now' : 'update downloaded, applies next launch');
        if (quick) await U.reloadAsync();
      } catch (e: any) { diag(`update check failed: ${e?.message ?? e}`); }
    })();
    // Tapping a reminder opens that person's page.
    const N = native.notifications();
    if (!N?.addNotificationResponseReceivedListener) return;
    try {
      N.setNotificationHandler?.({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
      const open = (r: any) => { const url = r?.notification?.request?.content?.data?.url; if (url) router.push(url); };
      N.getLastNotificationResponseAsync?.().then(open).catch(() => {});
      const sub = N.addNotificationResponseReceivedListener(open);
      return () => sub.remove();
    } catch { return; }
  }, []);
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <FamilyProvider>
          <Themed>
            <ToastProvider>
              <AppLock>
                <SheetProvider>
                  <Nav />
                </SheetProvider>
              </AppLock>
            </ToastProvider>
          </Themed>
        </FamilyProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
