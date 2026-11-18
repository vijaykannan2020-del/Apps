// Add documents — one or many at once. Each file is read on the phone, matched to the right person
// (by the name printed on it), and can fill that person's dates and start tracking its receipt number.
import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Switch, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Button, Note, Chips, DateField, Pill, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { pickFiles, pickPhotos, pickPhoto, addDoc, DOC_TYPES, DocType, Picked } from '../../src/lib/vault';
import { readText, parseDocument, statusUpdates, ocrAvailable, Found } from '../../src/lib/ocr';
import { loadProfile, saveProfile, Profile, useProfile, VisaType } from '../../src/lib/profile';
import { useFamily, loadFamily, saveMember } from '../../src/lib/family';
import { people, matchOwner, initials, Person } from '../../src/lib/people';
import { upsertCase, read as readStore } from '../../src/lib/store';
import { fmt } from '../../src/lib/compliance';
import { DOC_ICON } from '../../src/components/DocIcon';

type Item = {
  key: string; file: Picked; state: 'reading' | 'done' | 'unread';
  found?: Found; type: DocType; owner: string; validTo: string; receipt: string;
  applyDates: boolean; addCase: boolean; open: boolean;
};
const CLASS_TO_VISA: Record<string, VisaType> = { H1B: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', TN: 'TN', H4: 'H-4', L2S: 'L-2S', L2: 'L-2', TD: 'TD', F1: 'F-1 OPT', F2: 'F-2' };

function Avatar({ p, on, onPress }: { p: Person; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ alignItems: 'center', width: 58 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: on ? t.accent : t.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 1, borderColor: t.border }}>
        <T v="h3" style={{ fontSize: 14, color: on ? '#fff' : t.sub }}>{p.id === 'me' && p.name === 'Me' ? 'Me' : initials(p.name)}</T>
      </View>
      <T v="small" numberOfLines={1} style={{ marginTop: 4, color: on ? t.text : t.sub, fontSize: 11 }}>{p.id === 'me' ? 'Me' : p.name}</T>
    </Pressable>
  );
}

