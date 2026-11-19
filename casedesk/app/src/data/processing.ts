// Processing times: built-in snapshot, replaced by the CaseDesk server's live copy when it answers.
import { useEffect, useSyncExternalStore } from 'react';
import { PROCESSING, type PT } from '../content/processing';
import { fetchOr } from './api';

let state: { data: PT[]; live: boolean; fetchedAt?: string } = { data: PROCESSING, live: false };
const subs = new Set<() => void>();
let started = false;
export function useProcessing() {
  const s = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => state);
  useEffect(() => {
    if (started) return; started = true;
    fetchOr<PT[]>('/api/processing-times', PROCESSING).then((r) => { if (Array.isArray(r.data) && r.data.length) { state = { data: r.data, live: r.live, fetchedAt: r.fetchedAt }; subs.forEach((f) => f()); } }).catch(() => { started = false; });
  }, []);
  return s;
}
export const monthsFor = (data: PT[], form: string, category: string) => (data.find((p) => p.form === form && p.category === category) ?? PROCESSING.find((p) => p.form === form && p.category === category))?.months;
