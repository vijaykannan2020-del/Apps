// Green-card screens (v2.9): the GC section on the person page, GC tracking, the planner and
// interview preparation. Logic lives in core/gc.ts and the rules; these screens only render it.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { daysTo, fmt, today } from '../core/dates';
import type { GcFacts, Person } from '../core/model';
import { GC_STAGES, GATHER, INTERVIEW_QUESTIONS, COUNTRY_LABEL, STAGE_LABEL, cellText, checklistHtml, checklistText, crossChargeNote, eadDependents, gcPlan, gcTrackOf, interviewChecklist, spanText, stageIndex, ticked, workBasis, type GcTrack } from '../core/gc';
import { birthLabel } from '../core/birth';
import { stepsFor } from '../core/steps';
import { canPrintPdf, shareChecklist } from '../native/print';
import { gcStepKeys, stepMeta, fillsStep, type StepKey } from '../core/steps';
import { docTitle } from '../core/docs';
import { RULES } from '../core/rules/catalog';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { useProcessing } from '../data/processing';
import { fmtMonths } from '../content/processing';
import { SOURCES } from '../content/legal';
import {
  Button, Card, CheckRow, ChipToggle, Chips, DateField, EmptyState, Group, Hint, Note, Pastel, Pill, Row, Screen, SectionHeader, Segmented, SelectField, SheetButtons, T, Timeline, Why, BigText, LegalLine,
  font, useSheet, useTheme, useToast, type PastelTone,
} from '../ui';
import { back, DataFooter, go, LegalFooter, runFlow } from './common';
import { openUrl } from '../native/device';

type Ctx = { f: FamilyState; p: Person; track?: GcTrack; members: { person: Person; rec: FamilyState['records'][string] }[] };
function useGc(pid?: string): Ctx | undefined {
  const f = useFamily();
  return useMemo(() => {
    const p = f.people.find((x) => x.id === pid);
    if (!p || !f.records[p.id]) return undefined;
    const members = f.people.filter((x) => f.records[x.id]).map((x) => ({ person: x, rec: f.records[x.id] }));
    return { f, p, members, track: gcTrackOf({ person: p, rec: f.records[p.id] }, members, f.bulletin.data) };
  }, [f, pid]);
}
const STAGE_TONE: Record<string, PastelTone> = { 'not-started': 'sky', perm: 'mint', i140: 'mint', waiting: 'butter', i485: 'sky', interview: 'butter', approved: 'sage' };
const ownerName = (c: Ctx) => c.f.people.find((x) => x.id === c.track?.ownerId)?.name ?? 'the principal';
const poss = (p: Person) => (p.relation === 'self' ? 'your' : `${p.name}’s`);
const setGc = (f: FamilyState, p: Person, patch: Partial<GcFacts>) => f.actions.setFacts(p.id, { gc: { ...(p.facts.gc ?? {}), ...patch } });

/** One line about the priority date for rows and cards. */
function pdLine(t: GcTrack): string {
  if (!t.priorityDate) return 'Priority date not added yet';
  const b = t.bulletin;
  const cur = b ? (b.canApprove ? ' · final action current' : b.canFile ? ' · current for filing' : ' · not current yet') : '';
  return `${t.category ?? 'Category?'} · ${COUNTRY_LABEL[t.country]} · ${fmt(t.priorityDate)}${cur}`;
}

