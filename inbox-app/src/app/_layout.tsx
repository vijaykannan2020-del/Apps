import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { restore } from '@/lib/matrix';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/components/Banner';
import { startPush } from '@/lib/push';
import { startCalls } from '@/lib/calls';
import { CallPill } from '@/components/CallPill';
import { S } from '@/lib/matrix';

export default function RootLayout() {
  const t = useTheme();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { restore().finally(() => { setLoaded(true); if (S.token) { startPush(); startCalls(); } }); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        {!loaded ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator /></View>
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'default', fullScreenGestureEnabled: true }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="info/[id]" />
          </Stack>
        )}
        {loaded && <Banner />}
        {loaded && <CallPill />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
