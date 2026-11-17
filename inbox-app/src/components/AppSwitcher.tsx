import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Glass } from '@/components/Glass';
import { useTheme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const APPS = [['all', '/inbox'], ['whatsapp', '/whatsapp'], ['instagram', '/instagram'], ['messenger', '/messenger'], ['accounts', '/accounts']] as const;
type Key = typeof APPS[number][0];

/** Floating glass bar of app logos at the bottom, within thumb reach. (On iPhone Duo the system tab bar becomes a side strip that covers the chats.) */
export const SWITCHER_SPACE = 76;
export function AppSwitcher({ current, counts = {} }: { current: Key; counts?: Record<string, number> }) {
  const t = useTheme(); const ins = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(ins.bottom, 10) + 4 }]}>
    <Glass interactive style={[styles.bar, { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }]}>
      {APPS.map(([k, href]) => {
        const on = k === current; const c = k === 'accounts' ? 0 : counts[k] || 0; const col = on ? t.ink : t.soft;
        return (
          <Pressable key={k} hitSlop={4} accessibilityLabel={k} onPress={() => { Haptics.selectionAsync().catch(() => {}); if (!on) router.navigate(href); }}
            style={[styles.btn, on && { backgroundColor: t.fill }]}>
            {k === 'all' ? <Ionicons name="file-tray" size={21} color={col} />
              : k === 'whatsapp' ? <Ionicons name="logo-whatsapp" size={22} color={col} />
              : k === 'instagram' ? <Ionicons name="logo-instagram" size={21} color={col} />
              : k === 'messenger' ? <MaterialCommunityIcons name="facebook-messenger" size={22} color={col} />
              : <Ionicons name="person-circle-outline" size={23} color={col} />}
            {c > 0 && <View style={[styles.badge, { backgroundColor: t.red }]}><Text style={styles.badgeTxt}>{c > 99 ? '99+' : c}</Text></View>}
          </Pressable>
        );
      })}
    </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: { flexDirection: 'row', width: '100%', maxWidth: 420, borderRadius: 28, padding: 5, overflow: 'hidden' },

  btn: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 1, right: 6, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
