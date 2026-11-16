import { useEffect, useState } from 'react';
import { openChat } from '@/lib/layout';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform, Switch, TextInput, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S, NETS, Net, visibleRooms, netOf, logout, setupRoom, setPref, changePassword, backupApi } from '@/lib/matrix';
import { Sheet } from '@/components/Sheet';
import { fmtWhen } from '@/lib/time';
import { useTheme, useStore } from '@/lib/theme';

const SIZES: [string, number][] = [['Small', 0.9], ['Default', 1], ['Large', 1.12], ['XL', 1.25]];
export const APP_BUILD = 4;
const THEMES: ['auto' | 'light' | 'dark', string][] = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

export default function Accounts() {
  useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const rooms = visibleRooms();
  const [pw, setPw] = useState(false); const [pwOld, setPwOld] = useState(''); const [pwNew, setPwNew] = useState(''); const [pwNew2, setPwNew2] = useState('');
  const [pwErr, setPwErr] = useState(''); const [pwBusy, setPwBusy] = useState(false);
  const [bk, setBk] = useState<any>(null); const [bkOpen, setBkOpen] = useState(false); const [bkPaste, setBkPaste] = useState(''); const [bkErr, setBkErr] = useState(''); const [bkBusy, setBkBusy] = useState(false);
  const loadBk = () => backupApi.status().then(setBk).catch((e: any) => setBk(e.status === 403 ? { forbidden: true } : null));
  useEffect(() => { loadBk(); }, []);
  async function savePw() {
    setPwErr('');
    if (pwNew.length < 8) { setPwErr('Use at least 8 characters'); return; }
    if (pwNew !== pwNew2) { setPwErr('The new passwords don’t match'); return; }
    setPwBusy(true);
    try { await changePassword(pwOld, pwNew); setPw(false); setPwOld(''); setPwNew(''); setPwNew2(''); Alert.alert('Password changed', 'Use the new password next time you sign in. Save it in your Passwords app.'); }
    catch (e: any) { setPwErr(e.status === 401 || e.status === 403 ? 'Current password is wrong' : e.message || 'Could not change password'); }
    setPwBusy(false);
  }
  const bkSub = !bk ? 'Checking…' : bk.forbidden ? 'Only the server owner can manage backups' : !bk.connected ? 'Not set up — tap to connect Google Drive'
    : bk.running ? 'Backing up now…' : !bk.last ? 'Connected · first backup starting'
    : bk.last.ok ? `Last backup ${fmtWhen(Date.parse(bk.last.time))} ✓` : `Last backup failed ${fmtWhen(Date.parse(bk.last.time))}`;
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
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 24, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 640 }}>
        <View style={styles.titleRow}>
          
          <Text style={[styles.title, { color: t.ink }]}>Accounts</Text>
        </View>

        <Text style={[styles.h, { color: t.soft }]}>CONNECTED APPS</Text>
        <View style={styles.card}>
          {nets.map((n, i) => {
            const count = rooms.filter(r => netOf(r) === n).length;
            const sr = setupRoom(n);
            return <Row key={n} last={i === nets.length - 1} icon={n === 'whatsapp' ? 'logo-whatsapp' : n === 'instagram' ? 'logo-instagram' : 'logo-facebook'} iconBg={NETS[n].color}
              label={NETS[n].label} sub={count ? `${count} chats · tap for login & settings` : sr ? 'Not connected — tap to connect' : 'Connect it once in the web Inbox'}
              onPress={sr ? () => openChat(sr.id) : undefined} />;
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
        <Text style={[styles.h, { color: t.soft }]}>THEME</Text>
        <View style={[styles.seg, { backgroundColor: t.fill }]}>
          {THEMES.map(([k, label]) => {
            const on = S.prefs.theme === k;
            return <Pressable key={k} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPref('theme', k); }} style={[styles.segBtn, on && { backgroundColor: t.surface }]}>
              <Text style={{ color: t.ink, fontWeight: on ? '700' : '500' }}>{label}</Text></Pressable>;
          })}
        </View>

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
          <Row label="Backup" sub={bkSub} icon="cloud-upload" iconBg="#34A853" onPress={bk && !bk.forbidden ? () => { setBkErr(''); setBkPaste(''); setBkOpen(true); } : undefined} />
          <Row label="Change password" sub="Your Inbox login" icon="lock-closed" iconBg="#5E5CE6" onPress={() => { setPwErr(''); setPw(true); }} />
          <Row label="Notifications" sub="Coming with the full app — use the web Inbox for alerts meanwhile" icon="notifications" iconBg="#FF3B30" last />
        </View>

        <Text style={[styles.h, { color: t.soft }]}>THIS DEVICE</Text>
        <View style={styles.card}>
          <Row label="Signed in as" sub={(S.userId || '') + ' · ' + S.server.replace(/^https?:\/\//, '')} icon="person" iconBg="#5E5CE6" />
          <Row label="Log out" color={t.red} last onPress={() => Alert.alert('Log out?', 'You can sign in again any time.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
          ])} />
        </View>
      </View>
      <Sheet visible={pw} onClose={() => setPw(false)} title="Change password">
        {[['Current password', pwOld, setPwOld], ['New password (8+ characters)', pwNew, setPwNew], ['New password again', pwNew2, setPwNew2]].map(([ph, val, set]: any) => (
          <TextInput key={ph} placeholder={ph} placeholderTextColor={t.soft} value={val} onChangeText={set} secureTextEntry autoCapitalize="none" autoCorrect={false}
            style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
        ))}
        {!!pwErr && <Text style={{ color: t.red, marginBottom: 8 }}>{pwErr}</Text>}
        <Pressable onPress={savePw} disabled={pwBusy} style={[styles.bigBtn, { backgroundColor: t.primary }]}>
          {pwBusy ? <ActivityIndicator color={t.primaryText} /> : <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Change password</Text>}
        </Pressable>
      </Sheet>
      <Sheet visible={bkOpen} onClose={() => setBkOpen(false)} title="Backup" scroll>
        {bk && !bk.connected ? <>
          <Text style={[styles.steps, { color: t.ink }]}>1. Tap Copy sign-in link, open Safari, paste and go.{'\n'}2. Sign in to Google and tap Allow (it says “rclone” — the free backup tool your server uses).{'\n'}3. The page won’t load — that’s expected. Copy its whole address.{'\n'}4. Paste it below and tap Connect.</Text>
          <Pressable onPress={async () => { try { const { url } = await backupApi.authUrl(); await Clipboard.setStringAsync(url); Alert.alert('Copied', 'Now paste it in Safari.'); } catch { Alert.alert('Could not reach the server'); } }}
            style={[styles.bigBtn, { backgroundColor: t.dark ? '#2C2C2E' : '#fff' }]}><Text style={{ color: t.ink, fontWeight: '700', fontSize: 17 }}>Copy sign-in link</Text></Pressable>
          <TextInput placeholder="Paste the address of the page that didn’t load" placeholderTextColor={t.soft} value={bkPaste} onChangeText={setBkPaste} autoCapitalize="none" autoCorrect={false}
            style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
          {!!bkErr && <Text style={{ color: t.red, marginBottom: 8 }}>{bkErr}</Text>}
          <Pressable disabled={bkBusy} onPress={async () => { setBkBusy(true); setBkErr(''); try { await backupApi.connect(bkPaste); setBkOpen(false); Alert.alert('Google Drive connected', 'First backup is starting.'); setTimeout(loadBk, 3000); } catch (e: any) { setBkErr(e.message || 'Could not connect'); } setBkBusy(false); }}
            style={[styles.bigBtn, { backgroundColor: t.primary }]}>{bkBusy ? <ActivityIndicator color={t.primaryText} /> : <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Connect</Text>}</Pressable>
        </> : bk ? <>
          <Text style={[styles.steps, { color: t.ink }]}>{bkSub}. Every Sunday your chats, logins and settings are saved, encrypted, to the “My Inbox backups” folder in your Google Drive. The last 8 weeks are kept.</Text>
          {bk.last && !bk.last.ok && <Text style={{ color: t.red, marginBottom: 8 }}>{bk.last.message}</Text>}
          <Text style={{ color: t.soft, fontSize: 13, marginBottom: 4 }}>BACKUP PASSWORD — keep it in your Passwords app</Text>
          <Text selectable style={{ color: t.ink, fontSize: 20, fontWeight: '700', letterSpacing: 1, marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{bk.key}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => { Clipboard.setStringAsync(bk.key); Alert.alert('Backup password copied'); }} style={[styles.bigBtn, { flex: 1, backgroundColor: t.dark ? '#2C2C2E' : '#fff' }]}><Text style={{ color: t.ink, fontWeight: '700' }}>Copy password</Text></Pressable>
            <Pressable onPress={async () => { try { await backupApi.run(); setBkOpen(false); Alert.alert('Backup started', 'Takes about a minute.'); setTimeout(loadBk, 70e3); } catch (e: any) { Alert.alert('Could not start', e.message || ''); } }} style={[styles.bigBtn, { flex: 1, backgroundColor: t.primary }]}><Text style={{ color: t.primaryText, fontWeight: '700' }}>Back up now</Text></Pressable>
          </View>
        </> : null}
      </Sheet>
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
  field: { height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, marginBottom: 10 },
  bigBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  steps: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
});
