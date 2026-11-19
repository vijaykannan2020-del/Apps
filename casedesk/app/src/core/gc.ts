// Green-card track (v2.9), separate from the current stay. Pure — tested in tests/gc.test.ts.
//
// The family follows the principal's PERM and I-140 (category, priority date, country of
// chargeability). Each person has their own I-485, EAD (C9), advance parole, biometrics, medical
// (I-693), interview and green card. Stages:
//   not-started → PERM → I-140 → waiting for the priority date → I-485 pending → interview → approved
// Nothing here is legal advice; screens say so next to every "what happens next".
import { addDays, daysBetween, daysTo, fmt, today, type ISODate } from './dates';
import type { Person } from './model';
import type { CaseInfo, PersonRecord } from './record';
import { birthCountryOf, birthLabel, chargeabilityOf } from './birth';
import { PASTEL } from '../ui/tokens';
import { categoryOf, countryOf, cutoff, isCurrent, monthStart, type BulletinCell, type BulletinCountry, type BulletinRow, type VisaBulletin } from './bulletin';

export type GcStage = 'not-started' | 'perm' | 'i140' | 'waiting' | 'i485' | 'interview' | 'approved';
export const GC_STAGES: { key: Exclude<GcStage, 'not-started'>; title: string; sub: string }[] = [
  { key: 'perm', title: 'PERM labor certification', sub: 'The employer tests the job market with the Department of Labor.' },
  { key: 'i140', title: 'I-140 immigrant petition', sub: 'The employer files with USCIS. The PERM filing date becomes the priority date.' },
  { key: 'waiting', title: 'Wait for the priority date', sub: 'Each month the Visa Bulletin shows which dates can file and which can be approved.' },
  { key: 'i485', title: 'I-485 pending', sub: 'Each person files their own I-485, with the EAD (I-765) and advance parole (I-131).' },
  { key: 'interview', title: 'Interview', sub: 'USCIS may interview the family at a field office, or decide without one.' },
  { key: 'approved', title: 'Green card', sub: 'The card comes by mail. “Resident since” starts the citizenship clock.' },
];
export const STAGE_LABEL: Record<GcStage, string> = {
  'not-started': 'Not started', perm: 'PERM', i140: 'I-140', waiting: 'Waiting for the priority date', i485: 'I-485 pending', interview: 'Interview', approved: 'Green card approved',
};
const ORDER: GcStage[] = ['not-started', 'perm', 'i140', 'waiting', 'i485', 'interview', 'approved'];
export const stageIndex = (s: GcStage) => ORDER.indexOf(s);

export const COUNTRY_LABEL: Record<BulletinCountry, string> = { all: 'All other countries', china: 'China (mainland born)', india: 'India', mexico: 'Mexico', philippines: 'Philippines' };

type Who = { person: Person; rec: PersonRecord };

export type GcBulletin = {
  month: string;
  chart: 'final' | 'filing'; // the chart USCIS uses for I-485 filing this month
  final?: BulletinCell; // final action date (approval)
  filing?: BulletinCell; // date for filing
  canFile: boolean; // priority date earlier than the chart USCIS uses this month
  canApprove: boolean; // priority date earlier than the final action date
  movedBack: boolean; // final action date retrogressed past the priority date since last month
};

export type GcTrack = {
  personId: string;
  ownerId: string; // whose PERM / I-140 this follows
  derivative: boolean; // follows someone else's case
  stage: GcStage;
  started: boolean;
  category?: string; // 'EB-2'
  priorityDate?: ISODate;
  pdFrom?: 'i140' | 'perm' | 'typed';
  country: BulletinCountry;
  countryFrom: 'picked' | 'birth' | 'passport' | 'default'; // birth = the principal's country of birth (typed or printed on a document)
  birthCountry?: string; // the principal's country of birth (ISO-3 / OTH) when known
  perm?: PersonRecord['perm'];
  i140?: CaseInfo;
  i485?: CaseInfo; // this person's own
  i765?: CaseInfo; i131?: CaseInfo;
  ead?: PersonRecord['ead'];
  advanceParole?: PersonRecord['advanceParole'];
  biometrics?: ISODate;
  interview?: ISODate;
  medical?: PersonRecord['medical'];
  approvedOn?: ISODate;
  residentSince?: ISODate;
  bulletin?: GcBulletin;
  pendingDays?: number; // I-485 pending this many days
  next: string[]; // what happens next (plain lines)
};

