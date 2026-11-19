// Document steps (shared by family setup, add member, add / renew, continue adding), Review, Summary.
// "Home" (top right) on every step saves what's done so far and opens Home (owner change).
import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Person } from '../core/model';
import { stepMeta, type StepKey } from '../core/steps';
import { fieldRows, docNote, parseField, showField, FIELDS } from '../core/docs';
import { DOC_LABEL } from '../core/model';
import { useFamily } from '../data/FamilyProvider';
import {
  commit, discard, useDraftReady, editField, endFlow, flowEpoch, pendingMisfiles, startFlow, keepHere, moveTo, moveToStep, nextOf, personOf, progressOf, retake, setCountry, setWhere, skip, stepsOf, typeIn, upload, uploadOf, useFlow,
} from '../data/flow';
import { fileUri, type Source } from '../native/files';
import { Avatar, Button, Card, Chip, Field, H1, Hint, Icon, NavButton, Note, Option, Pill, Screen, SelectField, Spinner, Stack, T, Tag, Why, font, radius, useSheet, useTheme, useToast, MIN_TOUCH, TourTarget, useTour } from '../ui';
import { go, home, statusLabel, locationChip, relationLabel, untilText, AttentionRow } from './common';
import { COUNTRIES } from './sheets';

const TITLE: Record<string, string> = { family: 'Your documents', add: 'Add family member', renew: 'Add or renew', missing: 'Add documents' };

/** Home from any step: save what's done — but first ask about any unanswered "looks like X's" warning. */
function useLeave() {
  const f = useFamily();
  const toast = useToast();
  const sheet = useSheet();
  const leave = async (): Promise<void> => {
    const m = pendingMisfiles()[0];
    if (m) {
      const from = personOf(m.pid, f), to = personOf(m.to, f);
      sheet.open('Before you go', (
        <View>
          <Why>{`The ${DOC_LABEL[m.doc.type].toLowerCase()} in ${from?.name ?? 'this'}’s step looks like ${to?.name ?? 'someone else'}’s. Where should it go?`}</Why>
          <View style={{ gap: 10, marginTop: 16 }}>
            <Button title={`Move to ${to?.name ?? 'them'}`} onPress={() => { sheet.close(); moveTo(m.pid, m.k, m.to); setTimeout(leave, 350); }} />
            <Button kind="ghost" title={`Keep for ${from?.name ?? 'this person'}`} onPress={() => { sheet.close(); keepHere(m.pid, m.k); setTimeout(leave, 350); }} />
            <Button kind="danger" title="Don’t save it" onPress={() => { sheet.close(); discard(m.pid, m.k); setTimeout(leave, 350); }} />
          </View>
        </View>
      ));
      return;
    }
    const { saved } = await commit(f);
    home();
    setTimeout(() => toast(saved ? 'Saved · add the rest anytime from Home' : 'Add the rest anytime from Home'), 300);
  };
  return leave;
}