// ---------- the GC section on the person page ----------
export function GcSection({ pid }: { pid: string }) {
  const c = useGc(pid);
  const sheet = useSheet();
  if (!c || !c.track) return null;
  const { p, track: t } = c;
  const wb = workBasis({ person: p, rec: c.f.records[p.id] });
  return (
    <>
      <SectionHeader>Green card</SectionHeader>
      <Group>
        {t.started ? (
          <>
            <Row icon="card" iconPastel={STAGE_TONE[t.stage] === 'butter' ? 'butter' : STAGE_TONE[t.stage] === 'sage' ? 'sage' : 'sky'} title={STAGE_LABEL[t.stage]} subtitle={t.next[0]} onPress={() => go(`/gc/${p.id}`)} chevron />
            {t.stage !== 'approved' ? <Row icon="cal" title="Priority date" subtitle={pdLine(t)} onPress={() => go(`/gc/plan/${p.id}`)} chevron
              trailing={t.bulletin ? <Pill severity={t.bulletin.canFile || t.bulletin.canApprove ? 'good' : 'info'} text={t.bulletin.canApprove ? 'Final' : t.bulletin.canFile ? 'Current' : 'Waiting'} /> : undefined} /> : null}
            {wb.pending485 ? <Row icon="briefcase" title="Working on" subtitle={wb.workOn === 'ead' ? `EAD (C9)${wb.eadUntil ? ` until ${fmt(wb.eadUntil)}` : ''}` : `${wb.hlClass ? wb.hlClass.replace(/^H1B$/, 'H-1B') : 'H / L'} status${wb.i94Until ? ` until ${fmt(wb.i94Until)}` : ''}`} onPress={() => go(`/gc/${p.id}`)} chevron /> : null}
            {t.stage === 'i485' || t.stage === 'interview' ? <Row icon="list" iconPastel="butter" title="Interview prep" subtitle={t.interview ? `Interview ${fmt(t.interview)}` : 'Checklist and common questions'} onPress={() => go(`/gc/interview/${p.id}`)} chevron /> : null}
          </>
        ) : (
          <Row icon="card" iconPastel="mint" title="Track a green card" subtitle={p.relation === 'self' ? 'Started PERM or have an I-140? Add it to follow the priority date.' : `Follow ${poss(p)} green card with the family’s case.`} onPress={() => sheet.open('Green card details', <GcDetails pid={p.id} start />)} chevron={false} />
        )}
      </Group>
    </>
  );
}

