// The waterfall: per person, documents are added one step at a time (Upload or Skip).
// Steps depend on the status picked at setup and on what the documents already show (D1):
//   H/L/TN/E/O worker:  Passport → Visa → (Where?) → I-94 → Approval → Pending receipt
//   H-4 / L-2 spouse:   … → own I-539 approval (optional) → receipt → EAD (H-4 EAD / optional L-2S)
//   F-1 student:        Passport → Visa → (Where?) → I-94 → I-20 → OPT EAD → receipt
//   J-1 / J-2:          … → DS-2019
//   Green-card applicant: … → Approval (current status) → receipts (I-140 / I-485) → EAD/AP combo → Advance Parole
//   Green-card holder:  Passport → Green card → receipts (I-751 / N-400) → I-94 travel history
//   US citizen:         Passport → Naturalization certificate (optional). No checks.
// "Where?" is asked only when the I-94 is skipped (APPV2): people outside the US have no I-94.

import type { DocFields, DocType, Person, StatusCategory, VisaType } from './model';
import { isCitizen, isResident, isStudent } from './model';
import type { PersonRecord } from './record';

export type StepKey =
  | 'passport' | 'visa' | 'where' | 'i94' | 'approval' | 'receipt' | 'ead' | 'i20' | 'ds2019'
  | 'gc' | 'travel' | 'i140' | 'i485' | 'combo' | 'n400';

export type Step = { key: StepKey; title: string; accepts: DocType[]; form?: string; why: string; optional: boolean; keyField: { label: string; field: keyof DocFields } };

export type Track = 'work' | 'dependent' | 'student' | 'exchange' | 'gc-applicant' | 'resident' | 'citizen' | 'visitor' | 'unknown';

const STEP_OF: Partial<Record<DocType, StepKey>> = {
  passport: 'passport', visa: 'visa', i94: 'i94', approval: 'approval', i129s: 'approval', receipt: 'receipt', notice: 'receipt',
  ead: 'ead', i20: 'i20', ds2019: 'ds2019', 'green-card': 'gc', 'travel-history': 'travel', 'advance-parole': 'combo', 'reentry-permit': 'travel',
};
/** The step a document belongs to (a wrong type in a step is moved to its own step). Forms refine receipts/approvals. */
export function stepOf(t?: DocType, f?: DocFields): StepKey | undefined {
  if (!t) return undefined;
  if ((t === 'approval' || t === 'receipt') && f?.form === 'I-140') return 'i140';
  if (t === 'receipt' && f?.form === 'I-485') return 'i485';
  if (t === 'receipt' && f?.form === 'N-400') return 'n400';
  return STEP_OF[t];
}

