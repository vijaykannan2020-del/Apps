import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

export const VISA_TYPES = ['H-1B', 'L-1A', 'L-1B', 'TN', 'F-1 OPT', 'STEM OPT', 'H-4', 'H-4 EAD', 'L-2S', 'Green card pending'] as const;
export type VisaType = (typeof VISA_TYPES)[number];

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