/** A form's cases from receipts and approvals (biometrics / interview notices carry the form too, but aren't the case itself). */
const has = (r: PersonRecord, form: string) => r.cases.filter((c) => c.form === form && (!c.noticeKind || c.noticeKind === 'rfe' || c.noticeKind === 'noid' || c.noticeKind === 'denial'));
const latest = (cs: CaseInfo[]) => [...cs].sort((a, b) => (b.noticeDate ?? b.received ?? '').localeCompare(a.noticeDate ?? a.received ?? ''))[0];
/** A form's case, approved first, then pending (denied ones last). */
const best = (cs: CaseInfo[]) => cs.find((c) => c.status === 'approved') ?? latest(cs.filter((c) => c.status === 'pending')) ?? latest(cs);
const ownsCase = (w: Who) => !!w.rec.perm || has(w.rec, 'I-140').length > 0;

/** Whose green-card case a person follows: picked, their own, else the main person's. */
export function gcOwnerOf(me: Who, all: Who[]): Who {
  const pick = me.person.facts?.gc?.followsId;
  if (pick) { const x = all.find((w) => w.person.id === pick); if (x) return x; }
  if (ownsCase(me)) return me;
  if (me.person.relation === 'spouse' || me.person.relation === 'child') {
    const others = all.filter((w) => w.person.id !== me.person.id);
    return others.find((w) => w.person.relation === 'self' && ownsCase(w)) ?? others.find((w) => ownsCase(w)) ?? others.find((w) => w.person.relation === 'self') ?? me;
  }
  return me;
}

export function gcBulletin(pd: ISODate | undefined, cat: string | undefined, country: BulletinCountry, b?: VisaBulletin): GcBulletin | undefined {
  if (!b || !cat) return undefined;
  const final = cutoff(b.rows, cat, country, 'final');
  const filing = cutoff(b.rows, cat, country, 'filing');
  if (final === undefined && filing === undefined) return undefined;
  const used = b.uscisChart === 'filing' ? filing : final;
  const before = b.previous ? cutoff(b.previous.rows, cat, country, 'final') : undefined;
  return {
    month: b.month, chart: b.uscisChart, final, filing,
    canFile: !!pd && isCurrent(pd, used), canApprove: !!pd && isCurrent(pd, final),
    movedBack: !!pd && !isCurrent(pd, final) && isCurrent(pd, before),
  };
}

