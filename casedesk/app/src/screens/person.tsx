// Person page, document view, layoff plan, reminders.
import React, { useMemo, useState } from 'react';
import { Image, Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Document, Person } from '../core/model';
import { isResident, isCitizen, STATUS_LABEL } from '../core/model';
import { stepsFor, stepKeys } from '../core/steps';
import { docBadges, docNote, docTitle, fieldRows, parseField, FIELDS, showField } from '../core/docs';
import { addYears, addDays, daysBetween, daysTo, fmt, today, isISO } from '../core/dates';
import { metroOf, placeText } from '../core/metro';
import { MAX_YEARS } from '../core/rules/status';
import { evaluateFamily } from '../core/rules/engine';
import { isPendingCase } from '../core/cases';
import { useFamily, usePerson } from '../data/FamilyProvider';
import { readText } from '../native/ocr';
import { fileUri, keepFile, pick, preview, share as shareFile, type Source } from '../native/files';
import { readDocument } from '../core/read';
import { copyReminders, reminderSummary, LEAD_CHOICES, REMINDER_TYPES, typeDates, typeSetting, typesFor, type ReminderType } from '../core/reminders';
import { belongsElsewhere, identityOf, sameName } from '../core/identity';
import {
  Avatar, Button, Card, CheckRow, Chip, DateField, EmptyState, Field, Group, H1, Hint, Icon, LegalLine, Meter, NavButton, Note, Pill, Row, Screen, SectionHeader, Switch, T, Why, ChipToggle, Chips,
  font, useSheet, useTheme, useToast, Spinner, Columns, BigText,
  TourTarget, useTour, WalletCard,
} from '../ui';
import { NextFiling } from './filings';
import { NOT_OFFICIAL_ID } from '../content/legal';
import { AttentionRow, ReviewChip, back, ctaFor, go, LegalFooter, locationChip, needsLocation, relationLabel, statusLabel, untilText } from './common';
import { walletFacts } from '../core/priority';
import { reasonLine } from '../core/review';
import { StatusView } from './priority';
import { AddCase, AskWhere, Confirm, EditDetails, FixClass, RemovePerson, RenewSheet, Trips, Unemployment, WorkLocation } from './sheets';
import { newId } from '../data/store';
import { askNotificationPermission } from '../native/reminders';
import { leadText } from './profile';
import { WalletCardRow } from './wallet';
import { ShareRow } from './share';
import { GcSection } from './gc';

export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { person: p, rec } = usePerson(id);
  const sheet = useSheet();
  const tour = useTour('person');
  if (!p || !rec) return <Screen nav={{ back: 'Back', onBack: back }}><EmptyState icon="user" title="Removed" /></Screen>;
  return (
    <Screen wide tour={tour} nav={{ back: 'Back', onBack: back, title: p.name, right: <NavButton title="Edit" onPress={() => sheet.open('Edit details', <EditDetails pid={p.id} />)} /> }}>
      <PersonBody id={p.id} />
    </Screen>
  );
}

/** The person page body — on its own screen, or the right pane of Family on wide screens.
 *  Wide (≥ 700): status + needs attention + next filing | documents + cases + work + travel. */
