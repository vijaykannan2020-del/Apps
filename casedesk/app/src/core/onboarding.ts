// v3.0 onboarding: which steps apply, progress, resume, where the app opens, and the suggestions the
// steps make. Pure (no React Native) — tested in tests/onboarding.test.ts.
//
// Order (one question per screen; steps that don't apply are skipped and not counted):
//   welcome → you → where → status → details → work → gc → family → docs → cases → alerts → protect → done
// Why this order: status decides every later branch, so it comes before work / green card / family;
// documents come after family so the checklist covers everyone; cases come after documents because
// receipts read from I-797Cs are already cases; alerts come after documents so the preview can show a
// real upcoming date; protect is last because a lock and a backup matter once there is data.
import type { Person, Relation, Settings, StatusCategory } from './model';
import { dependentStatusFor, STATUS_LABEL } from './model';
import type { PersonRecord } from './record';
import { gcLocalStage, isOptionalStep, stepKeys, type StepKey } from './steps';

export type SetupStep = 'welcome' | 'you' | 'where' | 'status' | 'details' | 'work' | 'gc' | 'family' | 'docs' | 'cases' | 'alerts' | 'protect' | 'done';
export const SETUP_ORDER: SetupStep[] = ['welcome', 'you', 'where', 'status', 'details', 'work', 'gc', 'family', 'docs', 'cases', 'alerts', 'protect', 'done'];

/** Steps that may be skipped ("Skip for now"). The rest need an answer (or have their own Not now). */
export const OPTIONAL_STEPS: SetupStep[] = ['work', 'gc', 'family', 'docs', 'cases', 'protect'];

/** Work visas (and OPT, which is work on F-1): employer and work location are asked. */
export const WORK_STATUSES: StatusCategory[] = ['H-1B', 'L-1A', 'L-1B', 'L-1', 'TN', 'E-3', 'O-1', 'F-1 OPT', 'STEM OPT'];
/** Statuses where a green card process is common (dual intent and their dependents), plus applicants. */
export const GC_STATUSES: StatusCategory[] = ['H-1B', 'L-1A', 'L-1B', 'L-1', 'TN', 'E-3', 'O-1', 'H-4', 'L-2', 'green-card-applicant'];
/** Statuses with a follow-up question: blanket L, OPT or STEM OPT, H-4 EAD. */
export const DETAIL_STATUSES: StatusCategory[] = ['L-1A', 'L-1B', 'L-1', 'F-1', 'F-1 OPT', 'STEM OPT', 'H-4'];

export type SetupCtx = {
  status?: StatusCategory; // the main person's status (picked in this setup, or saved)
  rerun?: boolean; // Run setup again: no welcome slides
  locationFromDocs?: boolean; // an I-94 is saved: the documents already say where they are
  notif?: 'granted' | 'denied' | 'undetermined' | 'unavailable'; // notification permission
};

export function applies(s: SetupStep, c: SetupCtx): boolean {
  const st = c.status;
  switch (s) {
    case 'welcome': return !c.rerun;
    case 'where': return !c.locationFromDocs;
    case 'details': return !!st && DETAIL_STATUSES.includes(st);
    case 'work': return !!st && WORK_STATUSES.includes(st);
    case 'gc': return !!st && GC_STATUSES.includes(st);
    case 'alerts': return c.notif !== 'granted';
    default: return true;
  }
}

/** The steps this person walks, in order. */
export const setupSteps = (c: SetupCtx): SetupStep[] => SETUP_ORDER.filter((s) => applies(s, c));

/** Steps the progress bar counts (the welcome slides and the summary are not questions). */
export const countedSteps = (steps: SetupStep[]): SetupStep[] => steps.filter((s) => s !== 'welcome' && s !== 'done');

/** "Step 3 of 9" for the bar. Welcome = 0, Done = total. */
export function setupProgress(cur: SetupStep, steps: SetupStep[]): { at: number; total: number } {
  const counted = countedSteps(steps);
  if (cur === 'done') return { at: counted.length, total: counted.length };
  return { at: Math.max(0, counted.indexOf(cur) + 1), total: counted.length };
}

const ord = (s: SetupStep) => SETUP_ORDER.indexOf(s);
/** Next / previous by the fixed order, so a step that stopped applying mid-way (permission granted, status changed) never strands the user. */
export const nextStep = (cur: SetupStep, steps: SetupStep[]): SetupStep => steps.find((s) => ord(s) > ord(cur)) ?? 'done';
export const prevStep = (cur: SetupStep, steps: SetupStep[]): SetupStep | undefined => [...steps].reverse().find((s) => ord(s) < ord(cur));

/** Where to pick up: the saved step, or (when it no longer applies, e.g. the status changed) the next one that does. */
export function resumeStep(stored: string | undefined, steps: SetupStep[], hasSelf: boolean): SetupStep {
  const first = steps.find((s) => s !== 'welcome') ?? 'you';
  if (!stored) return steps[0] ?? first;
  if (!hasSelf) return stored === 'welcome' && steps.includes('welcome') ? 'welcome' : 'you';
  if (steps.includes(stored as SetupStep)) return stored as SetupStep;
  const i = SETUP_ORDER.indexOf(stored as SetupStep);
  if (i < 0) return first;
  return steps.find((s) => SETUP_ORDER.indexOf(s) >= i) ?? 'done';
}