// ---------- GC tracking ----------
export function GcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useGc(id);
  const sheet = useSheet();
  if (!c || !c.track) return <Screen nav={{ back: 'Back', onBack: back, title: 'Green card' }}><EmptyState icon="card" title="Nothing to track" body="US citizens don’t need a green card." /></Screen>;
  const { p, f, track: t } = c;
  const done = (k: string) => stageIndex(t.stage) > stageIndex(k as never) || (t.stage === 'approved' && k === 'approved');
  const rec = f.records[p.id];
  const wb = workBasis({ person: p, rec });
  const big = t.stage === 'approved' ? 'Approved' : t.stage === 'interview' && t.interview && (daysTo(t.interview) ?? -1) >= 0 ? `${daysTo(t.interview)} days` : STAGE_LABEL[t.stage];
  const findings = (f.results[p.id]?.findings ?? []).filter((x) => x.id.startsWith('gc-') || x.rule === 'R21' || x.id === 'pd-current' || x.id === 'pd-back' || ['R16', 'R17', 'R18', 'R22'].includes(x.rule ?? ''));
  const steps = gcStepKeys(p, rec, p.status === 'green-card-applicant');
  const mine = f.docs.filter((d) => d.ownerId === p.id && !f.superseded.has(d.id));
  return (
    <Screen wide nav={{ back: 'Back', onBack: back, title: p.relation === 'self' ? 'Your green card' : `${p.name}’s green card`, right: undefined }}>
      <Pastel tone={STAGE_TONE[t.stage]} r={30} pad={20}>
        <T style={[font.sub, { fontWeight: '600' }]}>{t.derivative ? `Follows ${ownerName(c)}’s case` : 'Green card'}</T>
        <BigText size={36} style={{ marginTop: 6 }}>{big}</BigText>
        <T style={[font.foot, { marginTop: 2 }]}>{t.stage === 'interview' ? `Interview ${fmt(t.interview)}` : pdLine(t)}</T>
      </Pastel>

      <SectionHeader>What happens next</SectionHeader>
      <Card>
        {t.next.map((x, i) => <T key={i} style={[font.sub, { marginTop: i ? 8 : 0 }]}>{x}</T>)}
        <LegalLine />
      </Card>
      {findings.length ? (
        <Group style={{ marginTop: 12 }}>
          {findings.map((x) => <Row key={x.id} icon={x.severity === 'act' || x.severity === 'review' ? 'alert' : x.severity === 'good' ? 'checkc' : 'info'} iconTone={x.severity === 'act' ? 'red' : x.severity === 'review' ? 'amber' : x.severity === 'good' ? 'green' : 'blue'} alignTop title={x.title}
            subtitle={<T tone="text2" style={[font.foot, { marginTop: 2 }]}>{x.detail}{x.source ? `\n${x.source.label} · checked ${fmt(x.checked)}` : ''}</T>} />)}
        </Group>
      ) : null}

      <SectionHeader>Stages</SectionHeader>
      <Card>
        <Timeline items={GC_STAGES.map((s) => ({ title: s.title, state: done(s.key) ? 'done' : t.stage === s.key ? 'now' : '', sub: stageSub(s.key, t) ?? (t.stage === s.key ? s.sub : undefined) }))} />
      </Card>

      {t.stage !== 'approved' ? (
        <>
          <SectionHeader>Priority date and the Visa Bulletin</SectionHeader>
          <Group>
            <Row title="Category" value={t.category ?? '—'} />
            <Row title="Country of chargeability" subtitle={t.countryFrom === 'picked' ? 'Picked by you' : t.countryFrom === 'birth' ? `Country of birth: ${birthLabel(t.birthCountry) ?? '—'}${t.derivative ? ` (${ownerName(c)})` : ''}` : t.countryFrom === 'passport' ? 'From the passport — add the country of birth in Edit details' : 'Not known — add the country of birth'} value={COUNTRY_LABEL[t.country]} />
            <Row title="Priority date" subtitle={t.pdFrom === 'i140' ? 'From the I-140' : t.pdFrom === 'perm' ? 'PERM filing date (fixed once the I-140 is approved)' : t.pdFrom === 'typed' ? 'Typed by you' : undefined} value={t.priorityDate ? fmt(t.priorityDate) : '—'} />
            {t.bulletin ? <Row title={`Final action date · ${t.bulletin.month}`} subtitle="When the I-485 can be approved" value={cellText(t.bulletin.final)} /> : null}
            {t.bulletin ? <Row title="Date for filing" subtitle={t.bulletin.chart === 'filing' ? 'USCIS takes I-485s by this chart this month' : 'USCIS uses the final action chart this month'} value={cellText(t.bulletin.filing)} /> : null}
            <Row icon="map" iconPastel="mint" title="Planner: expected wait" onPress={() => go(`/gc/plan/${p.id}`)} chevron />
          </Group>
          {crossChargeNote(t, { person: p, rec }, c.members) ? <Hint>{crossChargeNote(t, { person: p, rec }, c.members)}</Hint> : null}
          <Group style={{ marginTop: 12 }}>
            <Row icon="edit" title="Edit green card details" subtitle={t.derivative ? 'Whose case, country' : 'Category, priority date, country'} onPress={() => sheet.open('Green card details', <GcDetails pid={p.id} />)} chevron={false} />
          </Group>
        </>
      ) : null}

      {wb.pending485 ? <StatusChoice c={c} /> : null}

      <SectionHeader>{`${p.relation === 'self' ? 'Your' : `${p.name}’s`} green card documents`}</SectionHeader>
      <Group>
        {steps.map((k) => <GcDocRow key={k} k={k} c={c} mine={mine} />)}
        {!steps.length ? <Row title={t.derivative ? `${ownerName(c)}’s PERM and I-140 cover the family. Your own I-485 papers appear here once filed.` : 'Add the PERM or I-140 to start.'} titleTone="text2" /> : null}
      </Group>
      {t.stage === 'i485' || t.stage === 'interview' ? <Group style={{ marginTop: 12 }}><Row icon="list" iconPastel="butter" title="Interview prep" subtitle="Checklist per person and common questions" onPress={() => go(`/gc/interview/${p.id}`)} chevron /></Group> : null}

      <SectionHeader>The family</SectionHeader>
      <Group>
        {c.members.filter((m) => m.rec.visa !== 'US citizen' && m.person.status !== 'citizen').map((m) => {
          const tm = gcTrackOf(m, c.members, f.bulletin.data);
          return <Row key={m.person.id} avatar={m.person.name} title={m.person.name} subtitle={tm ? `${STAGE_LABEL[tm.stage]}${tm.derivative ? ` · follows ${f.people.find((x) => x.id === tm.ownerId)?.name ?? ''}` : ''}` : ''} onPress={m.person.id === p.id ? undefined : () => go(`/gc/${m.person.id}`)} chevron={m.person.id !== p.id} />;
        })}
      </Group>
      <Hint>The family follows the principal’s PERM and I-140. Each person files their own I-485, EAD and advance parole.</Hint>
      <DataFooter live={f.bulletin.live} asOf={`${f.bulletin.data.month} Visa Bulletin`} fetchedAt={f.bulletin.fetchedAt} source={{ label: SOURCES.bulletin.label, url: f.bulletin.data.source || SOURCES.bulletin.url }} />
    </Screen>
  );
}
function stageSub(k: string, t: GcTrack): string | undefined {
  if (k === 'perm' && t.perm) return [t.perm.filed ? `Filed ${fmt(t.perm.filed)}` : '', t.perm.certified ? `certified ${fmt(t.perm.certified)}` : ''].filter(Boolean).join(' · ') || undefined;
  if (k === 'i140' && t.i140) return `${t.i140.status === 'approved' ? 'Approved' : 'Pending'}${t.i140.priorityDate ? ` · priority date ${fmt(t.i140.priorityDate)}` : ''}`;
  if (k === 'i485' && t.i485) return `Filed ${fmt(t.i485.received)}${t.biometrics ? ` · biometrics ${fmt(t.biometrics)}` : ''}`;
  if (k === 'interview' && t.interview) return `Interview ${fmt(t.interview)}`;
  if (k === 'approved' && (t.approvedOn || t.residentSince)) return t.residentSince ? `Resident since ${fmt(t.residentSince)}` : `Approved ${fmt(t.approvedOn)}`;
  return undefined;
}

