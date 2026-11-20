// v3.0 onboarding (owner request, Nov 19): one question per screen, a step bar that counts only the
// steps that apply, branching on the status, slide + fade between steps, Finish later everywhere.
// Which steps apply, resume and routing are pure (core/onboarding.ts). Documents reuse the document
// flow screens in "quick" mode (one document, then back here). Tools stay as in-context tips later.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GcFacts, Person, Relation, StatusCategory } from '../core/model';
import { STATUS_LABEL } from '../core/model';
import { today, fmt } from '../core/dates';
import { parsePlace, placeText } from '../core/metro';
import { FORMS, isReceipt } from '../core/cases';
import { birthCountryGuess } from '../core/birth';
import { fillsStep, stepMeta, type StepKey } from '../core/steps';
import { FIELDS, showField } from '../core/docs';
import { REMINDER_TYPES, TYPE_DEFAULT, typeDates, typeSetting, typesFor, type ReminderType } from '../core/reminders';
import { widgetName } from '../core/widgets';
import {
  GC_ANSWERS, OPTIONAL_STEPS, SETUP_ORDER, docChecklist, docProgress, familyStatusLabel, gcAnswerOf, gcFactsFor, nextDeadline, nextStep, prevStep, resumeStep, setupProgress, setupSteps,
  suggestStatus, type GcAnswer, type SetupStep,
} from '../core/onboarding';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { newId } from '../data/store';
import { startFlow, typeIn, upload } from '../data/flow';
import { askNotificationPermission, openNotificationSettings, reminderItems } from '../native/reminders';
import { authenticate, canUseBiometrics, success, tap } from '../native/device';
import { supportText } from '../native/icloud';
import { icloudSettings } from '../data/icloudBackup';
import { forgetPassword } from '../native/secret';
import type { Source } from '../native/files';
import {
  Appear, Avatar, Button, Card, ChipToggle, Chips, DateField, Field, Footer, H1, Hint, Icon, Meter, Note, Pastel, SelectField, Spinner, Switch, T, Why, font, radius,
  useLayout, useReduceMotion, useSheet, useTheme, useToast, MIN_TOUCH, type PastelTone,
} from '../ui';
import { DISCLAIMER_LINE } from '../content/legal';
import { BirthCountryField, COUNTRIES, statusGroups } from './sheets';
import { go, home } from './common';
import { usePermission } from './notify';
import { useGuide } from './guide';
import { ICloudPasswordSheet, useICloudSupport } from './icloud';

// ---------- answers (what this setup collects before it is saved) ----------
type FamDraft = { id: string; name: string; relation: Relation; status: StatusCategory; dob?: string; touched?: boolean; saved?: boolean };
type GcCat = NonNullable<GcFacts['category']>;
type Answers = {
  first: string; last: string; nameStyle: 'initials' | 'first'; born: string;
  where?: 'US' | 'Outside'; country: string; lastEntry?: string;
  status?: StatusCategory;
  blanket?: 'yes' | 'no' | 'unsure'; stu?: StatusCategory; h4ead?: boolean;
  employer: string; place: string;
  gc?: GcAnswer; cat?: GcCat; pd?: string; workOn?: 'status' | 'ead';
  family: FamDraft[];
};

const F1_GROUP: StatusCategory[] = ['F-1', 'F-1 OPT', 'STEM OPT'];
const L1_GROUP: StatusCategory[] = ['L-1A', 'L-1B', 'L-1'];

function prefill(f: FamilyState): Answers {
  const me = f.people.find((p) => p.relation === 'self');
  const rec = me ? f.records[me.id] : undefined;
  const parts = (me?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const fx = me?.facts ?? {};
  const st = me?.status && me.status !== 'unsure' ? me.status : undefined;
  return {
    first: parts[0] ?? '', last: parts.slice(1).join(' '), nameStyle: f.settings.widgetNames ?? 'initials', born: fx.birthCountry ?? birthCountryGuess(rec)?.code ?? '',
    where: rec?.locationKnown ? rec.location : fx.location, country: fx.country ?? rec?.country ?? 'India', lastEntry: fx.lastEntry,
    status: st,
    blanket: fx.blanketL === true ? 'yes' : fx.blanketL === false ? 'no' : undefined, stu: st && F1_GROUP.includes(st) && me?.status ? st : undefined, h4ead: fx.hasEad,
    employer: fx.employer ?? rec?.employer ?? '', place: fx.workLocation ? placeText(fx.workLocation) : '',
    gc: gcAnswerOf(me), cat: fx.gc?.category, pd: fx.gc?.priorityDate, workOn: fx.gc?.workOn,
    family: f.people.filter((p) => p.relation !== 'self').map((p) => ({ id: p.id, name: p.name, relation: p.relation, status: p.status ?? 'unsure', dob: p.facts.birthDate, touched: true, saved: true })),
  };
}

// ---------- the screen ----------
export function Onboarding() {
  const f = useFamily();
  const t = useTheme();
  if (!f.ready) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  return <OnboardingBody />;
}

function OnboardingBody() {
  const f = useFamily();
  const t = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const reduce = useReduceMotion();
  const params = useLocalSearchParams<{ mode?: string; step?: string }>();
  const rerun = params.mode === 'rerun' || !!f.settings.setup?.rerun;
  const [a, setA] = useState<Answers>(() => prefill(f));
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));
  const me = f.people.find((p) => p.relation === 'self');
  const [perm] = usePermission();
  const guide = useGuide();
  const [sawAlerts, setSawAlerts] = useState(false);
  const steps = useMemo(() => setupSteps({
    status: a.status ?? me?.status, rerun, locationFromDocs: !!(me && f.records[me.id]?.i94),
    notif: sawAlerts ? 'undetermined' : perm ?? 'undetermined',
  }), [a.status, me, f.records, rerun, perm, sawAlerts]);
  const [step, setStep] = useState<SetupStep>(() => (params.step as SetupStep) || resumeStep(f.settings.setup?.step, steps, !!me));
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const finished = useRef(false);
  useEffect(() => { if (step === 'alerts') setSawAlerts(true); }, [step]);

  // Progress is saved on every step (no new storage key: settings.setup).
  useEffect(() => {
    if (finished.current || step === 'done' || (step === 'welcome' && !f.settings.setup)) return;
    f.actions.updateSettings({ setup: { ...(f.settings.setup ?? {}), step, rerun: rerun || undefined, later: false, at: new Date().toISOString() } }).catch(() => {});
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (to: SetupStep, d: 1 | -1) => { setDir(d); setStep(to); };
  const valid = isValid(step, a);
  const save = async (k: SetupStep) => { await saveStep(k, a, f); };
  const next = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await save(step); } catch { toast('Couldn’t save. Try again.'); setBusy(false); return; }
    setBusy(false);
    move(nextStep(step, steps), 1);
  };
  const skipStep = () => move(nextStep(step, steps), 1);
  const back = () => {
    const p = prevStep(step, steps);
    if (p) move(p, -1); else if (router.canGoBack()) router.back(); else home();
  };
  const finishLater = async () => {
    if (!me && !a.first.trim()) { toast('Type your first name first — it’s all we need to start'); return; }
    try { if (isValid(step, a)) await save(step); else if (!me) await save('you'); } catch {}
    finished.current = true;
    await f.actions.updateSettings(rerun ? { setup: undefined } : { setup: { ...(f.settings.setup ?? {}), step, later: true, dismissed: false, at: new Date().toISOString() } });
    home();
    setTimeout(() => toast(rerun ? 'Saved' : 'Saved · Continue setup from Home'), 350);
  };
  const finish = async () => {
    finished.current = true;
    success();
    await f.actions.updateSettings({ setupDone: true, tutorialSeen: true, setup: undefined, guideSeen: true });
    home();
  };
  // v3.0 (owner): no list of tools after setup; a guided tour of the app itself instead
  const showAround = async () => { await finish(); setTimeout(guide.start, 450); };

  if (step === 'welcome') return <WelcomeStep onStart={() => move(nextStep('welcome', steps), 1)} />;

  const pr = setupProgress(step, steps);
  const optional = OPTIONAL_STEPS.includes(step);
  const finishTo = async (path: string) => { await finish(); setTimeout(() => go(path), 50); };
  const ctx: StepCtx = { a, set, f, next, toast, finishTo };
  const body = <StepFrame key={step} dir={dir} reduce={reduce}>{renderStep(step, ctx)}</StepFrame>;
  const footer = step === 'done'
    ? <View style={{ flex: 1, gap: 10 }}><Button title="Show me around (about 1 minute)" onPress={showAround} /><Button kind="ghost" title="Go to Home" onPress={finish} /></View>
    : step === 'alerts'
      ? <AlertsButtons perm={perm} onDone={() => move(nextStep(step, steps), 1)} />
      : <>
          {optional ? <Button kind="ghost" title="Skip for now" onPress={skipStep} /> : null}
          <Button grow title={step === 'docs' || step === 'cases' || step === 'family' || step === 'protect' ? 'Continue' : 'Next'} disabled={!valid} busy={busy} onPress={next} />
        </>;
  const scroll = (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingHorizontal: L.side, paddingTop: 18, paddingBottom: 32, alignSelf: 'center', width: '100%', maxWidth: L.twoCol ? 600 : L.maxWidth + 2 * L.side }}>
      {body}
    </ScrollView>
  );
  const content = (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingLeft: insets.left, paddingRight: insets.right }}>
      <SetupHeader at={pr.at} total={pr.total} onBack={back} backLabel={prevStep(step, steps) ? 'Back' : rerun ? 'Close' : 'Back'} done={step === 'done'} onLater={finishLater} />
      {L.twoCol ? (
        <View style={{ flex: 1, flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: L.wideMax + 2 * L.side }}>
          <View style={{ flex: 1.15, minWidth: 0 }}>{scroll}</View>
          <View style={{ flex: 1, minWidth: 0, paddingRight: L.side, paddingLeft: 8, paddingTop: 18 }}><SetupPreview step={step} a={a} /></View>
        </View>
      ) : scroll}
      <Footer>{footer}</Footer>
    </View>
  );
  return Platform.OS === 'ios' ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>{content}</KeyboardAvoidingView> : content;
}

