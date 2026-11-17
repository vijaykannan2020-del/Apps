// The right-hand column: chat, chat info, media, Accounts and calls, with normal back navigation between them.
import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function DetailLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'default' }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: 'none', gestureResponseDistance: { start: 30 } as any }} />
      <Stack.Screen name="info/[id]" />
      <Stack.Screen name="media/[id]" />
      <Stack.Screen name="accounts" options={{ animation: 'none' }} />
      <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