export function trackOf(person: Person, rec?: PersonRecord): Track {
  const v = rec?.visa;
  const s = person.status;
  if (isCitizen(v) || s === 'citizen') return 'citizen';
  if (isResident(v) || s === 'green-card' || s === 'conditional-green-card' || s === 'citizenship-applicant') return 'resident';
  if (s === 'green-card-applicant' || v === 'Green card pending') return 'gc-applicant';
  if (isStudent(v) || s === 'F-1' || s === 'F-1 OPT' || s === 'STEM OPT') return 'student';
  if (v === 'J-1' || s === 'J-1') return 'exchange';
  if (v && ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1'].includes(v)) return 'work';
  if (s && ['H-1B', 'L-1', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1'].includes(s)) return 'work';
  if (v && ['H-4', 'H-4 EAD', 'L-2S', 'L-2', 'TD', 'E-3D', 'O-3', 'F-2', 'J-2'].includes(v)) return 'dependent';
  if (s && ['H-4', 'L-2', 'F-2', 'J-2'].includes(s)) return 'dependent';
  if (v === 'B-2' || v === 'B-1/B-2' || s === 'B-2') return 'visitor';
  return 'unknown';
}

const you = (p: Person) => p.relation === 'self';
/** Nationalities that don't need a visa stamp for TN / TD / visits (Canada, Bermuda). */
export const VISA_EXEMPT = ['CAN', 'BMU'];

/** The status that decides the steps: what they picked, else what their documents show. */
export function stepStatus(person: Person, rec?: PersonRecord): StatusCategory {
  if (person.status && person.status !== 'unsure' && person.status !== 'other') return person.status;
  const v = rec?.visa;
  const m: Partial<Record<VisaType, StatusCategory>> = {
    'H-1B': 'H-1B', 'L-1A': 'L-1A', 'L-1B': 'L-1B', TN: 'TN', 'E-3': 'E-3', 'O-1': 'O-1', 'F-1': 'F-1', 'F-1 OPT': 'F-1 OPT', 'STEM OPT': 'STEM OPT', 'J-1': 'J-1',
    'H-4': 'H-4', 'H-4 EAD': 'H-4', 'L-2S': 'L-2', 'L-2': 'L-2', 'F-2': 'F-2', 'J-2': 'J-2', 'B-2': 'B-2', 'B-1/B-2': 'B-2',
    'Green card pending': 'green-card-applicant', 'Green card': 'green-card', 'Conditional green card': 'conditional-green-card', 'US citizen': 'citizen',
  };
  return (v && m[v]) || person.status || 'unsure';
}

/** Step keys per status (prototype order). "where" is inserted by the flow when the I-94 is skipped. */
export function stepKeys(person: Person, rec?: PersonRecord): StepKey[] {
  const s = stepStatus(person, rec);
  const spouse = person.relation === 'spouse';
  const exempt = VISA_EXEMPT.includes(rec?.nationality ?? '');
  const visa: StepKey[] = exempt ? [] : ['visa'];
  if (s === 'citizen') return ['passport'];
  if (s === 'green-card' || s === 'conditional-green-card') return ['gc', 'passport', 'travel', ...(s === 'conditional-green-card' ? ['receipt' as StepKey] : [])];
  if (s === 'citizenship-applicant') return ['gc', 'passport', 'travel', 'n400'];
  if (s === 'green-card-applicant') return ['passport', 'i94', 'i140', 'i485', 'combo'];
  if (s === 'F-1' || s === 'F-1 OPT' || s === 'STEM OPT' || s === 'F-2') return ['passport', ...visa, 'i94', 'i20', ...(s === 'F-1 OPT' || s === 'STEM OPT' ? ['ead' as StepKey] : [])];
  if (s === 'J-1' || s === 'J-2') return ['passport', ...visa, 'i94', 'ds2019'];
  if (s === 'B-2') return ['passport', ...visa, 'i94'];
  if (s === 'L-2') return ['passport', ...visa, 'i94', ...(spouse ? ['ead' as StepKey] : [])];
  if (s === 'H-4') return ['passport', ...visa, 'i94', 'approval', 'receipt', ...(spouse ? ['ead' as StepKey] : [])];
  return ['passport', ...visa, 'i94', 'approval', 'receipt'];
}

const OPTIONAL: StepKey[] = ['receipt', 'travel', 'combo', 'n400', 'i485'];
export function isOptionalStep(person: Person, k: StepKey, rec?: PersonRecord) {
  const s = stepStatus(person, rec);
  return OPTIONAL.includes(k) || (k === 'ead' && ['H-4', 'L-2', 'F-2'].includes(s)) || (k === 'approval' && s === 'H-4') || (k === 'approval' && person.relation !== 'self' && s !== 'H-1B' && s !== 'L-1A' && s !== 'L-1B');
}

/** Title, explanation and the one field shown on a document row, for a step. */
export function stepMeta(person: Person, k: StepKey, rec?: PersonRecord): Step {
  const me = you(person);
  const n = me ? 'you' : person.name || 'them';
  const poss = me ? 'your' : `${person.name || 'their'}’s`;
  const s = stepStatus(person, rec);
  const L = s === 'L-1A' || s === 'L-1B';
  const student = s === 'F-1' || s === 'F-1 OPT' || s === 'STEM OPT';
  const M: Record<StepKey, Omit<Step, 'key' | 'optional'>> = {
    passport: { title: 'Passport', accepts: ['passport'], keyField: { label: 'Expires', field: 'validTo' }, why: `Proves who ${me ? 'you are' : `${n} is`}. Its expiry can cut the I-94 short.` },
    visa: { title: 'Visa stamp', accepts: ['visa'], keyField: { label: 'Expires', field: 'validTo' }, why: `Lets ${n} travel back into the US. It doesn’t control how long ${me ? 'you' : n} can stay.` },
    i94: { title: 'I-94 record', accepts: ['i94'], keyField: { label: 'Admit until', field: 'validTo' }, why: `Controls how long ${n} can stay. Get it from the CBP I-94 website. The newest one counts.` },
    approval: { title: L ? 'Approval · I-129S' : 'Approval notice', accepts: ['approval', 'i129s'], keyField: { label: 'Valid to', field: 'validTo' }, why: L ? 'For blanket L, the I-129S is the approval. It shows the petition dates.' : s === 'H-4' ? `I-797A for ${poss} I-539, if there is one.` : 'I-797A or I-797B. It shows the petition dates.' },
    receipt: { title: 'Pending receipt', accepts: ['receipt', 'notice'], keyField: { label: 'Received', field: 'receivedDate' }, why: 'An I-797C for a case that is still pending. Skip if nothing is pending.' },
    ead: { title: student ? 'OPT work permit (EAD)' : 'Work permit (EAD)', accepts: ['ead'], keyField: { label: 'Valid to', field: 'validTo' }, why: student ? 'Shows the OPT dates and category (c3B or c3C).' : s === 'L-2' ? 'Optional. On L-2S the I-94 itself allows work.' : `Lets ${n} work on H-4. Renewals don’t extend automatically.` },
    i20: { title: s === 'F-2' ? 'Dependent I-20' : 'I-20', accepts: ['i20'], keyField: { label: 'Program end', field: 'programEnd' }, why: 'Gives the program end date, OPT dates and the travel signature.' },
    ds2019: { title: 'DS-2019', accepts: ['ds2019'], keyField: { label: 'Program end', field: 'validTo' }, why: 'The program dates set how long the J stay lasts.' },
    gc: { title: 'Green card', accepts: ['green-card'], keyField: { label: 'Card expires', field: 'validTo' }, why: `Its category and “resident since” date set ${poss} citizenship date.` },
    travel: { title: 'Travel history', accepts: ['travel-history'], keyField: { label: 'Trips', field: 'trips' }, why: 'A screenshot or PDF from the CBP I-94 website. Counts days outside the US.' },
    i140: { title: 'I-140 notice', accepts: ['approval', 'receipt'], form: 'I-140', keyField: { label: 'Priority date', field: 'priorityDate' }, why: 'Saves the priority date and category for Visa Bulletin checks.' },
    i485: { title: 'I-485 receipt', accepts: ['receipt'], form: 'I-485', keyField: { label: 'Received', field: 'receivedDate' }, why: 'Pending since this date. It matters if the job changes.' },
    combo: { title: 'Combo card (EAD + travel)', accepts: ['ead', 'advance-parole'], keyField: { label: 'Valid to', field: 'validTo' }, why: 'Work permit and travel permission in one card. Needed to travel while the I-485 is pending.' },
    n400: { title: 'N-400 receipt', accepts: ['receipt'], form: 'N-400', keyField: { label: 'Received', field: 'receivedDate' }, why: 'The citizenship case. Add the interview date when it comes.' },
    where: { title: me ? 'Are you in the US right now?' : `Is ${person.name || 'this person'} in the US right now?`, accepts: [], keyField: { label: '', field: 'name' }, why: 'People outside the US (for example in India) don’t have an I-94.' },
  };
  return { key: k, ...M[k], optional: isOptionalStep(person, k, rec) };
}

/** Steps for a person, with metadata. */
export function stepsFor(person: Person, rec?: PersonRecord): Step[] {
  return stepKeys(person, rec).map((k) => stepMeta(person, k, rec));
}

/** Does a document fill this step? */
export function fillsStep(step: Step, d: { type: DocType; fields: DocFields }) {
  if (!step.accepts.includes(d.type)) return false;
  if (step.form) return d.fields.form === step.form;
  if (step.key === 'receipt' || step.key === 'approval') return !['I-140', 'I-485', 'N-400'].includes(d.fields.form ?? '');
  return true;
}

type DocLike = { ownerId: string; type: DocType; fields: DocFields };

/**
 * Is this step's document one they must have? (Everything else in the waterfall is optional.)
 * Passport for everyone but US citizens; visa stamp for nonimmigrants (not Canadians/Bermudians,
 * not green-card holders or I-485 applicants); I-94 only in the US and not while an I-485 is
 * pending; the approval only for the main worker in the US (TN: the I-94 is the approval);
 * the principal's own I-140 for a green-card applicant (never asked of dependents); I-20 for
 * students, DS-2019 for J-1, green card for residents, OPT EAD on OPT.
 */
export function isRequiredStep(person: Person, rec: PersonRecord | undefined, k: StepKey): boolean {
  const track = trackOf(person, rec);
  const s = stepStatus(person, rec);
  const self = person.relation === 'self';
  const inUS = rec?.location !== 'Outside';
  if (track === 'citizen') return false;
  if (isOptionalStep(person, k, rec)) return false;
  switch (k) {
    case 'passport': return true;
    case 'visa': return !['resident', 'gc-applicant'].includes(track) && !VISA_EXEMPT.includes(rec?.nationality ?? '');
    case 'i94': return inUS && track !== 'gc-applicant' && track !== 'resident';
    case 'approval': return inUS && self && ((track === 'work' && rec?.visa !== 'TN' && s !== 'TN') || track === 'unknown');
    case 'i140': return track === 'gc-applicant' && self;
    case 'i20': return track === 'student';
    case 'ds2019': return track === 'exchange';
    case 'gc': return track === 'resident';
    case 'ead': return s === 'F-1 OPT' || s === 'STEM OPT';
    default: return false;
  }
}

/** Already known from the record (another document carries it). */
function knownFromRecord(k: StepKey, rec?: PersonRecord): boolean {
  if (!rec) return false;
  switch (k) {
    case 'passport': return !!rec.passportExpiry;
    case 'visa': return !!rec.visaStamp;
    case 'i94': return !!rec.i94;
    case 'approval': return !!rec.petitionEnd || rec.docTypes.includes('approval') || rec.docTypes.includes('i129s');
    case 'i140': return rec.cases.some((c) => c.form === 'I-140');
    case 'gc': return !!rec.greenCard;
    default: return rec.docTypes.includes(k);
  }
}

/**
 * THE list of documents still to add — used by Home, "Continue adding", the person page and the
 * engine's `missing` (which the QA runner checks). Required steps with no document yet.
 */
export function missingSteps(person: Person, rec: PersonRecord, docs: DocLike[]): Step[] {
  const mine = docs.filter((d) => d.ownerId === person.id);
  return stepsFor(person, rec).filter((s) => isRequiredStep(person, rec, s.key) && !mine.some((d) => fillsStep(s, d)) && !knownFromRecord(s.key, rec));
}

/** The same list as document names (engine result / QA runner). */
export function missingDocs(person: Person, rec: PersonRecord, docs: DocLike[]): string[] {
  return missingSteps(person, rec, docs).map((s) => (s.key === 'approval' && rec.blanket ? 'I-129S (blanket L)' : s.key === 'approval' ? 'Approval' : s.key === 'i94' ? 'I-94' : s.key === 'gc' ? 'Green card' : s.title));
}