export function StepScreen() {
  const { pid, k } = useLocalSearchParams<{ pid: string; k: StepKey }>();
  const f = useFamily();
  const flow = useFlow();
  const t = useTheme();
  const toast = useToast();
  const leave = useLeave();
  const tour = useTour('flow-step');
  const p = pid ? personOf(pid, f) : undefined;
  // Opened without a running flow (deep link, or the app was restarted mid-flow): resume for this person.
  // Only once per screen, only after the saved draft was looked at, and never after this flow was
  // saved or ended (otherwise Home → save would start a fresh, empty flow behind the user's back).
  const loaded = useDraftReady();
  const epoch = React.useRef(flowEpoch());
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (flow || !p || !k || !f.ready || !loaded || resumed.current || flowEpoch() !== epoch.current) return;
    resumed.current = true;
    startFlow({ mode: 'renew', pids: [p.id] }, f);
  }, [flow, p, k, f, loaded]);
  if (!flow || !p || !k) {
    return <Screen nav={{ title: 'Documents', right: <NavButton title="Home" onPress={home} /> }}><Why>This step is no longer open.</Why><Button block title="Go to Home" onPress={home} /></Screen>;
  }
  const rec = f.records[p.id];
  const m = stepMeta(p, k, rec);
  const u = uploadOf(p.id, k);
  const pr = progressOf(p.id, k, f);
  const next = () => {
    const n = nextOf(p.id, k, f);
    if (n) go('/flow/step', { pid: n.pid, k: n.k }); else go('/flow/review');
  };
  const nav = { title: TITLE[flow.mode], right: <NavButton title="Home" label="Save what’s done and go to Home" onPress={leave} />, progress: pr };

  if (k === 'where') {
    const w = flow.where[p.id];
    return (
      <Screen nav={nav} footer={<><Button kind="ghost" title="Back" onPress={() => router.back()} /><Button grow title="Next" disabled={!w?.v} onPress={next} /></>}>
        <H1>{m.title}</H1>
        <Why>{m.why}</Why>
        <View style={{ marginTop: 24, gap: 10 }} accessibilityRole="radiogroup">
          <Option title="In the US" subtitle="I’ll add the I-94 later" selected={w?.v === 'US'} onPress={() => setWhere(p.id, 'US')} />
          <Option title="Outside the US" subtitle="We’ll check travel documents only" selected={w?.v === 'Outside'} onPress={() => setWhere(p.id, 'Outside')} />
          {w?.v === 'Outside' ? <SelectField label="Country" value={w.c} onChange={(c) => setCountry(p.id, c)} options={COUNTRIES.map((c) => ({ value: c, label: c }))} /> : null}
        </View>
      </Screen>
    );
  }

  const pickFrom = (s: Source) => upload(p.id, k, s, f);
  let content: React.ReactNode;
  if (!u || u.state === 'skipped') {
    content = (
      <>
        <TourTarget id="upload" style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          {([['camera', 'Camera', 'Scan with camera'], ['photo', 'Photos', 'Choose from Photos'], ['folder', 'Files', 'Choose a PDF from Files']] as const).map(([icon, label, a11y], i) => (
            <Pressable key={label} onPress={() => pickFrom((['camera', 'photos', 'files'] as Source[])[i])} accessibilityRole="button" accessibilityLabel={a11y}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 20, paddingHorizontal: 4, alignItems: 'center', gap: 10, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <View style={{ width: 52, height: 52, borderRadius: 19, backgroundColor: t.pastel[(['mint', 'sky', 'butter'] as const)[i]], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={24} color={t.ink} /></View>
              <T style={[font.sub, { fontWeight: '500' }]}>{label}</T>
            </Pressable>
          ))}
        </TourTarget>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}><Icon name="lock" size={13} color={t.text2} /><T tone="text2" style={font.caption}>Read on this phone. Your documents are never uploaded.</T></View>
        {k === 'i94' ? <Hint center>No I-94 handy? Skip it — we’ll ask one quick question.</Hint> : null}
      </>
    );
  } else if (u.state === 'reading') {
    content = (
      <Card style={{ marginTop: 24, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Spinner />
        <View style={{ flex: 1 }} accessibilityLiveRegion="polite"><T style={font.headline}>{`Reading ${m.title.toLowerCase()}…`}</T><T tone="text2" style={font.foot}>On this phone only · a few seconds</T></View>
      </Card>
    );
  } else if (u.state === 'error') {
    content = (
      <Note tone="amber" style={{ marginTop: 24 }} actions={<><Button size="sm" kind="tint" title="Try again" onPress={() => retake(p.id, k)} /><Button size="sm" kind="ghost" title="Type it in" onPress={() => typeIn(p.id, k, f)} /></>}>
        {u.error ?? 'Couldn’t read this one. Try a flatter, brighter photo — or type the dates yourself.'}
      </Note>
    );
  } else {
    const d = u.doc!;
    const other = u.misfile ? personOf(u.misfile, f) : undefined;
    const note = docNote(d, { inUS: rec?.location !== 'Outside' });
    const rows = u.typedIn ? FIELDS[d.type].map((s) => ({ spec: s, value: showField(d.fields, s) })) : fieldRows(d);
    content = (
      <Card style={{ marginTop: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Icon name="checkc" size={22} color={t.green} />
          <T style={[font.body, { fontWeight: '600', flex: 1 }]}>{u.typedIn ? m.title : DOC_LABEL[d.type]}</T>
          <Pressable onPress={() => retake(p.id, k)} accessibilityRole="button" accessibilityLabel="Retake" style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: 10 }}><T tone="accent" style={[font.sub, { fontWeight: '500' }]}>Retake</T></Pressable>
        </View>
        {u.movedFrom ? <Note tone="green" style={{ marginTop: 0, marginBottom: 6 }}>{`Moved here from ${personOf(u.movedFrom, f)?.name ?? 'another'}’s step.`}</Note> : null}
        {other ? (
          <Note tone="amber" style={{ marginTop: 0, marginBottom: 6 }} actions={<><Button size="sm" kind="tint" title={`Move to ${other.name}`} onPress={() => { moveTo(p.id, k, other.id); toast(`Moved to ${other.name}`); }} /><Button size="sm" kind="ghost" title={`Keep for ${p.name}`} onPress={() => keepHere(p.id, k)} /></>}>
            {`This looks like ${other.name}’s — the ${d.fields.passportNo && f.records[other.id]?.passportNos.includes(d.fields.passportNo) ? 'passport number' : 'name'} matches ${other.name}, not ${p.name}. Whose is it?`}
          </Note>
        ) : null}
        {u.wrongStep && !other ? (
          <Note tone="amber" style={{ marginTop: 0, marginBottom: 6 }} actions={stepsOf(p.id, f).includes(u.wrongStep) || flow.only ? <Button size="sm" kind="tint" title={`Move to ${stepMeta(p, u.wrongStep, rec).title}`} onPress={() => { const to = moveToStep(p.id, k); if (to) { router.setParams({ k: to } as never); toast(`Moved to ${stepMeta(p, to, rec).title}`); } }} /> : undefined}>
            {`This looks like a ${DOC_LABEL[d.type].toLowerCase()}, not a ${m.title.toLowerCase()}. It will be saved as a ${DOC_LABEL[d.type].toLowerCase()}.`}
          </Note>
        ) : null}
        {d.files?.[0]?.mime.startsWith('image/') ? <Image source={{ uri: fileUri(d.files[0]) }} accessibilityLabel="Document photo" style={{ width: '100%', aspectRatio: 1.5, borderRadius: 12, marginVertical: 6, backgroundColor: t.card2 }} resizeMode="contain" /> : null}
        {rows.map(({ spec, value }) => (
          <Field key={String(spec.key)} label={spec.label} value={value} placeholder={spec.kind === 'date' ? 'e.g. Sep 30, 2028' : ''} autoCapitalize={spec.key === 'name' ? 'words' : 'characters'}
            onChangeText={(x) => editField(p.id, k, { [spec.key]: x } as never)} onBlur={() => editField(p.id, k, parseField(spec, String(uploadOf(p.id, k)?.doc?.fields[spec.key] ?? '')))} />
        ))}
        {d.fields.dateNote ? <Note tone="amber">{d.fields.dateNote}</Note> : note ? <Note tone={note.tone}>{note.text}</Note> : null}
        <Hint>Check the dates. Tap a field to fix it.</Hint>
      </Card>
    );
  }
  const done = u?.state === 'done' && !u.misfile;
  return (
    <Screen keyboard nav={nav} tour={tour} footer={<>
      <Button kind="ghost" title="Back" onPress={() => { router.back(); }} />
      <TourTarget id="type"><Button kind="ghost" title="Skip" onPress={() => { skip(p.id, k); next(); }} /></TourTarget>
      <Button grow title="Next" disabled={!done} onPress={next} />
    </>}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <H1>{m.title}</H1>
        {m.optional ? <Tag text="Optional" /> : null}
      </View>
      <Why>{m.why}</Why>
      {content}
    </Screen>
  );
}

export function ReviewScreen() {
  const f = useFamily();
  const flow = useFlow();
  const t = useTheme();
  const toast = useToast();
  const tour = useTour('review');
  if (!flow) return <Screen nav={{ title: 'Review' }}><Why>Nothing to review.</Why><Button block title="Go to Home" onPress={home} /></Screen>;
  const save = async () => {
    const m = pendingMisfiles()[0];
    if (m) { toast(`Answer “whose is it?” for ${personOf(m.pid, f)?.name ?? 'this'}’s ${DOC_LABEL[m.doc.type].toLowerCase()} first`); go('/flow/step', { pid: m.pid, k: m.k }); return; }
    const mode = flow.mode, ret = flow.returnTo;
    const { saved } = await commit(f);
    if (mode === 'family') { router.dismissAll(); router.replace('/(tabs)' as never); setTimeout(() => go('/flow/summary'), 60); return; }
    home();
    if (ret) setTimeout(() => go(ret), 60);
    setTimeout(() => toast(saved ? 'Saved on this phone' : 'Nothing new to save'), 200);
  };
  const line = (ok: boolean, text: React.ReactNode, key: string) => (
    <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 }}>
      <Icon name={ok ? 'check' : 'minus'} size={18} color={ok ? t.green : t.text3} weight={ok ? 'bold' : 'regular'} />
      <T tone={ok ? 'text' : 'text2'} style={[font.sub, { flex: 1 }]}>{text}</T>
    </View>
  );
  return (
    <Screen tour={tour} nav={{ title: 'Review', back: 'Back', onBack: () => router.back() }} footer={<TourTarget id="save" style={{ flex: 1 }}><Button title="Save" onPress={save} /></TourTarget>}>
      <H1>Review &amp; save</H1>
      <Why>Check what will be saved. Nothing is kept until you tap Save.</Why>
      <TourTarget id="list"><Stack style={{ marginTop: 22 }}>
        {flow.pids.map((pid) => {
          const p = personOf(pid, f);
          if (!p) return null;
          const rec = f.records[pid];
          const per = flow.up[pid] ?? {};
          const keys = Array.from(new Set([...stepsOf(pid, f), ...(Object.keys(per) as StepKey[])]));
          const w = flow.where[pid];
          return (
            <Card key={pid}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <Avatar name={p.name} size="sm" /><T style={[font.body, { fontWeight: '600', flex: 1 }]}>{p.name}</T><Chip text={statusLabel(p, rec, f.results[pid])} />
              </View>
              {keys.flatMap((k) => {
                const st = stepMeta(p, k, rec);
                const u = per[k];
                const out: React.ReactNode[] = [];
                if (u?.state === 'done' && u.doc) {
                  const spec = FIELDS[u.doc.type].find((s) => s.key === st.keyField.field) ?? FIELDS[u.doc.type].find((s) => s.key === 'validTo');
                  const v = spec ? showField(u.doc.fields, spec) : '';
                  out.push(line(true, <>{st.title} → <T style={[font.sub, { fontWeight: '600' }]}>{v || 'saved'}</T></>, k));
                } else out.push(line(false, `${st.title} — skipped${f.docs.some((d) => d.ownerId === pid && st.accepts.includes(d.type)) ? ', kept the one on file' : ''}`, k));
                if (k === 'i94' && w?.v && per.i94?.state !== 'done') out.push(line(true, <>Location → <T style={[font.sub, { fontWeight: '600' }]}>{w.v === 'US' ? 'In the US (I-94 later)' : `Outside the US · ${w.c}`}</T></>, 'where'));
                return out;
              })}
            </Card>
          );
        })}
      </Stack></TourTarget>
    </Screen>
  );
}

