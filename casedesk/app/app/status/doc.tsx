// One saved document: see it, check and edit what was read from it, and push its dates to the right person.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Button, Field, DateField, Chips, Note, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useVault, updateDoc, deleteDoc, openDoc, shareDoc, DOC_TYPES, DocType } from '../../src/lib/vault';
import { statusUpdates, readText, parseDocument, ocrAvailable } from '../../src/lib/ocr';
import { useProfile, loadProfile, saveProfile } from '../../src/lib/profile';
import { useFamily, loadFamily, saveMember } from '../../src/lib/family';
import { people } from '../../src/lib/people';
import { upsertCase, read as readStore } from '../../src/lib/store';
import { DocPreview, useDocUri } from '../../src/components/DocPreview';

export default function DocDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [docs, ready] = useVault();
  const doc = docs.find((d) => d.id === id);
  const uri = useDocUri(doc);
  const [me] = useProfile();
  const [family] = useFamily();
  const plist = useMemo(() => people(me, family), [me, family]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocType>('Other');
  const [owner, setOwner] = useState('me');
  const [expires, setExpires] = useState('');
  const [receipt, setReceipt] = useState('');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title); setType(doc.type); setOwner(doc.owner || 'me'); setExpires(doc.expires || ''); setReceipt(doc.receipt || ''); setName(doc.name || '');
  }, [doc?.id]);

  // Documents saved before names were read (or where the name wasn't found): read it again from the file.
  const reread = async (silent = false) => {
    if (!doc || !uri || !ocrAvailable()) return;
    setReading(true);
    try {
      const text = await readText(uri, doc.mime);
      const f = text ? parseDocument(text) : null;
      if (f?.name) setName((n) => n || f.name!);
      if (f?.validTo) setExpires((e) => e || f.validTo!);
      if (!silent) setMsg(f?.name ? `Reads “${f.name}”` : 'No name found — type it in.');
    } catch { if (!silent) setMsg('Couldn’t read this document — type the name in.'); }
    setReading(false);
  };
  useEffect(() => {
    if (doc && uri && !doc.name && ['Passport', 'Visa stamp', 'I-94', 'EAD card'].includes(doc.type)) reread(true);
  }, [doc?.id, uri]);

  if (ready && !doc) return <DetailScreen title="Document"><View style={{ padding: 20 }}><T v="sub">This document was removed.</T></View></DetailScreen>;
  if (!doc) return <DetailScreen title="Document"><View /></DetailScreen>;

  const who = plist.find((x) => x.id === owner);
  const ups = statusUpdates({ lines: 0, type, validTo: expires || undefined, receipt: receipt || undefined });
  const dirty = name !== (doc.name || '') || title !== doc.title || type !== doc.type || owner !== (doc.owner || 'me') || expires !== (doc.expires || '') || receipt !== (doc.receipt || '');

  const save = async () => {
    await updateDoc({ ...doc, name: name.trim() || undefined, title: title.trim() || doc.title, type, owner, expires: expires || undefined, receipt: receipt.trim().toUpperCase() || undefined });
    tap(); setMsg('Saved');
  };
  const apply = async () => {
    await save();
    if (owner === 'me') {
      const p = (await loadProfile()) ?? { visa: 'H-1B' as const };
      for (const u of ups) (p as any)[u.field] = u.value;
      if (type === 'I-129S (blanket L)') p.blanket = true;
      await saveProfile(p);
    } else {
      const m = (await loadFamily()).find((x) => x.id === owner);
      if (m) { for (const u of ups) (m.profile as any)[u.field] = u.value; if (type === 'I-129S (blanket L)') m.profile.blanket = true; await saveMember(m); }
    }
    const r = receipt.trim().toUpperCase();
    if (/^[A-Z]{3}\d{10}$/.test(r)) {
      const exists = (await readStore<{ receipt: string }[]>('cd.cases.v1', [])).some((c) => c.receipt === r);
      if (!exists) await upsertCase({ receipt: r, owner, history: [] });
    }
    tap(); setMsg(`Updated ${owner === 'me' ? 'your' : (who?.short ?? '') + '’s'} ${ups.map((u) => u.label.toLowerCase()).join(', ')}`);
  };
  const ownerName = owner === 'me' ? me?.name?.trim() || '' : family.find((x) => x.id === owner)?.name?.trim() || '';
  const nameDiffers = !!name.trim() && name.trim().toLowerCase() !== ownerName.toLowerCase();
  const useName = async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    await save();
    if (owner === 'me') { const p = (await loadProfile()) ?? { visa: 'H-1B' as const }; p.name = n; await saveProfile(p); }
    else { const m = (await loadFamily()).find((x) => x.id === owner); if (m) { m.name = n; await saveMember(m); } }
    tap(); setMsg(`Name set to ${n}`);
  };
  const remove = () => {
    const go = async () => { await deleteDoc(doc); router.back(); };
    if (Platform.OS === 'web') go();
    else Alert.alert('Delete this document?', 'It is removed from this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  return (
    <DetailScreen title={doc.type === 'Other' ? 'Document' : doc.type}>
      <View style={{ paddingHorizontal: 20 }}>
        <DocPreview uri={uri} mime={doc.mime} height={260} onOpenExternal={() => openDoc(doc)} />
        <T v="small" style={{ marginTop: 8, textAlign: 'center' }}>Check the details below against the document. Tap it to see it full screen.</T>

        <Card style={{ marginTop: 16 }}>
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field label="Name on document" value={name} onChangeText={setName} placeholder={reading ? 'Reading…' : 'Type the name as printed'} autoCapitalize="words" />
          {nameDiffers ? <View style={{ marginTop: -4, marginBottom: 14 }}><Button label={`Use as ${owner === 'me' ? 'my' : 'this person’s'} name${ownerName ? ` (now “${ownerName}”)` : ''}`} kind="secondary" icon="person-outline" onPress={useName} /></View> : null}
          {!name && !reading && ocrAvailable() ? <View style={{ marginTop: -4, marginBottom: 14 }}><Button label="Read name from document" kind="secondary" icon="scan-outline" onPress={() => reread()} /></View> : null}
          <T v="label" style={{ marginBottom: 8 }}>Whose document</T>
          <View style={{ marginHorizontal: -36, marginBottom: 14 }}><Chips options={plist.map((x) => ({ label: x.short, value: x.id }))} value={owner} onChange={setOwner} /></View>
          <T v="label" style={{ marginBottom: 8 }}>Type</T>
          <View style={{ marginHorizontal: -36, marginBottom: 14 }}><Chips options={DOC_TYPES.map((d) => ({ label: d, value: d }))} value={type} onChange={(v) => setType(v as DocType)} /></View>
          <DateField label="Valid until" value={expires} onChange={setExpires} />
          <Field label="Receipt number (if any)" value={receipt} onChangeText={(v) => setReceipt(v.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" maxLength={13} />
        </Card>

        {msg ? <View style={{ marginTop: 12 }}><Note tone="accent">{msg}</Note></View> : null}
        <View style={{ marginTop: 14, gap: 10 }}>
          {ups.length ? <Button label={`Save & update ${owner === 'me' ? 'my' : (who?.short ?? '') + '’s'} dates`} icon="checkmark-circle" onPress={apply} /> : null}
          <Button label="Save changes" kind={ups.length ? 'secondary' : 'primary'} disabled={!dirty} onPress={save} />
          {Platform.OS !== 'web' ? <Button label="Share or export" kind="secondary" icon="share-outline" onPress={() => shareDoc(doc)} /> : null}
          <Button label="Delete document" kind="secondary" icon="trash-outline" onPress={remove} />
        </View>
      </View>
    </DetailScreen>
  );
}
