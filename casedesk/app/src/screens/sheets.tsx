// Bottom-sheet contents (edits, confirmations and small flows), opened with useSheet().open(title, <X/>).
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Person, Relation, StatusCategory } from '../core/model';
import { STATUS_GROUPS, STATUS_LABEL, STATUS_CHIP } from '../core/model';
import { fillsStep, stepsFor, type StepKey } from '../core/steps';
import { fmt, today, addDays, daysBetween, isISO } from '../core/dates';
import { differentMetro, metroOf, parsePlace, placeText } from '../core/metro';
import { FORMS, isReceipt, type CaseView } from '../core/cases';
import type { KeyDate } from '../core/model';
import { showField, FIELDS } from '../core/docs';
import { BIRTH_COUNTRIES, BIRTH_NOTE, birthCountryGuess, birthLabel } from '../core/birth';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { newId } from '../data/store';
import {
  Button, Card, Chips, ChipToggle, DateField, Field, Group, Hint, Note, Option, Row, SelectField, SheetButtons, T, Why, font, useSheet, useToast, LegalLine, Icon, useTheme,
  TourButton, TourScope, TourTarget, useSheetTour,
} from '../ui';
import { back, runFlow } from './common';
import { clipboardHasText, copy, hasClipboard, openUrl, openUrlAndWait, readClipboard } from '../native/device';
import { applyCaseText, parseCaseText, USCIS_CASE_URL, type Parsed } from '../core/uscis';

const Cancel = ({ label = 'Cancel' }: { label?: string }) => { const s = useSheet(); return <Button kind="ghost" title={label} onPress={s.close} />; };

export const statusGroups = (withOther = false) => STATUS_GROUPS.map((g) => ({ title: g.title, options: g.items.map((k) => ({ value: k, label: STATUS_LABEL[k] })) })).concat(withOther ? [{ title: 'Other', options: [{ value: 'other' as StatusCategory, label: STATUS_LABEL.other }] }] : []);
export const chipLabel = (k: StatusCategory) => STATUS_CHIP[k] ?? STATUS_LABEL[k];

// ---- location ----
export function AskWhere({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  const [out, setOut] = useState(false);
  const [c, setC] = useState('India');
  if (!p) return null;
  const save = async (v: 'US' | 'Outside') => { await f.actions.setFacts(pid, { location: v, country: v === 'Outside' ? c : undefined }); s.close(); toast(v === 'US' ? `${p.name}: in the US · add the I-94 when you can` : `${p.name}: outside the US · in ${c}`); };
  return (
    <View>
      <Why>People outside the US (for example in India) don’t have an I-94.</Why>
      <View style={{ marginTop: 16, gap: 10 }}>
        <Option title="In the US" subtitle="I’ll add the I-94 later" onPress={() => save('US')} />
        <Option title="Outside the US" subtitle="We’ll check travel documents only" selected={out} onPress={() => setOut(true)} />
        {out ? <SelectField label="Country" value={c} onChange={setC} options={COUNTRIES.map((x) => ({ value: x, label: x }))} /> : null}
      </View>
      <SheetButtons><Cancel />{out ? <Button grow title="Save" onPress={() => save('Outside')} /> : null}</SheetButtons>
    </View>
  );
}
/** v2.9 gc2: Country of birth (setup, Add a person, Edit details). '' = not sure yet. */
export function BirthCountryField({ value, onChange, guess }: { value: string; onChange: (v: string) => void; guess?: string }) {
  return (
    <>
      <SelectField label="Country of birth" value={value} onChange={onChange}
        options={[{ value: '', label: guess ? `Not sure (passport says ${birthLabel(guess)})` : 'Not sure yet' }, ...BIRTH_COUNTRIES.map((c) => ({ value: c.code, label: c.label }))]} />
      <Hint>{BIRTH_NOTE}</Hint>
    </>
  );
}
export const COUNTRIES = ['India', 'Canada', 'Mexico', 'China', 'Philippines', 'United Kingdom', 'Brazil', 'Nigeria', 'Other'];

export function FixClass() {
  const s = useSheet();
  return (
    <View>
      <Why>The class on the I-94 should match the approved petition (an L-2 spouse should show L-2S).</Why>
      <View style={{ marginTop: 14, gap: 8 }}>
        {['Check the I-94 on the CBP website and save a copy.', 'Visit a CBP Deferred Inspection office with the passport, approval (I-797 / I-129S) and I-94 — or email the port of entry.', 'Add the corrected I-94 here when you get it.'].map((x, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}><T style={[font.sub, { fontWeight: '600' }]}>{i + 1}</T><T style={[font.sub, { flex: 1 }]}>{x}</T></View>
        ))}
      </View>
      <Note tone="blue">Not legal advice — talk to your attorney or immigration team first.</Note>
      <SheetButtons><Cancel label="Close" /><Button grow icon="compass" title="CBP website" onPress={() => { s.close(); openUrl('https://www.cbp.gov/contact/deferred-inspection'); }} /></SheetButtons>
    </View>
  );
}