export function PersonBody({ id, single }: { id: string; single?: boolean }) {
  const { family: f, person: p, rec, result } = usePerson(id);
  const sheet = useSheet();
  const t = useTheme();
  if (!p || !rec) return <EmptyState icon="user" title="Removed" />;
  const you = p.relation === 'self';
  // Legal name under the name only when it differs from the display name and is this person's own
  // (never another family member's name from a misfiled document).
  const legal = rec.legalName && normName(rec.legalName) !== normName(p.name) && !f.people.some((o) => o.id !== p.id && sameName(rec.legalName, o.name)) ? rec.legalName : undefined;
  const steps = stepsFor(p, rec);
  const order = stepKeys(p, rec);
  const docs = f.docs.filter((d) => d.ownerId === p.id).sort((a, b) => {
    const ia = order.findIndex((k) => steps.find((s) => s.key === k)?.accepts.includes(a.type));
    const ib = order.findIndex((k) => steps.find((s) => s.key === k)?.accepts.includes(b.type));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || Number(f.superseded.has(a.id)) - Number(f.superseded.has(b.id));
  });
  const cases = f.caseList.filter((c) => c.ownerId === p.id).sort((a, b) => Number(isPendingCase(b)) - Number(isPendingCase(a)));
  const findings = (result?.findings ?? []).filter((x) => x.severity !== 'good');
  const handlers = {
    askWhere: () => sheet.open(stepTitleWhere(p), <AskWhere pid={p.id} />),
    fixClass: () => sheet.open('Fix a wrong I-94 class', <FixClass />),
    renew: (k: string) => { sheet.open('Add or renew a document', <RenewSheet pid={p.id} />); void k; },
  };
  const work = ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1', 'F-1 OPT', 'STEM OPT'].includes(rec.visa ?? '') || (!rec.visa && ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1', 'F-1 OPT', 'STEM OPT'].includes(p.status ?? ''));
  const resident = isResident(rec.visa) || isCitizen(rec.visa);
  const dependent = !!result?.principalId && result.principalId !== p.id;
  const principal = dependent ? f.people.find((x) => x.id === result!.principalId) : undefined;
  const missing = f.missing[p.id] ?? [];
  const rm = p.reminders ?? { on: true, lead: [180, 90, 30, 7] };

  const hasDocs = rec.docTypes.length > 0;
  const w = walletFacts({ today: today(), hasDocs, citizen: isCitizen(rec.visa), outside: rec.location === 'Outside', resident: isResident(rec.visa), until: result?.facts.statusUntil ?? rec.i94?.until ?? rec.greenCard?.expires, label: result?.facts.visaLabel });
  const line = untilText(p, rec, result);
  const reason = result ? reasonLine(result.findings, result.facts.statusUntil) : undefined;
  const openAdd = () => sheet.open('Add or renew a document', <RenewSheet pid={p.id} />);
  const left = (
    <>
      <TourTarget id="status">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <WalletCard name={legal ? `${p.name} · ${legal}` : p.name} line={`${statusLabel(p, rec, result)} · ${relationLabel(p)}`} corner={w.corner}
              caption={w.caption} big={w.big} foot={line} footWord={reason && w.word === 'valid' ? undefined : w.word} footTone={w.wordTone}
              a11y={`${p.name}. ${statusLabel(p, rec, result)}. ${w.caption} ${w.big}. ${line}${reason ? `. ${reason}` : ''}`} />
          </View>
          <View style={{ gap: 10, width: 64 }}>
            <SquareAction icon="plus" label="Add or renew a document" onPress={openAdd} />
            <SquareAction icon="plane" tone="mint" label="Plan a trip" onPress={() => go('/tools/travel', { pid: p.id })} />
            <SquareAction icon="bell" tone="butter" label={`Reminders: ${rm.on ? 'on' : 'off'}`} onPress={() => go(`/reminders/${p.id}`)} />
          </View>
        </View>
      </TourTarget>
      {/* The card says how long; the chip says Review and opens why. Needs attention below has the full
          list, so the reason line is not repeated here (it shows on the Home and Family cards). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginHorizontal: 4 }}>
        <Chip text={locationChip(p, rec)} />
        {result ? <ReviewChip findings={result.findings} until={result.facts.statusUntil} worst={result.worst} name={p.name} /> : null}
      </View>
      <WalletCardRow pid={p.id} />

      <SectionHeader>Needs attention</SectionHeader>
      {findings.length || needsLocation(rec) ? (
        <Group>
          {needsLocation(rec) ? (
            <Row icon="pin" iconTone="amber" alignTop title={you ? 'Are you in the US right now?' : `Is ${p.name} in the US right now?`} subtitle="People outside the US don’t have an I-94.">
              <View style={{ marginTop: 10 }}><Button size="sm" kind="tint" title="Answer" onPress={handlers.askWhere} /></View>
            </Row>
          ) : null}
          {findings.filter((x) => !(needsLocation(rec) && x.id === 'i94-missing')).map((x) => <AttentionRow key={x.id} f={x} cta={ctaFor(x, p, handlers)} />)}
        </Group>
      ) : (
        <Group><Row icon="checkc" iconTone="green" title="All good for now" subtitle="We’ll remind you before dates come up." /></Group>
      )}

      <StatusView pid={p.id} title="Document status" card />
      {/* v2.9 green card track (own section, separate from the current stay) */}
      <GcSection pid={p.id} />
      <TourTarget id="filing"><NextFiling p={p} /></TourTarget>
    </>
  );
  const right = (
    <>
      <SectionHeader>Documents</SectionHeader>
      <Group>
        {docs.map((d) => <DocRow key={d.id} d={d} superseded={f.superseded.has(d.id)} />)}
        {!docs.length ? <Row title="No documents yet." titleTone="text2" /> : null}
        {missing.map((s) => <Row key={s.key} icon="doc" iconPastel="butter" title={s.title} subtitle="Not added yet" chevron={false} onPress={openAdd} trailing={<T tone="amber" style={[font.sub, { fontWeight: '600' }]}>Missing</T>} />)}
        <TourTarget id="docs"><Row icon="plus" iconPastel="mint" title="Add or renew a document" chevron={false} onPress={openAdd} /></TourTarget>
      </Group>

      <SectionHeader>Cases</SectionHeader>
      <Group>
        {cases.map((c) => <Row key={c.id} icon="doc" onPress={() => go(`/case/${encodeURIComponent(c.id)}`)} title={<T style={font.body}><T style={[font.body, { fontWeight: '600' }]}>{c.form ?? 'Case'}</T>{` · ${c.name}`}</T>} subtitle={c.keyDates.find((k) => k.date >= today()) ? `${c.keyDates.find((k) => k.date >= today())!.label} ${fmt(c.keyDates.find((k) => k.date >= today())!.date)}` : c.updated ? `Updated ${fmt(c.updated)}` : ''} chevron={false} value={c.status} />)}
        {!cases.length ? <Row title="No cases yet. A receipt notice adds one." titleTone="text2" /> : null}
        <Row icon="plus" iconPastel="mint" title="Add a case" chevron={false} onPress={() => sheet.open('Add a case', <AddCase pid={p.id} />)} />
      </Group>

      {work ? (
        <>
          <SectionHeader>Work</SectionHeader>
          <Group>
            <Row icon="building" title={p.facts.employer ?? rec.employer ?? 'Employer not added'} subtitle="Employer" onPress={() => sheet.open('Edit details', <EditDetails pid={p.id} />)} />
            {(() => { const w = p.facts.workLocation ?? rec.approvedWorkLocation; const city = w ? placeText(w) : ''; const metro = w ? metroOf(w.city, w.state) ?? w.metro : undefined; return w && city
              ? <Row icon="pin" title={city} subtitle={`${metro ?? 'Unknown'} metro · work location`} onPress={() => sheet.open('Work location changed?', <WorkLocation pid={p.id} />)} />
              : <Row icon="pin" iconPastel="butter" title="Add work location" subtitle="City or ZIP · tells the metro for H-1B worksite checks" onPress={() => sheet.open('Work location', <WorkLocation pid={p.id} />)} />; })()}
          </Group>
        </>
      ) : null}

      <SectionHeader>Job &amp; travel</SectionHeader>
      <Group>
        {!resident ? <Row icon="case" iconTone="red" onPress={() => go(`/layoff/${dependent && principal ? principal.id : p.id}`)} title={dependent && principal ? `If ${principal.name} loses the job` : you ? 'I lost my job' : 'Job ended'} subtitle="Last day in status for everyone, and what to do" /> : null}
        <Row icon="plane" onPress={() => go('/tools/travel', { pid: p.id })} title="Plan a trip" subtitle={`Can ${you ? 'I' : p.name} travel? Checks against these documents`} />
      </Group>

      <Counters p={p} />
      <ShareRow pid={p.id} section />

      {(you || p.isMain) && f.people.length > 1 ? (
        <>
          <SectionHeader>Family members</SectionHeader>
          <Group>
            {f.people.filter((o) => o.id !== p.id).map((o) => {
              const follows = f.results[o.id]?.principalId;
              const sub = [relationLabel(o), follows === p.id ? `follows ${you ? 'you' : p.name}` : follows ? `follows ${f.people.find((x) => x.id === follows)?.name ?? 'someone'}` : 'own status'].join(' · ');
              return <Row key={o.id} avatar={o.name} title={o.name} subtitle={sub} value="Edit" chevron={false} label={`Edit ${o.name}: ${sub}`} onPress={() => sheet.open(`Edit ${o.name}`, <EditDetails pid={o.id} />)} />;
            })}
          </Group>
        </>
      ) : null}

      <SectionHeader>Details</SectionHeader>
      <Group>
        <Row icon="edit" title="Edit details" subtitle="Name, relationship, birth date, status, employer, where now" onPress={() => sheet.open('Edit details', <EditDetails pid={p.id} />)} chevron={false} />
        <Row icon="bell" title="Reminders" subtitle={reminderSummary(rm, typesFor(rec, f.caseList.some((c) => c.ownerId === p.id && c.keyDates.some((k) => k.date >= today()))))} onPress={() => go(`/reminders/${p.id}`)} chevron={false} />
        {!you ? <Row icon="trash" iconTone="red" title={`Remove ${p.name}`} titleTone="red" chevron={false} onPress={() => sheet.open(`Remove ${p.name}?`, <RemovePerson pid={p.id} />)} /> : null}
      </Group>
    </>
  );
  return (
    <>
      <Columns left={left} right={right} stack={single} />
      {findings.some((x) => x.severity === 'act') ? null : <LegalFooter />}
    </>
  );
}
const normName = (n?: string) => (n || '').toLowerCase().replace(/[^a-z]/g, '');
const stepTitleWhere = (p: Person) => (p.relation === 'self' ? 'Are you in the US right now?' : `Is ${p.name} in the US right now?`);

