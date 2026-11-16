import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Glass } from '@/components/Glass';
import { useTheme } from '@/lib/theme';

const APPS = [['all', '/inbox'], ['whatsapp', '/whatsapp'], ['instagram', '/instagram'], ['messenger', '/messenger'], ['accounts', '/accounts']] as const;
type Key = typeof APPS[number][0];

/** Glass row of app logos at the top — on iPhone Duo the system tab bar becomes a side strip that covers the chats. */
export function AppSwitcher({ current, counts = {} }: { current: Key; counts?: Record<string, number> }) {
  const t = useTheme();
  return (
    <Glass style={styles.bar}>
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
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, borderRadius: 24, padding: 4, overflow: 'hidden', maxWidth: 420 },
  btn: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 1, right: 6, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
