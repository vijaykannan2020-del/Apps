// Top of the chat list: a small icon per connected app with a coloured dot (green = connected, blue = syncing,
// orange = reconnecting, red = disconnected), plus a banner whenever one isn't fully connected.
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NETS, Net, setupRoom } from '@/lib/matrix';
import { openChat } from '@/lib/layout';
import { useConns, refreshConns, connLabel, connColor, lastMessageAt, ago, Conn } from '@/lib/conn';
import { useTheme } from '@/lib/theme';

function NetIcon({ n, size, color }: { n: Net; size: number; color: string }) {
  if (n === 'messenger') return <MaterialCommunityIcons name="facebook-messenger" size={size} color={color} />;
  return <Ionicons name={n === 'whatsapp' ? 'logo-whatsapp' : 'logo-instagram'} size={size} color={color} />;
}

function relogin(n: Net) {
  const sr = setupRoom(n);
  if (sr) openChat(sr.id); else Alert.alert(NETS[n].label, 'Connect it once in the web Inbox.');
}
function details(c: Conn) {
  Haptics.selectionAsync().catch(() => {});
  if (c.state === 'down' || c.state === 'off') { relogin(c.net); return; }
  const last = lastMessageAt(c.net);
  const lines = [connLabel[c.state] + (c.account ? ` as ${c.account}` : ''), last ? `Last message ${ago(last)}` : '', c.message].filter(Boolean);
  Alert.alert(NETS[c.net].label, lines.join('\n'), [
    { text: 'Log in again', onPress: () => relogin(c.net) },
    { text: 'Check now', onPress: () => refreshConns() },
    { text: 'OK', style: 'cancel' },
  ]);
}

/** Small app icons with status dots — sits next to the list title. */
export function ConnDots() {
  const t = useTheme(); const { list } = useConns();
  if (!list.length) return null;
  return (
    <View style={styles.dots}>
      {list.map(c => (
        <Pressable key={c.net} onPress={() => details(c)} hitSlop={6} accessibilityLabel={`${NETS[c.net].label}: ${connLabel[c.state]}`} style={[styles.dotBtn, { backgroundColor: t.fill }]}>
          <NetIcon n={c.net} size={17} color={t.ink} />
          <View style={[styles.dot, { backgroundColor: connColor[c.state], borderColor: t.bg }]} />
        </Pressable>
      ))}
    </View>
  );
}

/** One line per app that isn't fully connected (disconnected, reconnecting or syncing). */
export function ConnBanner() {
  const t = useTheme(); const { list } = useConns();
  const issues = list.filter(c => c.state !== 'ok' && c.state !== 'unknown');
  if (!issues.length) return null;
  return (
    <View style={{ gap: 8, marginHorizontal: 16, marginBottom: 10 }}>
      {issues.map(c => {
        const col = connColor[c.state];
        const bad = c.state === 'down' || c.state === 'off';
        const last = lastMessageAt(c.net);
        const sub = bad ? `You won't get ${NETS[c.net].label} messages here until you log in again.`
          : c.state === 'syncing' ? `Bringing in your chats${last ? ` · newest ${ago(last)}` : ''}`
          : 'Messages will catch up once it\'s back.';
        return (
          <Pressable key={c.net} onPress={() => details(c)} style={[styles.banner, { backgroundColor: col + '22', borderColor: col + '66' }]}>
            <NetIcon n={c.net} size={22} color={col} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontWeight: '700', fontSize: 15 }}>{NETS[c.net].label} · {connLabel[c.state]}</Text>
              <Text style={{ color: t.soft, fontSize: 13, marginTop: 2 }}>{sub}</Text>
            </View>
            {bad ? <Text style={{ color: col, fontWeight: '700' }}>Log in</Text> : <Ionicons name="sync" size={18} color={col} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 8, marginLeft: 'auto', alignItems: 'center' },
  dotBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
