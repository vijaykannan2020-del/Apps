import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMPTY, loadSettings, saveSettings } from '../src/store';
import { normalizeMac, normalizePortal, type Settings } from '../src/portal';
import { C } from '../src/theme';
import release from '../src/release.json';

const MODELS = ['MAG254', 'MAG250', 'MAG322', 'AuraHD9'];

function Field({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ color: C.dim, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#5f5a7d"
        autoCapitalize="none" autoCorrect={false}
        style={{ backgroundColor: C.card, color: C.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, borderWidth: 1, borderColor: C.line }}
      />
      {hint ? <Text style={{ color: '#6f6a8f', fontSize: 12, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<Settings>(EMPTY);
  const [err, setErr] = useState('');
  useEffect(() => { loadSettings().then(setS); }, []);
  const up = (k: keyof Settings) => (v: string) => setS(p => ({ ...p, [k]: v }));

  async function save() {
    try {
      normalizePortal(s.portal); normalizeMac(s.mac);
      await saveSettings({ ...s, mac: normalizeMac(s.mac), portal: s.portal.trim() });
      router.back();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
          <Text style={{ color: C.text, fontSize: 26, fontWeight: '800', flex: 1 }}>Your IPTV</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={{ color: C.dim, fontSize: 16 }}>Close</Text></Pressable>
        </View>
        <Field label="Portal URL" value={s.portal} onChange={up('portal')} placeholder="http://yourportal.com/c/" />
        <Field label="MAC address" value={s.mac} onChange={up('mac')} placeholder="00:1A:79:AB:CD:EF" />
        <Text style={{ color: C.dim, fontSize: 13, marginBottom: 8 }}>Box model</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {MODELS.map(m => (
            <Pressable key={m} onPress={() => up('model')(m)}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: s.model === m ? C.accent : C.card, borderWidth: 1, borderColor: s.model === m ? C.accent : C.line }}>
              <Text style={{ color: C.text, fontWeight: '600' }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Serial number (optional)" value={s.serial} onChange={up('serial')} placeholder="From your box's settings" />
        <Field label="Device ID (optional)" value={s.deviceId} onChange={up('deviceId')} hint='Leave blank if your box has "Send Device ID" turned off.' />
        {err ? <Text style={{ color: C.danger, marginBottom: 14 }}>{err}</Text> : null}
        <Pressable onPress={save} style={{ backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>Save</Text>
        </Pressable>
        <Text style={{ color: '#6f6a8f', fontSize: 12, marginTop: 16, textAlign: 'center' }}>Saved only on this iPhone.{'\n'}Sideline TV version 1.{release.n}{release.at ? ' · ' + release.at.slice(0, 16).replace('T', ' ') + ' UTC' : ''}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
