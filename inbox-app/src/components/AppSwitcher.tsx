import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Glass } from '@/components/Glass';
import { useTheme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const APPS = [['all', '/inbox'], ['whatsapp', '/whatsapp'], ['instagram', '/instagram'], ['messenger', '/messenger'], ['accounts', '/accounts']] as const;
export type Key = typeof APPS[number][0];
const PAD = 5;

/** Floating glass bar of app logos at the bottom, within thumb reach. Like iOS's own tab bar: tap an icon, or press and
 *  slide across — a lifted glass lens follows your finger, magnifies the icon under it and selects it when you let go. */
export const SWITCHER_SPACE = 76;
export function AppSwitcher({ current, counts = {}, onSelect }: { current: Key; counts?: Record<string, number>; onSelect?: (k: Key) => void }) {
  const t = useTheme(); const ins = useSafeAreaInsets();
  const cur = Math.max(0, APPS.findIndex(a => a[0] === current));
  const box = useRef({ x: 0, w: 0 });
  const barRef = useRef<any>(null);
  const lensX = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [itemW, setItemW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const curRef = useRef(cur); curRef.current = cur;
  const selRef = useRef(onSelect); selRef.current = onSelect;

  const iw = () => box.current.w / APPS.length;
  const idxAt = (pageX: number) => Math.max(0, Math.min(APPS.length - 1, Math.floor((pageX - box.current.x) / iw())));
  const follow = (pageX: number) => {
    const w = iw(); lensX.setValue(Math.max(0, Math.min(w * (APPS.length - 1), pageX - box.current.x - w / 2)));
    const i = idxAt(pageX);
    if (i !== hoverRef.current) { hoverRef.current = i; setHover(i); Haptics.selectionAsync().catch(() => {}); }
  };
  const settle = (i: number) => {
    Animated.parallel([
      Animated.spring(lensX, { toValue: i * iw(), useNativeDriver: true, speed: 18, bounciness: 7 }),
      Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }),
    ]).start();
    hoverRef.current = null; setHover(null);
  };
  const pick = (i: number) => {
    settle(i);
    if (i === curRef.current) return;
    const [k, href] = APPS[i];
    if (selRef.current) selRef.current(k); else router.navigate(href);
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      barRef.current?.measureInWindow((x: number, _y: number, w: number) => { if (w) box.current = { x, w }; });
      Animated.spring(lift, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      follow(e.nativeEvent.pageX);
    },
    onPanResponderMove: e => follow(e.nativeEvent.pageX),
    onPanResponderRelease: e => pick(idxAt(e.nativeEvent.pageX)),
    onPanResponderTerminate: () => settle(curRef.current),
  })).current;

  // Keep the lens on the current app when it changes from elsewhere.
  useEffect(() => { if (itemW && hoverRef.current === null) Animated.spring(lensX, { toValue: cur * itemW, useNativeDriver: true, speed: 18, bounciness: 6 }).start(); }, [cur, itemW]);

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(ins.bottom, 10) + 4 }]}>
      <Glass interactive style={[styles.bar, { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }]}>
        <View ref={barRef} {...pan.panHandlers} style={styles.row}
          onLayout={e => { const w = e.nativeEvent.layout.width; box.current.w = w; const i = w / APPS.length; setItemW(i); lensX.setValue(cur * i); barRef.current?.measureInWindow((x: number, _y: number, ww: number) => { if (ww) box.current = { x, w: ww }; }); }}
          accessibilityRole="tablist">
          {itemW > 0 && (
            <Animated.View pointerEvents="none" style={[styles.lens, { width: itemW, backgroundColor: t.fill, borderColor: t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)', transform: [{ translateX: lensX }, { scale }] }]} />
          )}
          {APPS.map(([k], i) => {
            const on = hover === null ? i === cur : i === hover;
            const big = hover === i;
            const c = k === 'accounts' ? 0 : counts[k] || 0; const col = on ? t.ink : t.soft;
            return (
              <View key={k} accessibilityRole="tab" accessibilityLabel={k} accessibilityState={{ selected: i === cur }} style={styles.btn}>
                <View style={big && { transform: [{ scale: 1.25 }] }}>
                  {k === 'all' ? <Ionicons name="file-tray" size={21} color={col} />
                    : k === 'whatsapp' ? <Ionicons name="logo-whatsapp" size={22} color={col} />
                    : k === 'instagram' ? <Ionicons name="logo-instagram" size={21} color={col} />
                    : k === 'messenger' ? <MaterialCommunityIcons name="facebook-messenger" size={22} color={col} />
                    : <Ionicons name="person-circle-outline" size={23} color={col} />}
                </View>
                {c > 0 && <View style={[styles.badge, { backgroundColor: t.red }]}><Text style={styles.badgeTxt}>{c > 99 ? '99+' : c}</Text></View>}
              </View>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: { width: '100%', maxWidth: 420, borderRadius: 28, padding: PAD, overflow: 'visible' },
  row: { flexDirection: 'row' },
  lens: { position: 'absolute', left: 0, top: 0, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth },
  btn: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 1, right: 6, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
