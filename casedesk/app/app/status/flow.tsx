// Upload documents — a waterfall, one document per step:
//   Family → for each person: Passport → Visa stamp → Where now? → I-94 (in the US only) → Approval →
//   Pending receipt → EAD (spouse / OPT) → next person → Review & save → Where everyone stands.
// Each step is Upload or Skip, with one line on why it matters. A document goes to the person whose step it is;
// a document read as another type moves to its own step (we say so). The app warns "looks like X's" only when
// the passport number or full passport name matches someone else AND not the step's own person.
import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Button, Note, Chips, DateField, Field, Pill, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { pickFiles, pickPhotos, pickPhoto, DOC_TYPES, DocType, Picked, useVault } from '../../src/lib/vault';
import { readText, parseDocument, ocrAvailable } from '../../src/lib/ocr';
import { loadProfile, saveProfile, Profile, useProfile, visasFor, PetitionKind } from '../../src/lib/profile';
import { useFamily, loadFamily, saveMember, removeMember, Member } from '../../src/lib/family';
import { familyChecks, fmt } from '../../src/lib/compliance';
import { Doc, describe, saveFor, belongsElsewhere, identityOf, stepsFor, stepOf, currentApproval, sameEmployer, applyDoc, StepKey, Step } from '../../src/lib/docflow';
import { PersonSummary } from '../../src/components/PersonSummary';
import { metroOf } from '../../src/lib/metro';
import { DOC_ICON } from '../../src/components/DocIcon';
import { DocPreview } from '../../src/components/DocPreview';

type P = { id: string; name: string; relation: string; isMe: boolean; profile: Profile | null };
type Item = Doc & { key: string; owner: string; step: StepKey; state: 'reading' | 'done' | 'unread'; open: boolean; editType: boolean; keep?: boolean; movedFrom?: string };
type Where = { loc: 'US' | 'Outside'; country: string };
const COUNTRIES = ['India', 'Canada', 'Mexico', 'United Kingdom', 'Other'];
const ORDER: StepKey[] = ['passport', 'visa', 'where', 'i94', 'approval', 'receipt', 'ead'];
const short = (d: DocType) => (d === 'Approval (I-797A/B)' ? 'I-797 approval' : d === 'Receipt (I-797C)' ? 'I-797C receipt' : d === 'Other' ? 'Document' : d.replace(/ \(.*\)/, ''));
const STATUS_FORMS = [undefined, 'I-129', 'I-539'];
const KINDS: { label: string; value: PetitionKind }[] = [{ label: 'Extension', value: 'extension' }, { label: 'Amendment', value: 'amendment' }, { label: 'Transfer (new employer)', value: 'transfer' }];
const parseCity = (s: string) => { const [city, state] = s.split(',').map((x) => x.trim()); return city ? { city, state: state?.toUpperCase().slice(0, 2), metro: metroOf(city, state?.toUpperCase()) } : undefined; };

