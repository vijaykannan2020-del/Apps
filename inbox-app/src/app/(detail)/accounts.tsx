import { useEffect, useState } from 'react';
import { openChat, backToList } from '@/lib/layout';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform, Switch, TextInput, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S, NETS, Net, visibleRooms, netOf, logout, setupRoom, setPref, changePassword, backupApi, familyApi, startPrivateChat, Person, getMyProfile, setMyName, setMyPhoto, mediaSource, hueFor } from '@/lib/matrix';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { pushCapable, enableNativePush, disableNativePush, pushWanted, apnsApi, deviceToken } from '@/lib/push';
import { Sheet } from '@/components/Sheet';
import { fmtWhen } from '@/lib/time';
import { DuoBar } from '@/components/DuoBar';
import { TargetScreen } from '@/components/TargetScreen';
import { useTheme, useStore, FONT_TITLE } from '@/lib/theme';
import { useWindowDimensions } from 'react-native';
import { useStatusGutter, useLayout, showList } from '@/lib/layout';

const SIZES: [string, number][] = [['Small', 0.9], ['Default', 1], ['Large', 1.12], ['XL', 1.25]];
export const APP_BUILD = 49;
const THEMES: ['auto' | 'light' | 'dark', string][] = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

export default function Accounts() {
  useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const dim = useWindowDimensions(); const { collapsed, single, target } = useLayout(); const wideNow = !single; const gut = useStatusGutter();
  const rooms = visibleRooms();
  const [pw, setPw] = useState(false); const [pwOld, setPwOld] = useState(''); const [pwNew, setPwNew] = useState(''); const [pwNew2, setPwNew2] = useState('');
  const [pwErr, setPwErr] = useState(''); const [pwBusy, setPwBusy] = useState(false);
  const [bk, setBk] = useState<any>(null); const [bkOpen, setBkOpen] = useState(false); const [bkPaste, setBkPaste] = useState(''); const [bkErr, setBkErr] = useState(''); const [bkBusy, setBkBusy] = useState(false);
  const [me, setMe] = useState<{ displayname?: string; avatar_url?: string }>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => { getMyProfile().then(setMe); }, []);
  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try { const url = await setMyPhoto(res.assets[0].uri, res.assets[0].mimeType || 'image/jpeg'); setMe(m => ({ ...m, avatar_url: url })); }
    catch (e: any) { Alert.alert('Could not update photo', e.message || ''); }
    setPhotoBusy(false);
  }
  function editName() {
    Alert.prompt('Your name', 'Shown to family in private chats', async (v?: string) => {
      if (!v || !v.trim()) return;
      try { await setMyName(v); setMe(m => ({ ...m, displayname: v.trim() })); } catch (e: any) { Alert.alert('Could not change name', e.message || ''); }
    }, 'plain-text', me.displayname || '');
  }
  const [fam, setFam] = useState<{ admin: boolean; people: Person[] } | null>(null);
  const [addOpen, setAddOpen] = useState(false); const [fName, setFName] = useState(''); const [fUser, setFUser] = useState(''); const [fPass, setFPass] = useState('');
  const [fErr, setFErr] = useState(''); const [fBusy, setFBusy] = useState(false); const [fDone, setFDone] = useState<{ user: string; pass: string } | null>(null);
  const [push, setPush] = useState<'on' | 'off' | 'denied' | 'unsupported' | 'error' | 'checking'>('checking');
  const [apnsOk, setApnsOk] = useState<boolean | null>(null);
  const [nOpen, setNOpen] = useState(false); const [nKeyId, setNKeyId] = useState(''); const [nTeam, setNTeam] = useState(''); const [nKey, setNKey] = useState('');
  const [nErr, setNErr] = useState(''); const [nBusy, setNBusy] = useState(false);
  const loadFam = () => familyApi.list().then(setFam).catch(() => setFam(null));
  useEffect(() => {
    loadFam();
    apnsApi.status().then(x => setApnsOk(x.configured)).catch(() => setApnsOk(null));
    if (!pushCapable) setPush('unsupported'); else pushWanted().then(w => setPush(w ? (deviceToken() ? 'on' : 'checking') : 'off'));
    if (pushCapable) pushWanted().then(w => { if (w) enableNativePush(false).then(r => setPush(r === 'on' ? 'on' : r)); });
  }, []);
  async function togglePush(v: boolean) {
    if (v) { const r = await enableNativePush(true); setPush(r); if (r === 'denied') Alert.alert('Notifications are off for Inbox', 'Turn them on in iPhone Settings → Inbox → Notifications.'); }
    else { await disableNativePush(); setPush('off'); }
  }
  function genPass() { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let p = ''; for (let i = 0; i < 14; i++) p += a[Math.floor(Math.random() * a.length)]; return p; }
  async function addPerson() {
    setFErr(''); setFBusy(true);
    try { await familyApi.create(fUser, fName || fUser, fPass); setFDone({ user: fUser.trim().toLowerCase(), pass: fPass }); loadFam(); }
    catch (e: any) { setFErr(e.message || 'Could not add'); }
    setFBusy(false);
  }
  async function chatWith(p: Person) {
    try { const id = await startPrivateChat(p.userId); openChat(id); } catch (e: any) { Alert.alert('Could not start the chat', e.message || ''); }
  }
  async function saveApns() {
    setNErr(''); setNBusy(true);
    try {
      await apnsApi.config(nKeyId.trim().toUpperCase(), nTeam.trim().toUpperCase(), nKey);
      setApnsOk(true); setNOpen(false);
      const r = await enableNativePush(true); setPush(r);
      const tok = deviceToken();
      if (tok) { try { await apnsApi.test(tok); Alert.alert('All set', 'A test notification is on its way.'); } catch (e: any) { Alert.alert('Saved, but the test failed', (e.message || '') + ' — check the Key ID and Team ID.'); } }
    } catch (e: any) { setNErr(e.message || 'Could not save'); }
    setNBusy(false);
  }
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
  if (collapsed && target && target !== 'accounts') return <TargetScreen />; // see layout.ts target
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <DuoBar />
    <ScrollView automaticallyAdjustsScrollIndicatorInsets={false} style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 40, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 640 }}>
        <View style={{ paddingRight: gut }}>
          <View style={styles.titleRow}>
            {single && !gut && <Pressable onPress={backToList} hitSlop={12} accessibilityLabel="Back to chats"><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>}
            <Text style={[styles.title, { color: t.ink }]}>Accounts</Text>
          </View>
        </View>

        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 }]}>
          <Pressable onPress={pickPhoto} accessibilityLabel="Change profile photo">
            <View style={{ width: 68, height: 68, borderRadius: 34, overflow: 'hidden', backgroundColor: hueFor(S.userId || ''), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>{(me.displayname || S.userId || '?').replace(/^@/, '')[0].toUpperCase()}</Text>
              {!!me.avatar_url && <Image source={mediaSource(me.avatar_url, 136)} style={StyleSheet.absoluteFill} contentFit="cover" />}
              {photoBusy && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color="#fff" /></View>}
            </View>
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.bg }}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={editName} style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 22, fontFamily: FONT_TITLE }} numberOfLines={1}>{me.displayname || S.userId?.split(':')[0].slice(1)}</Text>
            <Text style={{ color: t.soft, fontSize: 14, marginTop: 2 }}>Tap to change your name or photo</Text>
          </Pressable>
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

        <Text style={[styles.h, { color: t.soft }]}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          {push === 'unsupported' ? (
            <Row label="Notifications" sub="Work in the Inbox app from TestFlight (not in Expo Go)" icon="notifications" iconBg="#FF3B30" last />
          ) : <>
            <Row label="Message notifications" icon="notifications" iconBg="#FF3B30" last={!(fam?.admin && apnsOk === false)}
              sub={push === 'denied' ? 'Blocked — allow in iPhone Settings → Inbox' : apnsOk === false ? (fam?.admin ? 'One-time setup needed — tap below' : 'Waiting for the owner to finish setup') : push === 'on' ? 'On · WhatsApp, Instagram, Messenger & private chats' : push === 'checking' ? 'Checking…' : 'Off'}
              right={<Switch value={push === 'on'} onValueChange={togglePush} />} />
            {fam?.admin && apnsOk === false && <Row label="Notifications setup" sub="Paste your Apple push key once" icon="key" iconBg="#FF9500" last onPress={() => { setNErr(''); setNOpen(true); }} />}
          </>}
        </View>

        <Text style={[styles.h, { color: t.soft }]}>FAMILY · PRIVATE CHATS</Text>
        <View style={styles.card}>
          {(fam?.people || []).map((p, i) => (
            <Row key={p.userId} label={p.displayname} sub="Private chat on your own server · tap to open" icon="lock-closed" iconBg="#5E5CE6"
              last={!fam?.admin && i === fam!.people.length - 1} onPress={() => chatWith(p)} />
          ))}
          {fam?.admin && <Row label="Add family member" sub="Give them their own Inbox login" icon="person-add" iconBg="#34C759" last
            onPress={() => { setFErr(''); setFDone(null); setFName(''); setFUser(''); setFPass(genPass()); setAddOpen(true); }} />}
          {!fam && <Row label="Family" sub="Checking…" icon="people" iconBg="#5E5CE6" last />}
          {fam && !fam.admin && !fam.people.length && <Row label="No family members yet" icon="people" iconBg="#5E5CE6" last />}
        </View>
        <Text style={[styles.note, { color: t.soft }]}>Private chats stay on your Oracle server — they never go through WhatsApp or Meta. Each person only sees their own chats.</Text>

        <Text style={[styles.h, { color: t.soft }]}>PRIVACY</Text>
        <View style={styles.card}>
          <Row label="Send read receipts" sub="Off: people won’t see blue ticks when you read" icon="checkmark-done" iconBg="#34C759"
            right={<Switch value={S.prefs.receipts} onValueChange={v => setPref('receipts', v)} />} />
          <Row label="Show when I’m typing" sub="Others see “typing…” while you write" icon="ellipsis-horizontal" iconBg="#0A84FF" last
            right={<Switch value={S.prefs.typing} onValueChange={v => setPref('typing', v)} />} />
        </View>

        <Text style={[styles.h, { color: t.soft }]}>APP</Text>
        <View style={styles.card}>
          <Row label="Check for updates" sub={`Version ${APP_BUILD} · screen ${Math.round(dim.width)}×${Math.round(dim.height)} · ${wideNow ? "two columns" : "one column"}`} icon="refresh" iconBg="#30B0C7" onPress={checkUpdate} />
          <Row label="Backup" sub={bkSub} icon="cloud-upload" iconBg="#34A853" onPress={bk && !bk.forbidden ? () => { setBkErr(''); setBkPaste(''); setBkOpen(true); } : undefined} />
          <Row label="Change password" sub="Your Inbox login" icon="lock-closed" iconBg="#5E5CE6" last onPress={() => { setPwErr(''); setPw(true); }} />
        </View>

        <Text style={[styles.h, { color: t.soft }]}>THIS DEVICE</Text>
        <View style={styles.card}>
          <Row label="Signed in as" sub={(S.userId || '') + ' · ' + S.server.replace(/^https?:\/\//, '')} icon="person" iconBg="#5E5CE6" />
          <Row label="Log out" color={t.red} last onPress={() => Alert.alert('Log out?', 'You can sign in again any time.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); } },
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
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={fDone ? 'Login ready' : 'Add family member'} scroll>
        {fDone ? <>
          <Text style={[styles.steps, { color: t.ink }]}>Send these to them. They install Inbox from TestFlight (add their Apple ID email as a tester in App Store Connect first), then sign in with:</Text>
          <Text selectable style={[styles.creds, { color: t.ink }]}>{`Server: ${S.server.replace(/^https?:\/\//, '')}\nUsername: ${fDone.user}\nPassword: ${fDone.pass}`}</Text>
          <Pressable onPress={() => { Clipboard.setStringAsync(`Inbox login\nServer: ${S.server.replace(/^https?:\/\//, '')}\nUsername: ${fDone.user}\nPassword: ${fDone.pass}`); Alert.alert('Copied'); }}
            style={[styles.bigBtn, { backgroundColor: t.primary }]}><Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Copy login</Text></Pressable>
        </> : <>
          <TextInput placeholder="Name (e.g. Sangeetha)" placeholderTextColor={t.soft} value={fName} onChangeText={v => { setFName(v); if (!fUser || fUser === fName.toLowerCase().replace(/[^a-z0-9]/g, '')) setFUser(v.toLowerCase().replace(/[^a-z0-9]/g, '')); }}
            style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
          <TextInput placeholder="Username (letters/numbers)" placeholderTextColor={t.soft} value={fUser} onChangeText={setFUser} autoCapitalize="none" autoCorrect={false}
            style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
          <TextInput placeholder="Password" placeholderTextColor={t.soft} value={fPass} onChangeText={setFPass} autoCapitalize="none" autoCorrect={false}
            style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
          {!!fErr && <Text style={{ color: t.red, marginBottom: 8 }}>{fErr}</Text>}
          <Pressable disabled={fBusy} onPress={addPerson} style={[styles.bigBtn, { backgroundColor: t.primary }]}>
            {fBusy ? <ActivityIndicator color={t.primaryText} /> : <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Create login</Text>}
          </Pressable>
        </>}
      </Sheet>
      <Sheet visible={nOpen} onClose={() => setNOpen(false)} title="Notifications setup" scroll>
        <Text style={[styles.steps, { color: t.ink }]}>From developer.apple.com → Keys → Inbox Push:{'\n'}• Key ID (10 characters){'\n'}• Team ID (Membership details){'\n'}• The key file: in Files rename AuthKey_….p8 to .txt, open it, select all, copy, paste below.{'\n'}It goes straight to your own server.</Text>
        <TextInput placeholder="Key ID" placeholderTextColor={t.soft} value={nKeyId} onChangeText={setNKeyId} autoCapitalize="characters" autoCorrect={false}
          style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
        <TextInput placeholder="Team ID" placeholderTextColor={t.soft} value={nTeam} onChangeText={setNTeam} autoCapitalize="characters" autoCorrect={false}
          style={[styles.field, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} />
        <TextInput placeholder="-----BEGIN PRIVATE KEY----- …" placeholderTextColor={t.soft} value={nKey} onChangeText={setNKey} autoCapitalize="none" autoCorrect={false} multiline
          style={[styles.field, { height: 120, paddingTop: 12, backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink, fontSize: 13 }]} />
        {!!nErr && <Text style={{ color: t.red, marginBottom: 8 }}>{nErr}</Text>}
        <Pressable disabled={nBusy} onPress={saveApns} style={[styles.bigBtn, { backgroundColor: t.primary }]}>
          {nBusy ? <ActivityIndicator color={t.primaryText} /> : <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Save & test</Text>}
        </Pressable>
      </Sheet>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  title: { fontSize: 34, fontFamily: FONT_TITLE, letterSpacing: -0.6 },
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
  creds: { fontSize: 17, lineHeight: 26, fontWeight: '600', marginBottom: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  steps: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
});