// ---------- validity and saving (one place) ----------
export function isValid(step: SetupStep, a: Answers): boolean {
  switch (step) {
    case 'you': return !!a.first.trim();
    case 'where': return !!a.where;
    case 'status': return !!a.status;
    case 'details': {
      const s = a.status;
      if (s && L1_GROUP.includes(s)) return !!a.blanket;
      if (s && F1_GROUP.includes(s)) return !!a.stu;
      if (s === 'H-4') return a.h4ead !== undefined;
      return true;
    }
    case 'gc': return !!a.gc;
    default: return true;
  }
}

async function saveStep(step: SetupStep, a: Answers, f: FamilyState) {
  const me = f.people.find((p) => p.relation === 'self');
  const rec = me ? f.records[me.id] : undefined;
  const A = f.actions;
  switch (step) {
    case 'you': {
      const name = [a.first.trim(), a.last.trim()].filter(Boolean).join(' ');
      const guess = birthCountryGuess(rec)?.code;
      // pre-filled from the passport: kept unset while it still matches (documents decide), saved once changed
      const birthCountry = a.born && (a.born !== guess || me?.facts.birthCountry) ? a.born : undefined;
      if (!me) {
        const p: Person = { id: 'me', name, relation: 'self', isMain: true, status: a.status, facts: birthCountry ? { birthCountry } : {}, createdAt: today(), reminders: { on: true, lead: f.settings.reminderLeadDays } };
        await A.upsertPerson(p);
      } else await A.updatePerson(me.id, { name, facts: { ...me.facts, birthCountry: birthCountry ?? me.facts.birthCountry } });
      await A.updateSettings({ widgetNames: a.nameStyle, tutorialSeen: true });
      try { require('../native/diag').diag('setup: you saved'); } catch {}
      return;
    }
    case 'where': {
      if (!me || !a.where) return;
      const before = rec?.locationKnown ? rec.location : me.facts.location;
      const changed = a.where !== before || (a.where === 'Outside' && a.country !== (me.facts.country ?? rec?.country));
      await A.setFacts(me.id, {
        ...(changed ? { location: a.where, country: a.where === 'Outside' ? a.country : undefined, locationOn: today() } : {}),
        lastEntry: a.where === 'US' ? a.lastEntry : undefined,
      });
      return;
    }
    case 'status': if (me && a.status && a.status !== me.status) await A.updatePerson(me.id, { status: a.status }); return;
    case 'details': {
      if (!me) return;
      const s = a.status;
      if (s && L1_GROUP.includes(s)) await A.setFacts(me.id, { blanketL: a.blanket === 'yes' ? true : a.blanket === 'no' ? false : undefined });
      if (s && F1_GROUP.includes(s) && a.stu && a.stu !== me.status) await A.updatePerson(me.id, { status: a.stu });
      if (s === 'H-4') await A.setFacts(me.id, { hasEad: a.h4ead });
      return;
    }
    case 'work': {
      if (!me) return;
      const e = a.employer.trim();
      const loc = parsePlace(a.place);
      await A.setFacts(me.id, {
        // a typed employer is kept only where no document shows one (record.ts reads documents first)
        employer: e && e !== rec?.employer ? e : rec?.employer ? undefined : e || undefined,
        ...(loc ? { workLocation: { city: loc.city, state: loc.state, zip: loc.zip, metro: loc.metro } } : {}),
      });
      return;
    }
    case 'gc': {
      if (!me || !a.gc) return;
      await A.setFacts(me.id, gcFactsFor(a.gc, me.facts, { category: a.cat, priorityDate: a.pd, workOn: a.workOn }));
      if (a.gc === 'approved' && me.status !== 'green-card' && me.status !== 'conditional-green-card') await A.updatePerson(me.id, { status: 'green-card' });
      return;
    }
    case 'family': {
      const list = a.family.filter((d) => d.name.trim());
      const people: Person[] = list.map((d) => {
        const old = f.people.find((p) => p.id === d.id);
        const base: Pick<Person, 'facts' | 'createdAt' | 'reminders'> = old ?? { facts: {}, createdAt: today(), reminders: { on: true, lead: f.settings.reminderLeadDays } };
        // a typed date of birth is kept only where no document shows one
        const docDob = f.records[d.id]?.birthDate && f.records[d.id]?.birthDate !== old?.facts.birthDate ? f.records[d.id]?.birthDate : undefined;
        return { ...base, id: d.id, name: d.name.trim(), relation: d.relation, status: d.status, facts: { ...base.facts, birthDate: docDob ? base.facts.birthDate : d.dob } } as Person;
      });
      if (people.length) await A.savePeople(people);
      return;
    }
    default: return;
  }
}

// ---------- frame: header, progress, transitions ----------
function SetupHeader({ at, total, onBack, backLabel, onLater, done }: { at: number; total: number; onBack: () => void; backLabel: string; onLater: () => void; done: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  return (
    <View style={{ paddingTop: insets.top + 4, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, alignSelf: 'center', width: '100%', maxWidth: L.twoCol ? L.wideMax + 2 * L.side : L.maxWidth + 2 * L.side, minHeight: 48 }}>
        {!done ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={6} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
            <Icon name={backLabel === 'Close' ? 'x' : 'chevL'} size={22} color={t.text} weight="semibold" />
          </Pressable>
        ) : <View style={{ width: MIN_TOUCH }} />}
        <View style={{ flex: 1 }}><Segments at={at} total={total} done={done} /></View>
        {!done ? (
          <Pressable onPress={onLater} accessibilityRole="button" accessibilityLabel="Finish later and go to Home" hitSlop={6} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 8 }}>
            <T tone="text2" style={[font.sub, { fontWeight: '600' }]}>Finish later</T>
          </Pressable>
        ) : <View style={{ width: MIN_TOUCH }} />}
      </View>
    </View>
  );
}

