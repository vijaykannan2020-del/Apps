import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, NETS, Net, visibleRooms, netOf, botNetOf, logout } from '@/lib/matrix';
import { useTheme, useStore } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Accounts() {
  useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const rooms = visibleRooms();
  const setupRoom = (n: Net) => [...S.rooms.values()].find(r => botNetOf(r) === n);
  async function checkUpdate() {
    if (Platform.OS === 'web' || !Updates.isEnabled) { Alert.alert('Updates', 'Updates arrive automatically when you reopen the app.'); return; }
    try {
      const u = await Updates.checkForUpdateAsync();
      if (!u.isAvailable) { Alert.alert('You’re up to date'); return; }
      await Updates.fetchUpdateAsync(); await Updates.reloadAsync();
    } catch (e: any) { Alert.alert('Could not check', e.message || ''); }
  }
  const Row = ({ label, sub, onPress, color }: { label: string; sub?: string; onPress?: () => void; color?: string }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : t.surface }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTxt, { color: color || t.ink }]}>{label}</Text>
        {!!sub && <Text style={[styles.rowSub, { color: t.soft }]}>{sub}</Text>}
      </View>
      {onPress && !color && <Text style={{ color: t.soft, fontSize: 20 }}>›</Text>}
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 40 }}>
      <View style={styles.titleRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>
        <Text style={[styles.title, { color: t.ink }]}>Accounts</Text>
      </View>
      <Text style={[styles.h, { color: t.soft }]}>CONNECTED APPS</Text>
      <View style={styles.card}>
        {(Object.keys(NETS) as Net[]).map(n => {
          const count = rooms.filter(r => netOf(r) === n).length;
          const sr = setupRoom(n);
          return <Row key={n} label={NETS[n].label} sub={count ? `${count} chats` : sr ? 'Not connected — open setup' : 'Connect it in the web Inbox'}
            onPress={sr ? () => router.push({ pathname: '/chat/[id]', params: { id: sr.id } }) : undefined} />;
        })}
      </View>
      <Text style={[styles.h, { color: t.soft }]}>APP</Text>
      <View style={styles.card}>
        <Row label="Check for updates" sub={`Version ${Constants.expoConfig?.version || '1.0.0'} · app preview`} onPress={checkUpdate} />
        <Row label="Signed in as" sub={(S.userId || '') + ' · ' + S.server.replace(/^https?:\/\//, '')} />
        <Row label="Log out" color={t.red} onPress={() => Alert.alert('Log out?', 'You can sign in again any time.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
        ])} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8, marginBottom: 8 },
  back: { fontSize: 40, lineHeight: 44, fontWeight: '300' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  h: { fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 6, marginHorizontal: 32 },
  card: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', gap: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  rowTxt: { fontSize: 17 },
  rowSub: { fontSize: 13, marginTop: 2 },
});