function GcDocRow({ k, c, mine }: { k: StepKey; c: Ctx; mine: FamilyState['docs'] }) {
  const { f, p } = c;
  const toast = useToast();
  const st = stepMeta(p, k, f.records[p.id]);
  const d = mine.find((x) => fillsStep(st, x));
  const v = d ? (d.fields[st.keyField.field] as string | undefined) : undefined;
  const ap = f.records[p.id]?.advanceParole;
  if (!d && k === 'ap' && ap?.from === 'combo-card') return <Row icon="checkc" iconPastel="sage" title={st.title} subtitle={`Covered by the combo card · valid until ${fmt(ap.expires)}`} chevron={false} />;
  return d
    ? <Row icon="doc" iconPastel="sky" title={docTitle(d)} subtitle={`${st.keyField.label} ${v && /^\d{4}-/.test(String(v)) ? fmt(String(v)) : v ?? '—'}`} onPress={() => go(`/document/${d.id}`)} chevron />
    : <Row icon="plus" iconPastel="mint" title={st.title} subtitle={st.why} onPress={() => runFlow({ mode: 'renew', pids: [p.id], only: [k] }, f, toast)} chevron={false} trailing={<T tone="text2" style={font.foot}>Add</T>} />;
}

/** Item 4: keep H / L status or work on the EAD while the I-485 is pending. */
function StatusChoice({ c }: { c: Ctx }) {
  const { f, p } = c;
  const toast = useToast();
  const sheet = useSheet();
  const deps = wbDeps(c);
  const wb = workBasis({ person: p, rec: f.records[p.id] });
  const hl = wb.hlClass ? wb.hlClass.replace(/^H1B$/, 'H-1B').replace(/^L1([AB]?)$/, 'L-1$1').replace(/^H4$/, 'H-4').replace(/^L2S?$/, 'L-2') : 'H-1B / L-1';
  const opts = [`${hl} status`, 'EAD (C9)'];
  const src = RULES.G4.source;
  return (
    <>
      <SectionHeader>Current status while the I-485 is pending</SectionHeader>
      <Segmented options={opts} value={wb.workOn === 'ead' ? opts[1] : opts[0]} onChange={async (v) => {
        const ead = v === opts[1];
        await setGc(f, p, { workOn: ead ? 'ead' : 'status' });
        toast(ead ? 'Status is now the EAD (C9)' : `Status is ${hl} again`);
        if (ead && eadDependents({ person: p, rec: f.records[p.id] }, c.members).length) setTimeout(() => sheet.open('The family’s status', <EadFamily pid={p.id} />), 350);
      }} />
      <Card style={{ marginTop: 12 }}>
        <T style={[font.sub, { fontWeight: '600' }]}>{wb.workOn === 'ead' ? `On the EAD${wb.eadUntil ? ` · until ${fmt(wb.eadUntil)}` : ''}` : `On ${hl}${wb.i94Until ? ` · I-94 until ${fmt(wb.i94Until)}` : ''}`}</T>
        <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{`Keep ${hl}: travel and return on the visa without advance parole, extensions as usual, and a status to fall back on if the I-485 is denied. Dependents keep H-4 / L-2.`}</T>
        <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{`Work on the EAD: any employer or a same or similar job change (after 180 days, AC21); the I-94 no longer counts, travel needs advance parole, and an H-4 / L-2 that follows you ends. EAD renewals filed since Oct 30, 2025 are not extended automatically.`}</T>
        <T tone="text2" style={[font.caption, { marginTop: 8 }]}>{`${src.label} · checked ${fmt(RULES.G4.checked)}`}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <Button size="sm" kind="tint" icon="globe" title="Read the rule" onPress={() => openUrl(src.url)} />
        </View>
        <LegalLine />
      </Card>
      {!wb.chosen ? <Hint>{`Worked out from the documents: ${wb.hlValid ? `a valid ${hl} I-94` : 'no valid H / L I-94'}. Pick one to set it.`}</Hint> : null}
      {wb.workOn === 'ead' && deps.length ? (
        <Group style={{ marginTop: 12 }}>
          <Row icon="users" iconPastel="sky" title="The family’s status" subtitle={deps.map((d) => `${d.person.name}: ${d.workOn === 'ead' ? 'EAD (C9)' : d.depClass ?? 'H-4 / L-2'}`).join(' · ')} onPress={() => sheet.open('The family’s status', <EadFamily pid={p.id} />)} chevron={false} trailing={<T tone="text2" style={font.foot}>Change</T>} />
        </Group>
      ) : null}
    </>
  );
}
const wbDeps = (c: Ctx) => eadDependents({ person: c.p, rec: c.f.records[c.p.id] }, c.members);