export default function UploadFlow() {
  const t = useTheme();
  const router = useRouter();
  const [me] = useProfile();
  const [family] = useFamily();
  const [saved] = useVault();
  const canRead = ocrAvailable();

  // ---- family ----
  const [people, setPeople] = useState<P[] | null>(null);
  const list: P[] = people ?? [
    { id: 'me', name: me?.name ?? '', relation: 'You', isMe: true, profile: me },
    ...family.map((m) => ({ id: m.id, name: m.name === m.relation ? '' : m.name, relation: m.relation, isMe: false, profile: m.profile })),
  ];
  const setP = (id: string, patch: Partial<P>) => setPeople(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const [removed, setRemoved] = useState<string[]>([]);
  const label = (p?: P) => (p ? (p.name.trim() || (p.isMe ? 'You' : p.relation)) : '');
  const byId = (id: string) => list.find((x) => x.id === id);

  // ---- flow state ----
  const [stage, setStage] = useState<'family' | 'step' | 'review' | 'summary'>('family');
  const [at, setAt] = useState<{ who: string; step: StepKey }>({ who: 'me', step: 'passport' });
  const [items, setItems] = useState<Item[]>([]);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [where, setWhere] = useState<Record<string, Where>>({});
  const [work, setWork] = useState<{ now: string; approved: string }>({ now: '', approved: '' });
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const whereOf = (p: P): Where => where[p.id] ?? { loc: p.profile?.location === 'Outside' ? 'Outside' : 'US', country: p.profile?.country ?? 'India' };
  const mine = (id: string) => items.filter((i) => i.owner === id && i.state !== 'reading');
  // A draft of each person's record with this flow's documents applied — decides their steps (blanket L,
  // EAD for the spouse, I-94 only in the US).
  const draft = useMemo(() => {
    const out: Record<string, Profile> = {};
    for (const p of list) {
      const w = whereOf(p);
      const base: Profile = { ...(p.profile ?? { visa: visasFor(p.isMe ? undefined : p.relation)[0], visaSet: false }), location: w.loc, country: w.loc === 'Outside' ? w.country : undefined };
      const docs = mine(p.id).filter((i) => i.state === 'done').sort((a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step));
      for (const d of docs) applyDoc(base, d, p.relation);
      if (docs.some((d) => d.type === 'I-94')) base.location = 'US';
      out[p.id] = base;
    }
    return out;
  }, [items, where, people, me, family]);
  const steps = (p: P): Step[] => stepsFor(draft[p.id], p.isMe ? 'You' : p.relation, mine(p.id).map((i) => i.type));
  const person = byId(at.who) ?? list[0];

  // Whose is each document? Passport data only (never the typed name).
  const idsFor = (it: Item) => list.map((p) => identityOf(p.id, p.profile, items.filter((x) => x !== it && x.owner === p.id && x.state === 'done')));
  const looksLike = (it: Item) => {
    if (it.keep || it.state !== 'done') return undefined;
    const o = belongsElsewhere(it.found, it.owner, idsFor(it));
    return o ? { p: byId(o.id)!, by: it.found?.passportNo && (o.passportNos || []).includes(it.found.passportNo) ? 'same passport number' : 'same passport name' } : undefined;
  };

  // ---- navigation ----
  const flat = () => list.flatMap((p) => steps(p).map((s) => ({ who: p.id, step: s.key })));
  const go = (dir: 1 | -1) => {
    tap(); setFlash(''); setErr('');
    const f = flat();
    const i = f.findIndex((x) => x.who === at.who && x.step === at.step);
    const n = f[i + dir];
    if (n) setAt(n);
    else if (dir === 1) setStage('review');
    else setStage('family');
  };
  const skip = () => { setSkipped((s) => ({ ...s, [`${at.who}:${at.step}`]: true })); go(1); };

  const saveFamily = async () => {
    setErr('');
    const meP = list.find((p) => p.isMe)!;
    if (!meP.name.trim()) { setErr('Add your name first.'); return; }
    if (list.some((p) => !p.isMe && !p.name.trim())) { setErr('Give everyone a name — whatever you call them.'); return; }
    const mineP = (await loadProfile()) ?? { visa: 'H-1B' as const, visaSet: false };
    await saveProfile({ ...mineP, name: meP.name.trim() });
    const fam = await loadFamily();
    for (const id of removed) if (fam.some((m) => m.id === id)) await removeMember(id);
    for (const p of list.filter((x) => !x.isMe)) {
      const old = fam.find((m) => m.id === p.id);
      await saveMember({ id: p.id, name: p.name.trim(), relation: p.relation, profile: old?.profile ?? { visa: visasFor(p.relation)[0], visaSet: false } });
    }
    const w = me?.workLocation, a = me?.approvedWorkLocation;
    setWork({ now: w ? [w.city, w.state].filter(Boolean).join(', ') : '', approved: a ? [a.city, a.state].filter(Boolean).join(', ') : '' });
    tap(); setAt({ who: list[0].id, step: 'passport' }); setStage('step');
  };

  // ---- reading ----
  const add = (files: Picked[]) => {
    if (!files.length) return;
    const owner = person.id, step = at.step;
    const want = steps(person).find((s) => s.key === step)?.type ?? 'Other';
    const fresh: Item[] = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, owner, step, state: canRead ? 'reading' : 'unread', type: want, validTo: '', receipt: '', name: '', open: false, editType: false }));
    setItems((xs) => [...xs, ...fresh]);
    setSkipped((s) => ({ ...s, [`${owner}:${step}`]: false }));
    if (!canRead) return;
    for (const it of fresh) {
      queue.current = queue.current.then(async () => {
        try {
          const text = await readText(it.file.uri, it.file.mime);
          if (!text || text.replace(/\s/g, '').length < 20) { patch(it.key, { state: 'unread' }); return; }
          const f = parseDocument(text);
          const type = f.type ?? it.type;
          const own = stepOf(type) ?? it.step;
          patch(it.key, { state: 'done', found: f, type, step: own, validTo: f.validTo ?? '', receipt: f.receipt ?? '', name: f.name ?? '', movedFrom: own !== it.step ? it.step : undefined });
          if (own !== it.step) setFlash(`That’s ${/^[AEIOU]/.test(short(type)) ? 'an' : 'a'} ${short(type)} — moved it to the ${titleOf(own)} step.`);
          if (type === 'I-94') setWhere((w) => ({ ...w, [owner]: { loc: 'US', country: (w[owner] ?? { country: 'India' }).country } }));
        } catch { patch(it.key, { state: 'unread' }); }
      });
    }
  };
  const titleOf = (k: StepKey) => ({ passport: 'Passport', visa: 'Visa stamp', where: 'Where now', i94: 'I-94', approval: 'Approval', receipt: 'Pending receipt', ead: 'EAD' }[k]);
  const pick = async (src: 'camera' | 'photos' | 'files') => {
    setErr('');
    try {
      if (src === 'camera') { const p = await pickPhoto(true); if (p) add([p]); }
      else if (src === 'photos') add(await pickPhotos());
      else add(await pickFiles());
    } catch (e: any) { setErr(e.message); }
  };
  const reading = items.some((x) => x.state === 'reading');

  // ---- save ----
  const saveAll = async () => {
    setBusy(true); setErr('');
    try {
      const fam = await loadFamily();
      for (const p of list) {
        const docs = items.filter((i) => i.owner === p.id && i.state !== 'reading').sort((a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step));
        const w = whereOf(p);
        const loc = (prof: Profile): Profile => {
          const out: Profile = { ...prof, location: w.loc, country: w.loc === 'Outside' ? w.country : undefined };
          if (p.isMe) {
            const now = parseCity(work.now), appr = parseCity(work.approved);
            if (now) out.workLocation = now;
            if (appr) out.approvedWorkLocation = appr;
          }
          return out;
        };
        if (p.isMe) {
          const prof = loc((await loadProfile()) ?? { visa: 'H-1B' as const, visaSet: false });
          await saveProfile(docs.length ? await saveFor('me', 'Me', prof, docs, label(p)) : prof);
        } else {
          const m = fam.find((x) => x.id === p.id);
          if (!m) continue;
          m.profile = docs.length ? await saveFor(p.id, p.relation, loc({ ...m.profile }), docs, label(p)) : loc({ ...m.profile });
          await saveMember(m);
        }
      }
      tap(); setStage('summary');
    } catch (e: any) { setErr(e.message || 'Could not save.'); }
    setBusy(false);
  };

  // ---------- UI pieces ----------
  const Source = ({ icon, text, onPress }: { icon: any; text: string; onPress: () => void }) => (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flex: 1, backgroundColor: t.surface, borderRadius: 18, paddingVertical: 20, alignItems: 'center', gap: 8, transform: [{ scale: pressed ? 0.96 : 1 }], borderWidth: 0.5, borderColor: t.border })}>
      <Ionicons name={icon} size={28} color={t.accent} />
      <T v="h3" style={{ fontSize: 15, fontWeight: '500' }}>{text}</T>
    </Pressable>
  );
  const Option = ({ on, text, onPress }: { on: boolean; text: string; onPress: () => void }) => (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: t.surface, borderRadius: 18, borderWidth: 2, borderColor: on ? t.accent : 'transparent', marginBottom: 10 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 2, borderColor: on ? t.accent : t.faint }} />
      <T v="body" style={{ fontSize: 17, fontWeight: '500' }}>{text}</T>
    </Pressable>
  );
  const LocChip = ({ p }: { p: P }) => { const w = whereOf(p); return <Pill small label={w.loc === 'US' ? 'In US' : `In ${w.country}`} />; };
  const Footer = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>{children}</View>;
  const Flex = ({ n = 1, children }: { n?: number; children: React.ReactNode }) => <View style={{ flex: n }}>{children}</View>;

  // ---------- family ----------
  if (stage === 'family') {
    return (
      <DetailScreen title="Family" modal>
        <View style={{ paddingHorizontal: 20 }}>
          <T v="h1">Who’s in your family?</T>
          <T v="sub" style={{ marginTop: 6, marginBottom: 18, fontSize: 16 }}>Names here are just labels. Legal names come from passports.</T>
          {list.map((p) => (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <T v="label">{p.isMe ? 'You (the employee)' : p.relation}</T>
                {!p.isMe ? <Pressable hitSlop={10} onPress={() => { setRemoved((r) => [...r, p.id]); setPeople(list.filter((x) => x.id !== p.id)); }}><T v="small" style={{ color: t.red }}>Remove</T></Pressable> : null}
              </View>
              <Field placeholder={p.isMe ? 'Your name, e.g. Raj' : 'Name, e.g. Priya'} value={p.name} onChangeText={(v) => setP(p.id, { name: v })} autoCapitalize="words" />
              {!p.isMe ? <View style={{ marginHorizontal: -36, marginTop: -4 }}><Chips options={['Spouse', 'Child', 'Parent'].map((r) => ({ label: r, value: r }))} value={p.relation} onChange={(v) => setP(p.id, { relation: v })} /></View> : null}
            </Card>
          ))}
          <Button label="Add family member" kind="secondary" icon="person-add-outline" onPress={() => setPeople([...list, { id: `${Date.now()}`, name: '', relation: list.some((x) => x.relation === 'Spouse') ? 'Child' : 'Spouse', isMe: false, profile: null }])} />
          {err ? <View style={{ marginTop: 12 }}><Note tone="red">{err}</Note></View> : null}
          <View style={{ marginTop: 16 }}><Button label={`Start with ${label(list[0]) === 'You' ? 'you' : label(list[0])}`} icon="arrow-forward" onPress={saveFamily} /></View>
        </View>
      </DetailScreen>
    );
  }

  // ---------- one step ----------
  if (stage === 'step' && person) {
    const ss = steps(person);
    const s = ss.find((x) => x.key === at.step) ?? ss[0];
    const idx = ss.indexOf(s);
    const all = flat(), pos = all.findIndex((x) => x.who === person.id && x.step === s.key) + 1;
    const pi = list.indexOf(person);
    const here = items.filter((i) => i.owner === person.id && i.step === s.key);
    const w = whereOf(person);
    const forcedUS = mine(person.id).some((i) => i.type === 'I-94');
    const you = person.isMe;
    const nm = label(person);
    const titleText = s.key === 'where' ? (you ? 'Where are you now?' : `Where is ${nm} now?`) : s.title;
    const done = here.some((i) => i.state === 'done' || i.state === 'unread') || items.some((i) => i.movedFrom === s.key && i.owner === person.id);
    const blocked = here.some((i) => i.state === 'reading' || looksLike(i));
    const cur = currentApproval(draft[person.id]);
    return (
      <DetailScreen title="Upload documents" modal>
        <View style={{ paddingHorizontal: 20 }}>
          {/* progress */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <T v="small" style={{ color: t.text, fontWeight: '600' }}>{`${nm} · step ${idx + 1} of ${ss.length}`}</T>
            <T v="small">{`Person ${pi + 1} of ${list.length}`}</T>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.surface2, overflow: 'hidden', marginBottom: 18 }}>
            <View style={{ height: 4, width: `${Math.round((pos / Math.max(1, all.length)) * 100)}%`, backgroundColor: t.accent, borderRadius: 2 }} />
          </View>

          <T v="h1">{titleText}</T>
          <T v="sub" style={{ marginTop: 6, fontSize: 16 }}>{s.why.replace('they are', `${nm} is`)}</T>
          {flash ? <View style={{ marginTop: 14 }}><Note tone="accent">{flash}</Note></View> : null}

          {s.key === 'where' ? (
            <View style={{ marginTop: 22 }}>
              <Option on={w.loc === 'US'} text="In the US" onPress={() => setWhere({ ...where, [person.id]: { ...w, loc: 'US' } })} />
              <Option on={w.loc === 'Outside'} text="Outside the US" onPress={() => { if (!forcedUS) setWhere({ ...where, [person.id]: { ...w, loc: 'Outside' } }); }} />
              {forcedUS ? <Note tone="neutral">An I-94 is uploaded for {you ? 'you' : nm}, so this is set to In the US.</Note> : w.loc === 'Outside' ? (
                <View style={{ marginTop: 6 }}>
                  <T v="label" style={{ marginBottom: 8 }}>Country</T>
                  <View style={{ marginHorizontal: -20 }}><Chips options={COUNTRIES.map((c) => ({ label: c, value: c }))} value={w.country} onChange={(c) => setWhere({ ...where, [person.id]: { ...w, country: c } })} /></View>
                  <T v="small" style={{ marginTop: 10 }}>The I-94 step is skipped. We’ll check travel documents only.</T>
                </View>
              ) : <T v="small" style={{ marginTop: 4 }}>An uploaded I-94 also sets “In the US”.</T>}
            </View>
          ) : (
            <>
              {s.key === 'approval' && w.loc === 'Outside' ? <View style={{ marginTop: 14 }}><Note tone="neutral">I-94 skipped — not needed while outside the US.</Note></View> : null}
              {!here.length ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
                    {Platform.OS !== 'web' ? <Source icon="camera-outline" text="Camera" onPress={() => pick('camera')} /> : null}
                    <Source icon="images-outline" text="Photos" onPress={() => pick('photos')} />
                    <Source icon="folder-outline" text="Files" onPress={() => pick('files')} />
                  </View>
                  <T v="small" style={{ textAlign: 'center', marginTop: 14 }}>{canRead ? 'Read on this phone. Nothing is uploaded.' : 'Auto-reading works in the installed app. You can type the dates by hand.'}</T>
                </>
              ) : null}
              <View style={{ marginTop: 18, gap: 10 }}>
                {here.map((it) => {
                  if (it.state === 'reading') return <Card key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><ActivityIndicator color={t.accent} /><View><T v="h3">{`Reading ${s.title.toLowerCase().replace(' · optional', '')}…`}</T><T v="small">On this phone only</T></View></Card>;
                  const other = looksLike(it);
                  const lines = describe(person.profile, it);
                  const statusReceipt = it.type === 'Receipt (I-797C)' && STATUS_FORMS.includes(it.found?.form);
                  const otherEmployer = statusReceipt && cur?.employer && it.found?.employer && !sameEmployer(cur.employer, it.found.employer);
                  return (
                    <Card key={it.key}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={it.state === 'done' ? 'checkmark-circle' : (DOC_ICON[it.type] ?? 'document-outline')} size={22} color={it.state === 'done' ? t.green : t.text} />
                        <Pressable style={{ flex: 1 }} onPress={() => patch(it.key, { editType: !it.editType })}>
                          <T v="h3" style={{ fontSize: 17 }}>{`${short(it.type)} ▾`}</T>
                          <T v="small" numberOfLines={1}>{it.name ? `Name on it: ${it.name}` : it.state === 'unread' ? 'Couldn’t read much here — fill in what you can, or skip' : it.file.name}</T>
                        </Pressable>
                        <Pressable hitSlop={10} onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}><T v="small" style={{ color: t.accent, fontWeight: '600' }}>Retake</T></Pressable>
                      </View>
                      {it.editType ? <View style={{ marginHorizontal: -36, marginTop: 10 }}><Chips options={DOC_TYPES.map((d) => ({ label: d, value: d }))} value={it.type} onChange={(v) => { const st = stepOf(v) ?? it.step; patch(it.key, { type: v, editType: false, step: st }); if (st !== it.step) setFlash(`Moved to the ${titleOf(st)} step.`); }} /></View> : null}
                      {other ? (
                        <View style={{ marginTop: 12, gap: 8 }}>
                          <Note tone="amber">{`This looks like ${label(other.p)}’s (${other.by}).`}</Note>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Flex><Button label={`Move to ${label(other.p)}`} kind="secondary" icon="swap-horizontal" onPress={() => { patch(it.key, { owner: other.p.id, keep: true }); setFlash(`Moved to ${label(other.p)} · ${titleOf(it.step)}`); }} /></Flex>
                            <Flex><Button label={`Keep for ${nm}`} kind="secondary" onPress={() => patch(it.key, { keep: true })} /></Flex>
                          </View>
                        </View>
                      ) : null}
                      <View style={{ marginTop: 12 }}><DateField label={it.type === 'Receipt (I-797C)' ? 'Receipt date' : it.type === 'I-94' ? 'Admit until' : it.type === 'Approval (I-797A/B)' || it.type === 'I-129S (blanket L)' ? 'Valid to' : 'Expires'} value={it.validTo} onChange={(v) => patch(it.key, { validTo: v })} /></View>
                      {it.receipt || /I-797/.test(it.type) ? <Field label="Receipt number" value={it.receipt} onChangeText={(v) => patch(it.key, { receipt: v.toUpperCase().replace(/\s/g, '') })} autoCapitalize="characters" maxLength={13} placeholder="WAC2612345678" /> : null}
                      {statusReceipt ? (
                        otherEmployer ? <Note tone="neutral">{`Filed by ${it.found?.employer}, not ${cur?.employer} — counted as a transfer (new employer). The 240-day rule doesn’t apply.`}</Note> : (
                          <View>
                            <T v="label" style={{ marginBottom: 8 }}>What was filed?</T>
                            <View style={{ marginHorizontal: -36 }}><Chips options={KINDS} value={(it.filedFor ?? it.found?.petitionKind ?? 'extension') as PetitionKind} onChange={(v) => patch(it.key, { filedFor: v })} /></View>
                          </View>
                        )
                      ) : it.type === 'Receipt (I-797C)' ? <Note tone="neutral">{`${it.found?.form ?? 'This'} is just a case — it doesn’t extend the stay. It’s added to Cases.`}</Note> : null}
                      {s.key === 'approval' && you && (draft[person.id].visa === 'H-1B' || draft[person.id].visaSet === false) ? (
                        <View style={{ marginTop: 12 }}>
                          <Field label="Work location on this approval (city, state)" placeholder="e.g. Irving, TX" value={work.approved} onChangeText={(v) => setWork({ ...work, approved: v })} autoCapitalize="words" />
                          <Field label="Where do you work now? (city, state)" placeholder="e.g. Frisco, TX" value={work.now} onChangeText={(v) => setWork({ ...work, now: v })} autoCapitalize="words" />
                          <T v="small" style={{ marginTop: -4 }}>The I-797A doesn’t print the worksite — it’s on the LCA. A move to another metro needs an amendment first.</T>
                        </View>
                      ) : null}
                      {lines.length ? <View style={{ gap: 3, marginTop: 10 }}>{lines.map((l) => <T key={l.text} v="small" style={{ color: l.ok ? t.text : t.amber }}>{l.ok ? `✓ ${l.text}` : l.text}</T>)}</View> : null}
                      <Pressable onPress={() => patch(it.key, { open: !it.open })} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="eye-outline" size={15} color={t.accent} />
                        <T v="small" style={{ color: t.accent, fontWeight: '700' }}>{it.open ? 'Hide document' : 'View document to check'}</T>
                      </Pressable>
                      {it.open ? <View style={{ marginTop: 10 }}><DocPreview uri={Platform.OS === 'web' && it.file.webFile ? URL.createObjectURL(it.file.webFile) : it.file.uri} mime={it.file.mime} height={240} /></View> : null}
                    </Card>
                  );
                })}
                {here.length ? <Pressable onPress={() => pick('photos')} style={{ alignSelf: 'center', padding: 8 }}><T v="small" style={{ color: t.accent, fontWeight: '600' }}>+ Add another page or document</T></Pressable> : null}
              </View>
            </>
          )}
          {err ? <View style={{ marginTop: 12 }}><Note tone="red">{err}</Note></View> : null}
          <Footer>
            <Flex><Button label="Back" kind="secondary" onPress={() => go(-1)} /></Flex>
            {s.key !== 'where' ? <Flex><Button label="Skip" kind="secondary" onPress={skip} /></Flex> : null}
            <Flex n={2}><Button label={reading ? 'Reading…' : 'Next'} icon="arrow-forward" disabled={(s.key !== 'where' && !done) || blocked} onPress={() => go(1)} /></Flex>
          </Footer>
        </View>
      </DetailScreen>
    );
  }

  // ---------- review ----------
  if (stage === 'review') {
    return (
      <DetailScreen title="Review" modal>
        <View style={{ paddingHorizontal: 20 }}>
          <T v="h1">Review & save</T>
          <T v="sub" style={{ marginTop: 6, marginBottom: 18, fontSize: 16 }}>Check what will change. Nothing is saved until you tap Save.</T>
          {list.map((p) => {
            const w = whereOf(p);
            return (
              <Card key={p.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <T v="h3" style={{ flex: 1, fontSize: 17 }}>{p.isMe ? `${label(p)} (you)` : `${label(p)} · ${p.relation}`}</T>
                  <LocChip p={p} />
                </View>
                {steps(p).map((s) => {
                  if (s.key === 'where') return <T key={s.key} v="body" style={{ paddingVertical: 4 }}>{`✓ Location → ${w.loc === 'US' ? 'In the US' : `Outside the US · ${w.country}`}`}</T>;
                  const docs = items.filter((i) => i.owner === p.id && i.step === s.key && i.state !== 'reading');
                  if (!docs.length) return <T key={s.key} v="sub" style={{ paddingVertical: 4 }}>{`– ${s.title.replace(' · optional', '')} — ${skipped[`${p.id}:${s.key}`] ? 'skipped, ' : ''}kept what’s on file`}</T>;
                  return docs.map((d) => (
                    <View key={d.key} style={{ paddingVertical: 4 }}>
                      <T v="body">{`✓ ${short(d.type)}${d.validTo ? ` → ${fmt(d.validTo)}` : ' saved'}${d.movedFrom ? ' (moved here)' : ''}`}</T>
                      {describe(p.profile, d).filter((l) => !l.ok).map((l) => <T key={l.text} v="small" style={{ color: t.amber, marginLeft: 16 }}>{l.text}</T>)}
                    </View>
                  ));
                })}
                {w.loc === 'Outside' ? <T v="sub" style={{ paddingVertical: 4 }}>– I-94 — not needed outside the US</T> : null}
                {p.isMe && (work.now || work.approved) ? <T v="body" style={{ paddingVertical: 4 }}>{`✓ Work location → ${work.now || '—'}${work.approved ? ` (approval: ${work.approved})` : ''}`}</T> : null}
              </Card>
            );
          })}
          {err ? <View style={{ marginBottom: 10 }}><Note tone="red">{err}</Note></View> : null}
          <Footer>
            <Flex><Button label="Back" kind="secondary" onPress={() => { const f = flat(); setAt(f[f.length - 1]); setStage('step'); }} /></Flex>
            <Flex n={2}>{busy ? <ActivityIndicator color={t.text} /> : <Button label="Save" icon="lock-closed" onPress={saveAll} />}</Flex>
          </Footer>
          <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>Stored only on this phone.</T>
        </View>
      </DetailScreen>
    );
  }

  // ---------- compliance summary ----------
  return <Summary onDone={() => router.back()} />;
}

// Where everyone stands — from what's saved on the phone.
function Summary({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [me] = useProfile();
  const [family] = useFamily();
  const [saved] = useVault();
  const everyone = [{ id: 'me', name: me?.name || 'You', relation: 'You', profile: me as Profile | null }, ...family.map((m: Member) => ({ id: m.id, name: m.name, relation: m.relation, profile: m.profile as Profile | null }))];
  const all = familyChecks({ id: 'me', profile: me, relation: 'You' }, everyone.slice(1));
  return (
    <DetailScreen title="Summary" modal>
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Where everyone stands</T>
        <T v="sub" style={{ marginTop: 6, marginBottom: 18, fontSize: 16 }}>Saved on this phone. Not legal advice.</T>
        {everyone.map((p) => <PersonSummary key={p.id} p={p} checks={all[p.id] || []} principal={me} have={saved.filter((d) => (d.owner || 'me') === p.id).map((d) => d.type)} />)}
        <View style={{ marginTop: 6 }}><Button label="Done" icon="checkmark" onPress={onDone} /></View>
      </View>
    </DetailScreen>
  );
}
