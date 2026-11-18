import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

export type CaseEvent = { date: string; status: string };
export type TrackedCase = {
  receipt: string;
  nickname?: string;
  form?: string;
  status?: string;
  detail?: string;
  updated?: string;
  history: CaseEvent[];
  demo?: boolean;
  owner?: string; // 'me' or a family member id
};

export type I9Record = {
  id: string;
  name: string;
  visa: string;
  doc: string;
  expires: string; // YYYY-MM-DD — work authorization end (I-9 reverification)
  notes?: string;
  // Employer mode (optional)
  i94?: string;
  petitionEnd?: string;
  passport?: string;
  ead?: string;
  team?: string;
};

const KEYS = { cases: 'cd.cases.v1', i9: 'cd.i9.v1' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export async function write<T>(key: string, value: T) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
  emit();
  if (key === KEYS.i9 || key === 'cd.family.v1' || key === 'cd.pd.v1') import('./alerts').then((a) => a.scheduleReminders()).catch(() => {});
}

export function useStored<T>(key: string, fallback: T): [T, (v: T) => Promise<void>, boolean] {
  const [val, setVal] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const load = useCallback(() => { read(key, fallback).then((v) => { setVal(v); setReady(true); }); }, [key]);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  return [val, (v: T) => write(key, v), ready];
}

export const useCases = () => useStored<TrackedCase[]>(KEYS.cases, []);
export const useI9 = () => useStored<I9Record[]>(KEYS.i9, []);

export async function upsertCase(c: TrackedCase) {
  const all = await read<TrackedCase[]>(KEYS.cases, []);
  const i = all.findIndex((x) => x.receipt === c.receipt);
  if (i >= 0) all[i] = { ...all[i], ...c }; else all.unshift(c);
  await write(KEYS.cases, all);
}
export async function removeCase(receipt: string) {
  const all = await read<TrackedCase[]>(KEYS.cases, []);
  await write(KEYS.cases, all.filter((x) => x.receipt !== receipt));
}
export async function saveI9(r: I9Record) {
  const all = await read<I9Record[]>(KEYS.i9, []);
  const i = all.findIndex((x) => x.id === r.id);
  if (i >= 0) all[i] = r; else all.unshift(r);
  await write(KEYS.i9, all);
}
export async function removeI9(id: string) {
  const all = await read<I9Record[]>(KEYS.i9, []);
  await write(KEYS.i9, all.filter((x) => x.id !== id));
}
export async function importI9(recs: I9Record[]) {
  const all = await read<I9Record[]>(KEYS.i9, []);
  for (const r of recs) {
    const i = all.findIndex((x) => x.name.toLowerCase() === r.name.toLowerCase());
    if (i >= 0) all[i] = { ...all[i], ...r, id: all[i].id }; else all.push(r);
  }
  await write(KEYS.i9, all);
}
