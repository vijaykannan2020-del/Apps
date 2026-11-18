// Upload documents — a simple step-by-step flow:
//   1. Family: who's in it (the name is just what you call them).
//   2. Documents, one person at a time — read on the phone, already filed under that person.
//   3. Review what will be saved and which dates change.
//   4. Compliance: where each person stands.
// Documents always go to the person whose step you're on; the app only warns when passport data
// (passport number or full passport name) clearly points to someone else.
import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Button, Note, Chips, DateField, Field, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { pickFiles, pickPhotos, pickPhoto, DOC_TYPES, DocType, Picked, useVault } from '../../src/lib/vault';
import { readText, parseDocument, ocrAvailable } from '../../src/lib/ocr';
import { loadProfile, saveProfile, Profile, useProfile, visasFor, visaLabel } from '../../src/lib/profile';
import { useFamily, loadFamily, saveMember, removeMember, RELATIONS } from '../../src/lib/family';
import { runChecks, fmt, daysTo } from '../../src/lib/compliance';
import { slotsFor } from '../../src/lib/slots';
import { Doc, describe, saveFor, belongsElsewhere, SINGLE } from '../../src/lib/docflow';
import { DOC_ICON } from '../../src/components/DocIcon';
import { DocPreview } from '../../src/components/DocPreview';

type P = { id: string; name: string; relation: string; isMe: boolean; profile: Profile | null };
type Item = Doc & { key: string; owner: string; state: 'reading' | 'done' | 'unread'; open: boolean; editType: boolean };
const short = (d: DocType) => (d === 'Approval (I-797A/B)' ? 'I-797 approval' : d === 'Receipt (I-797C)' ? 'I-797C receipt' : d === 'Other' ? 'Document' : d.replace(/ \(.*\)/, ''));
const STEPS = ['Family', 'Documents', 'Review', 'Compliance'];