const DOC_ICON: Record<string, [string, 'sky' | 'blush' | 'sage' | 'butter' | 'mint']> = {
  passport: ['globe', 'sky'], visa: ['plane', 'blush'], i94: ['download', 'sage'], approval: ['doc', 'butter'], i129s: ['doc', 'butter'], receipt: ['copy', 'mint'], notice: ['bell', 'butter'],
  ead: ['briefcase', 'mint'], 'green-card': ['idcard', 'sage'], i20: ['cap', 'sky'], ds2019: ['cap', 'sky'], 'travel-history': ['map', 'blush'], 'advance-parole': ['plane', 'mint'], 'reentry-permit': ['plane', 'mint'],
};
/** A document row: identity-coloured icon, title, end date; the word on the right carries the status. */
function DocRow({ d, superseded }: { d: Document; superseded: boolean }) {
  const note = docNote(d, { superseded });
  const spec = FIELDS[d.type].find((s) => s.key === 'validTo') ?? FIELDS[d.type].find((s) => s.kind === 'date');
  const v = spec ? showField(d.fields, spec) : '';
  const n = !superseded && isISO(d.fields.validTo) ? daysTo(d.fields.validTo) : null;
  const [icon, pastel] = DOC_ICON[d.type] ?? ['doc', 'sky'];
  const word = superseded ? undefined : n === null ? undefined : n < 0 ? (note?.tone === 'red' ? 'Expired' : 'Ended') : n <= 180 ? `${n} days` : 'Valid';
  const tone = n === null || superseded ? 'text2' : n < 0 ? (note?.tone === 'red' ? 'red' : 'amber') : n <= 180 ? 'amber' : 'green';
  return (
    <Row icon={icon} iconPastel={pastel} onPress={() => go(`/document/${d.id}`)} chevron={false} title={docTitle(d)} titleTone={superseded ? 'text2' : undefined}
      label={`${docTitle(d)}${word ? `, ${word}` : ''}`}
      trailing={word ? <T tone={tone} style={[font.sub, { fontWeight: '600' }]}>{word}</T> : undefined}
      subtitle={d.type === 'travel-history' ? `${d.fields.trips?.length ?? 0} trips` : `${superseded ? 'Superseded · ' : ''}${d.type === 'ead' && d.fields.comboAP ? docBadges(d).map((b) => `${b.label} ${b.value}`).join(' · ') : `${spec?.label ?? ''} ${v || '—'}`}`} />
  );
}

