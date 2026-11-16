import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform, Switch } from 'react-native';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S, NETS, Net, visibleRooms, netOf, logout, setupRoom, setPref } from '@/lib/matrix';
import { useTheme, useStore } from '@/lib/theme';

const SIZES: [string, number][] = [['Small', 0.9], ['Default', 1], ['Large', 1.12], ['XL', 1.25]];
export const APP_BUILD = 2;

export default function Accounts() {
  useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const rooms = visibleRooms();
  async function checkUpdate() {
    if (Platform.OS === 'web' || !Updates.isEnabled) { Alert.alert('Updates', 'Updates arrive automatically when you reopen the app.'); return; }
    try {
      const u = await Updates.checkForUpdateAsync();
      if (!u.isAvailable) { Alert.alert('You’re up to date', 'Version ' + APP_BUILD); return; }
      await Updates.fetchUpdateAsync(); await Updates.reloadAsync();
    } catch (e: any) { Alert.alert('Could not check', e.message || ''); }
  }
  const Row = ({ label, sub, onPress, color, right, icon, iconBg, last }: { label: string; sub?: string; onPress?: () => void; color?: string; right?: React.ReactNode; icon?: any; iconBg?: string; last?: boolean }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : t.surface }]}>
      {icon && <View style={[styles.icon, { backgroundColor: iconBg || t.soft }]}><Ionicons name={icon} size={18} color="#fff" /></View>}
      <View style={[styles.rowIn, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTxt, { color: color || t.ink }]}>{label}</Text>
          {!!sub && <Text style={[styles.rowSub, { color: t.soft }]}>{sub}</Text>}
        </View>
        {right ?? (onPress && !color ? <Ionicons name="chevron-forward" size={18} color={t.soft} /> : null)}
      </View>
    </Pressable>
  );
  const nets = Object.keys(NETS) as Net[];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 40, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 640 }}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>
          <Text style={[styles.title, { color: t.ink }]}>Accounts</Text>
        </View>

        <Text style={[styles.h, { color: t.soft }]}>CONNECTED APPS</Text>
        <View style={styles.card}>
          {nets.map((n, i) => {
            const count = rooms.filter(r => netOf(r) === n).length;
            const sr = setupRoom(n);
            return <Row key={n} last={i === nets.length - 1} icon={n === 'whatsapp' ? 'logo-whatsapp' : n === 'instagram' ? 'logo-instagram' : 'logo-facebook'} iconBg={NETS[n].color}
              label={NETS[n].label} sub={count ? `${count} chats · tap for login & settings` : sr ? 'Not connected — tap to connect' : 'Connect it once in the web Inbox'}
              onPress={sr ? () => router.push({ pathname: '/chat/[id]', params: { id: sr.id } }) : undefined} />;
          })}
        </View>

        <Text style={[styles.h, { color: t.soft }]}>TEXT SIZE</Text>
        <View style={[styles.seg, { backgroundColor: t.fill }]}>
          {SIZES.map(([label, v]) => {
            const on = Math.abs(S.prefs.fontScale - v) < 0.01;
            return <Pressable key={label} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPref('fontScale', v); }} style={[styles.segBtn, on && { backgroundColor: t.surface }]}>
              <Text style={{ color: t.ink, fontWeight: on ? '700' : '500', fontSize: 14 * v }}>{label}</Text></Pressable>;
          })}
        </View>
        <Text style={[styles.note, { color: t.soft }]}>Light and dark follow your iPhone’s setting.</Text>

        <Text style={[styles.h, { color: t.soft }]}>PRIVACY</Text>
        <View style={styles.card}>
          <Row label="Send read receipts" sub="Off: people won’t see blue ticks when you read" icon="checkmark-done" iconBg="#34C759"
            right={<Switch value={S.prefs.receipts} onValueChange={v => setPref('receipts', v)} />} />
          <Row label="Show when I’m typing" sub="Others see “typing…” while you write" icon="ellipsis-horizontal" iconBg="#0A84FF" last
            right={<Switch value={S.prefs.typing} onValueChange={v => setPref('typing', v)} />} />
        </View>

        <Text style={[styles.h, { color: t.soft }]}>APP</Text>
        <View style={styles.card}>
          <Row label="Check for updates" sub={`Version ${APP_BUILD} · app preview in Expo Go`} icon="refresh" iconBg="#30B0C7" onPress={checkUpdate} />
          <Row label="Notifications, backup & password" sub="In the web Inbox for now (real app adds notifications)" icon="globe-outline" iconBg="#8E8E93" last />
        </View>

        <Text style={[styles.h, { color: t.soft }]}>THIS DEVICE</Text>
        <View style={styles.card}>
          <Row label="Signed in as" sub={(S.userId || '') + ' · ' + S.server.replace(/^https?:\/\//, '')} icon="person" iconBg="#5E5CE6" />
          <Row label="Log out" color={t.red} last onPress={() => Alert.alert('Log out?', 'You can sign in again any time.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
          ])} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  h: { fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 6, marginHorizontal: 32 },
  card: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  rowIn: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 14, marginLeft: 12, gap: 8 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowTxt: { fontSize: 17 },
  rowSub: { fontSize: 13, marginTop: 2 },
  seg: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  note: { fontSize: 13, marginHorizontal: 32, marginTop: 6 },
});
