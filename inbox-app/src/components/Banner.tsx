// In-app banner when a message arrives in another chat (works in Expo Go; real push needs the full app).
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, StyleSheet, PanResponder } from 'react-native';
import { router, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, Banner as B } from '@/lib/matrix';
import { useTheme, useStore } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';

export function Banner() {
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const path = usePathname();
  const [cur, setCur] = useState<B | null>(null);
  const y = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = () => Animated.timing(y, { toValue: -160, duration: 200, useNativeDriver: true }).start(() => setCur(null));
  useEffect(() => {
    const b = S.banner; if (!b || (cur && b.at === cur.at)) return;
    S.banner = null;
    if (path === '/login') return;
    setCur(b); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, 4000);
  }, [v]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderMove: (_, g) => { if (g.dy < 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => { if (g.dy < -30) hide(); else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(); },
  })).current;
  if (!cur) return null;
  const r = S.rooms.get(cur.room);
  return (
    <Animated.View {...pan.panHandlers} style={[styles.wrap, { top: ins.top + 6, transform: [{ translateY: y }] }]} pointerEvents="box-none">
      <Pressable onPress={() => { hide(); router.push({ pathname: '/chat/[id]', params: { id: cur.room } }); }} style={{ borderRadius: 22, overflow: 'hidden', maxWidth: 560, width: '100%' }}>
        <BlurView intensity={t.dark ? 50 : 70} tint={t.dark ? 'dark' : 'light'} style={[styles.card, { borderColor: t.line }]}>
          {r && <Avatar room={r} size={40} />}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{cur.title}</Text>
            <Text numberOfLines={2} style={{ color: t.ink, opacity: 0.8, fontSize: 14 }}>{cur.body}</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, alignItems: 'center', zIndex: 100 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22 },
});