/** Segmented step bar: one segment per step that applies; the current one fills in. */
function Segments({ at, total, done }: { at: number; total: number; done?: boolean }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fill.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(fill, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [at, total, reduce, fill]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={done ? 'All done' : `Step ${at} of ${total}`} accessibilityValue={{ min: 0, max: total, now: at }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: Math.max(1, total) }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: t.fill, overflow: 'hidden' }}>
            {i < at - 1 ? <View style={{ flex: 1, backgroundColor: t.green }} /> : i === at - 1 ? <Animated.View style={{ height: 5, backgroundColor: t.green, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
          </View>
        ))}
      </View>
      <T tone="text2" style={[font.caption, { textAlign: 'center', marginTop: 4 }]}>{done ? 'All done' : `Step ${at} of ${total}`}</T>
    </View>
  );
}

/** Slide + fade in (from the right going forward, from the left going back). Reduce Motion: no movement. */
function StepFrame({ dir, reduce, children }: { dir: number; reduce: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [v, reduce]);
  return <Animated.View style={{ opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [dir * 36, 0] }) }] }}>{children}</Animated.View>;
}

/** Animated checkmark (spring in). */
export function Tick({ size = 26, on = true }: { size?: number; on?: boolean }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const s = useRef(new Animated.Value(on && !reduce ? 0 : 1)).current;
  useEffect(() => { if (on && !reduce) Animated.spring(s, { toValue: 1, friction: 5, tension: 140, useNativeDriver: Platform.OS !== 'web' }).start(); }, [on, reduce, s]);
  return (
    <Animated.View accessibilityLabel="Added" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.pastel.sageD, alignItems: 'center', justifyContent: 'center', transform: [{ scale: s }] }}>
      <Icon name="check" size={size * 0.55} color={t.ink} weight="bold" />
    </Animated.View>
  );
}

/** A big tappable choice card (status, yes / no). Selected: outlined + check; light haptic on tap. */
function ChoiceCard({ title, sub, icon, tone = 'sky', selected, onPress, compact }: { title: string; sub?: string; icon?: string; tone?: PastelTone; selected?: boolean; onPress: () => void; compact?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={[title, sub].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: compact ? 14 : 16, minHeight: 64, backgroundColor: t.card, borderRadius: radius.row, borderWidth: 2, borderColor: selected ? t.text : 'transparent', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {icon ? <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={t.ink} /></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={[font.body, { fontWeight: '600' }]}>{title}</T>
        {sub ? <T tone="text2" style={[font.foot, { marginTop: 1 }]}>{sub}</T> : null}
      </View>
      {selected ? <Tick size={24} /> : <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.text3 }} />}
    </Pressable>
  );
}