/** Where the app opens: Home once setup is done (or put off with Finish later), else the onboarding. */
export function startRoute(s: Pick<Settings, 'setupDone' | 'setup'>, people: number): 'home' | 'onboarding' {
  if (people > 0 && (s.setupDone || s.setup?.later)) return 'home';
  return 'onboarding';
}

/** Home's "Continue setup" card: setup started, not finished, not dismissed. */
export const showContinueCard = (s: Pick<Settings, 'setupDone' | 'setup'>, people: number) => people > 0 && !s.setupDone && !!s.setup && !s.setup.dismissed;

/** Settings → Run setup again: progress for a rerun (keeps data). */
export const rerunProgress = (): NonNullable<Settings['setup']> => ({ step: 'you', rerun: true, at: new Date().toISOString() });

// ---- suggestions ----

/** A dependent's principal, when YOU are the dependent (H-4 → your spouse is on H-1B). */
const PRINCIPAL_FOR: Partial<Record<StatusCategory, StatusCategory>> = { 'H-4': 'H-1B', 'L-2': 'L-1', 'F-2': 'F-1', 'J-2': 'J-1' };

/** Status suggested for a family member from yours (editable): L-2 (shown L-2S) for the spouse of an L-1, H-4 for H-1B… */
export function suggestStatus(main: StatusCategory | undefined, relation: Relation): StatusCategory {
  if (main && relation === 'spouse' && PRINCIPAL_FOR[main]) return PRINCIPAL_FOR[main]!;
  if (main && relation === 'child' && PRINCIPAL_FOR[main]) return main;
  return dependentStatusFor(main, relation);
}

/** Label for a family member's status (a spouse on L-2 is L-2S). */
export const familyStatusLabel = (st: StatusCategory, relation: Relation) => (st === 'L-2' && relation === 'spouse' ? 'L-2S' : STATUS_LABEL[st]);

// ---- documents ----

/** The checklist for one person: key documents first, the rest under "More". "where" is never a document. */
export function docChecklist(p: Person, rec?: PersonRecord): { key: StepKey[]; more: StepKey[] } {
  const all = stepKeys(p, rec).filter((k) => k !== 'where');
  const ead = !!p.facts?.hasEad;
  const c9 = p.facts?.gc?.workOn === 'ead';
  const i485 = gcLocalStage(p, rec) === 'i485';
  const key = all.filter((k) => !isOptionalStep(p, k, rec) || (k === 'ead' && ead) || (k === 'combo' && c9) || (k === 'i485' && i485));
  return { key, more: all.filter((k) => !key.includes(k)) };
}

/** "3 of 7 added" across everyone. `has(pid, k)` = a saved document fills that row. */
export function docProgress(rows: { pid: string; k: StepKey }[], has: (pid: string, k: StepKey) => boolean) {
  return { added: rows.filter((r) => has(r.pid, r.k)).length, total: rows.length };
}

// ---- green card ----
export type GcAnswer = 'none' | 'perm' | 'i140' | 'i485' | 'approved';
export const GC_ANSWERS: { key: GcAnswer; title: string; sub: string }[] = [
  { key: 'none', title: 'Not started', sub: 'No PERM or I-140 yet' },
  { key: 'perm', title: 'PERM in process', sub: 'Labor certification filed or certified' },
  { key: 'i140', title: 'I-140 approved', sub: 'Waiting for the priority date' },
  { key: 'i485', title: 'I-485 filed', sub: 'Adjustment of status pending' },
  { key: 'approved', title: 'Approved', sub: 'Green card approved' },
];

/** The answer as saved facts (typed answers never replace what documents show: gc.ts and steps.ts read them last). */
export function gcFactsFor(a: GcAnswer, prev: Person['facts'], extra: { category?: NonNullable<Person['facts']['gc']>['category']; priorityDate?: string; workOn?: 'status' | 'ead' } = {}): Partial<Person['facts']> {
  const gc = { ...(prev.gc ?? {}) };
  delete gc.stage;
  if (a === 'perm' || a === 'i140' || a === 'i485') gc.stage = a;
  if (a === 'i140' || a === 'i485') { if (extra.category) gc.category = extra.category; if (extra.priorityDate) gc.priorityDate = extra.priorityDate; }
  if (a === 'i485' && extra.workOn) gc.workOn = extra.workOn;
  return { greenCardStarted: a !== 'none' && a !== 'approved' ? true : a === 'none' ? undefined : prev.greenCardStarted, gc };
}

/** The saved answer, for prefilling a rerun. */
export function gcAnswerOf(p?: Person): GcAnswer | undefined {
  const f = p?.facts;
  if (!f) return undefined;
  if (f.gc?.stage) return f.gc.stage;
  if (f.greenCardStarted) return 'perm';
  return undefined;
}

/** The next date that matters across the family (summary card): soonest future date from the records. */
export function nextDeadline(items: { name: string; what: string; date?: string }[], today: string): { name: string; what: string; date: string } | undefined {
  return items.filter((x): x is { name: string; what: string; date: string } => !!x.date && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
}
