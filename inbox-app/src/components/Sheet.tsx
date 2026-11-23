// iOS-style bottom sheet: backdrop fades, sheet springs up, drag down to close.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, PanResponder, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

export function Sheet({ visible, onClose, title, children, scroll }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; scroll?: boolean }) {
  const t = useTheme(); const ins = useSafeAreaInsets(); const { height, width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 260, mass: 0.9 }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(y, { toValue: height, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 110 || g.vy > 0.8) onClose();
      else Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 260 }).start();
    },
  })).current;
  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { backgroundColor: t.dark ? '#1C1C1E' : '#F2F2F7', paddingBottom: ins.bottom + 10, maxHeight: height * 0.88,
        width: Math.min(width, 560), alignSelf: 'center', transform: [{ translateY: y }] }]}>
        <View {...pan.panHandlers} style={styles.grab}><View style={[styles.handle, { backgroundColor: t.soft }]} />
          {!!title && <Text numberOfLines={1} style={[styles.title, { color: t.soft }]}>{title}</Text>}
        </View>
        <Body style={{ paddingHorizontal: 14 }} {...(scroll ? { keyboardShouldPersistTaps: 'handled' as const } : {})}>{children}</Body>
      </Animated.View>
    </Modal>
  );
}

export function SheetGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.group, { backgroundColor: t.dark ? '#2C2C2E' : '#FFFFFF' }]}>{children}</View>;
}
export function SheetItem({ label, onPress, icon, danger, last }: { label: string; onPress: () => void; icon?: ReactNode; danger?: boolean; last?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.fill : 'transparent' }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
      <Text style={[styles.itemTxt, { color: danger ? t.red : t.ink }]}>{label}</Text>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  grab: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 38, height: 5, borderRadius: 3, opacity: 0.5 },
  title: { marginTop: 10, fontSize: 14, fontWeight: '600', paddingHorizontal: 20 },
  group: { borderRadius: 20, overflow: 'hidden', marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  itemTxt: { fontSize: 17 },
});
