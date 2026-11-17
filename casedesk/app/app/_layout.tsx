import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function Root() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="case/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tools/i9-record" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
