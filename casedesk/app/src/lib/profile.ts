import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

export const VISA_TYPES = ['H-1B', 'L-1A', 'L-1B', 'TN', 'F-1 OPT', 'STEM OPT', 'H-4', 'H-4 EAD', 'L-2S', 'L-2', 'TD', 'F-1', 'F-2', 'B-1/B-2', 'B-2', 'Green card pending'] as const;
export type VisaType = (typeof VISA_TYPES)[number];

// Statuses offered for each person: dependents only see dependent/student/visitor statuses, no work visas.
export const MY_VISAS: VisaType[] = ['H-1B', 'L-1A', 'L-1B', 'TN', 'F-1 OPT', 'STEM OPT', 'H-4', 'H-4 EAD', 'L-2S', 'Green card pending'];
export function visasFor(relation?: string): VisaType[] {
  switch (relation) {
    case 'Spouse': return ['H-4', 'H-4 EAD', 'L-2S', 'L-2', 'TD', 'F-2', 'Green card pending', 'B-1/B-2', 'B-2'];
    case 'Child': return ['H-4', 'L-2', 'TD', 'F-1', 'F-2', 'Green card pending', 'B-1/B-2', 'B-2'];
    case 'Parent': return ['B-1/B-2', 'B-2', 'Green card pending'];
    case 'Other': return [...VISA_TYPES];
    default: return MY_VISAS;
  }
}
// Statuses that come with their own I-797 approval (or follow the principal's)
export const hasApprovalNotice = (v: VisaType) => ['H-1B', 'L-1A', 'L-1B', 'TN', 'H-4', 'H-4 EAD', 'L-2S', 'L-2'].includes(v);
export const canBeBlanket = (v: VisaType) => ['L-1A', 'L-1B', 'L-2S', 'L-2'].includes(v);
export const isBlanket = (p: { visa: VisaType; blanket?: boolean }) => !!p.blanket && canBeBlanket(p.visa);

export type Profile = {
  visa: VisaType;
  visaSet?: boolean; // false = not confirmed yet (CaseDesk never assumes a visa type)
  name?: string; // used to match scanned documents to the right person
  employer?: string;
  blanket?: boolean; // L-1 (or L-2 dependent) admitted under a blanket L petition with Form I-129S — no individual I-797
  i94Expiry?: string; // "Admit Until" date on the I-94
  petitionEnd?: string; // validity end on I-797 approval
  passportExpiry?: string;
  passportNo?: string; // links this person's passport, visa stamp and I-94
  oldPassportNos?: string[]; // earlier (superseded) passports of the same person
  location?: 'US' | 'Outside'; // where the person is now (an I-94 means they're in the US)
  country?: string; // when outside the US, e.g. India
  legalName?: string; // full name as on the passport (the typed name is only what the family calls them)
  birthDate?: string;
  visaStampExpiry?: string;
  eadExpiry?: string;
  statusStart?: string; // first day in H-1B / L-1 (for the max-stay clock)
  i140Approved?: boolean;
  extFiled?: string; // date an extension / renewal was filed
  extReceipt?: string;
  extKind?: PetitionKind; // what the pending I-129 / I-539 is: extension, amendment, transfer (change of employer)…
  i94IssuedOn?: string; // issue date of the current I-94: CBP "Most Recent Date of Entry", or the I-797A notice date
  i94Class?: string; // class printed on the current I-94 (L2 vs L2S matters for an L-2 spouse)
  approvalNoticeDate?: string; // notice date of the current approval (the one petitionEnd comes from)
  approvals?: Approval[]; // every status approval saved (newest notice = current; the rest are superseded)
  workLocation?: WorkLocation; // where the employee works now (H-1B: a move to another metro needs an amendment)
  approvedWorkLocation?: WorkLocation; // work location the current approval / LCA is for (the I-797A doesn't print it — asked)
  visaFrom?: 'Visa stamp' | 'I-94' | 'Approval'; // which document set the visa type (approval > I-94 > visa stamp)
  approvalClass?: string; // class on the current approval / I-129S (H1B, L1A, L1B…) — compared with the I-94 class
  jobEnded?: string; // last day of employment (layoff / resignation) — starts the 60-day grace period
  travelPlanned?: boolean; // planning to leave the US soon (matters while an extension is pending)
  updated?: string;
};

export type PetitionKind = 'new' | 'extension' | 'amendment' | 'transfer';
export type WorkLocation = { city?: string; state?: string; metro?: string };
export type Approval = {
  kind?: PetitionKind;
  form?: string; // I-129, I-539, I-129S
  receipt?: string;
  noticeDate?: string;
  validFrom?: string;
  validTo?: string;
  employer?: string;
  cls?: string; // class on the approval (H1B, L1B, H4…)
  workLocation?: WorkLocation;
  superseded?: boolean;
};

const KEY = 'cd.profile.v1';
const listeners = new Set<() => void>();

export async function loadProfile(): Promise<Profile | null> {
  try { const r = await AsyncStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export async function saveProfile(p: Profile | null) {
  try {
    if (p) await AsyncStorage.setItem(KEY, JSON.stringify({ ...p, updated: new Date().toISOString().slice(0, 10) }));
    else await AsyncStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
  // keep date reminders in step with the saved dates
  import('./alerts').then((a) => a.applyAlerts()).catch(() => {});
}
export function useProfile(): [Profile | null, boolean] {
  const [p, setP] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const load = useCallback(() => { loadProfile().then((v) => { setP(v); setReady(true); }); }, []);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  return [p, ready];
}

export const usesEAD = (v: VisaType) => ['F-1 OPT', 'STEM OPT', 'H-4 EAD', 'Green card pending'].includes(v);
export const hasPetition = (v: VisaType) => ['H-1B', 'L-1A', 'L-1B', 'TN'].includes(v);

// What to show for someone's visa: never a guessed one.
export const visaLabel = (p?: Profile | null) => (!p ? '' : p.visaSet === false ? 'Visa not confirmed' : p.visa);