const Label = ({ children }: { children: string }) => <T tone="text2" style={[font.caption, { marginTop: 20, marginLeft: 2, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{children}</T>;

// ---------- steps ----------
type StepCtx = { a: Answers; set: (p: Partial<Answers>) => void; f: FamilyState; next: () => void; toast: (m: string) => void; finishTo?: (path: string) => void };

function renderStep(step: SetupStep, c: StepCtx): React.ReactNode {
  switch (step) {
    case 'you': return <YouStep {...c} />;
    case 'where': return <WhereStep {...c} />;
    case 'status': return <StatusStep {...c} />;
    case 'details': return <DetailsStep {...c} />;
    case 'work': return <WorkStep {...c} />;
    case 'gc': return <GcStep {...c} />;
    case 'family': return <FamilyStep {...c} />;
    case 'docs': return <DocsStep {...c} />;
    case 'cases': return <CasesStep {...c} />;
    case 'alerts': return <AlertsStep {...c} />;
    case 'protect': return <ProtectStep {...c} />;
    case 'done': return <DoneStep {...c} />;
    default: return null;
  }
}

function YouStep({ a, set, next }: StepCtx) {
  const t = useTheme();
  const lastRef = useRef<any>(null);
  const full = [a.first.trim(), a.last.trim()].filter(Boolean).join(' ') || 'Your Name';
  return (
    <View>
      <H1>What’s your name?</H1>
      <Why>Your full name helps match documents to you. Your legal name comes from your passport.</Why>
      <Field label="First name" value={a.first} onChangeText={(first) => set({ first })} placeholder="First name" autoCapitalize="words" autoComplete="given-name" returnKeyType="next" onSubmitEditing={() => lastRef.current?.focus()} />
      <Field label="Last name" value={a.last} onChangeText={(last) => set({ last })} placeholder="Last name" autoCapitalize="words" autoComplete="family-name" inputRef={lastRef} returnKeyType="next" onSubmitEditing={next} />
      <Label>On widgets and the lock screen, show</Label>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }} accessibilityRole="radiogroup">
        {(['initials', 'first'] as const).map((k) => {
          const on = a.nameStyle === k;
          return (
            <Pressable key={k} onPress={() => { tap(); set({ nameStyle: k }); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={k === 'initials' ? 'Initials' : 'First name'}
              style={({ pressed }) => ({ flex: 1, backgroundColor: t.card, borderRadius: 22, padding: 14, borderWidth: 2, borderColor: on ? t.text : 'transparent', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <View style={{ backgroundColor: t.pastel.sage, borderRadius: 16, padding: 10, minHeight: 64, justifyContent: 'space-between' }}>
                <T style={[font.headline, { color: t.ink }]} numberOfLines={1}>{widgetName(full, k)}</T>
                <T style={[font.caption, { color: t.ink2 }]} numberOfLines={1}>{`${a.status ? familyStatusLabel(a.status, 'self') : 'Status'} · 412 days`}</T>
              </View>
              <T style={[font.sub, { fontWeight: '600', marginTop: 8, textAlign: 'center' }]}>{k === 'initials' ? 'Initials' : 'First name'}</T>
            </Pressable>
          );
        })}
      </View>
      <Hint>More private: initials. You can change it in Settings.</Hint>
      <BirthCountryField value={a.born} onChange={(born) => set({ born })} />
    </View>
  );
}

function WhereStep({ a, set }: StepCtx) {
  return (
    <View>
      <H1>Where are you now?</H1>
      <Why>People outside the US don’t have an I-94, so we check travel documents only.</Why>
      <View style={{ gap: 10, marginTop: 20 }} accessibilityRole="radiogroup">
        <ChoiceCard icon="home" tone="sage" title="In the US" sub="We’ll check your I-94 and stay dates" selected={a.where === 'US'} onPress={() => set({ where: 'US' })} />
        <ChoiceCard icon="airplane" tone="sky" title="Outside the US" sub="Travel documents only" selected={a.where === 'Outside'} onPress={() => set({ where: 'Outside' })} />
      </View>
      {a.where === 'US' ? <Appear><DateField label="Most recent entry to the US (optional)" value={a.lastEntry} onChange={(lastEntry) => set({ lastEntry })} /><Hint>The CBP I-94 website asks for this date. Your I-94 shows it too.</Hint></Appear> : null}
      {a.where === 'Outside' ? <Appear><SelectField label="Country" value={a.country} onChange={(country) => set({ country })} options={COUNTRIES.map((x) => ({ value: x, label: x }))} /></Appear> : null}
    </View>
  );
}

const CARDS: { key: StatusCategory; title: string; sub: string; icon: string; tone: PastelTone; group?: StatusCategory[] }[] = [
  { key: 'H-1B', title: 'H-1B', sub: 'Specialty occupation', icon: 'briefcase', tone: 'sky' },
  { key: 'L-1A', title: 'L-1A', sub: 'Manager or executive transfer', icon: 'layers', tone: 'sage' },
  { key: 'L-1B', title: 'L-1B', sub: 'Specialized knowledge transfer', icon: 'layers', tone: 'sage' },
  { key: 'F-1', title: 'F-1 · OPT · STEM OPT', sub: 'Student, or working on OPT', icon: 'school', tone: 'butter', group: F1_GROUP },
  { key: 'H-4', title: 'H-4', sub: 'Spouse or child of an H-1B', icon: 'users', tone: 'blush' },
  { key: 'L-2', title: 'L-2 / L-2S', sub: 'Spouse or child of an L-1', icon: 'users', tone: 'blush' },
  { key: 'green-card-applicant', title: 'Green card applicant', sub: 'I-485 filed', icon: 'card', tone: 'mint' },
  { key: 'green-card', title: 'Green card holder', sub: 'Permanent resident', icon: 'card', tone: 'mint', group: ['green-card', 'conditional-green-card'] },
];
const ALIASES: Partial<Record<StatusCategory, string>> = { TN: 'usmca canada mexico nafta', 'E-3': 'australia', 'O-1': 'extraordinary ability', 'J-1': 'exchange visitor research scholar', 'B-2': 'visitor tourist business', citizen: 'naturalized', 'citizenship-applicant': 'n-400 naturalization', 'F-1 OPT': 'student work', 'STEM OPT': 'student work extension', 'L-2': 'l2s', 'green-card-applicant': 'i-485 adjustment aos', 'green-card': 'permanent resident pr lpr' };

function StatusStep({ a, set }: StepCtx) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(() => !!a.status && !CARDS.some((c) => (c.group ?? [c.key]).includes(a.status!)));
  const L = useLayout();
  const pick = (k: StatusCategory) => set({ status: k, stu: F1_GROUP.includes(k) && a.stu && F1_GROUP.includes(a.stu) ? a.stu : undefined });
  const ql = q.trim().toLowerCase();
  const matches = (Object.keys(STATUS_LABEL) as StatusCategory[]).filter((k) => k !== 'unsure' && (!ql || `${k} ${STATUS_LABEL[k]} ${ALIASES[k] ?? ''}`.toLowerCase().includes(ql)));
  const cols = L.width >= 520 && !L.twoCol ? 2 : 1;
  return (
    <View>
      <H1>What’s your status now?</H1>
      <Why>Pick the closest. Your documents confirm the exact type later.</Why>
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Search, e.g. TN, O-1, J-1" autoCapitalize="none" returnKeyType="done" />
      {ql ? (
        <View style={{ gap: 8, marginTop: 14 }} accessibilityRole="radiogroup">
          {matches.length ? matches.map((k) => <ChoiceCard key={k} compact title={STATUS_LABEL[k]} selected={a.status === k} onPress={() => pick(k)} />) : <Hint>No match. Try “Something else”.</Hint>}
          {matches.includes('other') ? null : <ChoiceCard compact title={STATUS_LABEL.other} selected={a.status === 'other'} onPress={() => pick('other')} />}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }} accessibilityRole="radiogroup">
            {CARDS.map((c) => (
              <View key={c.key} style={{ width: cols === 2 ? '48.5%' : '100%' }}>
                <ChoiceCard icon={c.icon} tone={c.tone} title={c.title} sub={c.sub} selected={!!a.status && (c.group ?? [c.key]).includes(a.status)} onPress={() => { pick(c.key); setAll(false); }} />
              </View>
            ))}
            <View style={{ width: cols === 2 ? '48.5%' : '100%' }}>
              <ChoiceCard icon="more" tone="sky" title="Other" sub="TN, E-3, O-1, J-1, visitor, citizen…" selected={all} onPress={() => setAll(true)} />
            </View>
          </View>
          {all ? (
            <Appear style={{ gap: 8, marginTop: 12 }}>
              {matches.filter((k) => !CARDS.some((c) => (c.group ?? [c.key]).includes(k))).map((k) => <ChoiceCard key={k} compact title={STATUS_LABEL[k]} selected={a.status === k} onPress={() => pick(k)} />)}
            </Appear>
          ) : null}
        </>
      )}
    </View>
  );
}

function DetailsStep({ a, set }: StepCtx) {
  const s = a.status;
  if (s && L1_GROUP.includes(s)) {
    return (
      <View>
        <H1>Blanket L or individual petition?</H1>
        <Why>It decides which approval you have: an I-129S for blanket L, an I-797 for an individual petition.</Why>
        <View style={{ gap: 10, marginTop: 20 }} accessibilityRole="radiogroup">
          <ChoiceCard icon="layers" tone="sage" title="Blanket L" sub="Visa stamp says BLANKET · you carry an I-129S" selected={a.blanket === 'yes'} onPress={() => set({ blanket: 'yes' })} />
          <ChoiceCard icon="doc" tone="sky" title="Individual petition" sub="USCIS approved an I-129 for you (I-797)" selected={a.blanket === 'no'} onPress={() => set({ blanket: 'no' })} />
          <ChoiceCard icon="help" tone="butter" title="Not sure" sub="Your documents will tell" selected={a.blanket === 'unsure'} onPress={() => set({ blanket: 'unsure' })} />
        </View>
      </View>
    );
  }
  if (s && F1_GROUP.includes(s)) {
    return (
      <View>
        <H1>Are you working on OPT?</H1>
        <Why>OPT and STEM OPT have their own work permit and unemployment limits.</Why>
        <View style={{ gap: 10, marginTop: 20 }} accessibilityRole="radiogroup">
          <ChoiceCard icon="school" tone="butter" title="Still studying" sub="F-1, no OPT yet" selected={a.stu === 'F-1'} onPress={() => set({ stu: 'F-1', status: 'F-1' })} />
          <ChoiceCard icon="briefcase" tone="sky" title="OPT" sub="Up to 12 months after the degree · EAD (c)(3)(B)" selected={a.stu === 'F-1 OPT'} onPress={() => set({ stu: 'F-1 OPT', status: 'F-1 OPT' })} />
          <ChoiceCard icon="chart" tone="sage" title="STEM OPT" sub="24-month extension · EAD (c)(3)(C)" selected={a.stu === 'STEM OPT'} onPress={() => set({ stu: 'STEM OPT', status: 'STEM OPT' })} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <H1>Do you have an H-4 EAD?</H1>
      <Why>An H-4 EAD lets you work. Renewals don’t extend automatically, so we track its dates.</Why>
      <View style={{ gap: 10, marginTop: 20 }} accessibilityRole="radiogroup">
        <ChoiceCard icon="card" tone="sage" title="Yes, I have an EAD" sub="We’ll add it to your documents" selected={a.h4ead === true} onPress={() => set({ h4ead: true })} />
        <ChoiceCard icon="x" tone="sky" title="No" selected={a.h4ead === false} onPress={() => set({ h4ead: false })} />
      </View>
    </View>
  );
}

/** v3.0 (owner): the on-this-phone promise is the first thing on the documents step, not small print. */
function PhoneOnly() {
  return (
    <Pastel tone="good" style={{ marginTop: 14 }} pad={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="lock" size={26} color="#1D2A24" />
        <View style={{ flex: 1 }}>
          <T style={[font.headline, { fontWeight: '700' }]}>Your documents stay on this phone</T>
          <T style={[font.sub, { marginTop: 2 }]}>Read here, never uploaded. Not on our server, not shared unless you send them.</T>
        </View>
      </View>
    </Pastel>
  );
}

function WorkStep({ a, set, next }: StepCtx) {
  const placeRef = useRef<any>(null);
  const loc = parsePlace(a.place);
  const opt = a.status === 'F-1 OPT' || a.status === 'STEM OPT';
  return (
    <View>
      <H1>Where do you work?</H1>
      <Why>{opt ? 'OPT employers and work addresses are reported in the SEVP portal.' : 'Moving to another metro area can need an amended petition first.'}</Why>
      <Field label="Work location: city or ZIP" value={a.place} onChangeText={(place) => set({ place })} placeholder="e.g. Austin, TX or 75038" autoCapitalize="words" inputRef={placeRef} returnKeyType="next" onSubmitEditing={next} />
      {loc ? (
        <Appear style={{ marginTop: 10 }}>
          <Note tone={loc.metro ? 'green' : 'blue'}>{loc.metro ? `${placeText(loc) || `ZIP ${loc.zip}`} is in the ${loc.metro} metro.` : `We couldn’t tell the metro for ${placeText(loc) || loc.zip}. You can still save it.`}</Note>
        </Appear>
      ) : <Chips>{['Irving, TX', 'Austin, TX', 'Plano, TX', 'Chicago, IL'].map((c) => <ChipToggle key={c} role="button" size="sm" text={c} onPress={() => { tap(); set({ place: c }); }} />)}</Chips>}
      <Hint>Your approval notice shows the employer, so we don’t ask. Count working from home.</Hint>
    </View>
  );
}

const CATS: GcCat[] = ['EB-1', 'EB-2', 'EB-3', 'EB-3 OW', 'EB-5'];
function GcStep({ a, set }: StepCtx) {
  const applicant = a.status === 'green-card-applicant';
  const answers = applicant ? GC_ANSWERS.filter((x) => x.key !== 'none' && x.key !== 'approved') : GC_ANSWERS;
  return (
    <View>
      <H1>{applicant ? 'How far is your green card?' : 'Has a green card process started?'}</H1>
      <Why>Each stage has its own documents. The priority date and category come from the I-140 once you add it.</Why>
      <View style={{ gap: 10, marginTop: 20 }} accessibilityRole="radiogroup">
        {answers.map((x, i) => <ChoiceCard key={x.key} compact title={x.title} sub={x.sub} icon={['minus', 'doc', 'checkc', 'clock', 'card'][GC_ANSWERS.indexOf(x)] ?? 'doc'} tone={(['sky', 'butter', 'sage', 'mint', 'sage'] as PastelTone[])[i % 5]} selected={a.gc === x.key} onPress={() => set({ gc: x.key })} />)}
      </View>
      {a.gc === 'i140' || a.gc === 'i485' ? (
        <Appear style={{ marginTop: 6 }}>
          <Label>Category, if you know it</Label>
          <Chips style={{ marginTop: 8 }}>{CATS.map((c) => <ChipToggle key={c} text={c} on={a.cat === c} onPress={() => { tap(); set({ cat: a.cat === c ? undefined : c }); }} />)}</Chips>
          <DateField label="Priority date (optional)" value={a.pd} onChange={(pd) => set({ pd })} />
        </Appear>
      ) : null}
      {a.gc === 'i485' ? (
        <Appear style={{ marginTop: 6 }}>
          <Label>While the I-485 is pending, you work on</Label>
          <View style={{ gap: 10, marginTop: 8 }} accessibilityRole="radiogroup">
            <ChoiceCard compact title={applicant ? 'My visa status' : `My ${a.status ?? 'visa'} status`} sub="Keep extending it" selected={a.workOn === 'status'} onPress={() => set({ workOn: 'status' })} />
            <ChoiceCard compact title="The EAD (C9)" sub="Work permit from the I-485" selected={a.workOn === 'ead'} onPress={() => set({ workOn: 'ead' })} />
          </View>
        </Appear>
      ) : null}
      {a.gc === 'approved' ? <Appear style={{ marginTop: 10 }}><Note tone="green">Congratulations. We’ll set your status to green card holder.</Note></Appear> : null}
    </View>
  );
}

function FamilyStep({ a, set, f }: StepCtx) {
  const t = useTheme();
  const main = a.status ?? f.main?.status;
  const add = (relation: Relation) => { tap(); set({ family: [...a.family, { id: newId('p'), name: '', relation, status: suggestStatus(main, relation) }] }); };
  const upd = (i: number, d: FamDraft) => set({ family: a.family.map((x, j) => (j === i ? d : x)) });
  const groups = useMemo(() => {
    const g = statusGroups(true);
    if (!g.some((x) => x.options.some((o) => o.value === 'L-1'))) g[0] = { ...g[0], options: [...g[0].options, { value: 'L-1' as StatusCategory, label: 'L-1 (A or B)' }] };
    return g;
  }, []);
  return (
    <View>
      <H1>Who’s in your family?</H1>
      <Why>Add your spouse and children on a visa or green card — even if they’re outside the US. Full names help match their documents.</Why>
      <View style={{ gap: 12, marginTop: 18 }}>
        {a.family.map((d, i) => (
          <Appear key={d.id}>
            <Card style={{ paddingVertical: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={d.name || (d.relation === 'spouse' ? 'S' : d.relation === 'child' ? 'C' : 'P')} size="sm" />
                <T style={[font.headline, { flex: 1 }]}>{d.relation === 'spouse' ? 'Spouse' : d.relation === 'child' ? 'Child' : 'Parent'}</T>
                {!d.saved ? (
                  <Pressable onPress={() => set({ family: a.family.filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel={`Remove ${d.name || 'this person'}`} hitSlop={8} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={18} color={t.text2} />
                  </Pressable>
                ) : null}
              </View>
              <Field label="Full name" value={d.name} onChangeText={(name) => upd(i, { ...d, name })} placeholder="First and last name" autoCapitalize="words" autoFocus={!d.saved && !d.name && Platform.OS !== 'web'} returnKeyType="done" />
              <DateField label="Date of birth (optional)" value={d.dob} onChange={(dob) => upd(i, { ...d, dob })} />
              <SelectField label={d.touched ? 'Status' : `Status · suggested from yours`} value={d.status} onChange={(status) => upd(i, { ...d, status, touched: true })} groups={groups} />
              {d.status === 'L-2' && d.relation === 'spouse' ? <Hint>Shown as L-2S: the spouse’s I-94 itself allows work.</Hint> : null}
            </Card>
          </Appear>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {!a.family.some((d) => d.relation === 'spouse') ? <Button kind="ghost" icon="plus" title="Spouse" onPress={() => add('spouse')} /> : null}
        <Button kind="ghost" icon="plus" title="Child" onPress={() => add('child')} />
        <Button kind="ghost" icon="plus" title="Parent" onPress={() => add('parent')} />
      </View>
      {!a.family.length ? <Hint center style={{ marginTop: 14 }}>Just you for now? Tap Skip — add family anytime from Home.</Hint> : null}
    </View>
  );
}

// ---- documents: a per-person checklist; each row opens the existing document step (quick mode) ----
function DocsStep({ f }: StepCtx) {
  const t = useTheme();
  const [more, setMore] = useState<Record<string, boolean>>({});
  const later = new Set(f.settings.setup?.docsLater ?? []);
  const has = (pid: string, k: StepKey) => {
    const p = f.people.find((x) => x.id === pid);
    if (!p) return undefined;
    const m = stepMeta(p, k, f.records[pid]);
    return f.docs.find((d) => d.ownerId === pid && fillsStep(m, d));
  };
  const lists = f.people.map((p) => ({ p, ...docChecklist(p, f.records[p.id]) }));
  const rows = lists.flatMap((l) => l.key.map((k) => ({ pid: l.p.id, k })));
  const prog = docProgress(rows, (pid, k) => !!has(pid, k));
  const setLater = (id: string, on: boolean) => {
    const cur = new Set(f.settings.setup?.docsLater ?? []);
    if (on) cur.add(id); else cur.delete(id);
    f.actions.updateSettings({ setup: { ...(f.settings.setup ?? { step: 'docs' }), docsLater: [...cur] } }).catch(() => {});
  };
  const open = (pid: string, k: StepKey, src: Source | 'type') => {
    tap();
    const first = startFlow({ mode: 'renew', pids: [pid], only: [k], quick: true }, f);
    if (!first) return;
    if (src === 'type') typeIn(pid, k, f);
    go('/flow/step', { pid, k });
    if (src !== 'type') setTimeout(() => { upload(pid, k, src, f).catch(() => {}); }, 120);
  };
  const row = (p: Person, k: StepKey, key: boolean) => {
    const rec = f.records[p.id];
    const m = stepMeta(p, k, rec);
    const d = has(p.id, k);
    const id = `${p.id}:${k}`;
    const isLater = !d && later.has(id);
    const spec = d ? FIELDS[d.type].find((s) => s.key === m.keyField.field) ?? FIELDS[d.type].find((s) => s.key === 'validTo') : undefined;
    const val = d && spec ? showField(d.fields, spec) : '';
    const hint = k === 'i94' && p.facts.lastEntry ? `From the CBP I-94 website · entry ${fmt(p.facts.lastEntry)}` : m.keyField.label === 'Expires' ? 'Expiry date' : m.keyField.label;
    return (
      <View key={id} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.sep }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {d ? <Tick size={24} /> : <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isLater ? t.outline : t.text3, borderStyle: isLater ? 'dashed' : 'solid' }} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <T style={[font.callout, { fontWeight: '600' }]}>{m.title}{!key ? <T tone="text2" style={font.caption}>{'  optional'}</T> : null}</T>
            <T tone="text2" style={font.foot} numberOfLines={2}>{d ? `${m.keyField.label} ${val || 'saved'}` : isLater ? 'Later · add it anytime' : hint}</T>
          </View>
          {isLater ? <Pressable onPress={() => setLater(id, false)} accessibilityRole="button" accessibilityLabel={`Add ${m.title} now`} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 6 }}><T tone="accent" style={[font.sub, { fontWeight: '600' }]}>Add now</T></Pressable> : null}
          {!d && !isLater ? <Pressable onPress={() => setLater(id, true)} accessibilityRole="button" accessibilityLabel={`Later: ${m.title} for ${p.name}`} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 6 }}><T tone="text2" style={[font.sub, { fontWeight: '600' }]}>Later</T></Pressable> : null}
        </View>
        {!d && !isLater ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {([['camera', 'Scan', 'camera', 'Scan with the camera'], ['photo', 'Photo', 'photos', 'Choose a photo'], ['folder', 'File', 'files', 'Upload a file'], ['edit', 'Type', 'type', 'Type dates']] as const).map(([icon, label, src, a11y]) => (
              <Pressable key={label} onPress={() => open(p.id, k, src)} accessibilityRole="button" accessibilityLabel={`${a11y}: ${m.title} for ${p.name}`}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 54, borderRadius: 16, backgroundColor: t.dark ? t.card2 : '#EEEFF2', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                <Icon name={icon} size={18} color={t.text} /><T style={[font.caption, { fontWeight: '600' }]} numberOfLines={1}>{label}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };
  return (
    <View>
      <H1>Add your documents</H1>
      <PhoneOnly />
      <Why>Add what you have now — the rest anytime.</Why>
      <Card style={{ marginTop: 18, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }} accessibilityLiveRegion="polite">
          <T style={font.headline}>{`${prog.added} of ${prog.total} added`}</T>
          <T tone="text2" style={font.foot}>{prog.added === prog.total && prog.total ? 'All key documents' : 'Key documents'}</T>
        </View>
        <Meter value={prog.added} max={Math.max(1, prog.total)} />
      </Card>
      {lists.map(({ p, key, more: rest }) => (
        <Card key={p.id} style={{ marginTop: 12, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Avatar name={p.name} size="sm" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={[font.headline]} numberOfLines={1}>{p.relation === 'self' ? `${p.name} (you)` : p.name}</T>
              <T tone="text2" style={font.foot}>{familyStatusLabel(p.status ?? 'unsure', p.relation)}</T>
            </View>
          </View>
          {key.map((k) => row(p, k, true))}
          {rest.length ? (
            more[p.id] ? rest.map((k) => row(p, k, false)) : (
              <Pressable onPress={() => setMore({ ...more, [p.id]: true })} accessibilityRole="button" accessibilityLabel={`More documents for ${p.name}`} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', borderTopWidth: 1, borderTopColor: t.sep }}>
                <T tone="text2" style={[font.sub, { fontWeight: '600' }]}>{`More documents (${rest.length}, optional)`}</T>
              </Pressable>
            )
          ) : null}
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}><Icon name="lock" size={13} color={t.text2} /><T tone="text2" style={font.caption}>Read on this phone. Your documents are never uploaded.</T></View>
    </View>
  );
}

function CasesStep({ f, toast }: StepCtx) {
  const t = useTheme();
  const [rn, setRn] = useState('');
  const [form, setForm] = useState('I-129');
  const [owner, setOwner] = useState(f.main?.id ?? f.people[0]?.id ?? '');
  const [err, setErr] = useState<string>();
  const add = async () => {
    const r = rn.trim().toUpperCase();
    if (!isReceipt(r)) { setErr('3 letters and 10 numbers, like IOE0912345678.'); return; }
    if (f.caseList.some((c) => c.receipt === r)) { setErr('Already added.'); return; }
    await f.actions.addCase({ receipt: r, form, ownerId: owner, status: 'pending' });
    tap(); setRn(''); setErr(undefined); toast(`${form} added`);
  };
  const steps: [string, string, string][] = [
    ['copy', 'We copy the receipt number', 'Tap Check status on a case.'],
    ['compass', 'uscis.gov opens in Safari', 'Paste it and tap Check Status.'],
    ['doc', 'Copy the result, come back', 'We read the status from what you copied.'],
  ];
  return (
    <View>
      <H1>Any USCIS cases?</H1>
      <Why>Add receipt numbers you know. Cases from the I-797C receipts you added are already here.</Why>
      {f.caseList.length ? (
        <Card style={{ marginTop: 16, paddingVertical: 8 }}>
          {f.caseList.map((c, i) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.sep }}>
              <Tick size={22} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={[font.callout, { fontWeight: '600' }]}>{`${c.form ?? 'Case'} · ${c.receipt ?? ''}`}</T>
                <T tone="text2" style={font.foot}>{f.people.find((p) => p.id === c.ownerId)?.name ?? ''}</T>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      <Field label="Receipt number" value={rn} onChangeText={(x) => { setRn(x.toUpperCase()); setErr(undefined); }} placeholder="IOE0900000000" autoCapitalize="characters" maxLength={13} mono error={err} returnKeyType="done" onSubmitEditing={add} />
      <SelectField label="Form" value={form} onChange={setForm} options={FORMS.filter((x) => x[0] !== 'I-129S').map(([v, n]) => ({ value: v, label: `${v} · ${n}` }))} />
      {f.people.length > 1 ? <Chips>{f.people.map((p) => <ChipToggle key={p.id} size="sm" text={p.name} on={owner === p.id} onPress={() => setOwner(p.id)} />)}</Chips> : null}
      <View style={{ flexDirection: 'row', marginTop: 12 }}><Button kind="tint" icon="plus" title="Add case" disabled={rn.trim().length !== 13} onPress={add} /></View>
      <Label>How checking works</Label>
      <Card style={{ marginTop: 8 }}>
        {steps.map(([icon, title, sub], i) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.pastel[(['sky', 'butter', 'sage'] as const)[i]], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={t.ink} /></View>
            <View style={{ flex: 1 }}><T style={font.headline}>{`${i + 1}. ${title}`}</T><T tone="text2" style={font.foot}>{sub}</T></View>
          </View>
        ))}
        <Hint>USCIS has no public status API for apps, so the check happens on uscis.gov. Your receipt numbers stay on this phone.</Hint>
      </Card>
    </View>
  );
}

// ---- alerts: explain first, then the system permission (the button) ----
const STEP_REMINDER: Partial<Record<StepKey, ReminderType>> = { passport: 'passport', visa: 'visa', i94: 'i94', approval: 'approval', ead: 'ead', combo: 'ead', ap: 'ap', gc: 'gc' };
function useFamilyItems(f: FamilyState) {
  return useMemo(() => reminderItems(f.people, f.records, f.results, []), [f.people, f.records, f.results]);
}
function AlertsStep({ f }: StepCtx) {
  const t = useTheme();
  const items = useFamilyItems(f);
  const first = items[0];
  const me = f.main;
  // the types the family has dates for, plus the ones their document checklists will bring
  const kinds: ReminderType[] = (() => {
    const s = new Set<ReminderType>();
    for (const p of f.people) {
      for (const k of typesFor(f.records[p.id], false)) s.add(k);
      for (const k of docChecklist(p, f.records[p.id]).key) { const ty = STEP_REMINDER[k]; if (ty) s.add(ty); }
    }
    return REMINDER_TYPES.map((x) => x.key).filter((k) => s.has(k));
  })();
  const onFor = (k: ReminderType) => f.people.every((p) => typeSetting(p.reminders, k).on);
  const toggle = async (k: ReminderType, on: boolean) => {
    tap();
    for (const p of f.people) {
      const rm = p.reminders ?? { on: true, lead: f.settings.reminderLeadDays };
      await f.actions.updatePerson(p.id, { reminders: { ...rm, types: { ...(rm.types ?? {}), [k]: { on, lead: typeSetting(rm, k).lead } } } });
    }
  };
  const sample = first ? { title: first.title, body: first.body } : { title: `${me?.name?.split(' ')[0] ?? 'You'}: passport expires`, body: 'Oct 5, 2034 — in 180 days. Open Immigration Wallet to see what to do.' };
  return (
    <View>
      <H1>Get alerts before dates</H1>
      <Why>Reminders are worked out on this phone. Nothing about you is sent to us.</Why>
      <Appear style={{ marginTop: 18 }}>
        <View accessibilityLabel={`Example alert: ${sample.title}. ${sample.body}`} style={{ backgroundColor: t.dark ? '#2A2B2E' : '#FFFFFF', borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: t.dark ? 0 : 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.pastel.sage, alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={20} color={t.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={[font.foot, { fontWeight: '600' }]} numberOfLines={1}>{sample.title}</T><T tone="text2" style={font.caption}>9:00</T></View>
            <T tone="text2" style={font.foot} numberOfLines={2}>{sample.body}</T>
          </View>
        </View>
        <Hint center>{first ? 'Your next reminder' : 'An example'}</Hint>
      </Appear>
      <Label>Remind me about</Label>
      <Card style={{ marginTop: 8, paddingVertical: 4 }}>
        {kinds.map((k, i) => {
          const def = TYPE_DEFAULT[k];
          const ty = REMINDER_TYPES.find((x) => x.key === k)!;
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.sep }}>
              <View style={{ flex: 1 }}>
                <T style={[font.callout, { fontWeight: '600' }]}>{ty.title}</T>
                <T tone="text2" style={font.foot}>{`${def.join(', ')} days before`}</T>
              </View>
              <Switch value={onFor(k)} label={ty.title} onValueChange={(on) => toggle(k, on)} />
            </View>
          );
        })}
      </Card>
      <Hint>Case status changes and the new Visa Bulletin each month too. Change any of this in Settings.</Hint>
    </View>
  );
}
function AlertsButtons({ perm, onDone }: { perm: string | null; onDone: () => void }) {
  const f = useFamily(); const toast = useToast();
  const mark = () => f.actions.updateSettings({ notifAskedAt: new Date().toISOString() }).catch(() => {});
  if (perm === 'denied') return <><Button kind="ghost" title="Not now" onPress={() => { mark(); onDone(); }} /><Button grow title="Open Settings" onPress={() => { openNotificationSettings(); mark(); onDone(); }} /></>;
  if (perm === 'unavailable') return <Button grow title="Next" onPress={() => { toast('Alerts work in the Immigration Wallet app on your phone'); mark(); onDone(); }} />;
  return (
    <>
      <Button kind="ghost" title="Not now" onPress={() => { mark(); onDone(); }} />
      <Button grow title="Turn on alerts" onPress={async () => { await mark(); const ok = await askNotificationPermission(); toast(ok ? 'Alerts on' : 'Alerts off · turn them on in Settings anytime'); onDone(); }} />
    </>
  );
}

function ProtectStep({ f, toast }: StepCtx) {
  const sheet = useSheet();
  const sup = useICloudSupport();
  const [bio, setBio] = useState<boolean | null>(null);
  useEffect(() => { canUseBiometrics().then(setBio).catch(() => setBio(false)); }, []);
  const ic = icloudSettings(f.settings);
  const faceId = async (on: boolean) => {
    tap();
    if (on && !bio) { toast('Set up Face ID or a passcode in the system settings first'); return; }
    if (on && !(await authenticate('Turn on Face ID lock'))) return;
    await f.actions.updateSettings({ faceId: on, hideInSwitcher: on }); toast(on ? 'Face ID on' : 'Face ID off');
  };
  return (
    <View>
      <H1>Keep it private and safe</H1>
      <Why>Your documents live only on this phone. Lock them, and keep a copy only you can open.</Why>
      <Card style={{ marginTop: 18, paddingVertical: 6 }}>
        <ProtectRow icon="face" tone="sage" title="Face ID lock" sub={bio === false ? 'Set up Face ID or a passcode on this phone first' : 'Asks for Face ID when you open the app and hides documents in the app switcher.'}
          right={<Switch value={!!f.settings.faceId} label="Face ID lock" onValueChange={faceId} />} />
        <ProtectRow icon="backup" tone="sky" title="iCloud backup" first={false}
          sub={!sup ? 'Checking iCloud…' : sup.ok ? (ic.on ? 'On · daily and after changes, locked with your password' : 'A locked copy in your iCloud every day. Only you can open it.') : Platform.OS === 'ios' ? supportText(sup) : 'On this phone, back up to a file from Settings → Backup.'}
          right={sup?.ok ? <Switch value={ic.on} label="iCloud backup" onValueChange={async (on) => { tap(); if (on) { sheet.open('Turn on iCloud backup', <ICloudPasswordSheet mode="enable" />); return; } await f.actions.updateSettings({ icloud: { ...ic, on: false } }); await forgetPassword(); toast('iCloud backup off'); }} /> : undefined} />
      </Card>
    </View>
  );
}
function ProtectRow({ icon, tone, title, sub, right, first = true }: { icon: string; tone: PastelTone; title: string; sub: string; right?: React.ReactNode; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: t.sep }}>
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} color={t.ink} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><T style={[font.callout, { fontWeight: '600' }]}>{title}</T><T tone="text2" style={font.foot}>{sub}</T></View>
      {right}
    </View>
  );
}

function DoneStep({ f }: StepCtx) {
  const t = useTheme();
  const me = f.main;
  const rows = f.people.flatMap((p) => docChecklist(p, f.records[p.id]).key.map((k) => ({ pid: p.id, k })));
  const prog = docProgress(rows, (pid, k) => { const p = f.people.find((x) => x.id === pid)!; const m = stepMeta(p, k, f.records[pid]); return f.docs.some((d) => d.ownerId === pid && fillsStep(m, d)); });
  const dates = f.people.flatMap((p) => { const d = typeDates(f.records[p.id]); return REMINDER_TYPES.filter((x) => x.key !== 'cases').map((x) => ({ name: p.name, what: x.title, date: d[x.key] })); });
  const nd = nextDeadline(dates, today());
  const pop = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => { if (reduce) pop.setValue(1); else Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: Platform.OS !== 'web' }).start(); }, [pop, reduce]);
  return (
    <View>
      <Animated.View style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
        <Pastel tone="good" style={{ marginTop: 8 }} pad={22}>
          <Tick size={52} />
          <T a11y="header" style={[font.title, { marginTop: 16 }]}>{`You’re all set${me ? `, ${me.name.split(' ')[0]}` : ''}`}</T>
          <T style={[font.sub, { marginTop: 4 }]}>Saved on this phone. Add or change anything from Home.</T>
          <View style={{ marginTop: 18, gap: 12 }}>
            <SummaryLine icon="users" label="People" value={`${f.people.length}`} extra={<View style={{ flexDirection: 'row', gap: 4 }}>{f.people.slice(0, 4).map((p) => <Avatar key={p.id} name={p.name} size="sm" tone="sky" />)}</View>} />
            <SummaryLine icon="doc" label="Documents added" value={`${prog.added} of ${prog.total}`} />
            <SummaryLine icon="cal" label="Next date" value={nd ? `${nd.what} · ${fmt(nd.date)}` : 'Add documents to see dates'} sub={nd && f.people.length > 1 ? nd.name : undefined} />
          </View>
        </Pastel>
      </Animated.View>
      <View style={{ marginTop: 22, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <IconTileSmall icon="play" tone="sky" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={font.headline}>Want a quick look around?</T>
          <T tone="text2" style={[font.sub, { marginTop: 3 }]}>A 1-minute tour opens each screen and shows where things are: your status card, documents, cases, the widget and the Wallet card.</T>
        </View>
      </View>
      <Hint center style={{ marginTop: 14 }}>General information, not legal advice.</Hint>
    </View>
  );
}

function IconTileSmall({ icon, tone }: { icon: string; tone: 'sky' | 'sage' | 'butter' | 'blush' | 'mint' }) {
  const t = useTheme();
  return <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={t.ink} /></View>;
}
function SummaryLine({ icon, label, value, sub, extra }: { icon: string; label: string; value: string; sub?: string; extra?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={t.text} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T tone="text2" style={font.caption}>{label}</T>
        <T style={font.headline} numberOfLines={2}>{value}</T>
        {sub ? <T tone="text2" style={font.caption}>{sub}</T> : null}
      </View>
      {extra}
    </View>
  );
}

// ---------- wide screens: a live preview next to the step ----------
const PREVIEW: Record<SetupStep, [string, PastelTone, string]> = {
  welcome: ['shield', 'sage', ''], you: ['user', 'sky', 'Names are labels. Legal names come from passports.'], where: ['globe', 'sage', 'In the US you have an I-94. Outside, travel documents matter.'],
  status: ['idcard', 'butter', 'Your status decides which documents and checks you see.'], details: ['list', 'butter', 'One detail that changes which documents apply.'],
  work: ['building', 'sky', 'H-1B work sites tie to a metro area.'], gc: ['card', 'mint', 'The family follows the main applicant’s PERM and I-140.'],
  family: ['users', 'blush', 'Dependents’ dates follow the main applicant.'], docs: ['doc', 'sky', 'Read on this phone. Never uploaded.'],
  cases: ['clock', 'butter', 'Receipts stay on this phone.'], alerts: ['bell', 'butter', 'Reminders at the times each document needs.'],
  protect: ['lock', 'sage', 'Face ID and a backup only you can open.'], done: ['checkc', 'sage', 'Everything is saved on this phone.'],
};
function SetupPreview({ step, a }: { step: SetupStep; a: Answers }) {
  const t = useTheme();
  const f = useFamily();
  const name = [a.first.trim(), a.last.trim()].filter(Boolean).join(' ');
  const [icon, tone, line] = PREVIEW[step];
  const st = a.status ? STATUS_LABEL[a.status] : 'Status';
  const rows = f.people.flatMap((p) => docChecklist(p, f.records[p.id]).key.map((k) => ({ pid: p.id, k })));
  const prog = docProgress(rows, (pid, k) => { const p = f.people.find((x) => x.id === pid)!; const m = stepMeta(p, k, f.records[pid]); return f.docs.some((d) => d.ownerId === pid && fillsStep(m, d)); });
  const fam = a.family.filter((d) => d.name.trim());
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 420 }}>
        <Pastel tone="sky" pad={22}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={name || 'You'} tone="sage" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={font.big} numberOfLines={1}>{name || 'Your name'}</T>
              <T style={font.foot}>{[st, a.where === 'Outside' ? `In ${a.country}` : a.where === 'US' ? 'In the US' : undefined].filter(Boolean).join(' · ')}</T>
            </View>
          </View>
          {a.place.trim() ? <T style={[font.foot, { marginTop: 12 }]} numberOfLines={1}>{a.place.trim()}</T> : null}
          {fam.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {fam.map((d) => <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.fill, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}><T style={font.caption}>{`${d.name.split(' ')[0]} · ${familyStatusLabel(d.status, d.relation)}`}</T></View>)}
            </View>
          ) : null}
          {rows.length && SETUP_ORDER.indexOf(step) >= SETUP_ORDER.indexOf('docs') ? <View style={{ marginTop: 14 }}><T style={font.caption}>{`Documents · ${prog.added} of ${prog.total}`}</T><Meter value={prog.added} max={Math.max(1, prog.total)} /></View> : null}
        </Pastel>
        <View style={{ alignItems: 'center', marginTop: 28 }}>
          <View style={{ width: 110, height: 110, borderRadius: 40, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={48} color={t.ink} /></View>
          {line ? <T tone="text2" style={[font.sub, { textAlign: 'center', marginTop: 16, maxWidth: 320 }]}>{line}</T> : null}
        </View>
      </View>
    </View>
  );
}

// ---------- welcome: three value slides with page dots ----------
const SLIDES: [string, PastelTone, string, string][] = [
  ['users', 'sage', 'Your family’s status in one place', 'How long everyone can stay, which document proves it, and what to do next.'],
  ['doc', 'sky', 'Documents read on your phone', 'Scan a passport, I-94 or approval. The dates are read on this phone — nothing is uploaded.'],
  ['bell', 'butter', 'Alerts before dates', 'Reminders well before passports, I-94s, approvals and work permits end.'],
];
function WelcomeStep({ onStart }: { onStart: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const goTo = (k: number) => { if (!box) return; tap(); ref.current?.scrollTo({ x: k * box.w, animated: true }); setI(k); };
  const short = (box?.h ?? 600) < 330;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: t.pastel.sage, alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={16} color={t.ink} /></View>
        <T a11y="header" style={font.headline}>Immigration Wallet</T>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box ? (
          <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: box.w, height: box.h }}
            onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w))} onScroll={Platform.OS === 'web' ? (e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w)) : undefined} scrollEventThrottle={64}>
            {SLIDES.map(([icon, tone, title, sub], k) => (
              <View key={title} accessibilityLabel={`${title}. ${sub}. Page ${k + 1} of ${SLIDES.length}`} style={{ width: box.w, height: box.h, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
                <View style={{ width: short ? 96 : 150, height: short ? 96 : 150, borderRadius: short ? 34 : 54, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center', marginBottom: short ? 16 : 30 }}><Icon name={icon} size={short ? 44 : 64} color={t.ink} /></View>
                <T style={[font.title, { textAlign: 'center', maxWidth: Math.min(box.w - 64, 460) }]}>{title}</T>
                <T tone="text2" style={[font.body, { textAlign: 'center', marginTop: 10, maxWidth: Math.min(box.w - 64, 420), lineHeight: 24 }]}>{sub}</T>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', paddingVertical: 6 }}>
        {SLIDES.map((s, k) => (
          <Pressable key={k} onPress={() => goTo(k)} accessibilityRole="button" accessibilityLabel={`Page ${k + 1}: ${s[2]}`} accessibilityState={{ selected: k === i }} hitSlop={8} style={{ padding: 6 }}>
            <View style={{ width: k === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? t.text : t.outline }} />
          </Pressable>
        ))}
      </View>
      <Footer column>
        <Button title="Get started" onPress={onStart} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <Button kind="ghost" size="sm" icon="download" title="I have a shared file" onPress={() => router.push('/share-import' as never)} />
          <Button kind="ghost" size="sm" icon="restore" title="Restore a backup" onPress={() => router.push('/restore' as never)} />
          {Platform.OS === 'ios' ? <Button kind="ghost" size="sm" icon="backup" title="iCloud" label="Restore from iCloud" onPress={() => router.push('/restore-icloud' as never)} /> : null}
        </View>
        <Pressable onPress={() => router.push('/demo' as never)} accessibilityRole="button" accessibilityLabel="Look around with an example family" style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <T tone="text2" style={[font.foot, { textAlign: 'center', fontWeight: '600' }]}>Look around with an example family</T>
        </Pressable>
        <Pressable onPress={() => router.push('/about' as never)} accessibilityRole="link" accessibilityLabel={`${DISCLAIMER_LINE} Read more`} style={{ minHeight: 32, justifyContent: 'center' }}>
          <T tone="text2" style={[font.caption, { textAlign: 'center' }]}>{DISCLAIMER_LINE} <T tone="accent" style={[font.caption, { fontWeight: '600' }]}>Read more</T></T>
        </Pressable>
      </Footer>
    </View>
  );
}