/** gc2 item 2: the principal works on the EAD — did each dependent with a pending I-485 get an EAD too? */
export function EadFamily({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  const members = f.people.filter((x) => f.records[x.id]).map((x) => ({ person: x, rec: f.records[x.id] }));
  const deps = p && f.records[p.id] ? eadDependents({ person: p, rec: f.records[p.id] }, members) : [];
  const [ans, setAns] = useState<Record<string, 'ead' | 'status' | undefined>>(() => Object.fromEntries(deps.map((d) => [d.person.id, d.workOn])));
  if (!p) return null;
  const whose = p.relation === 'self' ? 'your' : `${p.name}’s`;
  const save = async (addCardFor?: string) => {
    for (const d of deps) if (ans[d.person.id]) await setGc(f, d.person, { workOn: ans[d.person.id] });
    s.close();
    if (addCardFor) {
      const d = deps.find((x) => x.person.id === addCardFor)!;
      const k = stepsFor(d.person, d.rec).some((st) => st.key === 'combo') ? 'combo' : 'ead';
      setTimeout(() => runFlow({ mode: 'renew', pids: [addCardFor], only: [k] }, f, toast), 300);
    } else toast('Saved');
  };
  return (
    <View>
      <Why>Each person with their own pending I-485 can work on their own EAD (C9), or stay on H-4 / L-2.</Why>
      {deps.map((d) => {
        const a = ans[d.person.id];
        const cls = d.depClass ?? 'H-4 / L-2';
        return (
          <Card key={d.person.id} style={{ marginTop: 12 }}>
            <T style={[font.headline]}>{`Did ${d.person.name} also get an EAD?`}</T>
            <Chips style={{ marginTop: 8 }}>
              <ChipToggle role="radio" text="Yes" on={a === 'ead'} onPress={() => setAns({ ...ans, [d.person.id]: 'ead' })} />
              <ChipToggle role="radio" text={`No, still on ${cls}`} on={a === 'status'} onPress={() => setAns({ ...ans, [d.person.id]: 'status' })} />
            </Chips>
            {a === 'ead' ? (
              <>
                <T tone="text2" style={[font.foot, { marginTop: 8 }]}>{`${d.person.name}’s status becomes the EAD (C9)${d.rec.ead?.expires ? `, valid until ${fmt(d.rec.ead.expires)}` : ''}. Travel needs advance parole.`}</T>
                {!d.hasEad ? <View style={{ flexDirection: 'row', marginTop: 10 }}><Button size="sm" kind="tint" icon="plus" title={`Add ${d.person.name}’s EAD card`} onPress={() => save(d.person.id)} /></View> : null}
              </>
            ) : a === 'status' ? (
              <Note tone="amber">{`${d.person.name} stays on ${cls}. That depends on ${whose} H / L status — it ends once ${p.relation === 'self' ? 'you work' : `${p.name} works`} on the EAD. ${d.person.name}’s own pending I-485 still lets them stay in the US; ask your attorney before relying on the ${cls}.`}</Note>
            ) : null}
          </Card>
        );
      })}
      <Hint>You can change this later on each person’s green card page.</Hint>
      <SheetButtons><Button kind="ghost" title="Later" onPress={() => s.close()} /><Button grow title="Save" onPress={() => save()} /></SheetButtons>
    </View>
  );
}

/** Category, priority date, country, whose case (stored on the person; documents win over typed values). */
export function GcDetails({ pid, start }: { pid: string; start?: boolean }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  const g = p?.facts.gc ?? {};
  const [cat, setCat] = useState<GcFacts['category']>(g.category);
  const [pd, setPd] = useState<string | undefined>(g.priorityDate);
  const [ctry, setCtry] = useState<string>(g.chargeability ?? '');
  const [follows, setFollows] = useState<string>(g.followsId ?? '');
  if (!p) return null;
  const dep = p.relation === 'spouse' || p.relation === 'child';
  const others = f.people.filter((x) => x.id !== p.id && f.records[x.id]?.visa !== 'US citizen');
  const save = async () => {
    await f.actions.setFacts(p.id, { gc: { ...g, category: cat, priorityDate: pd, chargeability: (ctry || undefined) as GcFacts['chargeability'], followsId: follows || undefined }, ...(start && !dep ? { greenCardStarted: true } : {}) });
    s.close(); toast('Saved');
  };
  return (
    <View>
      <Why>{dep ? 'A spouse or child follows the principal’s case. Their own I-485 papers are added on their page.' : 'Documents fill these in (PERM, I-140). Type them only if you don’t have the notice yet.'}</Why>
      {dep || others.length ? <SelectField label="Whose case does this follow?" value={follows} onChange={setFollows} options={[{ value: '', label: dep ? 'The principal (automatic)' : 'Their own case' }, ...others.map((x) => ({ value: x.id, label: x.name }))]} /> : null}
      {!dep ? (
        <>
          <T tone="text2" style={[font.caption, { marginTop: 14, marginLeft: 2 }]}>Category</T>
          <Chips style={{ marginTop: 8 }}>{(['EB-1', 'EB-2', 'EB-3', 'EB-3 OW'] as const).map((x) => <ChipToggle key={x} text={x} on={cat === x} onPress={() => setCat(cat === x ? undefined : x)} />)}</Chips>
          <DateField label="Priority date (I-140, or the PERM filing date)" value={pd} onChange={setPd} />
        </>
      ) : null}
      <SelectField label="Visa Bulletin country (override)" value={ctry} onChange={setCtry} options={[{ value: '', label: 'From the country of birth' }, ...(['india', 'china', 'mexico', 'philippines', 'all'] as const).map((x) => ({ value: x, label: COUNTRY_LABEL[x] }))]} />
      <Hint>The Visa Bulletin goes by country of birth, not passport — set it in Edit details. Pick a country here only to override it (for example cross-chargeability through a spouse, after asking your attorney).</Hint>
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={() => s.close()} /><Button grow title="Save" onPress={save} /></SheetButtons>
    </View>
  );
}

// ---------- planner ----------
export function GcPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFamily();
  return <Screen wide nav={{ back: 'Back', onBack: back, title: 'Green card planner' }}><GcPlanBody pid={id ?? f.main?.id} /></Screen>;
}
export function GcPlanBody({ pid }: { pid?: string }) {
  const c = useGc(pid);
  const proc = useProcessing();
  const sheet = useSheet();
  const f = useFamily();
  if (!c || !c.track) return <EmptyState icon="map" title="Add someone first" body="The planner uses the family’s I-140 and the Visa Bulletin." />;
  const { p, track: t } = c;
  const plan = gcPlan(t, f.bulletin.data, proc.data, today());
  const eta = plan.eta?.filing ?? plan.eta?.final;
  const big = plan.current.final ? 'Current' : plan.current.filing ? 'File now' : eta ? fmt(eta).replace(/^\w+ \d+, /, '') : t.priorityDate ? '—' : 'Add a date';
  const sub = plan.current.final ? 'The final action date has passed the priority date.' : plan.current.filing ? 'Current for filing the I-485 this month.' : eta ? `Estimated year the I-485 can be filed (${t.category}, ${COUNTRY_LABEL[t.country]})` : t.priorityDate ? 'Not enough data to estimate yet' : 'Add the I-140 or type the priority date';
  const gatherFor = GATHER.filter((g) => g.who === 'all' || (g.who === 'principal' && !t.derivative) || (g.who === 'spouse' && (p.relation === 'spouse' || p.relation === 'self')));
  return (
    <>
      <Pastel tone={plan.current.filing || plan.current.final ? 'sage' : 'butter'} r={30} pad={20} style={{ marginTop: 8 }}>
        <T style={[font.sub, { fontWeight: '600' }]}>{`${p.name} · ${t.category ?? 'Category?'} · ${COUNTRY_LABEL[t.country]}`}</T>
        <BigText size={40} style={{ marginTop: 6 }}>{big}</BigText>
        <T style={[font.foot, { marginTop: 2 }]}>{sub}</T>
      </Pastel>
      {!t.priorityDate ? <Group style={{ marginTop: 12 }}><Row icon="edit" iconPastel="mint" title="Add the priority date" subtitle="Or add the I-140 notice on the person page" onPress={() => sheet.open('Green card details', <GcDetails pid={t.ownerId} start />)} chevron={false} /></Group> : null}
      {t.priorityDate ? (
        <>
          <SectionHeader>Where the dates are</SectionHeader>
          <Group>
            <Row title="Priority date" value={fmt(t.priorityDate)} />
            {(['filing', 'final'] as const).map((k) => {
              const cell = t.bulletin?.[k];
              const gap = plan.gapDays?.[k];
              return <Row key={k} title={k === 'filing' ? 'Date for filing' : 'Final action date'} subtitle={plan.current[k] ? 'Current' : gap ? `Cut-off is ${spanText(gap)} behind your date` : undefined} value={cellText(cell)} />;
            })}
            {plan.pace?.filing || plan.pace?.final ? <Row title="Recent pace" subtitle={`${plan.pace.filing ? 'Filing' : 'Final action'} chart, ${(plan.pace.filing ?? plan.pace.final)!.from} to ${(plan.pace.filing ?? plan.pace.final)!.to}`} value={`${Math.round(((plan.pace.filing ?? plan.pace.final)!.daysPerYear / 30.44))} months / year`} /> : null}
            {plan.eta?.final ? <Row title="Estimated approval window" subtitle="Final action date reaches your priority date" value={fmt(plan.eta.final).replace(/^\w+ \d+, /, '')} /> : null}
          </Group>
          {plan.etaNote ? <Hint>{plan.etaNote}</Hint> : null}
        </>
      ) : null}

      <SectionHeader>When to gather documents</SectionHeader>
      <Note tone={plan.gatherNow ? 'amber' : 'blue'}>{plan.gatherNow ? 'Start now: the date is current. Book the I-693 medical — it must go in with the I-485.' : plan.gatherFrom ? `Start around ${fmt(plan.gatherFrom)}, about 4 months before the estimated filing date. Book the medical close to filing.` : 'Start once the date for filing is within a few months of your priority date. We’ll tell you when the bulletin moves.'}</Note>
      <Group style={{ marginTop: 12 }}>{gatherFor.map((g) => <Row key={g.id} icon="doc" title={g.text} titleStyle={font.callout} />)}</Group>

      <SectionHeader>How long USCIS is taking</SectionHeader>
      <Group>{plan.processing.map((x) => <Row key={x.form + x.label} title={x.form} subtitle={x.label} value={fmtMonths(x.months)} />)}</Group>
      <Hint>USCIS’s published “8 in 10 cases decided within” times. The I-485 also waits for the final action date.</Hint>
      <DataFooter live={f.bulletin.live} asOf={`${f.bulletin.data.month} Visa Bulletin`} fetchedAt={f.bulletin.fetchedAt} source={{ label: SOURCES.bulletin.label, url: f.bulletin.data.source || SOURCES.bulletin.url }} note="Estimates come from how far the cut-off moved in past bulletins. They are not predictions and not legal advice. Processing times: egov.uscis.gov." />
    </>
  );
}

