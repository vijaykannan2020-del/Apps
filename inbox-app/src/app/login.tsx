import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { startPush } from '@/lib/push';
import { startCalls } from '@/lib/calls';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { login, DEFAULT_SERVER } from '@/lib/matrix';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const t = useTheme(); const ins = useSafeAreaInsets();
  const [user, setUser] = useState(''); const [pass, setPass] = useState('');
  const [server, setServer] = useState(DEFAULT_SERVER); const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function go() {
    if (!user || !pass) return;
    setBusy(true); setErr('');
    try { await login(server, user, pass); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); router.replace('/inbox'); startPush(); startCalls(); }
    catch (e: any) { setErr(e.status === 403 ? 'Wrong username or password' : e.message || 'Could not sign in'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); }
    setBusy(false);
  }
  const input = [styles.input, { backgroundColor: t.fill, color: t.ink }];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.wrap, { paddingTop: ins.top + 60 }]}>
        <Text style={[styles.title, { color: t.ink }]}>Inbox</Text>
        <Text style={[styles.sub, { color: t.soft }]}>WhatsApp, Instagram and Messenger in one place</Text>
        <TextInput style={input} placeholder="Username" placeholderTextColor={t.soft} value={user} onChangeText={setUser}
          autoCapitalize="none" autoCorrect={false} textContentType="username" returnKeyType="next" />
        <TextInput style={input} placeholder="Password" placeholderTextColor={t.soft} value={pass} onChangeText={setPass}
          secureTextEntry textContentType="password" returnKeyType="go" onSubmitEditing={go} />
        {showServer && (
          <TextInput style={input} placeholder="Server address" placeholderTextColor={t.soft} value={server} onChangeText={setServer}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        )}
        {!!err && <Text style={[styles.err, { color: t.red }]}>{err}</Text>}
        <Pressable onPress={go} disabled={busy} style={({ pressed }) => [styles.btn, { backgroundColor: t.primary, opacity: pressed || busy ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          {busy ? <ActivityIndicator color={t.primaryText} /> : <Text style={[styles.btnTxt, { color: t.primaryText }]}>Sign in</Text>}
        </Pressable>
        <Pressable onPress={() => setShowServer(s => !s)} hitSlop={10}>
          <Text style={[styles.link, { color: t.soft }]}>{showServer ? 'Hide server' : 'Different server?'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  sub: { fontSize: 16, marginBottom: 24 },
  input: { height: 52, borderRadius: 14, paddingHorizontal: 16, fontSize: 17 },
  err: { fontSize: 15 },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnTxt: { fontSize: 17, fontWeight: '600' },
  link: { textAlign: 'center', fontSize: 15, marginTop: 8 },
});