// ---- documents ----
export function RenewSheet({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  if (!p) return null;
  const rec = f.records[pid];
  const mine = f.docs.filter((d) => d.ownerId === pid && !f.superseded.has(d.id));
  const steps = stepsFor(p, rec);
  const open = (k: StepKey) => { s.close(); runFlow({ mode: 'renew', pids: [pid], only: [k] }, f, toast); };
  return (
    <View>
      <Why>Pick one, or go through {p.relation === 'self' ? 'your' : `${p.name}’s`} steps in order.</Why>
      <Group style={{ marginTop: 14 }}>
        {steps.map((st) => {
          const d = mine.find((x) => fillsStep(st, x));
          const spec = d ? FIELDS[d.type].find((x) => x.key === st.keyField.field) : undefined;
          return <Row key={st.key} title={st.title} subtitle={d ? `On file · ${st.keyField.label} ${spec ? showField(d.fields, spec) || '—' : ''}` : 'Not added'} onPress={() => open(st.key)} />;
        })}
      </Group>
      <SheetButtons><Cancel /><Button grow title="All steps" onPress={() => { s.close(); runFlow({ mode: 'renew', pids: [pid] }, f, toast); }} /></SheetButtons>
    </View>
  );
}

// ---- people ----
/**
 * Edit details (v2.9): everything set during setup — name, relationship, principal link, date of
 * birth, status, employer, in the US or abroad, and the work location. Values read from documents
 * stay the source of truth; a typed value is kept only where it differs from them.
 */
export function EditDetails({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  const rec = f.records[pid];
  const [name, setName] = useState(p?.name ?? '');
  const [rel, setRel] = useState<Relation>(p?.relation ?? 'child');
  const [st, setSt] = useState<StatusCategory>(p?.status ?? 'unsure');
  const [follows, setFollows] = useState<string>(p?.facts.dependentOf ?? (p?.isMain ? 'own' : 'auto'));
  const [dob, setDob] = useState<string | undefined>(p?.facts.birthDate ?? rec?.birthDate);
  const [emp, setEmp] = useState(p?.facts.employer ?? rec?.employer ?? '');
  const [where, setWhere] = useState<'US' | 'Outside' | undefined>(rec?.locationKnown ? rec.location : p?.facts.location);
  const [country, setCountry] = useState(p?.facts.country ?? rec?.country ?? 'India');
  const guess = birthCountryGuess(rec)?.code;
  const [born, setBorn] = useState<string>(p?.facts.birthCountry ?? guess ?? '');
  if (!p) return null;
  const self = p.relation === 'self';
  const dependentKind = !self && (rel === 'spouse' || rel === 'child');
  const others = f.people.filter((x) => x.id !== p.id);
  // who this person's status can follow: a parent-generation member (never a child), for a child also the spouse
  const principals = others.filter((x) => x.relation === 'self' || x.relation === 'spouse' || x.isMain);
  const w = p.facts.workLocation ?? rec?.approvedWorkLocation;
  const save = async () => {
    if (!name.trim()) { toast('Name can’t be empty'); return; }
    const facts = { ...p.facts };
    facts.dependentOf = dependentKind && follows !== 'auto' && follows !== 'own' ? follows : undefined;
    facts.birthDate = dob && dob !== rec?.birthDate ? dob : rec?.birthDate ? undefined : dob;
    // pre-filled from the passport: kept unset while it still matches (documents decide), saved once changed
    facts.birthCountry = born && (born !== guess || p.facts.birthCountry) ? born : undefined;
    const e = emp.trim();
    facts.employer = e && e !== rec?.employer ? e : rec?.employer ? undefined : e || undefined;
    const before = rec?.locationKnown ? rec.location : p.facts.location;
    if (where && (where !== before || (where === 'Outside' && country !== (rec?.country ?? p.facts.country)))) {
      facts.location = where; facts.country = where === 'Outside' ? country : undefined; facts.locationOn = today();
    }
    await f.actions.updatePerson(pid, {
      name: name.trim(), relation: self ? 'self' : rel, status: st, facts,
      isMain: self ? p.isMain : follows === 'own' ? true : p.isMain && follows === 'auto' ? true : false,
    });
    s.close(); toast('Saved');
  };
  return (
    <View>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      {!self ? (
        <>
          <T tone="text2" style={[font.caption, { marginTop: 14, marginLeft: 2 }]}>Relationship</T>
          <Chips style={{ marginTop: 8 }}>{(['spouse', 'child', 'parent', 'other'] as Relation[]).map((r) => <ChipToggle key={r} text={REL_WORD[r]} on={rel === r} onPress={() => setRel(r)} />)}</Chips>
        </>
      ) : null}
      {dependentKind && principals.length ? (
        <>
          <T tone="text2" style={[font.caption, { marginTop: 14, marginLeft: 2 }]}>Status follows</T>
          <Chips style={{ marginTop: 8 }}>
            <ChipToggle text="Automatic" on={follows === 'auto'} onPress={() => setFollows('auto')} />
            {principals.map((o) => <ChipToggle key={o.id} text={o.name} on={follows === o.id} onPress={() => setFollows(o.id)} />)}
            <ChipToggle text="Own status (principal)" on={follows === 'own'} onPress={() => setFollows('own')} />
          </Chips>
          <Hint>A spouse or child on H-4 / L-2 follows the principal’s dates.</Hint>
        </>
      ) : null}
      <DateField label="Date of birth" value={dob} onChange={setDob} />
      <BirthCountryField value={born} onChange={setBorn} guess={guess} />
      <SelectField label="Status / visa type" value={st} onChange={setSt} groups={statusGroups()} />
      <Hint>Changing the status changes which documents and checks apply.</Hint>
      {rel !== 'child' || self ? <Field label="Employer" value={emp} onChangeText={setEmp} placeholder="e.g. Acme Tech Inc" autoCapitalize="words" /> : null}
      <T tone="text2" style={[font.caption, { marginTop: 14, marginLeft: 2 }]}>Where now</T>
      <Chips style={{ marginTop: 8 }}>
        <ChipToggle text="In the US" on={where === 'US'} onPress={() => setWhere('US')} />
        <ChipToggle text="Outside the US" on={where === 'Outside'} onPress={() => setWhere('Outside')} />
      </Chips>
      {where === 'Outside' ? <SelectField label="Country" value={country} onChange={setCountry} options={COUNTRIES.map((x) => ({ value: x, label: x }))} /> : null}
      <Group style={{ marginTop: 16 }}>
        <Row icon="pin" title="Work location" subtitle={w ? `${placeText(w)} · ${metroOf(w.city, w.state) ?? w.metro ?? 'unknown'} metro` : 'Not added'} onPress={() => s.open('Work location', <WorkLocation pid={pid} />)} />
      </Group>
      <SheetButtons><Cancel /><Button grow title="Save" onPress={save} /></SheetButtons>
    </View>
  );
}
const REL_WORD: Record<Relation, string> = { self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', other: 'Other' };

export function RemovePerson({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  if (!p) return null;
  return (
    <View>
      <Why>{p.name}’s documents and cases are deleted from this phone. This can’t be undone.</Why>
      <SheetButtons><Cancel /><Button grow kind="danger" title="Remove" onPress={async () => { s.close(); back(); await f.actions.removePerson(pid); toast(`Removed ${p.name}`); }} /></SheetButtons>
    </View>
  );
}

// ---- trips & counters ----
export function Trips({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast(); const t = useTheme();
  const p = f.people.find((x) => x.id === pid);
  const [adding, setAdding] = useState(false);
  const [dep, setDep] = useState<string | undefined>(addDays(today(), 30));
  const [ret, setRet] = useState<string | undefined>(addDays(today(), 45));
  const [c, setC] = useState('India');
  if (!p) return null;
  const rec = f.records[pid];
  const trips = rec?.trips ?? [];
  const add = async () => {
    if (!dep || !ret || !isISO(dep) || !isISO(ret) || ret <= dep) { toast('The return date must be after the leave date'); return; }
    const planned = dep >= today();
    await f.actions.setFacts(pid, { trips: [...(p.facts.trips ?? []), { id: newId('trip'), depart: dep, return: ret, country: c, planned }] });
    setAdding(false); toast(`Trip added · ${fmt(dep)} – ${fmt(ret)}`);
  };
  return (
    <View>
      <Why>From the I-94 travel history, or added by hand.</Why>
      <Group style={{ marginTop: 14 }}>
        {trips.length ? trips.map((x, i) => {
          const n = x.depart ? daysBetween(x.depart, x.return ?? today()) - 1 : 0;
          return <Row key={i} icon="plane" iconTone={n > 180 ? 'amber' : undefined} title={`${x.country ?? 'Abroad'} · ${n} days${x.planned ? ' · planned' : ''}`} subtitle={`${fmt(x.depart)} – ${x.return ? fmt(x.return) : 'now'}`} value={n > 180 ? 'Over 6 months' : undefined} />;
        }) : <Row title="No trips yet." titleTone="text2" />}
      </Group>
      {adding ? (
        <View>
          <DateField label="Leave" value={dep} onChange={setDep} />
          <DateField label="Return" value={ret} onChange={setRet} />
          <SelectField label="Country" value={c} onChange={setC} options={COUNTRIES.map((x) => ({ value: x, label: x }))} />
          <SheetButtons><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /><Button grow title="Add trip" onPress={add} /></SheetButtons>
        </View>
      ) : <SheetButtons><Cancel label="Close" /><Button grow kind="tint" icon="plus" title="Add trip" onPress={() => setAdding(true)} /></SheetButtons>}
      <View style={{ height: 1, backgroundColor: t.bg, opacity: 0 }} />
    </View>
  );
}

export function Unemployment({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet();
  const p = f.people.find((x) => x.id === pid);
  const r = f.results[pid];
  const lim = r?.facts.unemployment?.limit ?? (f.records[pid]?.visa === 'STEM OPT' ? 150 : 90);
  const [n, setN] = useState(String(r?.facts.unemployment?.days ?? p?.facts.unemploymentDays ?? 0));
  if (!p) return null;
  const v = Math.max(0, Math.min(lim, parseInt(n, 10) || 0));
  return (
    <View>
      <Why>Days without qualifying work while on OPT count toward a total limit of {lim} days (OPT + STEM OPT together).</Why>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <Button kind="ghost" size="sm" title="−" label="One day less" onPress={() => setN(String(Math.max(0, v - 1)))} />
        <View style={{ flex: 1 }}><Field label="Days used" value={n} onChangeText={(x) => setN(x.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
        <Button kind="ghost" size="sm" title="+" label="One day more" onPress={() => setN(String(Math.min(lim, v + 1)))} />
      </View>
      <Hint>Counted from your jobs when you add them; type a number to correct it. Report any job change in the SEVP portal within 10 days.</Hint>
      <SheetButtons>
        {p.facts.unemploymentDays !== undefined ? <Button kind="ghost" title="Use jobs" onPress={async () => { await f.actions.setFacts(pid, { unemploymentDays: undefined }); s.close(); }} /> : null}
        <Button grow title="Done" onPress={async () => { await f.actions.setFacts(pid, { unemploymentDays: v }); s.close(); }} />
      </SheetButtons>
    </View>
  );
}

/** Work location: city, "City, ST" or a ZIP code → metro (core/metro). First time it just saves;
 *  a change is checked against the approved worksite (H-1B amendment, L-1, OPT reporting). */
export function WorkLocation({ pid }: { pid: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const p = f.people.find((x) => x.id === pid);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<WorkLoc | null>(null);
  if (!p) return null;
  const rec = f.records[pid];
  const cur = p.facts.workLocation ?? rec?.approvedWorkLocation;
  const curMetro = cur ? metroOf(cur.city, cur.state) ?? cur.metro : undefined;
  const check = (x = q) => {
    const r = parsePlace(x);
    if (!r) { toast('Type a city or a ZIP code'); return; }
    setQ(x); setRes(r);
  };
  const save = async () => {
    if (!res) return;
    await f.actions.setFacts(pid, { workLocation: { city: res.city, state: res.state, zip: res.zip, metro: res.metro }, ...(cur && !p.facts.approvedWorkLocation ? { approvedWorkLocation: cur } : {}) });
    s.close(); toast(res.metro ? `Work location saved · ${res.metro} metro` : 'Work location saved');
  };
  const v = rec?.visa;
  const label = res ? placeText(res) : '';
  let result: React.ReactNode = null;
  if (res) {
    const upd = <Button size="sm" kind="tint" title={cur ? 'Update work location' : 'Save work location'} onPress={save} />;
    if (!cur) result = <Note tone={res.metro ? 'green' : 'amber'} actions={upd}>{res.metro ? `${label} is in the ${res.metro} metro.` : `We couldn’t tell which metro ${label} is in. You can still save it.`}</Note>;
    else if (v === 'L-1A' || v === 'L-1B') result = <Note tone="blue" actions={upd}>{`L-1 has no LCA. Tell your immigration team before you start working in ${label}.`}</Note>;
    else if (v === 'F-1 OPT' || v === 'STEM OPT') result = <Note tone="amber" actions={upd}>Report the new work address in the SEVP portal within 10 days.</Note>;
    else if (v !== 'H-1B') result = <Note tone={res.metro ? 'green' : 'amber'} actions={upd}>{res.metro ? `${label} is in the ${res.metro} metro.` : `We couldn’t tell which metro ${label} is in.`}</Note>;
    else if (!differentMetro(res, cur)) result = <Note tone="green" actions={upd}>{`Same metro (${res.metro ?? curMetro ?? 'same area'}). No amendment needed — your employer posts the LCA notice at the new site.`}</Note>;
    else if (res.metro || res.state) result = <><Note tone="red" actions={upd}>{`${label} is in the ${res.metro ?? res.state} area. An amended H-1B and a new LCA are needed before you start there.`}</Note><Hint>Your employer files it. Working from home in another metro counts too.</Hint><LegalLine /></>;
    else result = <Note tone="amber" actions={upd}>{`We couldn’t tell which metro ${label} is in. Ask your immigration team before you move.`}</Note>;
  }
  return (
    <View>
      <Why>{cur ? `Now: ${placeText(cur)}${curMetro ? ` · ${curMetro} metro` : ''}. Where will you work now? Count working from home too.` : 'Where do you work? A city or a ZIP code.'}</Why>
      <Field label={cur ? 'New city or ZIP' : 'City or ZIP'} value={q} onChangeText={setQ} placeholder="e.g. Austin, TX or 75038" autoCapitalize="words" />
      <Chips>{['Irving, TX', 'Austin, TX', 'Plano, TX', 'Chicago, IL'].map((c) => <ChipToggle key={c} role="button" text={c} onPress={() => check(c)} />)}</Chips>
      {result}
      <SheetButtons><Cancel label={res ? 'Close' : 'Cancel'} /><Button grow title="Check" onPress={() => check()} /></SheetButtons>
    </View>
  );
}
type WorkLoc = { city?: string; state?: string; zip?: string; metro?: string };

// ---- cases ----
export function AddCase({ pid }: { pid?: string }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const [rn, setRn] = useState('');
  const [form, setForm] = useState('I-129');
  const [owner, setOwner] = useState(pid ?? f.main?.id ?? '');
  const [err, setErr] = useState<string>();
  const tour = useSheetTour('add-case');
  const add = async () => {
    const r = rn.trim().toUpperCase();
    if (!isReceipt(r)) { setErr('3 letters and 10 numbers, like IOE0912345678.'); return; }
    await f.actions.addCase({ receipt: r, form, ownerId: owner, status: 'pending' });
    s.close(); toast(`${form} added · check its status in Safari`);
  };
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Why>Type the 13-character receipt number from the I-797C notice.</Why></View><TourButton /></View>
      <TourTarget id="receipt"><Field label="Receipt number" value={rn} onChangeText={(x) => { setRn(x.toUpperCase()); setErr(undefined); }} placeholder="IOE0900000000" autoCapitalize="characters" maxLength={13} mono error={err} /></TourTarget>
      <SelectField label="Form" value={form} onChange={setForm} options={FORMS.filter((x) => x[0] !== 'I-129S').map(([v, n]) => ({ value: v, label: `${v} · ${n}` }))} />
      <TourTarget id="who"><SelectField label="Whose case" value={owner} onChange={setOwner} options={f.people.map((p) => ({ value: p.id, label: p.name }))} /></TourTarget>
      <SheetButtons><Cancel /><Button grow title="Add case" onPress={add} /></SheetButtons>
    </TourScope>
  );
}

/** After Safari: paste what USCIS says (clipboard, or a text box), or pick the status by hand. */
export function CheckStatus({ view, copied }: { view: CaseView; copied: boolean }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast(); const t = useTheme();
  const [typed, setTyped] = useState('');
  const [showBox, setShowBox] = useState(!hasClipboard());
  const [found, setFound] = useState<Parsed | null>(null);
  const [miss, setMiss] = useState(false);
  const tour = useSheetTour('check-status');
  const saveParsed = async (p: Parsed) => {
    await f.actions.editCase(view, (c) => applyCaseText(c, p, today()));
    s.close(); toast(`Status saved · ${p.status}`);
  };
  const tryText = (x: string) => {
    const p = parseCaseText(x, view.receipt);
    setFound(p); setMiss(!p);
    if (!p) setShowBox(true);
  };
  const paste = async () => {
    const x = await readClipboard();
    if (x === undefined) { setShowBox(true); return; }
    setTyped(x); tryText(x);
  };
  const set = async (label: string) => {
    const status = label === 'Approved' ? 'approved' : label === 'Request for Evidence' ? 'rfe' : 'pending';
    await f.actions.editCase(view, (c) => ({ ...c, status, checkedAt: new Date().toISOString(), history: [{ date: new Date().toISOString(), text: label === 'Still pending' ? 'Checked · still pending' : label }, ...c.history] }));
    s.close(); toast(`Status saved · ${label}`);
  };
  return (
    <TourScope tour={tour}><View>
      {!copied && view.receipt ? (
        <Note tone="amber">
          <T style={font.sub}>Couldn’t copy the receipt number. Press and hold it to copy:</T>
          <T selectable style={[font.headline, { fontFamily: 'Menlo', marginTop: 6 }]}>{view.receipt}</T>
        </Note>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Why>On the USCIS page, select the status and its explanation, tap Copy, and come back here.</Why></View><TourButton /></View>
      <TourTarget id="paste" style={{ marginTop: 12, flexDirection: 'row' }}><Button icon="copy" title="Paste what USCIS says" onPress={paste} /></TourTarget>
      {showBox ? (
        <Field label="Or paste it here" value={typed} onChangeText={(x) => { setTyped(x); setMiss(false); setFound(null); }} onBlur={() => typed && tryText(typed)} placeholder="Case Was Received…" multiline autoCapitalize="none" />
      ) : null}
      {showBox && typed && !found ? <View style={{ marginTop: 8, flexDirection: 'row' }}><Button kind="tint" title="Read this" onPress={() => tryText(typed)} /></View> : null}
      {found ? (
        <Card style={{ marginTop: 12, backgroundColor: t.card2 }}>
          <T tone="text2" style={font.caption}>USCIS says</T>
          <T style={[font.headline, { marginTop: 2 }]}>{found.status}</T>
          <T tone="text2" style={[font.foot, { marginTop: 4 }]}>{[found.date ? fmt(found.date) : undefined, found.form].filter(Boolean).join(' · ')}</T>
          <T style={[font.foot, { marginTop: 6 }]} numberOfLines={4}>{found.detail}</T>
          <Button block title="Save to this case" onPress={() => saveParsed(found)} />
        </Card>
      ) : null}
      {miss ? <Hint>{`That doesn’t look like a USCIS status yet. Copy the heading and the sentence under it${view.receipt ? ` for ${view.receipt}` : ''}, or pick below.`}</Hint> : null}
      <T tone="text2" style={[font.caption, { marginTop: 16 }]}>Or pick what it said</T>
      <TourTarget id="pick" style={{ gap: 8, marginTop: 8 }}>
        {['Still pending', 'Request for Evidence', 'Biometrics scheduled', 'Approved'].map((x) => <Option key={x} title={x} onPress={() => set(x)} />)}
      </TourTarget>
      <SheetButtons><Cancel label="Not now" /></SheetButtons>
    </View></TourScope>
  );
}

/**
 * Copy the receipt → Safari (wait until the person is back) → THEN open the paste sheet. Opening a
 * sheet before Safari left the app stuck on iOS (v2.0.2 P0).
 */
export async function startCaseCheck(view: CaseView, open: (title: string, node: React.ReactNode) => void) {
  let copied = false;
  if (view.receipt) {
    copied = await copy(view.receipt);
    if (copied) { const has = await clipboardHasText(); if (has === false) copied = false; }
  }
  await openUrlAndWait(USCIS_CASE_URL);
  open('What did USCIS say?', <CheckStatus view={view} copied={copied || !view.receipt} />);
}

export function AddKeyDate({ view }: { view: CaseView }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const [kind, setKind] = useState<KeyDate['kind']>('biometrics');
  const [date, setDate] = useState<string | undefined>(addDays(today(), 30));
  return (
    <View>
      <SelectField label="What" value={kind} onChange={setKind} options={[{ value: 'biometrics', label: 'Biometrics' }, { value: 'interview', label: 'Interview' }, { value: 'rfe-due', label: 'RFE response due' }, { value: 'oath', label: 'Oath ceremony' }]} />
      <DateField label="Date" value={date} onChange={setDate} />
      <Hint>We’ll remind you 7 days and 1 day before.</Hint>
      <SheetButtons><Cancel /><Button grow title="Add" onPress={async () => {
        if (!date || !isISO(date)) { toast('Pick a date'); return; }
        await f.actions.editCase(view, (c) => ({ ...c, keyDates: [...c.keyDates, { kind, date }] }));
        s.close(); toast('Date added · reminder set');
      }} /></SheetButtons>
    </View>
  );
}

export function Confirm({ body, action, onConfirm }: { body: string; action: string; onConfirm: () => void | Promise<void> }) {
  const s = useSheet();
  return (
    <View>
      <Why>{body}</Why>
      <SheetButtons><Cancel /><Button grow kind="danger" title={action} onPress={async () => { s.close(); await onConfirm(); }} /></SheetButtons>
    </View>
  );
}

export function SourceSheet({ tag, body, source, url, checked }: { tag?: string; body: string; source: string; url: string; checked: string }) {
  const s = useSheet(); const t = useTheme();
  return (
    <View>
      <Why>{body}</Why>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 }}><Icon name="globe" size={14} color={t.text2} /><T tone="text2" style={font.caption}>{`Source: ${source} · last checked ${checked}`}</T></View>
      <SheetButtons><Cancel label="Close" /><Button grow icon="compass" title="Open source" onPress={() => { s.close(); openUrl(url); }} /></SheetButtons>
      {tag ? null : null}
    </View>
  );
}

export const useFamilyState = (): FamilyState => useFamily();
export type { Person };
export const goPerson = (id: string) => router.push(`/person/${id}` as never);