export default function AddDocuments() {
  const t = useTheme();
  const router = useRouter();
  const { member } = useLocalSearchParams<{ member?: string }>();
  const [me] = useProfile();
  const [family] = useFamily();
  const list = useMemo(() => people(me, family), [me, family]);
  const fallbackOwner = member || 'me';
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const canRead = ocrAvailable();

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const add = (files: Picked[]) => {
    if (!files.length) return;
    const fresh: Item[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`, file: f, state: canRead ? 'reading' : 'unread',
      type: 'Other', owner: fallbackOwner, validTo: '', receipt: '', applyDates: true, addCase: true, open: !canRead,
    }));
    setItems((xs) => [...xs, ...fresh]);
    if (!canRead) return;
    // Read one at a time so big scans don't compete for memory.
    for (const it of fresh) {
      queue.current = queue.current.then(async () => {
        const text = await readText(it.file.uri, it.file.mime);
        if (!text || text.replace(/\s/g, '').length < 20) { patch(it.key, { state: 'unread', open: true }); return; }
        const f = parseDocument(text);
        patch(it.key, {
          state: 'done', found: f, type: f.type ?? 'Other', validTo: f.validTo ?? '', receipt: f.receipt ?? '',
          owner: matchOwner(f.name, list, fallbackOwner), open: !f.type && !f.validTo,
        });
      });
    }
  };

  const pick = async (src: 'camera' | 'photos' | 'files') => {
    setErr('');
    try {
      if (src === 'camera') { const p = await pickPhoto(true); if (p) add([p]); }
      else if (src === 'photos') add(await pickPhotos());
      else add(await pickFiles());
    } catch (e: any) { setErr(e.message); }
  };

  const reading = items.some((x) => x.state === 'reading');

  const saveAll = async () => {
    setSaving(true); setErr('');
    try {
      const fam = await loadFamily();
      let mine: Profile | null = await loadProfile();
      const existing = new Set((await readStore<{ receipt: string }[]>('cd.cases.v1', [])).map((c) => c.receipt));
      for (const it of items) {
        const who = list.find((p) => p.id === it.owner);
        const title = `${it.owner !== 'me' && who ? who.name + ' · ' : ''}${it.type}${it.validTo ? ' · ' + fmt(it.validTo) : ''}`;
        await addDoc({ title, type: it.type, expires: it.validTo || undefined, receipt: it.receipt || undefined, fileName: it.file.name, mime: it.file.mime, size: it.file.size, owner: it.owner }, it.file);
        const f: Found = { ...(it.found || { lines: 0 }), type: it.type, validTo: it.validTo || undefined, receipt: it.receipt || undefined };
        const ups = it.applyDates ? statusUpdates(f) : [];
        if (ups.length) {
          if (it.owner === 'me') {
            mine = mine ?? { visa: CLASS_TO_VISA[f.classOfAdmission ?? ''] ?? 'H-1B' };
            for (const u of ups) (mine as any)[u.field] = u.value;
            if (it.type === 'I-129S (blanket L)') mine.blanket = true;
            if (f.name && !mine.name) mine.name = f.name;
          } else {
            const m = fam.find((x) => x.id === it.owner);
            if (m) {
              for (const u of ups) (m.profile as any)[u.field] = u.value;
              if (it.type === 'I-129S (blanket L)') m.profile.blanket = true;
              if (f.name && (!m.name || m.name === m.relation)) m.name = f.name.split(' ')[0];
            }
          }
        }
        if (it.addCase && it.receipt && /^[A-Z]{3}\d{10}$/.test(it.receipt) && !existing.has(it.receipt)) {
          await upsertCase({ receipt: it.receipt, form: f.form, owner: it.owner, nickname: it.owner !== 'me' && who ? `${who.name}${f.form ? ' · ' + f.form : ''}` : undefined, history: [] });
          existing.add(it.receipt);
        }
      }
      if (mine) await saveProfile(mine);
      for (const m of fam) await saveMember(m);
      tap();
      router.back();
    } catch (e: any) { setErr(e.message || 'Could not save.'); }
    setSaving(false);
  };

  const Source = ({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) => (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flex: 1, backgroundColor: t.surface, borderRadius: 18, paddingVertical: 18, alignItems: 'center', opacity: pressed ? 0.7 : 1, borderWidth: 0.5, borderColor: t.border })}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={t.accent} />
      </View>
      <T v="h3" style={{ fontSize: 14, marginTop: 8 }}>{label}</T>
    </Pressable>
  );

  return (
    <DetailScreen title="Add documents" modal>
      <View style={{ paddingHorizontal: 20 }}>
        <T v="sub">Pick one or many. CaseDesk reads each on your phone, files it under the right person, fills their dates and tracks receipt numbers.</T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {Platform.OS !== 'web' ? <Source icon="camera-outline" label="Camera" onPress={() => pick('camera')} /> : null}
          <Source icon="images-outline" label="Photos" onPress={() => pick('photos')} />
          <Source icon="document-attach-outline" label="Files" onPress={() => pick('files')} />
        </View>
        {!canRead ? <View style={{ marginTop: 12 }}><Note tone="amber">Auto-reading works in the installed app (not Expo Go or the preview). You can still add details by hand.</Note></View> : null}
        {err ? <View style={{ marginTop: 12 }}><Note tone="red">{err}</Note></View> : null}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 12 }}>
        {items.map((it) => {
          const who = list.find((p) => p.id === it.owner);
          const ups = it.state !== 'reading' ? statusUpdates({ ...(it.found || { lines: 0 }), type: it.type, validTo: it.validTo || undefined, receipt: it.receipt || undefined }) : [];
          return (
            <Card key={it.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={DOC_ICON[it.type] ?? 'document-outline'} size={20} color={t.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3" numberOfLines={1}>{it.state === 'reading' ? 'Reading…' : it.type === 'Other' ? 'Document' : it.type}</T>
                  <T v="small" numberOfLines={1}>{it.file.name}</T>
                </View>
                {it.state === 'reading' ? <ActivityIndicator color={t.sub} /> : (
                  <Pressable onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} hitSlop={10}><Ionicons name="close-circle" size={22} color={t.faint} /></Pressable>
                )}
              </View>

              {it.state !== 'reading' ? (
                <>
                  {it.state === 'unread' && canRead ? <View style={{ marginTop: 10 }}><Note tone="amber">Couldn’t read this one — choose the type and date below.</Note></View> : null}
                  <T v="label" style={{ marginTop: 14, marginBottom: 8 }}>Whose document{it.found?.name ? ` · reads “${it.found.name}”` : ''}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {list.map((p) => <Avatar key={p.id} p={p} on={it.owner === p.id} onPress={() => patch(it.key, { owner: p.id })} />)}
                  </View>

                  <View style={{ marginTop: 12, gap: 8 }}>
                    {it.validTo ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="calendar-outline" size={16} color={t.sub} /><T v="body">Valid to <T v="h3" style={{ fontSize: 15 }}>{fmt(it.validTo)}</T></T></View> : null}
                    {it.receipt ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="receipt-outline" size={16} color={t.sub} /><T v="body">{it.receipt}{it.found?.form ? ` · ${it.found.form}` : ''}</T></View> : null}
                  </View>

                  {ups.length ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                      <T v="body" style={{ flex: 1, fontSize: 14 }}>Update {it.owner === 'me' ? 'my' : `${who?.name}’s`} {ups.map((u) => u.label.toLowerCase()).join(', ')}</T>
                      <Switch value={it.applyDates} onValueChange={(v) => patch(it.key, { applyDates: v })} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
                    </View>
                  ) : null}
                  {it.receipt ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <T v="body" style={{ flex: 1, fontSize: 14 }}>Track this receipt in Cases</T>
                      <Switch value={it.addCase} onValueChange={(v) => patch(it.key, { addCase: v })} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
                    </View>
                  ) : null}

                  <Pressable onPress={() => patch(it.key, { open: !it.open })} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <T v="small" style={{ color: t.accent, fontWeight: '700' }}>{it.open ? 'Hide details' : 'Edit details'}</T>
                    <Ionicons name={it.open ? 'chevron-up' : 'chevron-down'} size={14} color={t.accent} />
                  </Pressable>
                  {it.open ? (
                    <View style={{ marginTop: 10 }}>
                      <T v="label" style={{ marginBottom: 8 }}>Type</T>
                      <View style={{ marginHorizontal: -36, marginBottom: 12 }}><Chips options={DOC_TYPES.map((d) => ({ label: d, value: d }))} value={it.type} onChange={(v) => patch(it.key, { type: v })} /></View>
                      <DateField label="Valid until" value={it.validTo} onChange={(v) => patch(it.key, { validTo: v })} />
                    </View>
                  ) : null}
                </>
              ) : null}
            </Card>
          );
        })}
      </View>

      {items.length ? (
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          {saving ? <ActivityIndicator color={t.text} /> : <Button label={reading ? 'Reading…' : `Save ${items.length} document${items.length > 1 ? 's' : ''}`} icon="lock-closed" disabled={reading} onPress={saveAll} />}
          <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>Stored only on this phone.</T>
        </View>
      ) : (
        <View style={{ alignItems: 'center', marginTop: 30, paddingHorizontal: 30 }}>
          <Ionicons name="documents-outline" size={40} color={t.faint} />
          <T v="sub" style={{ textAlign: 'center', marginTop: 8 }}>I-797 notices, I-94, I-129S, passports, visas and EAD cards for you and your family.</T>
        </View>
      )}
    </DetailScreen>
  );
}