/** The person's green-card track. undefined only for US citizens. */
export function gcTrackOf(me: Who, all: Who[], bulletin?: VisaBulletin): GcTrack | undefined {
  const { person: p, rec: r } = me;
  if (r.visa === 'US citizen' || p.status === 'citizen') return undefined;
  const owner = gcOwnerOf(me, all);
  const o = owner.rec;
  const gcf = { ...(owner.person.facts?.gc ?? {}), ...(p.facts?.gc ?? {}) };
  const i140 = best(has(o, 'I-140'));
  const i485 = best(has(r, 'I-485'));
  const i765 = best(has(r, 'I-765').filter((c) => !c.category || c.category === 'C9'));
  const i131 = best(has(r, 'I-131'));
  const interviewCase = r.cases.filter((c) => c.noticeKind === 'interview' && c.appointmentDate && (!c.form || c.form === 'I-485')).sort((a, b) => (b.appointmentDate ?? '').localeCompare(a.appointmentDate ?? ''))[0];
  const bio = r.cases.filter((c) => c.noticeKind === 'biometrics' && c.appointmentDate && (!c.form || ['I-485', 'I-765', 'I-131'].includes(c.form))).sort((a, b) => (b.appointmentDate ?? '').localeCompare(a.appointmentDate ?? ''))[0];

  const category = categoryOf(i140?.category) ?? gcf.category;
  let priorityDate: ISODate | undefined, pdFrom: GcTrack['pdFrom'];
  if (i140?.priorityDate) { priorityDate = i140.priorityDate; pdFrom = 'i140'; }
  else if (o.perm?.filed) { priorityDate = o.perm.filed; pdFrom = 'perm'; }
  else if (gcf.priorityDate) { priorityDate = gcf.priorityDate; pdFrom = 'typed'; }
  // Chargeability: an explicit pick wins; else the principal's country of birth (a derivative is charged to the
  // principal's country); else the passport nationality.
  const picked = p.facts?.gc?.chargeability ?? owner.person.facts?.gc?.chargeability;
  const born = birthCountryOf(owner.person.facts?.birthCountry, o);
  const bornKnown = born && born.from !== 'nationality' ? born : undefined;
  const nat = o.nationality ?? r.nationality;
  const country: BulletinCountry = picked ?? (bornKnown ? chargeabilityOf(bornKnown.code) : countryOf(nat));
  const countryFrom: GcTrack['countryFrom'] = picked ? 'picked' : bornKnown ? 'birth' : nat ? 'passport' : 'default';

  const approved = !!r.greenCard || i485?.status === 'approved';
  let stage: GcStage = 'not-started';
  if (approved) stage = 'approved';
  else if (i485 && i485.status !== 'denied') stage = interviewCase ? 'interview' : 'i485';
  else if (i140?.status === 'approved' || (pdFrom === 'typed' && category)) stage = 'waiting';
  else if (i140) stage = 'i140';
  else if (o.perm || owner.person.facts?.greenCardStarted || p.facts?.greenCardStarted || p.status === 'green-card-applicant' || owner.person.status === 'green-card-applicant' || gcf.category) stage = 'perm';
  // v3.0 setup answer: only while no PERM, I-140 or I-485 document says how far it is (documents win).
  if (!approved && !i140 && !i485 && !o.perm && (stage === 'not-started' || stage === 'perm' || stage === 'waiting') && gcf.stage) stage = gcf.stage === 'i485' ? 'i485' : gcf.stage === 'i140' ? 'waiting' : 'perm';
  if (r.visa === 'Green card' || r.visa === 'Conditional green card') stage = 'approved';

  const t: GcTrack = {
    personId: p.id, ownerId: owner.person.id, derivative: owner.person.id !== p.id, stage, started: stage !== 'not-started',
    category, priorityDate, pdFrom, country, countryFrom, birthCountry: born?.code, perm: o.perm, i140, i485, i765, i131,
    ead: r.ead, advanceParole: r.advanceParole, biometrics: bio?.appointmentDate, interview: interviewCase?.appointmentDate, medical: r.medical,
    approvedOn: i485?.status === 'approved' ? i485.noticeDate : undefined, residentSince: r.greenCard?.residentSince,
    bulletin: stage === 'approved' ? undefined : gcBulletin(priorityDate, category, country, bulletin),
    pendingDays: i485?.status === 'pending' && i485.received ? Math.max(0, -(daysTo(i485.received) ?? 0)) : undefined,
    next: [],
  };
  t.next = nextSteps(t, owner.person.name, p.relation === 'self');
  return t;
}

/** What happens next, in plain words (two or three lines). */
export function nextSteps(t: GcTrack, ownerName: string, self: boolean): string[] {
  const whose = t.derivative ? `${ownerName}’s` : self ? 'your' : 'the';
  const b = t.bulletin;
  switch (t.stage) {
    case 'not-started': return ['Nothing filed yet. The employer starts with the prevailing wage and PERM (Department of Labor).', 'Add the PERM or I-140 when you have it — the priority date and category come from them.'];
    case 'perm': return [
      t.perm?.expires && (daysTo(t.perm.expires) ?? -1) >= 0 ? `The employer must file the I-140 by ${fmt(t.perm.expires)} (180 days after certification).` : 'After PERM is certified, the employer files the I-140 within 180 days.',
      t.priorityDate ? `The PERM filing date (${fmt(t.priorityDate)}) becomes the priority date once the I-140 is approved.` : 'The PERM filing date becomes the priority date.',
    ];
    case 'i140': return [`${t.derivative ? `${ownerName}’s` : 'The'} I-140 is pending. Add the approval notice when it comes.`, b?.canFile ? 'The priority date is already current: the I-485 can be filed now with the I-140 (concurrent filing).' : 'Then wait for the priority date to be current in the Visa Bulletin.'];
    case 'waiting': {
      if (!t.priorityDate || !t.category) return ['Add the I-140 approval (or type the priority date and category) to compare with the Visa Bulletin.'];
      if (b?.canFile) return [`${whose[0].toUpperCase()}${whose.slice(1)} priority date ${fmt(t.priorityDate)} is current for filing in the ${b.month} Visa Bulletin.`, 'Each person files their own I-485 (with I-765 and I-131) and the I-693 medical in its sealed envelope.', 'Gather documents now — see the planner.'];
      return [`Waiting: ${t.category} ${COUNTRY_LABEL[t.country]} cut-off is ${cellText(b?.chart === 'filing' ? b?.filing : b?.final)} (${b?.month ?? 'this month'}); the priority date is ${fmt(t.priorityDate)}.`, t.derivative ? 'Keep your current status (H-4 / L-2, following the main applicant) while you wait.' : 'Keep your current status (H-1B / L-1 extensions) while you wait.', 'Check the bulletin each month; the planner estimates the wait.'];
    }
    case 'i485': return [
      t.pendingDays !== undefined ? `I-485 pending ${t.pendingDays} days.${t.pendingDays >= 180 && !t.derivative ? ' After 180 days with an approved I-140, a same or similar job change may be possible (AC21).' : ''}` : 'I-485 pending.',
      b ? (b.canApprove ? 'The final action date is current: USCIS can approve once the case is ready (biometrics, medical, any interview).' : `It can be approved only when the final action date passes ${fmt(t.priorityDate)} (now ${cellText(b.final)}).`) : 'Approval needs the priority date to be current on the final action chart.',
      'Renew the EAD and advance parole in time; renewals filed since Oct 30, 2025 are not automatically extended.',
    ];
    case 'interview': return [`Interview ${fmt(t.interview)}${(daysTo(t.interview) ?? -1) >= 0 ? ` — in ${daysTo(t.interview)} days` : ''}. Use the interview checklist.`, 'Bring originals of everything filed with the I-485, and the interview notice.'];
    case 'approved': return [t.residentSince ? `Permanent resident since ${fmt(t.residentSince)}.` : 'Approved. Add the green card when it arrives.', 'You can usually apply for citizenship 5 years after “resident since” (3 if married to a US citizen).'];
  }
}

