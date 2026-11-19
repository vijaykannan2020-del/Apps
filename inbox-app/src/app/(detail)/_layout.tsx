// The right-hand column: chat, chat info, media, Accounts and calls, with normal back navigation between them.
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout, getSidebarRight, flushShow } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

// Keeps the right-hand column's content clear of the floating list panel when they're side by side.
function ClearOfSidebar({ children }: { children: React.ReactNode }) {
  const ins = useSafeAreaInsets(); const { single: collapsed } = useLayout();
  const ref = useRef<any>(null); const [x, setX] = useState(0);
  const measure = () => ref.current?.measureInWindow((px: number) => setX(px));
  const overlap = collapsed ? 0 : Math.max(0, getSidebarRight() - x);
  const left = Math.max(ins.left, overlap);
  return (
    <View ref={ref} onLayout={measure} style={{ flex: 1 }}>
      <View style={{ flex: 1, marginLeft: left, marginRight: collapsed ? 0 : ins.right }}>{children}</View>
    </View>
  );
}

export default function DetailLayout() {
  return <SafeAreaProvider><ClearOfSidebar><DetailStack /></ClearOfSidebar></SafeAreaProvider>;
}

function DetailStack() {
  const t = useTheme(); const { wideSingle } = useLayout();
  const anim = wideSingle ? 'default' : 'none'; // upright Duo: normal push/back like any iPhone app
  // Chat and Accounts: no stack swipe-back — on one-column screens Apple's split view does the swipe back to the list
  // itself (our stack doing it too made the empty right-hand page flash); side by side there's nothing to go back to.
  return (
    <Stack screenListeners={({ route }: any) => ({ focus: () => { if (route.name !== 'index') flushShow(); } })} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'default' }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: anim, gestureEnabled: false, headerTransparent: true, title: '', headerBackVisible: false, headerShadowVisible: false }} />
      <Stack.Screen name="info/[id]" />
      <Stack.Screen name="media/[id]" />
      <Stack.Screen name="accounts" options={{ animation: anim, gestureEnabled: wideSingle }} />
      <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