export default function UploadFlow() {
  const t = useTheme();
  const router = useRouter();
  const [me] = useProfile();
  const [family] = useFamily();
  const [saved] = useVault();
  const canRead = ocrAvailable();

  // ---- step 1: family ----
  const [people, setPeople] = useState<P[] | null>(null);
  const list: P[] = people ?? [
    { id: 'me', name: me?.name ?? '', relation: 'You', isMe: true, profile: me },
    ...family.map((m) => ({ id: m.id, name: m.name === m.relation ? '' : m.name, relation: m.relation, isMe: false, profile: m.profile })),
  ];
  const setP = (id: string, patch: Partial<P>) => setPeople(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const [removed, setRemoved] = useState<string[]>([]);

  // ---- steps ----
  const [step, setStep] = useState(0); // 0 family, 1 documents, 2 review, 3 compliance
  const [who, setWho] = useState(0); // index into list during step 1
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const person = list[who];
  const label = (p?: P) => (p ? (p.name.trim() || (p.isMe ? 'You' : p.relation)) : '');
  const whose = (p?: P) => (p?.isMe ? 'your' : `${label(p)}’s`);

  // Passport data known per person: saved profile, plus passports uploaded in this flow.
  const ids = useMemo(() => list.map((p) => {
    const pass = items.find((i) => i.owner === p.id && i.type === 'Passport' && i.found);
    return { id: p.id, passportNo: pass?.found?.passportNo ?? p.profile?.passportNo, legalName: pass?.name || p.profile?.legalName };
  }), [items, people, me, family]);

  const saveFamily = async () => {
    setErr('');
    const meP = list.find((p) => p.isMe)!;
    if (!meP.name.trim()) { setErr('Add your name first.'); return; }
    if (list.some((p) => !p.isMe && !p.name.trim())) { setErr('Give everyone a name — whatever you call them.'); return; }
    const mine = (await loadProfile()) ?? { visa: 'H-1B' as const, visaSet: false };
    await saveProfile({ ...mine, name: meP.name.trim() });
    const fam = await loadFamily();
    for (const id of removed) if (fam.some((m) => m.id === id)) await removeMember(id);
    for (const p of list.filter((x) => !x.isMe)) {
      const old = fam.find((m) => m.id === p.id);
      await saveMember({ id: p.id, name: p.name.trim(), relation: p.relation, profile: old?.profile ?? { visa: visasFor(p.relation)[0], visaSet: false } });
    }
    tap(); setWho(0); setStep(1);
  };

  const add = (files: Picked[]) => {
    if (!files.length) return;
    const owner = person.id;
    const fresh: Item[] = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, owner, state: canRead ? 'reading' : 'unread', type: 'Other', validTo: '', receipt: '', name: '', open: false, editType: !canRead }));
    setItems((xs) => [...xs, ...fresh]);
    if (!canRead) return;
    for (const it of fresh) {
      queue.current = queue.current.then(async () => {
        try {
          const text = await readText(it.file.uri, it.file.mime);
          if (!text || text.replace(/\s/g, '').length < 20) { patch(it.key, { state: 'unread', editType: true }); return; }
          const f = parseDocument(text);
          patch(it.key, { state: 'done', found: f, type: f.type ?? 'Other', validTo: f.validTo ?? '', receipt: f.receipt ?? '', name: f.name ?? '', editType: !f.type });
        } catch { patch(it.key, { state: 'unread', editType: true }); }
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
    setBusy(true); setErr('');
    try {
      const fam = await loadFamily();
      for (const p of list) {
        const docs = items.filter((i) => i.owner === p.id);
        if (!docs.length) continue;
        if (p.isMe) {
          const prof = (await loadProfile()) ?? { visa: 'H-1B' as const, visaSet: false };
          await saveProfile(await saveFor('me', 'Me', prof, docs, label(p)));
        } else {
          const m = fam.find((x) => x.id === p.id);
          if (!m) continue;
          m.profile = await saveFor(p.id, p.relation, { ...m.profile }, docs, label(p));
          await saveMember(m);
        }
      }
      tap(); setStep(3);
    } catch (e: any) { setErr(e.message || 'Could not save.'); }
    setBusy(false);
  };

  // ---------- UI pieces ----------
  const Steps = () => (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
      {STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= step ? t.accent : t.surface2 }} />
          <T v="small" style={{ marginTop: 5, fontSize: 11, color: i === step ? t.text : t.sub }}>{`${i + 1}. ${s}`}</T>
        </View>
      ))}
    </View>
  );
  const Source = ({ icon, text, onPress }: { icon: any; text: string; onPress: () => void }) => (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flex: 1, backgroundColor: t.surface, borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1, borderWidth: 0.5, borderColor: t.border })}>
      <Ionicons name={icon} size={22} color={t.accent} />
      <T v="h3" style={{ fontSize: 13, marginTop: 6 }}>{text}</T>
    </Pressable>
  );

  // ---------- step 1: family ----------
  if (step === 0) {
    return (
      <DetailScreen title="Upload documents" modal>
        <View style={{ paddingHorizontal: 20 }}>
          <Steps />
          <T v="h2">Who’s in your family?</T>
          <T v="sub" style={{ marginTop: 4, marginBottom: 14 }}>Use the names you call them — the full legal name is read from each passport in the next step.</T>
          {list.map((p) => (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <T v="label">{p.isMe ? 'You (the employee)' : p.relation}</T>
                {!p.isMe ? <Pressable hitSlop={10} onPress={() => { setRemoved((r) => [...r, p.id]); setPeople(list.filter((x) => x.id !== p.id)); }}><T v="small" style={{ color: t.red }}>Remove</T></Pressable> : null}
              </View>
              <Field placeholder={p.isMe ? 'Your name, e.g. Vijay' : 'Name, e.g. Sangeetha'} value={p.name} onChangeText={(v) => setP(p.id, { name: v })} autoCapitalize="words" />
              {!p.isMe ? <View style={{ marginHorizontal: -36, marginTop: -4 }}><Chips options={RELATIONS.map((r) => ({ label: r, value: r }))} value={p.relation} onChange={(v) => setP(p.id, { relation: v })} /></View> : null}
            </Card>
          ))}
          <Button label="Add family member" kind="secondary" icon="person-add-outline" onPress={() => setPeople([...list, { id: `${Date.now()}`, name: '', relation: list.some((x) => x.relation === 'Spouse') ? 'Child' : 'Spouse', isMe: false, profile: null }])} />
          {err ? <View style={{ marginTop: 12 }}><Note tone="red">{err}</Note></View> : null}
          <View style={{ marginTop: 16 }}><Button label="Next: documents" icon="arrow-forward" onPress={saveFamily} /></View>
        </View>
      </DetailScreen>
    );
  }

  // ---------- step 2: documents, one person at a time ----------
  if (step === 1 && person) {
    const mine = items.filter((i) => i.owner === person.id);
    const slots = slotsFor(person.profile);
    const have = (ty: string) => mine.some((i) => i.type === ty) || saved.some((d) => (d.owner || 'me') === person.id && d.type === ty);
    const last = who === list.length - 1;
    return (
      <DetailScreen title="Upload documents" modal>
        <View style={{ paddingHorizontal: 20 }}>
          <Steps />
          <T v="small">{`Person ${who + 1} of ${list.length}`}</T>
          <T v="h2" style={{ marginTop: 2 }}>{person.isMe ? 'Your documents' : `${label(person)}’s documents`}</T>
          <T v="sub" style={{ marginTop: 4 }}>Upload all of them at once — they’re filed under {person.isMe ? 'you' : label(person)}.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {slots.map((s) => (
              <View key={s.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: have(s.type) ? t.greenSoft ?? t.surface2 : t.surface2 }}>
                <Ionicons name={have(s.type) ? 'checkmark' : 'ellipse-outline'} size={12} color={have(s.type) ? t.green : t.sub} />
                <T v="small" style={{ fontSize: 12, color: have(s.type) ? t.green : t.sub }}>{s.label}</T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {Platform.OS !== 'web' ? <Source icon="camera-outline" text="Camera" onPress={() => pick('camera')} /> : null}
            <Source icon="images-outline" text="Photos" onPress={() => pick('photos')} />
            <Source icon="document-attach-outline" text="Files" onPress={() => pick('files')} />
          </View>
          {!canRead ? <View style={{ marginTop: 10 }}><Note tone="amber">Auto-reading works in the installed app. You can still pick the type and dates by hand.</Note></View> : null}
          {err ? <View style={{ marginTop: 10 }}><Note tone="red">{err}</Note></View> : null}

          <View style={{ marginTop: 14, gap: 10 }}>
            {mine.map((it) => {
              if (it.state === 'reading') return <Card key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ActivityIndicator color={t.sub} /><T v="sub" numberOfLines={1} style={{ flex: 1 }}>Reading {it.file.name}…</T></Card>;
              const other = belongsElsewhere(it.found, person.id, ids);
              const otherP = other ? list.find((x) => x.id === other.id) : undefined;
              const lines = describe(person.profile, it);
              const replaces = SINGLE.includes(it.type) && saved.some((d) => (d.owner || 'me') === person.id && d.type === it.type);
              return (
                <Card key={it.key}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name={DOC_ICON[it.type] ?? 'document-outline'} size={22} color={t.text} />
                    <Pressable style={{ flex: 1 }} onPress={() => patch(it.key, { editType: !it.editType })}>
                      <T v="h3">{it.type === 'Other' ? 'Choose the type ▾' : `${short(it.type)} ▾`}</T>
                      <T v="small" numberOfLines={1}>{it.name ? `Name on it: ${it.name}` : it.state === 'unread' ? 'Couldn’t read it — fill in below' : it.file.name}</T>
                    </Pressable>
                    <Pressable hitSlop={10} onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} accessibilityLabel="Remove"><Ionicons name="close-circle" size={22} color={t.faint} /></Pressable>
                  </View>
                  {it.editType ? <View style={{ marginHorizontal: -36, marginTop: 10 }}><Chips options={DOC_TYPES.map((d) => ({ label: d, value: d }))} value={it.type} onChange={(v) => patch(it.key, { type: v, editType: false })} /></View> : null}
                  {otherP ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Note tone="amber">{`This looks like ${label(otherP)}’s (${it.found?.passportNo && other?.passportNo === it.found.passportNo ? 'same passport number' : 'same passport name'}).`}</Note>
                      <Button label={`Move to ${label(otherP)}`} kind="secondary" icon="swap-horizontal" onPress={() => patch(it.key, { owner: otherP.id })} />
                    </View>
                  ) : null}
                  <View style={{ marginTop: 12 }}><DateField label={it.type === 'Receipt (I-797C)' ? 'Receipt date' : 'Valid until'} value={it.validTo} onChange={(v) => patch(it.key, { validTo: v })} /></View>
                  {it.receipt || /I-797|I-129S/.test(it.type) ? <Field label="Receipt number" value={it.receipt} onChangeText={(v) => patch(it.key, { receipt: v.toUpperCase().replace(/\s/g, '') })} autoCapitalize="characters" maxLength={13} placeholder="WAC2612345678" /> : null}
                  {lines.length || replaces ? (
                    <View style={{ gap: 3 }}>
                      {replaces ? <T v="small">↻ Replaces the {short(it.type)} saved before</T> : null}
                      {lines.map((l) => <T key={l.text} v="small" style={{ color: l.ok ? t.text : t.amber }}>{l.ok ? `✓ ${l.text}` : l.text}</T>)}
                    </View>
                  ) : null}
                  <Pressable onPress={() => patch(it.key, { open: !it.open })} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="eye-outline" size={15} color={t.accent} />
                    <T v="small" style={{ color: t.accent, fontWeight: '700' }}>{it.open ? 'Hide document' : 'View document to check'}</T>
                  </Pressable>
                  {it.open ? <View style={{ marginTop: 10 }}><DocPreview uri={Platform.OS === 'web' && it.file.webFile ? URL.createObjectURL(it.file.webFile) : it.file.uri} mime={it.file.mime} height={240} /></View> : null}
                </Card>
              );
            })}
          </View>

          <View style={{ marginTop: 18, gap: 10 }}>
            <Button label={reading ? 'Reading…' : last ? 'Next: review' : `Next: ${label(list[who + 1])}’s documents`} icon="arrow-forward" disabled={reading} onPress={() => { tap(); if (last) setStep(2); else setWho(who + 1); }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Back" kind="secondary" onPress={() => { if (who === 0) setStep(0); else setWho(who - 1); }} /></View>
              {!mine.length ? <View style={{ flex: 1 }}><Button label="Skip" kind="secondary" onPress={() => { if (last) setStep(2); else setWho(who + 1); }} /></View> : null}
            </View>
          </View>
        </View>
      </DetailScreen>
    );
  }

  // ---------- step 3: review ----------
  if (step === 2) {
    return (
      <DetailScreen title="Upload documents" modal>
        <View style={{ paddingHorizontal: 20 }}>
          <Steps />
          <T v="h2">Check and save</T>
          <T v="sub" style={{ marginTop: 4, marginBottom: 14 }}>What will be saved for each person, and which dates change.</T>
          {list.map((p, idx) => {
            const docs = items.filter((i) => i.owner === p.id);
            return (
              <Card key={p.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <T v="h3" style={{ flex: 1 }}>{p.isMe ? `${label(p)} (you)` : `${label(p)} · ${p.relation}`}</T>
                  <Pressable hitSlop={10} onPress={() => { setWho(idx); setStep(1); }}><T v="small" style={{ color: t.accent, fontWeight: '700' }}>Edit</T></Pressable>
                </View>
                {docs.length ? docs.map((d) => (
                  <View key={d.key} style={{ marginTop: 8 }}>
                    <T v="body" style={{ fontSize: 15 }}>{`${short(d.type)}${d.validTo ? ` · ${fmt(d.validTo)}` : ''}`}</T>
                    {describe(p.profile, d).map((l) => <T key={l.text} v="small" style={{ color: l.ok ? t.sub : t.amber }}>{l.ok ? `✓ ${l.text}` : l.text}</T>)}
                  </View>
                )) : <T v="small" style={{ marginTop: 6 }}>No new documents</T>}
              </Card>
            );
          })}
          {err ? <View style={{ marginBottom: 10 }}><Note tone="red">{err}</Note></View> : null}
          {busy ? <ActivityIndicator color={t.text} /> : <Button label={`Save ${items.length} document${items.length === 1 ? '' : 's'}`} icon="lock-closed" disabled={!items.length} onPress={saveAll} />}
          <View style={{ marginTop: 10 }}><Button label="Back" kind="secondary" onPress={() => { setWho(list.length - 1); setStep(1); }} /></View>
          <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>Stored only on this phone.</T>
        </View>
      </DetailScreen>
    );
  }

  // ---------- step 4: compliance ----------
  const everyone = [{ id: 'me', name: me?.name ?? 'You', relation: 'You', profile: me }, ...family.map((m) => ({ id: m.id, name: m.name, relation: m.relation, profile: m.profile as Profile | null }))];
  return (
    <DetailScreen title="Compliance" modal>
      <View style={{ paddingHorizontal: 20 }}>
        <Steps />
        <T v="h2">Where everyone stands</T>
        <T v="sub" style={{ marginTop: 4, marginBottom: 14 }}>Based on the documents and dates saved — not legal advice.</T>
        {everyone.map((p) => {
          const pr = p.profile;
          const checks = pr ? runChecks(pr) : [];
          const red = checks.filter((c) => c.tone === 'red'), amber = checks.filter((c) => c.tone === 'amber'), green = checks.filter((c) => c.tone === 'green');
          const docsOf = saved.filter((d) => (d.owner || 'me') === p.id);
          const missing = slotsFor(pr).filter((s) => !docsOf.some((d) => d.type === s.type) && !(pr && pr[s.key]));
          const status = pr?.i94Expiry ? `Status valid until ${fmt(pr.i94Expiry)} (${daysTo(pr.i94Expiry)} days)` : 'No I-94 date yet';
          return (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: red.length ? t.red : amber.length ? t.amber : t.green }} />
                <T v="h3" style={{ flex: 1 }}>{p.relation === 'You' ? `${p.name || 'You'} (you)` : `${p.name} · ${p.relation}`}</T>
                <T v="small">{pr ? visaLabel(pr) : ''}</T>
              </View>
              <T v="body" style={{ marginTop: 8, fontSize: 15 }}>{status}</T>
              {[...red, ...amber].map((c) => <T key={c.id} v="small" style={{ marginTop: 4, color: c.tone === 'red' ? t.red : t.amber }}>{`• ${c.title}`}</T>)}
              {!red.length && !amber.length && green.length ? <T v="small" style={{ marginTop: 4, color: t.green }}>• No action needed right now</T> : null}
              {missing.length ? <T v="small" style={{ marginTop: 6 }}>{`Missing: ${missing.map((m) => m.label).join(', ')}`}</T> : null}
            </Card>
          );
        })}
        <View style={{ marginTop: 6 }}><Button label="Done" icon="checkmark" onPress={() => router.back()} /></View>
      </View>
    </DetailScreen>
  );
}