export function SummaryScreen() {
  const f = useFamily();
  const tour = useTour('summary');
  return (
    <Screen tour={tour} nav={{ title: 'Summary' }} footer={<TourTarget id="home" style={{ flex: 1 }}><Button title="Go to Home" onPress={() => { endFlow(); router.back(); }} /></TourTarget>}>
      <H1>Where everyone stands</H1>
      <Why>Saved on this phone. This is general information, not legal advice.</Why>
      <TourTarget id="cards"><Stack style={{ marginTop: 22 }}>{f.people.map((p) => <SummaryCard key={p.id} p={p} />)}</Stack></TourTarget>
    </Screen>
  );
}

export function SummaryCard({ p }: { p: Person }) {
  const f = useFamily();
  const rec = f.records[p.id], res = f.results[p.id];
  const missing = f.missing[p.id] ?? [];
  return (
    <Card onPress={() => go(`/person/${p.id}`)} label={p.name}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Avatar name={p.name} size="sm" /><T style={[font.body, { fontWeight: '600', flex: 1 }]}>{p.name}</T>{res ? <Pill severity={res.worst} /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}><T tone="text2" style={font.sub}>{`${relationLabel(p)} · ${statusLabel(p, rec, res)}`}</T><Chip text={locationChip(p, rec)} /></View>
      <T style={[font.big, { marginTop: 10, marginBottom: 6 }]}>{untilText(p, rec, res)}</T>
      {(res?.findings ?? []).filter((x) => x.severity !== 'good').slice(0, 4).map((x) => (
        <View key={x.id} style={{ marginHorizontal: -16 }}><AttentionRow f={x} /></View>
      ))}
      {missing.length ? <T tone="text2" style={[font.foot, { marginTop: 10 }]}>{`Missing: ${missing.map((s) => s.title).join(', ')}`}</T> : null}
    </Card>
  );
}