export const cellText = (c?: BulletinCell) => (c === 'C' ? 'Current' : c === 'U' ? 'Unavailable' : c ? fmt(c) : '—');

// ---------- current status while the I-485 is pending (item 4) ----------
const HL = ['H1B', 'L1A', 'L1B', 'L1', 'H4', 'L2', 'L2S'];
export type WorkBasis = { pending485: boolean; hlValid: boolean; hlClass?: string; workOn: 'status' | 'ead'; chosen: boolean; eadUntil?: string; i94Until?: string };
/** Keep H / L status or work on the EAD? Unset → from the documents (a valid H / L I-94 means status). */
export function workBasis(me: Who): WorkBasis {
  const r = me.rec;
  const pending485 = r.cases.some((c) => c.form === 'I-485' && c.status === 'pending');
  const cls = (r.i94?.cls ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hlValid = HL.includes(cls) && (daysTo(r.i94?.until) ?? -1) >= 0;
  const chosen = me.person.facts?.gc?.workOn;
  return { pending485, hlValid, hlClass: hlValid ? cls : undefined, workOn: chosen ?? (hlValid ? 'status' : 'ead'), chosen: !!chosen, eadUntil: r.ead?.expires, i94Until: r.i94?.until };
}

/** Spouse cross-chargeability: a short note when the principal and spouse were born in countries with different columns. */
export function crossChargeNote(t: GcTrack, me: Who, all: Who[]): string | undefined {
  if (t.stage === 'approved' || t.countryFrom === 'picked') return undefined;
  const owner = all.find((w) => w.person.id === t.ownerId) ?? me;
  const ownerBorn = birthCountryOf(owner.person.facts?.birthCountry, owner.rec);
  const isSpouse = (w: Who) => w.person.relation === 'spouse' || (owner.person.relation === 'spouse' && w.person.relation === 'self');
  const spouse = all.find((w) => w.person.id !== owner.person.id && isSpouse(w));
  const spouseBorn = spouse ? birthCountryOf(spouse.person.facts?.birthCountry, spouse.rec) : undefined;
  if (!ownerBorn || !spouseBorn || chargeabilityOf(ownerBorn.code) === chargeabilityOf(spouseBorn.code)) return undefined;
  return `${spouse!.person.name} was born in ${birthLabel(spouseBorn.code) ?? 'another country'}. A spouse born elsewhere can sometimes use that country instead (cross-chargeability) — ask your attorney before filing.`;
}

/** Item 2 (gc2): when the principal works on the EAD, the dependents with their own pending I-485 to ask about. */
export function eadDependents(principal: Who, all: Who[]): { person: Person; rec: PersonRecord; workOn?: 'status' | 'ead'; hasEad: boolean; depClass?: string }[] {
  return all
    .filter((w) => w.person.id !== principal.person.id && (w.person.relation === 'spouse' || w.person.relation === 'child'))
    .filter((w) => w.rec.cases.some((c) => c.form === 'I-485' && c.status === 'pending'))
    .filter((w) => gcOwnerOf(w, all).person.id === principal.person.id)
    .map((w) => {
      const cls = (w.rec.i94?.cls ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return { person: w.person, rec: w.rec, workOn: w.person.facts?.gc?.workOn, hasEad: !!w.rec.ead?.expires, depClass: /^H4$/.test(cls) ? 'H-4' : /^L2S?$/.test(cls) ? 'L-2' : undefined };
    });
}

// ---------- planner (item 5) ----------
export type PaceInfo = { daysPerYear: number; months: number; from: string; to: string };
/** How fast a cut-off moved, from the oldest to the newest bulletin at least ~5 months apart. */
export function paceOf(b: VisaBulletin, cat: string, country: BulletinCountry, chart: 'final' | 'filing'): PaceInfo | undefined {
  const snaps = [...(b.history ?? []), ...(b.previous ? [b.previous] : []), { month: b.month, rows: b.rows }]
    .map((s) => ({ at: monthStart(s.month), month: s.month, cell: cutoff(s.rows, cat, country, chart) }))
    .filter((s): s is { at: string; month: string; cell: string } => !!s.at && !!s.cell && /^\d{4}-\d{2}-\d{2}$/.test(s.cell))
    .sort((a, b) => a.at.localeCompare(b.at));
  const uniq = snaps.filter((s, i) => i === 0 || s.at !== snaps[i - 1].at);
  if (uniq.length < 2) return undefined;
  const last = uniq[uniq.length - 1];
  const first = uniq.find((s) => daysBetween(s.at, last.at) >= 150);
  if (!first || first === last) return undefined;
  const span = daysBetween(first.at, last.at);
  return { daysPerYear: Math.round((daysBetween(first.cell, last.cell) / span) * 365), months: Math.round(span / 30.4), from: first.month, to: last.month };
}

export type GcPlan = {
  current: { filing: boolean; final: boolean };
  gapDays?: { filing?: number; final?: number }; // how far the cut-off is behind the priority date
  pace?: { filing?: PaceInfo; final?: PaceInfo };
  eta?: { filing?: ISODate; final?: ISODate }; // estimate only
  etaNote?: string;
  gatherFrom?: ISODate; // start gathering I-485 documents
  gatherNow: boolean;
  processing: { form: string; label: string; months: number }[];
};
const MAX_ETA_YEARS = 40;

export function gcPlan(t: GcTrack, b: VisaBulletin, processing: { form: string; category: string; months: number }[], now: ISODate = today()): GcPlan {
  const cat = t.category, pd = t.priorityDate;
  const cell = (k: 'final' | 'filing') => (cat ? cutoff(b.rows, cat, t.country, k) : undefined);
  const cur = (k: 'final' | 'filing') => !!pd && isCurrent(pd, cell(k));
  const plan: GcPlan = { current: { filing: cur('filing'), final: cur('final') }, gatherNow: false, processing: [] };
  const pick = (form: string, re: RegExp) => { const row = processing.find((x) => x.form === form && re.test(x.category)); if (row) plan.processing.push({ form, label: row.category, months: row.months }); };
  pick('I-140', cat === 'EB-3' ? /EB-3/ : cat === 'EB-1' ? /EB-1/ : /EB-2 advanced/);
  pick('I-485', /Employment/);
  pick('I-765', /\(c\)\(9\)/);
  pick('I-131', /Advance parole/);
  if (!pd || !cat) return plan;
  plan.gapDays = {};
  plan.pace = {};
  plan.eta = {};
  for (const k of ['filing', 'final'] as const) {
    const c = cell(k);
    if (!c || c === 'C' || c === 'U' || plan.current[k]) continue;
    plan.gapDays[k] = daysBetween(c, pd);
    const pace = paceOf(b, cat, t.country, k);
    plan.pace[k] = pace;
    if (pace && pace.daysPerYear > 0) {
      const years = plan.gapDays[k]! / pace.daysPerYear;
      if (years <= MAX_ETA_YEARS) plan.eta[k] = addDays(monthStart(b.month) ?? now, Math.round(years * 365));
    }
  }
  if (plan.current.filing || plan.current.final) plan.gatherNow = true;
  else if (plan.eta.filing ?? plan.eta.final) {
    plan.gatherFrom = addDays((plan.eta.filing ?? plan.eta.final)!, -120);
    plan.gatherNow = plan.gatherFrom <= now;
  }
  const anyPace = plan.pace.filing ?? plan.pace.final;
  plan.etaNote = plan.gatherNow && (plan.current.filing || plan.current.final) ? undefined
    : !anyPace ? 'Not enough Visa Bulletin history yet to estimate the pace: the planner needs more months of bulletins (at least 5 months apart). They are added automatically each month.'
    : anyPace.daysPerYear <= 0 ? `The cut-off has not moved forward over the last ${anyPace.months} months, so no estimate is possible.`
    : `Estimate only: at the pace of the last ${anyPace.months} months (${anyPace.from} to ${anyPace.to}). Real movement jumps and can go back.`;
  return plan;
}

/** "3 years 2 months" from days. */
export function spanText(days: number): string {
  const m = Math.round(Math.abs(days) / 30.44);
  const y = Math.floor(m / 12), mm = m % 12;
  if (!y) return `${mm} month${mm === 1 ? '' : 's'}`;
  return `${y} year${y === 1 ? '' : 's'}${mm ? ` ${mm} month${mm === 1 ? '' : 's'}` : ''}`;
}

/** Documents to gather for each person's I-485 (USCIS I-485 instructions and initial-evidence checklist). */
export const GATHER: { id: string; text: string; who: 'all' | 'principal' | 'spouse' | 'child' }[] = [
  { id: 'photos', text: 'Two passport-style photos', who: 'all' },
  { id: 'id', text: 'Passport (biographic page) and a government photo ID', who: 'all' },
  { id: 'birth', text: 'Birth certificate, with a certified English translation if needed', who: 'all' },
  { id: 'entry', text: 'Visa stamp, latest I-94 and every I-797 approval (proof of lawful status)', who: 'all' },
  { id: 'medical', text: 'I-693 medical exam by a USCIS civil surgeon, filed with the I-485 in its sealed envelope', who: 'all' },
  { id: 'marriage', text: 'Marriage certificate (and proof any earlier marriage ended)', who: 'spouse' },
  { id: 'job', text: 'Employment verification letter from the sponsoring employer (job offer, title, salary)', who: 'principal' },
  { id: 'i140', text: 'I-140 approval or receipt notice', who: 'all' },
];

// ---------- interview preparation (item 6) ----------
export type PrepItem = { id: string; text: string; why?: string };
/** What to bring, per person. Ids are stable (saved ticks). */
export function interviewChecklist(p: Person, t: GcTrack | undefined): PrepItem[] {
  const out: PrepItem[] = [
    { id: 'notice', text: 'The interview notice (I-797C) for this person', why: 'Each family member scheduled brings their own.' },
    { id: 'passport', text: 'Passport, and older passports with US visas or entry stamps' },
    { id: 'idcard', text: 'Government photo ID (driver’s license or state ID)' },
    { id: 'status', text: 'Every I-94, I-797 approval and visa stamp since the first entry', why: 'Officers check that status was kept.' },
    { id: 'ead', text: 'EAD and advance parole (or the combo card)' },
    { id: 'birth', text: 'Original birth certificate, with certified translation' },
    { id: 'copy485', text: 'A copy of the I-485 as filed, and originals of what was filed with it' },
  ];
  if (p.relation === 'spouse' || p.relation === 'self') out.push({ id: 'marriage', text: 'Original marriage certificate (if married), and proof earlier marriages ended' });
  if (!t?.derivative) {
    out.push({ id: 'job', text: 'New employment verification letter from the sponsoring employer', why: 'Confirms the job offer is still open.' });
    out.push({ id: 'pay', text: 'Recent pay stubs and the last W-2s' });
    if (t?.i140) out.push({ id: 'i140', text: 'The I-140 approval notice' });
  }
  out.push({ id: 'medical', text: 'Only if the notice asks: a new I-693 medical in a sealed envelope' });
  return out;
}

export const INTERVIEW_QUESTIONS: { q: string; tip: string }[] = [
  { q: 'Confirm your name, date of birth and address', tip: 'Officers verify identity and that you understood every question on the I-485.' },
  { q: 'Go through the I-485 answers under oath', tip: 'You can correct an answer; if anything changed, you re-sign the form at the end.' },
  { q: 'Your job: employer, title, duties, salary, start date', tip: 'It should match the PERM and I-140. Say if you changed jobs (Supplement J).' },
  { q: 'Do you intend to work for the sponsoring employer?', tip: 'The green card is for a future job offer.' },
  { q: 'Education and experience', tip: 'Degrees and past jobs listed in the PERM.' },
  { q: 'Immigration history: entries, statuses, any gaps or unauthorized work', tip: 'Bring the I-94s and approvals that show each period.' },
  { q: 'Trips abroad since the I-485 was filed', tip: 'Have the advance parole or H / L visa used to return.' },
  { q: 'Marriage (spouses): when and where you married, life together', tip: 'Only for the derivative spouse and principal.' },
  { q: 'The yes / no questions about arrests, taxes and admissibility', tip: 'Bring court records for any “yes” answer and talk to an attorney first.' },
];

/** Tick ids for one person (saved on the person). */
export const ticked = (p: Person) => new Set(p.facts?.gc?.interviewTicks ?? []);

// ---------- interview checklist to share (gc2 item 4) ----------
export type ChecklistShare = { name: string; items: PrepItem[]; ticks: Set<string> | string[]; interview?: ISODate };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shareHead = (interview?: ISODate) => `Green card interview checklist${interview ? ` · ${fmt(interview)}` : ''}`;
const SHARE_FOOT = 'Bring originals and a copy of each. The interview notice may list more — follow it. For personal reference, not legal advice. Made with Immigration Wallet.';

/** Plain text (share sheet fallback when the PDF printer is not in the installed build). */
export function checklistText(people: ChecklistShare[]): string {
  const iv = people.map((p) => p.interview).filter(Boolean).sort()[0];
  const parts = [shareHead(iv), ''];
  for (const p of people) {
    const t = new Set(p.ticks);
    parts.push(`${p.name} (${p.items.filter((x) => t.has(x.id)).length} of ${p.items.length} ready)`);
    for (const x of p.items) parts.push(`${t.has(x.id) ? '[x]' : '[ ]'} ${x.text}${x.why ? ` — ${x.why}` : ''}`);
    parts.push('');
  }
  parts.push(SHARE_FOOT);
  return parts.join('\n');
}

/** Printable HTML for the PDF (pastel, one section per person, tick boxes). */
export function checklistHtml(people: ChecklistShare[]): string {
  const iv = people.map((p) => p.interview).filter(Boolean).sort()[0];
  const sec = people.map((p) => {
    const t = new Set(p.ticks);
    const rows = p.items.map((x) => `<li class="${t.has(x.id) ? 'on' : ''}"><span class="box">${t.has(x.id) ? '&#10003;' : ''}</span><span>${esc(x.text)}${x.why ? `<em> — ${esc(x.why)}</em>` : ''}</span></li>`).join('');
    return `<section><h2>${esc(p.name)} <small>${p.items.filter((x) => t.has(x.id)).length} of ${p.items.length} ready</small></h2><ul>${rows}</ul></section>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1d1d1f;margin:32px;font-size:13px}
.hero{background:${PASTEL.butter};border-radius:22px;padding:20px 22px;margin-bottom:18px}.hero h1{margin:0;font-size:22px}.hero p{margin:6px 0 0;color:rgba(0,0,0,.72)}
section{background:${PASTEL.sky};border-radius:18px;padding:14px 18px;margin-bottom:14px;page-break-inside:avoid}
h2{font-size:16px;margin:0 0 8px}h2 small{font-weight:500;color:rgba(0,0,0,.6);font-size:12px;margin-left:6px}
ul{list-style:none;padding:0;margin:0}li{display:flex;gap:10px;padding:6px 0;border-top:1px solid rgba(0,0,0,.08)}li:first-child{border-top:0}
.box{flex:none;width:16px;height:16px;border:1.5px solid #8e8e93;border-radius:5px;text-align:center;line-height:16px;font-size:12px}
li.on .box{background:${PASTEL.sage};border-color:${PASTEL.sageD};color:#000}em{color:rgba(0,0,0,.6);font-style:normal}
footer{color:#6e6e73;font-size:11px;margin-top:16px}</style></head><body>
<div class="hero"><h1>${esc(shareHead(iv))}</h1><p>Each person scheduled brings their own documents.</p></div>${sec}<footer>${esc(SHARE_FOOT)}</footer></body></html>`;
}
