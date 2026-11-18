import React, { useEffect, useState } from 'react';
import { View, Platform, Switch, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { DetailScreen } from '../../src/components/TopBar';
import { DOC_ICON } from '../../src/components/DocIcon';
import { Card, T, Section, Note, Button, Chips, Pill, IconBubble, Field, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useVault, pickFile, pickPhoto, addDoc, deleteDoc, openDoc, shareDoc, webData, DOC_TYPES, DocType, VaultDoc, getLock, setLock } from '../../src/lib/vault';
import { DateField } from '../../src/components/ui';
import { fmt, daysTo } from '../../src/lib/compliance';
import { readText, parseDocument, statusUpdates, ocrAvailable, Found } from '../../src/lib/ocr';
import { loadProfile, saveProfile, Profile, VisaType, useProfile } from '../../src/lib/profile';
import { people } from '../../src/lib/people';
import { useFamily } from '../../src/lib/family';

const BIO = Platform.OS === 'android' ? 'fingerprint' : 'Face ID';
const ICON_UNUSED: Record<string, any> = { 'I-129S (blanket L)': 'layers-outline', 'Receipt (I-797C)': 'receipt-outline', 'Approval (I-797A/B)': 'ribbon-outline', 'I-94': 'document-text-outline', 'Visa stamp': 'card-outline', Passport: 'airplane-outline', 'EAD card': 'id-card-outline', LCA: 'briefcase-outline', 'Green card': 'card-outline', 'Pay stub / W-2': 'cash-outline', Other: 'document-outline' };

function DocRow({ d, who }: { d: VaultDoc; who?: string }) {
  const router = useRouter();
  const t = useTheme();
  const [preview, setPreview] = useState<string | null>(null);
  const days = daysTo(d.expires);
  const open = async () => {
    tap();
    if (Platform.OS === 'web') { setPreview(preview ? null : await webData(d)); return; }
    openDoc(d);
  };
  const remove = () => {
    if (Platform.OS === 'web') { deleteDoc(d); return; }
    Alert.alert('Delete document?', d.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(d) }]);
  };
  return (
    <Card style={{ marginBottom: 10 }}>
      <Pressable onPress={() => router.push(`/status/doc?id=${d.id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble name={DOC_ICON[d.type] ?? 'document-outline'} tone="neutral" size={40} />
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>{d.title}</T>
          <T v="small" style={{ marginTop: 2 }}>{who ? `${who} · ` : ''}{d.type}{d.receipt ? ` · ${d.receipt}` : ''} · {Math.max(1, Math.round(d.size / 1024))} KB</T>
          {d.expires ? <View style={{ marginTop: 6 }}><Pill small label={days! < 0 ? `Expired ${fmt(d.expires)}` : `Valid to ${fmt(d.expires)}`} tone={days! < 0 ? 'red' : days! <= 90 ? 'amber' : 'green'} /></View> : null}
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 12, paddingLeft: 52 }}>
        <Pressable onPress={open} hitSlop={8}><T v="small" style={{ color: t.accent, fontWeight: '700' }}>{Platform.OS === 'web' ? (preview ? 'Hide' : 'View') : 'Open'}</T></Pressable>
        {Platform.OS !== 'web' ? <Pressable onPress={() => shareDoc(d)} hitSlop={8}><T v="small" style={{ color: t.accent, fontWeight: '700' }}>Share</T></Pressable> : null}
        <Pressable onPress={remove} hitSlop={8}><T v="small" style={{ color: t.red, fontWeight: '700' }}>Delete</T></Pressable>
      </View>
      {preview && d.mime.startsWith('image/') ? <Image source={{ uri: preview }} style={{ width: '100%', height: 260, marginTop: 12, borderRadius: 12 }} resizeMode="contain" /> : null}
      {preview && !d.mime.startsWith('image/') ? <View style={{ marginTop: 12 }}><Note>PDFs open full screen in the phone app.</Note></View> : null}
    </Card>
  );
}

export default function Vault() {
  const t = useTheme();
  const [docs] = useVault();
  const params = useLocalSearchParams<{ add?: string; member?: string; owner?: string }>();
  const router = useRouter();
  const [me] = useProfile();
  const [family] = useFamily();
  const plist = people(me, family);
  const [owner, setOwner] = useState<string>(params.owner || params.member || 'all');
  useEffect(() => { if (params.add === '1') router.replace((params.member ? `/status/add?member=${params.member}` : '/status/add') as any); }, []);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [lockOn, setLockOn] = useState(false);
  const [filter, setFilter] = useState<'All' | DocType>('All');

  useEffect(() => {
    (async () => {
      const on = await getLock();
      setLockOn(on);
      if (on && Platform.OS !== 'web') {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your documents' });
        setLocked(!r.success);
      } else setLocked(false);
    })();
  }, []);

  const toggleLock = async (v: boolean) => {
    if (v && Platform.OS !== 'web') {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!ok) return;
    }
    setLockOn(v); setLock(v);
  };

  if (locked === null) return <DetailScreen title="My documents"><ActivityIndicator color={t.sub} style={{ marginTop: 40 }} /></DetailScreen>;
  if (locked) return (
    <DetailScreen title="My documents">
      <View style={{ alignItems: 'center', padding: 40 }}>
        <Ionicons name="lock-closed" size={44} color={t.sub} />
        <T v="h2" style={{ marginTop: 14 }}>Locked</T>
        <View style={{ marginTop: 18, alignSelf: 'stretch' }}><Button label={`Unlock with ${BIO}`} onPress={async () => { const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your documents' }); setLocked(!r.success); }} /></View>
      </View>
    </DetailScreen>
  );

  const types = ['All', ...DOC_TYPES.filter((d) => docs.some((x) => x.type === d))] as ('All' | DocType)[];
  const shown = docs.filter((d) => (filter === 'All' || d.type === filter) && (owner === 'all' || (d.owner || 'me') === owner));
  const nameOf = (id?: string) => plist.find((x) => x.id === (id || 'me'))?.name ?? 'Me';

  return (
    <DetailScreen title="My documents">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">My documents</T>
        <T v="sub" style={{ marginTop: 4 }}>For you and your family · stored only on this phone.</T>
      </View>
      {plist.length > 1 ? <View style={{ marginTop: 16 }}><Chips options={[{ label: 'Everyone', value: 'all' }, ...plist.map((x) => ({ label: x.short, value: x.id }))]} value={owner} onChange={setOwner} /></View> : null}
      {docs.length > 1 ? <View style={{ marginTop: 8 }}><Chips options={types.map((x) => ({ label: x, value: x }))} value={filter} onChange={setFilter} /></View> : null}
      <Section>
        {shown.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Ionicons name="folder-open-outline" size={36} color={t.faint} />
            <T v="h3" style={{ marginTop: 10 }}>No documents yet</T>
            <T v="sub" style={{ textAlign: 'center', marginTop: 4, maxWidth: 270 }}>Add your receipt notices, approvals, I-94, passport and EAD so they’re always with you.</T>
          </Card>
        ) : shown.map((d) => <DocRow key={d.id} d={d} who={plist.length > 1 && owner === 'all' ? nameOf(d.owner) : undefined} />)}
      </Section>
      <Section title="Privacy">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 15 }}>{`Lock with ${BIO}`}</T>
              <T v="small" style={{ marginTop: 2 }}>{`Ask for ${BIO} or your phone passcode before opening`}</T>
            </View>
            <Switch value={lockOn} onValueChange={toggleLock} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
          </View>
          <View style={{ marginTop: 12 }}><Note>{`Files live only on this phone (included in your encrypted ${Platform.OS === 'ios' ? 'iPhone' : 'Google'} backup). Deleting the app deletes them — keep originals too.`}</Note></View>
        </Card>
      </Section>
    </DetailScreen>
  );
}
