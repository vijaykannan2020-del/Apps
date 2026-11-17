import React, { useEffect, useState } from 'react';
import { View, Platform, Switch, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Note, Button, Chips, Pill, IconBubble, Field, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useVault, pickFile, pickPhoto, addDoc, deleteDoc, openDoc, shareDoc, webData, DOC_TYPES, DocType, VaultDoc, getLock, setLock } from '../../src/lib/vault';
import { DateField } from '../../src/components/ui';
import { fmt, daysTo } from '../../src/lib/compliance';
import { readText, parseDocument, statusUpdates, ocrAvailable, Found } from '../../src/lib/ocr';
import { loadProfile, saveProfile, Profile, VisaType } from '../../src/lib/profile';

const CLASS_TO_VISA: Record<string, VisaType> = { H1B: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', TN: 'TN', H4: 'H-4', L2S: 'L-2S', F1: 'F-1 OPT' };

async function applyToStatus(f: Found) {
  const ups = statusUpdates(f);
  if (!ups.length) return 0;
  const p: Profile = (await loadProfile()) ?? { visa: CLASS_TO_VISA[f.classOfAdmission ?? ''] ?? 'H-1B' };
  for (const u of ups) (p as any)[u.field] = u.value;
  await saveProfile(p);
  return ups.length;
}

const BIO = Platform.OS === 'android' ? 'fingerprint' : 'Face ID';
const ICON: Record<string, any> = { 'Receipt (I-797C)': 'receipt-outline', 'Approval (I-797A/B)': 'ribbon-outline', 'I-94': 'document-text-outline', 'Visa stamp': 'card-outline', Passport: 'airplane-outline', 'EAD card': 'id-card-outline', LCA: 'briefcase-outline', 'Green card': 'card-outline', 'Pay stub / W-2': 'cash-outline', Other: 'document-outline' };

function AddSheet({ onDone }: { onDone: (msg?: string) => void }) {
  const t = useTheme();
  const [picked, setPicked] = useState<Awaited<ReturnType<typeof pickFile>>>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocType>('Approval (I-797A/B)');
  const [expires, setExpires] = useState('');
  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [readNote, setReadNote] = useState('');
  const [applyStatus, setApplyStatus] = useState(true);
  const [err, setErr] = useState('');

  const onPicked = async (f: Awaited<ReturnType<typeof pickFile>>) => {
    if (!f) return;
    setPicked(f); setErr(''); setFound(null); setReadNote('');
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ''));
    if (!ocrAvailable()) { setReadNote('Auto-read works in the phone app. Fill in the details below.'); return; }
    setReading(true);
    const text = await readText(f.uri, f.mime);
    setReading(false);
    if (!text || text.trim().length < 20) { setReadNote('Couldn’t read text from this file (it may be a scan). Try a clear photo, or fill in below.'); return; }
    const d = parseDocument(text);
    setFound(d);
    if (d.type) { setType(d.type); setTitle((x) => (x && x !== f.name.replace(/\.[a-z0-9]+$/i, '') ? x : `${d.type}${d.validTo ? ' · ' + fmt(d.validTo) : ''}`)); }
    if (d.receipt) setReceipt(d.receipt);
    if (d.validTo) setExpires(d.validTo);
    if (!d.type && !d.validTo && !d.receipt) setReadNote('Read the document but found no dates I recognise. Fill in below.');
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true); setErr('');
    try {
      await addDoc({ title: title.trim() || picked.name, type, expires: expires || undefined, receipt: receipt.trim() || undefined, fileName: picked.name, mime: picked.mime, size: picked.size }, picked);
      let n = 0;
      if (found && applyStatus) n = await applyToStatus({ ...found, type, validTo: expires || found.validTo, receipt: receipt || found.receipt });
      onDone(n ? `Saved · My Status updated (${n} date${n > 1 ? 's' : ''})` : 'Saved');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const ups = found ? statusUpdates({ ...found, type, validTo: expires || found.validTo, receipt: receipt || found.receipt }) : [];

  return (
    <Card style={{ marginBottom: 14 }}>
      {picked ? (
        <Button label={`✓ ${picked.name}`} kind="secondary" icon="attach" onPress={async () => onPicked(await pickFile())} />
      ) : (
        <View style={{ gap: 10 }}>
          {Platform.OS !== 'web' ? <Button label="Scan with camera" icon="camera" onPress={async () => { try { onPicked(await pickPhoto(true)); } catch (e: any) { setErr(e.message); } }} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="PDF / file" kind="secondary" icon="document-attach-outline" onPress={async () => onPicked(await pickFile())} /></View>
            <View style={{ flex: 1 }}><Button label="Photos" kind="secondary" icon="images-outline" onPress={async () => { try { onPicked(await pickPhoto(false)); } catch (e: any) { setErr(e.message); } }} /></View>
          </View>
          <T v="small" style={{ textAlign: 'center' }}>Dates are read on your phone — nothing is uploaded.</T>
        </View>
      )}

      {reading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}><ActivityIndicator color={t.sub} /><T v="sub">Reading the document…</T></View> : null}
      {readNote ? <View style={{ marginTop: 12 }}><Note tone="amber">{readNote}</Note></View> : null}
      {found && (found.type || found.validTo || found.receipt) ? (
        <View style={{ marginTop: 14, backgroundColor: t.greenSoft, borderRadius: 14, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={15} color={t.green} />
            <T v="h3" style={{ fontSize: 14, color: t.green }}>Found on the document</T>
          </View>
          {[
            ['Type', found.type], ['Receipt', found.receipt], ['Class', found.classOfAdmission], ['Category', found.category],
            ['Valid from', found.validFrom && fmt(found.validFrom)], ['Valid to', found.validTo && fmt(found.validTo)], ['Received', found.receivedDate && fmt(found.receivedDate)],
          ].filter(([, v]) => v).map(([k, v]) => (
            <View key={k as string} style={{ flexDirection: 'row', marginTop: 6 }}>
              <T v="small" style={{ width: 84 }}>{k}</T><T v="body" style={{ flex: 1, fontSize: 14 }}>{v}</T>
            </View>
          ))}
          <T v="small" style={{ marginTop: 8 }}>Check these against the document — you can edit them below.</T>
        </View>
      ) : null}

      {picked ? (
        <>
          <View style={{ height: 14 }} />
          <T v="label" style={{ marginBottom: 8 }}>Type</T>
          <View style={{ marginHorizontal: -36, marginBottom: 14 }}>
            <Chips options={DOC_TYPES.map((d) => ({ label: d, value: d }))} value={type} onChange={setType} />
          </View>
          <Field label="Name" placeholder="e.g. H-1B approval 2026" value={title} onChangeText={setTitle} />
          <Field label="Receipt number (optional)" placeholder="e.g. WAC2690012345" autoCapitalize="characters" value={receipt} onChangeText={setReceipt} />
          <DateField label="Valid until (optional)" value={expires} onChange={setExpires} />
          {ups.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <T v="h3" style={{ fontSize: 15 }}>Also update My Status</T>
                <T v="small" style={{ marginTop: 2 }}>{ups.map((u) => `${u.label}: ${u.field === 'extReceipt' ? u.value : fmt(u.value)}`).join(' · ')}</T>
              </View>
              <Switch value={applyStatus} onValueChange={setApplyStatus} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
            </View>
          ) : null}
          {err ? <View style={{ marginBottom: 10 }}><Note tone="red">{err}</Note></View> : null}
          {busy ? <ActivityIndicator color={t.text} /> : <Button label="Save to my phone" icon="lock-closed" onPress={save} disabled={reading} />}
        </>
      ) : err ? <View style={{ marginTop: 10 }}><Note tone="red">{err}</Note></View> : null}
    </Card>
  );
}

function DocRow({ d }: { d: VaultDoc }) {
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
      <Pressable onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble name={ICON[d.type] ?? 'document-outline'} tone="neutral" size={40} />
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>{d.title}</T>
          <T v="small" style={{ marginTop: 2 }}>{d.type}{d.receipt ? ` · ${d.receipt}` : ''} · {Math.max(1, Math.round(d.size / 1024))} KB</T>
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
  const params = useLocalSearchParams<{ add?: string }>();
  const [adding, setAdding] = useState(params.add === '1');
  const [toast, setToast] = useState('');
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
  const shown = docs.filter((d) => filter === 'All' || d.type === filter);

  return (
    <DetailScreen title="My documents">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">My documents</T>
        <T v="sub" style={{ marginTop: 4 }}>Stored in this app’s private folder on your phone. Nothing is uploaded.</T>
      </View>
      <Section>
        {adding ? <AddSheet onDone={(m) => { setAdding(false); setToast(m ?? ''); }} /> : <Button label="Add or scan a document" icon="scan" onPress={() => { setAdding(true); setToast(''); }} />}
        {toast ? <View style={{ marginTop: 10 }}><Note tone="accent">{toast}</Note></View> : null}
      </Section>
      {docs.length > 1 ? <View style={{ marginTop: 16 }}><Chips options={types.map((x) => ({ label: x, value: x }))} value={filter} onChange={setFilter} /></View> : null}
      <Section>
        {shown.length === 0 && !adding ? (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Ionicons name="folder-open-outline" size={36} color={t.faint} />
            <T v="h3" style={{ marginTop: 10 }}>No documents yet</T>
            <T v="sub" style={{ textAlign: 'center', marginTop: 4, maxWidth: 270 }}>Add your receipt notices, approvals, I-94, passport and EAD so they’re always with you.</T>
          </Card>
        ) : shown.map((d) => <DocRow key={d.id} d={d} />)}
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
