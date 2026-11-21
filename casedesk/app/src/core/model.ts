// CaseDesk data model. Pure types + small lookups; no React Native.
//
// People are set up once. Documents belong to a person. Everything about someone's status
// (valid until, visa type, current approval, pending case…) is DERIVED from their documents
// by record.ts — never typed in, never guessed.

import type { ISODate } from './dates';

// ---------- people ----------
export type Relation = 'self' | 'spouse' | 'child' | 'parent' | 'other';

/** What the person picked ("What's your situation?"). A starting point only — documents confirm the exact visa type. */
export type StatusCategory =
  | 'H-1B' | 'L-1A' | 'L-1B' | 'L-1' | 'TN' | 'E-3' | 'O-1'
  | 'F-1' | 'F-1 OPT' | 'STEM OPT' | 'J-1'
  | 'H-4' | 'L-2' | 'F-2' | 'J-2' | 'TD'
  | 'green-card-applicant' | 'green-card' | 'conditional-green-card' | 'citizenship-applicant' | 'citizen'
  | 'B-2' | 'other' | 'unsure';

/** Full names (status select, chips on cards). */
export const STATUS_LABEL: Record<StatusCategory, string> = {
  'H-1B': 'H-1B', 'L-1A': 'L-1A', 'L-1B': 'L-1B', 'L-1': 'L-1', TN: 'TN', 'E-3': 'E-3', 'O-1': 'O-1',
  'F-1': 'F-1', 'F-1 OPT': 'F-1 OPT', 'STEM OPT': 'F-1 STEM OPT', 'J-1': 'J-1',
  'H-4': 'H-4', 'L-2': 'L-2', 'F-2': 'F-2', 'J-2': 'J-2', TD: 'TD',
  'green-card-applicant': 'Green card applicant', 'green-card': 'Green card holder', 'conditional-green-card': 'Conditional green card',
  'citizenship-applicant': 'Citizenship applicant', citizen: 'US citizen', 'B-2': 'B-1/B-2 visitor', other: 'Something else', unsure: 'Not sure yet',
};
/** Short chip labels inside a group ("Applying", "OPT"…). */
export const STATUS_CHIP: Partial<Record<StatusCategory, string>> = {
  'green-card-applicant': 'Applying', 'green-card': 'Holder', 'conditional-green-card': 'Conditional', 'citizenship-applicant': 'Applying',
  citizen: 'US citizen', 'B-2': 'B-1 / B-2', unsure: 'I’m not sure', 'F-1 OPT': 'OPT', 'STEM OPT': 'STEM OPT',
};
/** The situation picker, grouped (prototype order). */
export const STATUS_GROUPS: { title: string; icon: string; items: StatusCategory[] }[] = [
  { title: 'Work visa', icon: 'briefcase', items: ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1'] },
  { title: 'Student', icon: 'school', items: ['F-1', 'F-1 OPT', 'STEM OPT'] },
  { title: 'Dependent', icon: 'people', items: ['H-4', 'L-2', 'F-2', 'J-2', 'TD'] },
  { title: 'Green card', icon: 'card', items: ['green-card-applicant', 'green-card', 'conditional-green-card'] },
  { title: 'Citizenship', icon: 'flag', items: ['citizenship-applicant', 'citizen'] },
  { title: 'Visitor', icon: 'airplane', items: ['B-2'] },
  { title: 'Not sure', icon: 'help-circle', items: ['unsure'] },
];
/** Default status for a family member, from the main person's (prototype depFor). */
export function dependentStatusFor(main?: StatusCategory, relation?: Relation): StatusCategory {
  if (relation === 'parent') return 'B-2';
  const m: Partial<Record<StatusCategory, StatusCategory>> = {
    'H-1B': 'H-4', 'L-1A': 'L-2', 'L-1B': 'L-2', 'L-1': 'L-2', 'F-1': 'F-2', 'F-1 OPT': 'F-2', 'STEM OPT': 'F-2', 'J-1': 'J-2',
    'green-card': 'green-card', 'conditional-green-card': 'conditional-green-card', 'citizenship-applicant': 'green-card',
    'green-card-applicant': 'green-card-applicant', 'B-2': 'B-2', TN: 'TD', 'E-3': 'other', 'O-1': 'other',
  };
  return (main && m[main]) || 'unsure';
}

/** The exact visa type / status, as documents show it. */
export type VisaType =
  | 'H-1B' | 'L-1A' | 'L-1B' | 'TN' | 'E-3' | 'O-1'
  | 'F-1' | 'F-1 OPT' | 'STEM OPT' | 'J-1'
  | 'H-4' | 'H-4 EAD' | 'L-2S' | 'L-2' | 'F-2' | 'J-2' | 'TD' | 'E-3D' | 'O-3'
  | 'B-1/B-2' | 'B-2'
  | 'Green card pending' | 'Green card' | 'Conditional green card' | 'US citizen';

export const WORK_VISAS: VisaType[] = ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1'];
export const DEPENDENT_VISAS: VisaType[] = ['H-4', 'H-4 EAD', 'L-2S', 'L-2', 'F-2', 'J-2', 'TD', 'E-3D', 'O-3'];
export const STUDENT_VISAS: VisaType[] = ['F-1', 'F-1 OPT', 'STEM OPT', 'J-1'];
export const RESIDENT_VISAS: VisaType[] = ['Green card', 'Conditional green card'];

export const isWorkVisa = (v?: VisaType) => !!v && WORK_VISAS.includes(v);
export const isDependentVisa = (v?: VisaType) => !!v && DEPENDENT_VISAS.includes(v);
export const isStudent = (v?: VisaType) => !!v && ['F-1', 'F-1 OPT', 'STEM OPT'].includes(v);
export const isResident = (v?: VisaType) => !!v && RESIDENT_VISAS.includes(v);
export const isCitizen = (v?: VisaType) => v === 'US citizen';
/** Nonimmigrant = has an I-94 that controls the stay. */
export const isNonimmigrant = (v?: VisaType) => !isResident(v) && !isCitizen(v);
/** Statuses with a 6/7/5-year cap and a 60-day grace period after a job ends. */
export const hasPetition = (v?: VisaType) => !!v && ['H-1B', 'L-1A', 'L-1B', 'TN', 'E-3', 'O-1'].includes(v);
export const canBeBlanket = (v?: VisaType) => !!v && ['L-1A', 'L-1B', 'L-2S', 'L-2'].includes(v);

/** Which principal visa a dependent visa follows. */
export const PRINCIPAL_OF: Partial<Record<VisaType, VisaType[]>> = {
  'H-4': ['H-1B'], 'H-4 EAD': ['H-1B'], 'L-2S': ['L-1A', 'L-1B'], 'L-2': ['L-1A', 'L-1B'],
  'F-2': ['F-1', 'F-1 OPT', 'STEM OPT'], 'J-2': ['J-1'], TD: ['TN'], 'E-3D': ['E-3'], 'O-3': ['O-1'],
};

export type WorkLocation = { city?: string; state?: string; metro?: string; zip?: string };

export type Trip = {
  id: string;
  depart?: ISODate; // planned or actual departure from the US
  return?: ISODate; // planned or actual return
  country?: string;
  planned: boolean; // true = upcoming trip, false = logged (from travel history or typed)
};

/** Things only the person can tell us (documents don't show them). All optional. */
export type PersonFacts = {
  location?: 'US' | 'Outside'; // only asked when the I-94 is skipped; an I-94 means in the US
  country?: string; // when outside, e.g. India
  workLocation?: WorkLocation; // where the principal works now
  approvedWorkLocation?: WorkLocation; // worksite the current approval/LCA is for (the I-797 doesn't print it)
  jobEnded?: ISODate; // last day of employment (layoff, resignation)
  jobChangedOn?: ISODate; // new job (matters with a pending I-485, AC21)
  travelPlanned?: boolean; // "planning to travel soon" without dates
  trips?: Trip[];
  statusStart?: ISODate; // first day in H-1B / L-1 (max-stay clock); else the earliest approval start
  greenCardStarted?: boolean; // PERM or I-140 filed (answer, when no case is saved)
  unemploymentDays?: number; // F-1 OPT / STEM OPT: days unemployed so far, if typed (else counted from jobs)
  employment?: { employer: string; start: ISODate; end?: ISODate | null }[]; // jobs (OPT unemployment counter, SEVP reporting)
  dependentOf?: string; // person id a dependent's status follows (when two people could be the principal)
  sevpPending?: { kind: 'employer' | 'job-end' | 'address'; date: ISODate }[]; // F-1 OPT changes not yet reported in the SEVP portal
  stemEligibleDegree?: boolean;
  marriedToCitizen?: boolean; // 3-year citizenship path
  daysInUS?: number; // days physically in the US since resident-since (when no travel history is loaded)
  birthDate?: ISODate; // v2.9 Edit details: typed when no document shows it
  birthCountry?: string; // v2.9 gc2: country of birth (ISO-3, or OTH) — the Visa Bulletin charges by it, not the passport
  employer?: string; // v2.9 Edit details: typed when no approval / receipt shows it
  locationOn?: ISODate; // v2.9 Edit details: when "In the US / Outside" was set (wins over older I-94s)
  gc?: GcFacts; // v2.9 green-card track (answers only the person can give; documents decide the rest)
  blanketL?: boolean; // v3.0 setup: L-1 on a blanket petition (I-129S) or an individual one (I-797). Documents decide once saved
  hasEad?: boolean; // v3.0 setup: H-4 / L-2 with a work permit (adds the EAD document)
  trackOnly?: boolean; // v3.0 fix8: a principal added by a dependent to follow only (setup doesn't list their documents; add them anytime)
  lastEntry?: ISODate; // v3.0 setup: most recent entry to the US, typed (an I-94 shows its own; needed on the CBP I-94 site)
};

/** v2.9 green-card answers. All optional: families saved before v2.9 load unchanged. */
export type GcFacts = {
  /** While the I-485 is pending: keep working on H-1B / L-1 (or H-4 / L-2) status, or work on the EAD (C9). Unset = worked out from the documents. */
  workOn?: 'status' | 'ead';
  /** Person id whose PERM / I-140 this person's green card follows (unset = their principal, or their own case). */
  followsId?: string;
  /** Typed when no I-140 is saved yet. */
  category?: 'EB-1' | 'EB-2' | 'EB-3' | 'EB-3 OW' | 'EB-5';
  priorityDate?: ISODate;
  /** Visa Bulletin column override (country of chargeability). Unset = from the country of birth (facts.birthCountry), else the passport. */
  chargeability?: 'all' | 'china' | 'india' | 'mexico' | 'philippines';
  /** v3.0 setup: how far the green card is, typed when no document shows it yet (documents win). */
  stage?: 'perm' | 'i140' | 'i485';
  /** Interview preparation: checklist items ticked (ids from core/gc.ts). */
  interviewTicks?: string[];
};

export type Person = {
  id: string;
  name: string; // what the family calls them ("Dad", "Asha") — display only, never used for matching
  relation: Relation;
  isMain?: boolean; // the main person in the family (F2: anyone can be)
  reminders?: { on: boolean; lead: number[]; types?: Partial<Record<'passport' | 'visa' | 'i94' | 'approval' | 'ead' | 'ap' | 'gc' | 'cases', { on: boolean; lead: number[] }>> }; // local notifications before this person's dates (v2.9: per type)
  status?: StatusCategory; // picked at setup
  facts: PersonFacts;
  createdAt: ISODate;
};

// ---------- documents ----------
export type DocType =
  | 'passport' | 'visa' | 'i94' | 'approval' | 'receipt' | 'notice' | 'i129s' | 'ead'
  | 'i20' | 'ds2019' | 'green-card' | 'advance-parole' | 'reentry-permit' | 'naturalization'
  | 'travel-history' | 'lca' | 'perm' | 'medical' | 'other';

/** User-facing names. (These exact strings are also used by the QA test families.) */
// v3.0 (owner): plain words first, the form name in brackets
export const DOC_LABEL: Record<DocType, string> = {
  passport: 'Passport',
  visa: 'Visa stamp',
  i94: 'Entry record (I-94)',
  approval: 'Approval notice (I-797)',
  receipt: 'Receipt notice (I-797C)',
  notice: 'USCIS notice',
  i129s: 'I-129S (blanket L)',
  ead: 'Work permit (EAD)',
  i20: 'Student form (I-20)',
  ds2019: 'Exchange visitor form (DS-2019)',
  'green-card': 'Green card (I-551)',
  'advance-parole': 'Travel permit (Advance Parole)',
  'reentry-permit': 'Re-entry permit',
  naturalization: 'Naturalization certificate',
  'travel-history': 'Travel history (I-94)',
  lca: 'LCA',
  perm: 'PERM labor certification',
  medical: 'Medical exam (I-693)',
  other: 'Other document',
};

export type PetitionKind = 'new' | 'extension' | 'amendment' | 'transfer' | 'change-of-status';

/** Everything a document can carry. Each reader fills the fields its document has. */
export type DocFields = {
  name?: string; // as printed (passport MRZ, I-94, beneficiary…)
  passportNo?: string; // passport / visa / I-94: links documents to a person
  oldPassportNo?: string; // newer Indian passports print the previous number
  birthDate?: ISODate;
  nationality?: string; // ISO-3 from the MRZ (IND)
  birthPlace?: string; // v2.9 gc2: place / country of birth as printed (passport, EAD, green card)
  issueDate?: ISODate;
  validFrom?: ISODate;
  validTo?: ISODate; // the date that matters: passport/visa/EAD/card expiry, I-94 admit-until, approval end
  classOfAdmission?: string; // H1B, L1A, L2S, F1… (as printed, no hyphen)
  blanket?: boolean; // visa annotated BLANKET L / I-129S
  // USCIS notices
  receipt?: string;
  form?: string; // I-129, I-539, I-765, I-140, I-485, I-131, I-751, I-90, N-400, I-130, I-824
  noticeDate?: ISODate;
  receivedDate?: ISODate;
  priorityDate?: ISODate;
  preferenceCategory?: string; // I-140: E21/EB2…
  petitionKind?: PetitionKind;
  employer?: string;
  workLocation?: WorkLocation;
  i94Until?: ISODate; // I-94 printed at the foot of an I-797A
  noticeKind?: 'rfe' | 'noid' | 'denial' | 'biometrics' | 'interview' | 'oath' | 'transfer' | 'other';
  requestedStart?: ISODate; // I-129 receipt: requested start (cap H-1B: Oct 1)
  dueDate?: ISODate; // RFE / NOID response due
  appointmentDate?: ISODate; // biometrics / interview / oath
  // I-94
  entryDate?: ISODate; // CBP "Most Recent Date of Entry" = issue date of that I-94
  durationOfStatus?: boolean; // I-94 "D/S"
  // EAD / green card
  category?: string; // EAD C26, C9, C3C… / green-card IR1, CR1, E21…
  comboAP?: boolean; // EAD card that "serves as I-512 Advance Parole"
  residentSince?: ISODate;
  conditional?: boolean; // CR/CF/C… green card (2-year)
  uscisNumber?: string;
  // student / exchange
  sevisId?: string;
  school?: string;
  programStart?: ISODate;
  programEnd?: ISODate;
  optStart?: ISODate;
  optEnd?: ISODate;
  travelSignature?: ISODate; // last DSO travel endorsement
  // citizenship
  naturalizedOn?: ISODate;
  certificateNo?: string;
  // travel history
  trips?: { depart?: ISODate; return?: ISODate }[];
  // green card (v2.9)
  caseNumber?: string; // PERM (DOL) case number, e.g. G-100-26001-000001
  signedDate?: ISODate; // I-693: civil surgeon's signature date
  // reading notes
  dateNote?: string; // a date that needs a second look
};

/** A kept file. `file` is the stored file NAME inside the app's documents folder (cd2-docs/), never
 *  an absolute path — iOS moves the app container on updates. The web preview keeps its blob/http URI. */
export type DocFile = { file: string; name: string; mime: string; size?: number };

export type Document = {
  id: string;
  ownerId: string;
  type: DocType;
  fields: DocFields;
  filedFor?: PetitionKind; // answer to "What was filed?" on an I-129 / I-539 receipt
  addedAt: string; // ISO timestamp; also the tie-breaker for upload order
  updatedAt?: string; // ISO timestamp of the last edit (shares: the newer copy of a document wins)
  seq?: number; // upload order within a flow
  files?: DocFile[];
  edited?: (keyof DocFields)[]; // fields the user corrected
};

// ---------- cases ----------
export type CaseStatus = 'pending' | 'approved' | 'denied' | 'withdrawn' | 'rfe' | 'unknown';
export type KeyDate = { kind: 'biometrics' | 'interview' | 'rfe-due' | 'noid-due' | 'oath' | 'other'; date: ISODate; note?: string };
export type Case = {
  id: string;
  receipt: string;
  form?: string;
  ownerId: string;
  nickname?: string;
  status?: CaseStatus;
  receivedDate?: ISODate;
  priorityDate?: ISODate;
  category?: string;
  keyDates: KeyDate[];
  history: { date: string; text: string }[];
  fromDocId?: string;
  hidden?: boolean; // a case read from a document that the user deleted from Cases
  checkedAt?: string; // last time the status was checked on uscis.gov (paste-back or picked)
};

// ---------- settings ----------
export type Settings = {
  tutorialSeen?: boolean;
  setupDone?: boolean;
  faceId?: boolean;
  hideInSwitcher?: boolean;
  reminderLeadDays: number[];
  address?: { changedOn: ISODate; ar11Done: string[] }; // AR-11: ids of people who filed it
  rulesVersion?: string;
  theme?: 'system' | 'dark' | 'light';
  colour?: 'pastel' | 'indigo' | 'emerald' | 'ocean' | 'sunset' | 'rose' | 'graphite'; // v2.7 colour theme (default pastel)
  lastBackupAt?: string; // ISO timestamp of the last "Back up now"
  firstDocAt?: string; // when the first document was saved (backup reminder starts 30 days later)
  backupReminderSnoozed?: string; // ISO date until which the Home reminder is hidden
  familyCardDismissed?: boolean; // Home "Add your family" card dismissed
  hrTools?: boolean; // show "For HR" tools
  devTools?: boolean; // v3.0: Developer section in Settings (tap the version 7 times)
  helpSeen?: string[]; // first-time help cards dismissed (home, family, cases, tools, settings)
  updatesDismissed?: string[]; // update alerts dismissed or opened (news ids)
  icloudAsk?: boolean; // after a restore: ask "Turn on iCloud backup on this phone?"
  toursSeen?: string[]; // first-visit tips already shown (screen ids)
  toursOff?: boolean; // "Skip all tips"
  toursAll?: boolean; // v2.7: "Show tips on each screen" (off by default — only Home's one tip auto-shows)
  notifAskedAt?: string; // when the notification explainer was shown
  alerts?: { cases?: boolean; bulletin?: boolean; docs?: boolean }; // which alerts (default all on)
  bulletinSeen?: string; // last Visa Bulletin month the app saw (for the new-bulletin alert)
  icloud?: { on: boolean; wifiOnly: boolean; lastAt?: string; lastError?: string; lastAttemptAt?: string; failures?: number }; // iCloud automatic backup (v2.2)
  widgetNames?: 'initials' | 'first'; // v2.5 home-screen widgets: how names show (default initials)
  widgetHideLocked?: boolean; // v2.5: hide widget details while Face ID lock is on (default true)
  walletName?: 'full' | 'first' | 'initials'; // v2.5 Wallet status card: last name style picked
  setup?: SetupProgress; // v3.0 onboarding in progress (cleared when finished); setupDone stays the gate
  guideSeen?: boolean; // v3.0 guided tour offered (setup Done), taken, or its Home card closed
};

/** v3.0 onboarding progress (kept in settings, no new storage key). */
export type SetupProgress = {
  step: string; // the step to resume at (core/onboarding SetupStep)
  later?: boolean; // Finish later tapped: open Home, show Continue setup there
  dismissed?: boolean; // Continue setup card closed on Home
  rerun?: boolean; // Settings, Run setup again (keeps data, fills gaps)
  docsLater?: string[]; // document rows put off ("pid:step")
  at?: string; // ISO timestamp of the last change
  since?: string; // v3.0 fix8: when this setup began (documents saved before it show as Added earlier)
  /** v3.0 fix8 / bulk2: documents from the last Add several at once, for the review list (core/match BulkEntry; `by` = older entries). */
  bulk?: { id: string; ownerId?: string; by?: 'passport number' | 'name' | 'none' | 'moved'; state?: 'filed' | 'ask' | 'duplicate' | 'moved'; why?: ('passport number' | 'name' | 'date of birth')[]; name?: string; close?: string; dupOf?: string; rename?: { id: string; to: string } }[];
  bulkPending?: Document[]; // bulk2: read documents waiting for Whose document is this? (saved once answered)
  bulkUnread?: number; // ...and how many of the picked files couldn't be read
  bulkNoText?: number; // ...of those, how many had no readable text at all (the rest had text but aren't a known document)
};

export const DEFAULT_SETTINGS: Settings = { reminderLeadDays: [180, 90, 30, 7] };

export const RELATION_LABEL: Record<Relation, string> = { self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', other: 'Family' };

/** 'Work permit (EAD)' → 'work permit (EAD)': lower-case only the first letter, so form names keep their case. */
export const lowerFirst = (x: string) => (/^[A-Z][a-z]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