// ---------- interview preparation ----------
export function GcInterviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useGc(id);
  const toast = useToast();
  const [who, setWho] = useState<string | undefined>(id);
  if (!c || !c.track) return <Screen nav={{ back: 'Back', onBack: back, title: 'Interview prep' }}><EmptyState icon="list" title="Nothing to prepare" /></Screen>;
  const { f } = c;
  // everyone in the family with an I-485 on file (the interview usually covers them together)
  const family = c.members.map((m) => ({ m, t: gcTrackOf(m, c.members, f.bulletin.data) })).filter((x) => x.t && (x.t.stage === 'i485' || x.t.stage === 'interview' || x.m.person.id === id));
  const cur = family.find((x) => x.m.person.id === who) ?? family[0];
  const p = cur.m.person;
  const list = interviewChecklist(p, cur.t);
  const ticks = ticked(p);
  const toggle = async (k: string) => { const n = new Set(ticks); if (n.has(k)) n.delete(k); else n.add(k); await setGc(f, p, { interviewTicks: [...n] }); };
  const iv = family.map((x) => x.t?.interview).filter(Boolean).sort()[0];
  const src = RULES.G5.source;
  const pdf = canPrintPdf();
  return (
    <Screen wide nav={{ back: 'Back', onBack: back, title: 'Interview prep' }}>
      <Pastel tone={iv ? 'butter' : 'sky'} r={30} pad={20}>
        <T style={[font.sub, { fontWeight: '600' }]}>Green card interview</T>
        <BigText size={36} style={{ marginTop: 6 }}>{iv ? ((daysTo(iv) ?? -1) >= 0 ? `${daysTo(iv)} days` : 'Done') : 'No date yet'}</BigText>
        <T style={[font.foot, { marginTop: 2 }]}>{iv ? `${fmt(iv)} · reminders before the date` : 'Add the interview notice when it comes. USCIS may also decide without an interview.'}</T>
      </Pastel>
      {!iv ? <Group style={{ marginTop: 12 }}><Row icon="plus" iconPastel="mint" title="Add the interview notice" subtitle="Reads the date and reminds you" onPress={() => runFlow({ mode: 'renew', pids: [p.id], only: ['interview'] }, f, toast)} chevron={false} /></Group> : null}
      {family.length > 1 ? <View style={{ marginTop: 16 }}><Segmented options={family.map((x) => x.m.person.name)} value={p.name} onChange={(v) => setWho(family.find((x) => x.m.person.name === v)?.m.person.id)} /></View> : null}
      <SectionHeader right={<T tone="text2" style={font.foot}>{`${list.filter((x) => ticks.has(x.id)).length} of ${list.length}`}</T>}>{`What ${p.relation === 'self' ? 'you bring' : `${p.name} brings`}`}</SectionHeader>
      <Group>{list.map((x) => <CheckRow key={x.id} title={x.why ? `${x.text} — ${x.why}` : x.text} checked={ticks.has(x.id)} onPress={() => toggle(x.id)} />)}</Group>
      <Hint>Bring originals and a copy of each. The notice may list more — follow it.</Hint>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Button size="sm" kind="tint" icon="share" title={pdf ? 'Share as PDF' : 'Share checklist'} onPress={async () => {
          const people = family.map((x) => ({ name: x.m.person.name, items: interviewChecklist(x.m.person, x.t), ticks: [...ticked(x.m.person)], interview: x.t?.interview }));
          const r = await shareChecklist(checklistHtml(people), checklistText(people), 'Green card interview checklist');
          if (r === 'text' && pdf) toast('Shared as text');
        }} />
      </View>
      {!pdf ? <Hint>PDF needs the next app version from TestFlight; this shares the checklist as text.</Hint> : null}
      <SectionHeader>Common questions</SectionHeader>
      <Group>{INTERVIEW_QUESTIONS.map((q) => <Row key={q.q} title={q.q} titleStyle={{ ...font.callout, fontWeight: '500' }} subtitle={q.tip} />)}</Group>
      <Note tone="blue">This is the green card (I-485) interview — the citizenship test is separate (Tools → Citizenship test).</Note>
      <DataFooter source={src} note={`USCIS interviews adjustment applicants unless it waives the interview; officers go through the I-485 answers with you. Checked ${fmt(RULES.G5.checked)}.`} />
      <LegalFooter />
    </Screen>
  );
}