/** Square action next to the wallet card (the mock's + / camera / attach column). */
function SquareAction({ icon, label, onPress, tone }: { icon: string; label: string; onPress: () => void; tone?: 'mint' | 'butter' | 'sky' }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, minHeight: 50, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: tone ? t.pastel[tone] : 'transparent', borderWidth: tone ? 0 : 1.5, borderColor: t.outline, opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={22} color={tone ? t.ink : t.text} />
    </Pressable>
  );
}

function Counters({ p }: { p: Person }) {
  const f = useFamily();
  const sheet = useSheet();
  const rec = f.records[p.id], res = f.results[p.id];
  if (!rec || !res) return null;
  const rows: React.ReactNode[] = [];
  const meter = (key: string, label: string, n: number, of: number, unit: string, sub: string, tone?: 'amber' | 'red', onPress?: () => void) => rows.push(
    <Pressable key={key} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${n} ${unit}`} style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <T style={[font.body, { flexShrink: 1 }]}>{label}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0 }}><BigText size={22}>{String(n)}</BigText><T tone="text2" style={font.foot}>{unit}</T></View>
      </View>
      <Meter value={n} max={of} tone={tone} />
      <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{sub}</T>
    </Pressable>,
  );
  const u = res.facts.unemployment;
  if (u) meter('unemp', 'OPT unemployment days', u.days, u.limit, `of ${u.limit}`, `${Math.max(0, u.limit - u.days)} days left · counted across OPT and STEM OPT`, u.days >= u.limit - 10 ? 'red' : u.days >= u.limit - 30 ? 'amber' : undefined, () => sheet.open('Unemployment days', <Unemployment pid={p.id} />));
  else if (rec.visa === 'F-1 OPT' || rec.visa === 'STEM OPT') meter('unemp', 'OPT unemployment days', p.facts.unemploymentDays ?? 0, rec.visa === 'STEM OPT' ? 150 : 90, `of ${rec.visa === 'STEM OPT' ? 150 : 90}`, 'Tap to enter the days used, or add your jobs', undefined, () => sheet.open('Unemployment days', <Unemployment pid={p.id} />));
  const lim = rec.visa ? MAX_YEARS[rec.visa] : undefined;
  if (lim && rec.statusStart) {
    const used = Math.max(0, daysBetween(rec.statusStart, today()) / 365.25);
    meter('max', `Time used toward ${lim}-year ${rec.visa} limit`, Math.round(used * 10) / 10, lim, 'years', `Since ${fmt(rec.statusStart)}. Days abroad can be added back${rec.visa === 'H-1B' ? ` (recapture${res.facts.recaptureDays ? `: ${res.facts.recaptureDays} days` : ''})` : ''}.`, used > lim - 1 ? 'amber' : undefined);
  }
  const logged = rec.trips.filter((x) => !x.planned);
  if ((rec.trips.length || !isResident(rec.visa)) && !res.facts.citizenship) {
    const n = res.facts.daysOutsideByTrip.reduce((a, b) => a + b, 0);
    meter('trips', 'Days outside the US (trips)', n, 365, 'days', rec.trips.length ? `${rec.trips.length} trip${rec.trips.length > 1 ? 's' : ''} · tap to see or add` : 'No trips yet · tap to add one', undefined, () => sheet.open('Trips outside the US', <Trips pid={p.id} />));
  }
  const cz = res.facts.citizenship;
  if (cz) {
    const left = Math.max(0, daysTo(cz.fileFrom) ?? 0);
    meter('cz', 'Days to earliest citizenship filing', left, cz.years * 365, 'days', `You may file from ${fmt(cz.fileFrom)} (${cz.years}-year path).`);
    meter('inus', 'Days in the US since becoming a resident', cz.daysInUS ?? 0, cz.needed, `of ${cz.needed} needed`, cz.daysInUS === undefined ? 'Add the I-94 travel history to count days' : `${res.facts.daysOutsideByTrip.reduce((a, b) => a + b, 0)} days abroad · longest trip ${Math.max(0, ...res.facts.daysOutsideByTrip)} days`, (cz.daysInUS ?? 0) < cz.needed ? 'amber' : undefined, () => sheet.open('Trips outside the US', <Trips pid={p.id} />));
  }
  void logged;
  if (!rows.length) return null;
  return <><SectionHeader>Day counters</SectionHeader><Group>{rows}</Group></>;
}

// ---------- document view ----------
export function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFamily();
  const t = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const d = f.docs.find((x) => x.id === id);
  const p = d ? f.people.find((x) => x.id === d.ownerId) : undefined;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const tour = useTour('document');
  if (!d || !p) return <Screen nav={{ back: 'Back', onBack: back }}><EmptyState icon="doc" title="Document deleted" /></Screen>;
  const superseded = f.superseded.has(d.id);
  const note = docNote(d, { superseded, inUS: f.records[p.id]?.location !== 'Outside' });
  const elsewhere = whoseElse(d, f);
  const file = d.files?.[0];
  const replace = async (src: Source) => {
    const picked = await pick(src).catch((e: Error) => { toast(e.message); return null; });
    if (!picked) return;
    setBusy(true);
    try {
      const nf = await keepFile(picked, newId('doc'));
      const text = await readText(fileUri(nf), nf.mime);
      const r = text ? readDocument(text) : undefined;
      await f.actions.replaceDoc(d.id, { type: r?.type ?? d.type, fields: r?.type ? r.fields : d.fields, files: [nf] });
      toast(r?.type ? 'Replaced · fields read again' : 'Replaced · check the fields');
    } finally { setBusy(false); }
  };
  const doShare = async () => {
    if (file && (await shareFile(fileUri(file), file.mime, `${docTitle(d)} — ${NOT_OFFICIAL_ID}`))) return;
    const lines = fieldRows(d).map((r) => `${r.spec.label}: ${r.value || '—'}`).join('\n');
    try { await Share.share({ message: `${docTitle(d)}\n${lines}\n\n${NOT_OFFICIAL_ID}` }); } catch {}
  };
  return (
    <Screen keyboard tour={tour} nav={{ back: p.name, onBack: back, title: docTitle(d), right: <NavButton title="Edit" onPress={() => sheet.open('Edit document', <DocEditMenu docId={d.id} />)} /> }} footer={<>
      <TourTarget id="actions" style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button kind="ghost" icon="refresh" title="Replace" onPress={() => sheet.open('Replace document', <ReplacePicker onPick={(s) => { sheet.close(); replace(s); }} />)} />
        <Button kind="tint" icon="share" title="Share" onPress={doShare} />
      </TourTarget>
      <Button kind="danger" icon="trash" title="Delete" onPress={() => sheet.open(`Delete ${docTitle(d)}?`, <Confirm body="It’s removed from this phone. This can’t be undone." action="Delete" onConfirm={async () => { back(); await f.actions.deleteDoc(d.id); toast(`Deleted ${docTitle(d)}`); }} />)} />
    </>}>
      <Pressable onPress={() => file && preview(file)} disabled={!file} accessibilityRole={file ? 'button' : undefined} accessibilityLabel={file ? 'Open the document' : 'No image saved'}
        style={{ borderRadius: 28, backgroundColor: t.card, padding: file?.mime.startsWith('image/') ? 0 : 18, overflow: 'hidden', minHeight: 160, alignItems: 'center', justifyContent: 'center' }}>
        {file?.mime.startsWith('image/') ? <Image source={{ uri: fileUri(file) }} style={{ width: '100%', aspectRatio: 1.55 }} resizeMode="contain" accessibilityIgnoresInvertColors /> : (
          <View style={{ alignItems: 'center', gap: 8 }}><Icon name="doc" size={44} color={t.text3} /><T tone="text2" style={font.foot}>{file ? `${file.name} · tap to open` : 'No image saved'}</T></View>
        )}
        {busy ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.shade, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View> : null}
      </Pressable>
      <T tone="text2" style={[font.caption, { marginTop: 8, textAlign: 'center' }]}>{NOT_OFFICIAL_ID}</T>
      {docBadges(d).map((b, i) => (
        <Card key={b.label} style={{ marginTop: i ? 8 : 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: superseded || !note || note.tone === 'blue' ? t.grey : t[note.tone] }} />
          <T style={[font.body, { fontWeight: '500', flex: 1 }]}>{`${b.label} ${b.value}`}</T>
        </Card>
      ))}
      {elsewhere ? (
        <Note tone="amber" actions={<Button size="sm" kind="tint" title={`Move to ${elsewhere.name}`} onPress={async () => { await f.actions.updateDoc(d.id, { ownerId: elsewhere.id }); toast(`Moved to ${elsewhere.name}`); }} />}>
          {`The name on this ${docTitle(d).toLowerCase()} matches ${elsewhere.name}, not ${p.name}. Move it if it is ${elsewhere.name}’s.`}
        </Note>
      ) : null}
      {note && !(note.tone === 'green' && /^(Valid until|Good for travel until|Approval valid until|Program ends)/.test(note.text)) ? <Note tone={note.tone}>{note.text}</Note> : null}
      {d.fields.dateNote ? <Note tone="amber">{d.fields.dateNote}</Note> : null}
      <SectionHeader>Read from the document</SectionHeader>
      <TourTarget id="fields"><Card style={{ paddingTop: 4 }}>
        {FIELDS[d.type].map((spec) => {
          const k = String(spec.key);
          const value = draft[k] ?? showField(d.fields, spec);
          return <Field key={k} label={spec.label} value={value} onChangeText={(x) => setDraft({ ...draft, [k]: x })} autoCapitalize={spec.key === 'name' ? 'words' : 'characters'}
            onBlur={async () => { if (draft[k] === undefined) return; await f.actions.updateDoc(d.id, { fields: parseField(spec, draft[k]), edited: [...new Set([...(d.edited ?? []), spec.key])] }); const n = { ...draft }; delete n[k]; setDraft(n); }} />;
        })}
        {d.type === 'travel-history' ? (d.fields.trips ?? []).map((x, i) => <Row key={i} icon="plane" title={`${fmt(x.depart)} – ${x.return ? fmt(x.return) : 'now'}`} subtitle={x.depart && x.return ? `${daysBetween(x.depart, x.return) - 1} days outside` : ''} />) : null}
      </Card></TourTarget>
      <Hint style={{ marginHorizontal: 4 }}>Edits save on this phone. Status updates right away.</Hint>
    </Screen>
  );
}
/** Another family member this saved document looks like it belongs to (name or passport number). */
function whoseElse(d: Document, f: ReturnType<typeof useFamily>): Person | undefined {
  const others = f.docs.filter((x) => x.id !== d.id);
  const ids = f.people.map((p) => identityOf(p.id, others.filter((x) => x.ownerId === p.id), { displayName: p.name }));
  const who = belongsElsewhere(d.fields, d.ownerId, ids);
  return who ? f.people.find((p) => p.id === who.id) : undefined;
}

/** Edit menu on a document: move it to another person (the one it replaced comes back as current). */
function DocEditMenu({ docId }: { docId: string }) {
  const f = useFamily();
  const sheet = useSheet();
  const toast = useToast();
  const d = f.docs.find((x) => x.id === docId);
  const [moving, setMoving] = useState(false);
  if (!d) return null;
  const owner = f.people.find((p) => p.id === d.ownerId);
  const others = f.people.filter((p) => p.id !== d.ownerId);
  const move = async (to: Person) => {
    sheet.close();
    await f.actions.updateDoc(d.id, { ownerId: to.id });
    toast(`Moved to ${to.name}`);
  };
  if (!moving) {
    return (
      <View style={{ marginTop: 10 }}>
        <Group>
          <Row icon="people" title="Move to another person" subtitle={others.length ? `Saved under ${owner?.name ?? 'this person'} by mistake?` : 'Add a family member first'} onPress={others.length ? () => setMoving(true) : undefined} />
        </Group>
        <Hint>Fields can be corrected right on the document page.</Hint>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 10 }}>
      <Why>{`Whose ${docTitle(d).toLowerCase()} is this?`}</Why>
      <Group style={{ marginTop: 12 }}>
        {others.map((p) => <Row key={p.id} avatar={p.name} title={p.name} subtitle={relationLabel(p)} onPress={() => move(p)} />)}
      </Group>
      <Hint>{`If it replaced one of ${owner?.name ?? 'this person'}’s documents, that one becomes current again.`}</Hint>
    </View>
  );
}

function ReplacePicker({ onPick }: { onPick: (s: Source) => void }) {
  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      <Button kind="ghost" icon="camera" title="Camera" onPress={() => onPick('camera')} />
      <Button kind="ghost" icon="photo" title="Photos" onPress={() => onPick('photos')} />
      <Button kind="ghost" icon="folder" title="Files" onPress={() => onPick('files')} />
    </View>
  );
}

// ---------- layoff plan ----------
export function LayoffScreen() {
  const f = useFamily();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Wait for the saved data: the date and "Saved" state come from the person's page.
  if (!f.ready) return <Screen nav={{ back: 'Back', onBack: back, title: 'Layoff plan' }}><Spinner /></Screen>;
  return <LayoffPlan key={id} id={id} />;
}
function LayoffPlan({ id }: { id?: string }) {
  const f = useFamily();
  const toast = useToast();
  const me = f.people.find((x) => x.id === id);
  const [last, setLast] = useState<string | undefined>(me?.facts.jobEnded ?? today());
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  // Preview everyone's last day with this job-end date (pure: nothing saved until Save).
  const preview = useMemo(() => {
    if (!me || !last || !isISO(last)) return f.results;
    const people = f.people.map((p) => (p.id === me.id ? { ...p, facts: { ...p.facts, jobEnded: last } } : p));
    return evaluateFamily({ members: people.map((p) => ({ person: p, rec: f.records[p.id] })).filter((m) => m.rec), docs: f.docs, settings: f.settings, cases: f.cases, bulletin: f.bulletin.data });
  }, [me, last, f]);
  const tour = useTour('layoff');
  if (!me) return <Screen nav={{ back: 'Back', onBack: back }}><EmptyState icon="user" title="Removed" /></Screen>;
  const rec = f.records[me.id];
  const opt = rec?.visa === 'F-1 OPT' || rec?.visa === 'STEM OPT';
  const L = rec?.visa === 'L-1A' || rec?.visa === 'L-1B';
  const opts: [string, string][] = opt
    ? [['Find a new OPT job', 'Must relate to your degree. Report it in the SEVP portal within 10 days.'], ['Change status', 'e.g. a new degree program (new I-20) before the days run out.'], ['Leave the US', 'Before the last day, to keep a clean record.']]
    : [[L ? 'New employer files an H-1B or other status' : 'New employer files an H-1B transfer', L ? 'L-1 can’t move to a new employer. A new status must be filed before the last day.' : 'You can start work when it is filed (portability).'], ['Change of status', 'e.g. to B-2 (to stay longer and wrap up) or to H-4 / L-2 if your spouse has a status.'], ['Leave the US', 'Before the last day. Family members leave too, unless they have their own status.']];
  const week = ['Get the termination letter and last pay slips', 'Save copies of every I-94, approval and pay slip', opt ? 'Report the job end in the SEVP portal' : 'Talk to an immigration attorney', 'Set a reminder for the earliest last day'];
  const saved = !!me.facts.jobEnded && me.facts.jobEnded === last;
  return (
    <Screen tour={tour} nav={{ back: 'Back', onBack: back, title: 'Layoff plan' }} footer={<Button title={saved ? 'Saved — undo' : me.facts.jobEnded ? `Update ${me.name}’s last day` : `Save to ${me.name}’s page`} onPress={async () => {
      if (saved) { await f.actions.setFacts(me.id, { jobEnded: undefined }); toast('Removed'); } else { await f.actions.setFacts(me.id, { jobEnded: last }); toast('Saved · shown as Act now on Home'); }
    }} />}>
      <H1>{me.relation === 'self' ? 'You lost your job' : `${me.name}’s job ended`}</H1>
      <Why>Here’s the last day in status for each person, and what to do this week.</Why>
      <TourTarget id="date"><DateField label="Last day of work (last paycheck date)" value={last} onChange={setLast} /></TourTarget>
      <SectionHeader>Last day in status</SectionHeader>
      <Group>
        {f.people.map((p) => {
          const r = f.records[p.id];
          if (r?.location === 'Outside') return <Row key={p.id} avatar={p.name} title={p.name} subtitle="Outside the US — check before travelling in" />;
          if (needsLocation(r)) return <Row key={p.id} avatar={p.name} title={p.name} subtitle={`Location unknown — answer on ${p.name}’s page`} />;
          const g = preview[p.id]?.facts.graceUntil;
          const own = p.id !== me.id && !preview[p.id]?.findings.some((x) => x.rule === 'C18');
          const why = isResident(r?.visa) || isCitizen(r?.visa) ? 'A green card doesn’t depend on a job.' : own ? 'Own status — not affected.' : p.id === me.id ? (g && r?.i94?.until === g ? 'The I-94 ends before the 60-day grace period.' : 'Up to 60 days after the last day of work, or the I-94 end if sooner.') : `Follows ${me.name}’s date — ${statusLabel(p, r)} depends on ${me.name}’s status.`;
          return <Row key={p.id} avatar={p.name} title={<T style={font.body}>{p.name} <T tone="text2" style={font.foot}>· {statusLabel(p, r, f.results[p.id])}</T></T>} subtitle={why}
            value={g && !own ? fmt(g) : '—'} />;
        })}
      </Group>
      <Note tone="red">
        <T style={font.sub}>Act before the earliest date. Days only count while you are in the US.</T>
        <LegalLine />
      </Note>
      <SectionHeader>Your options</SectionHeader>
      <TourTarget id="options"><Group>{opts.map(([a, b]) => <Row key={a} icon="chevR" title={a} titleStyle={{ ...font.callout, fontWeight: '500' }} subtitle={b} />)}</Group></TourTarget>
      <SectionHeader>This week</SectionHeader>
      <Group>{week.map((x, i) => <CheckRow key={x} title={x} checked={!!ticks[i]} onPress={() => setTicks({ ...ticks, [i]: !ticks[i] })} />)}</Group>
    </Screen>
  );
}

// ---------- reminders ----------
// v2.9: real per-type switches with their own lead times, only for the types this person has;
// the same settings can be copied to everyone or to chosen people.
export function RemindersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFamily();
  const toast = useToast();
  const [to, setTo] = useState<string[]>([]);
  const p = f.people.find((x) => x.id === id);
  if (!p) return <Screen nav={{ back: 'Back', onBack: back }}><EmptyState icon="user" title="Removed" /></Screen>;
  const r = p.reminders ?? { on: true, lead: [180, 90, 30, 7] };
  const set = (patch: Partial<typeof r>) => f.actions.updatePerson(p.id, { reminders: { ...r, ...patch } });
  const hasCaseDates = f.caseList.some((c) => c.ownerId === p.id && c.keyDates.some((k) => k.date >= today()));
  const kinds = typesFor(f.records[p.id], hasCaseDates);
  const dates = typeDates(f.records[p.id]);
  const setType = (k: ReminderType, s: { on: boolean; lead: number[] }) => set({ types: { ...(r.types ?? {}), [k]: s } });
  const others = f.people.filter((x) => x.id !== p.id);
  const apply = async () => {
    const ids = to.includes('*') ? others.map((x) => x.id) : to;
    for (const oid of ids) { const o = f.people.find((x) => x.id === oid); if (o) await f.actions.updatePerson(oid, { reminders: copyReminders(r, o.reminders) }); }
    setTo([]); toast(ids.length ? `Same reminders for ${ids.length === others.length ? 'everyone' : listOf(ids.map((x) => f.people.find((o) => o.id === x)?.name ?? ''))}` : 'Choose people first');
  };
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Reminders' }}>
      <H1>{`${p.name}’s reminders`}</H1>
      <Why>Notifications on this phone before each date.</Why>
      <Group style={{ marginTop: 18 }}>
        <Row title="Reminders" trailing={<Switch value={r.on} label={`Reminders for ${p.name}`} onValueChange={async (on) => { await set({ on }); if (on) await askNotificationPermission(); }} />} />
      </Group>
      {r.on ? (
        <>
          <SectionHeader>For</SectionHeader>
          {kinds.length ? (
            <Group>
              {kinds.map((k) => {
                const s = typeSetting(r, k);
                const meta = REMINDER_TYPES.find((x) => x.key === k)!;
                const d = k === 'cases' ? undefined : dates[k];
                return (
                  <View key={k} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T style={[font.body, { fontWeight: '600' }]}>{meta.title}</T>
                        <T tone="text2" style={font.foot}>{d ? `${meta.what[0].toUpperCase()}${meta.what.slice(1)} ${fmt(d)}` : 'Biometrics, interview, RFE due dates'}</T>
                      </View>
                      <Switch value={s.on} label={`${meta.title} reminders`} onValueChange={(on) => setType(k, { ...s, on })} />
                    </View>
                    {s.on ? (
                      <Chips style={{ marginTop: 10 }}>
                        {LEAD_CHOICES.map((n) => <ChipToggle key={n} role="checkbox" text={`${n} day${n === 1 ? '' : 's'}`} on={s.lead.includes(n)}
                          onPress={() => setType(k, { on: true, lead: s.lead.includes(n) ? s.lead.filter((x) => x !== n) : [...s.lead, n].sort((a, b) => b - a) })} />)}
                      </Chips>
                    ) : null}
                  </View>
                );
              })}
            </Group>
          ) : <Hint>No dated documents yet. Add a passport, I-94 or approval to get reminders.</Hint>}
          <Hint style={{ marginHorizontal: 4 }}>Days before the date. Checks that need action (for example the I-94 ending before the approval) follow the same type.</Hint>
          {others.length ? (
            <>
              <SectionHeader>Use the same reminders for</SectionHeader>
              <Chips style={{ marginTop: 0 }}>
                <ChipToggle role="checkbox" text="Everyone" on={to.includes('*')} onPress={() => setTo(to.includes('*') ? [] : ['*'])} />
                {others.map((o) => <ChipToggle key={o.id} role="checkbox" text={o.name} on={to.includes('*') || to.includes(o.id)} onPress={() => setTo(to.includes(o.id) ? to.filter((x) => x !== o.id) : [...to.filter((x) => x !== '*'), o.id])} />)}
              </Chips>
              <View style={{ flexDirection: 'row', marginTop: 12 }}><Button kind="tint" title="Apply" disabled={!to.length} onPress={apply} /></View>
            </>
          ) : null}
        </>
      ) : <Hint style={{ marginTop: 12 }}>Off. Dates still show on Home.</Hint>}
    </Screen>
  );
}
const listOf = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
