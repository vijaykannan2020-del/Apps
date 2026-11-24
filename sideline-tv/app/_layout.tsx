import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C } from '../src/theme';

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="setup" />
        <Stack.Screen name="series" />
        <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
      </Stack>
    </>
  );
}
