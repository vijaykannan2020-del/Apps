import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

export const VISA_TYPES = ['H-1B', 'L-1A', 'L-1B', 'TN', 'F-1 OPT', 'STEM OPT', 'H-4', 'H-4 EAD', 'L-2S', 'L-2', 'TD', 'F-1', 'F-2', 'B-1/B-2', 'Green card pending'] as const;
export type VisaType = (typeof VISA_TYPES)[number];

// Statuses offered for each person: dependents only see dependent/student/visitor statuses, no work visas.
export const MY_VISAS: VisaType[] = ['H-1B', 'L-1A', 'L-1B', 'TN', 'F-1 OPT', 'STEM OPT', 'H-4', 'H-4 EAD', 'L-2S', 'Green card pending'];
export function visasFor(relation?: string): VisaType[] {
  switch (relation) {
    case 'Spouse': return ['H-4', 'H-4 EAD', 'L-2S', 'TD', 'F-2', 'Green card pending', 'B-1/B-2'];
    case 'Child': return ['H-4', 'L-2', 'TD', 'F-1', 'F-2', 'Green card pending', 'B-1/B-2'];
    case 'Parent': return ['B-1/B-2', 'Green card pending'];
    case 'Other': return [...VISA_TYPES];
    default: return MY_VISAS;
  }
}
// Statuses that come with their own I-797 approval (or follow the principal's)
export const hasApprovalNotice = (v: VisaType) => ['H-1B', 'L-1A', 'L-1B', 'TN', 'H-4', 'H-4 EAD', 'L-2S', 'L-2'].includes(v);

export type Profile = {
  visa: VisaType;
  employer?: string;
  i94Expiry?: string; // "Admit Until" date on the I-94
  petitionEnd?: string; // validity end on I-797 approval
  passportExpiry?: string;
  visaStampExpiry?: string;
  eadExpiry?: string;
  statusStart?: string; // first day in H-1B / L-1 (for the max-stay clock)
  i140Approved?: boolean;
  extFiled?: string; // date an extension / renewal was filed
  extReceipt?: string;
  updated?: string;
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
