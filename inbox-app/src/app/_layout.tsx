import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { restore } from '@/lib/matrix';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const t = useTheme();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { restore().finally(() => setLoaded(true)); }, []);
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
            <Stack.Screen name="chats" options={{ animation: 'fade' }} />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="accounts" />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
