// News feed: built-in briefs, replaced by the live CaseDesk server feed (/api/news) when it answers.
// Live items come first; curated built-in briefs the live feed doesn't cover are kept.
import { useEffect, useSyncExternalStore } from 'react';
import { STARTER_NEWS, STARTER_WEB_NEWS, type NewsItem } from '../content/news';
import { getJSON } from './api';

export type { NewsItem };
const BUILT_IN: NewsItem[] = [...STARTER_NEWS.map((n) => ({ ...n, kind: 'official' as const })), ...STARTER_WEB_NEWS];
const byDate = (a: NewsItem, b: NewsItem) => (b.date || '').localeCompare(a.date || '');
let state: { items: NewsItem[]; live: boolean; loaded: boolean; updated?: string } = { items: [...BUILT_IN].sort(byDate), live: false, loaded: false };
const subs = new Set<() => void>();
let loading: Promise<void> | null = null;

export function loadNews(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const d = await getJSON<{ items: NewsItem[]; updated?: string }>('/api/news');
      if (!Array.isArray(d?.items) || !d.items.length) throw new Error('empty');
      const key = (n: NewsItem) => n.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 60);
      const seen = new Set(d.items.map(key));
      state = { items: [...d.items, ...BUILT_IN.filter((n) => !seen.has(key(n)))].sort(byDate), live: true, loaded: true, updated: d.updated ?? new Date().toISOString() };
    } catch {
      state = { ...state, loaded: true };
      loading = null; // try again next time
    }
    subs.forEach((f) => f());
  })();
  return loading;
}
export function useNews() {
  const s = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => state);
  useEffect(() => { loadNews(); }, []);
  return s;
}
export const newsById = (id?: string) => state.items.find((n) => n.id === id) ?? BUILT_IN.find((n) => n.id === id);
export const kindOf = (n: NewsItem) => n.kind ?? 'official';
/** The headlines already on this phone (no network call) — for the Home search. */
export const newsOnPhone = () => state.items;
