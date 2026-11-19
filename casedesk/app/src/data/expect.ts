// "What to expect" data: asks the server (GET /api/expect — form, office code, received date, premium, class only),
// keeps the last answer per query on the phone, and falls back to the built-in summary when offline.
// "Cases like mine" sharing is opt-in per case and stored under the same key the old app used (cd.community.v1),
// so people who shared before keep their anonymous entry.
import { useEffect, useState } from 'react';
import type { KV } from './kv';
import { apiBase, getJSON } from './api';
import { asyncKV } from '../native/asyncKV';
import type { CaseView } from '../core/cases';
import { expectQuery, localExpect, randomId, sharePayload, type ExpectInput, type ExpectResult } from '../core/expect';

const CACHE = 'iw.expect.cache.v1';
const PREFS = 'cd.community.v1';
export type CasePrefs = { id: string; on: boolean; premium?: boolean; cls?: string };

let kv: KV | null = null;
const store = () => (kv ??= asyncKV());
/** Tests: use a memory store. */
export const _useKV = (k: KV) => { kv = k; };

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await store().getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
const writeJSON = (key: string, v: unknown) => store().setItem(key, JSON.stringify(v)).catch(() => {});

export type ExpectState = { result: ExpectResult; live: boolean; cachedAt?: string; loading: boolean };

/** Server answer → cached answer (with its date) → built-in summary. */
export async function loadExpect(q: ExpectInput, get: <T>(path: string) => Promise<T> = (p) => getJSON(p)): Promise<Omit<ExpectState, 'loading'>> {
  const key = expectQuery(q);
  try {
    const result = await get<ExpectResult>(key);
    if (!result?.query) throw new Error('bad answer');
    const cache = await readJSON<Record<string, { at: string; result: ExpectResult }>>(CACHE, {});
    cache[key] = { at: new Date().toISOString(), result };
    const keys = Object.keys(cache);
    if (keys.length > 40) for (const k of keys.sort((a, b) => cache[a].at.localeCompare(cache[b].at)).slice(0, keys.length - 40)) delete cache[k];
    await writeJSON(CACHE, cache);
    return { result, live: true };
  } catch {
    const cache = await readJSON<Record<string, { at: string; result: ExpectResult }>>(CACHE, {});
    const hit = cache[key];
    if (hit) return { result: hit.result, live: false, cachedAt: hit.at };
    return { result: localExpect(q), live: false };
  }
}

export function useExpect(q: ExpectInput | null): ExpectState | null {
  const key = q ? expectQuery(q) : '';
  const [s, set] = useState<ExpectState | null>(q ? { result: localExpect(q), live: false, loading: true } : null);
  useEffect(() => {
    if (!q) { set(null); return; }
    let on = true;
    set({ result: localExpect(q), live: false, loading: true });
    loadExpect(q).then((r) => { if (on) set({ ...r, loading: false }); }).catch(() => { if (on) set((x) => (x ? { ...x, loading: false } : x)); });
    return () => { on = false; };
  }, [key]);
  return s;
}

// ---------- per-case preferences and anonymous sharing ----------
export async function getPrefs(receipt: string): Promise<CasePrefs | null> {
  const all = await readJSON<Record<string, CasePrefs>>(PREFS, {});
  return all[receipt] ?? null;
}
export async function setPrefs(receipt: string, patch: Partial<CasePrefs>): Promise<CasePrefs> {
  const all = await readJSON<Record<string, CasePrefs>>(PREFS, {});
  const next: CasePrefs = { ...all[receipt], ...patch, on: patch.on ?? all[receipt]?.on ?? false, id: all[receipt]?.id || randomId() };
  all[receipt] = next;
  await writeJSON(PREFS, all);
  return next;
}

type Send = (method: 'POST' | 'DELETE', body: unknown) => Promise<boolean>;
const send: Send = async (method, body) => {
  const b = apiBase();
  if (!b) return false;
  try { const r = await fetch(`${b}/api/community`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.ok; } catch { return false; }
};

/** Push the current state of a shared case (no-op unless the person opted in). */
export async function syncShare(c: CaseView, prefs: CasePrefs | null, post: Send = send): Promise<boolean> {
  if (!prefs?.on) return false;
  const body = sharePayload(prefs.id, c, prefs.cls, prefs.premium);
  return body ? post('POST', body) : false;
}
/** Turn sharing on or off. Off deletes the entry on the server. */
export async function toggleShare(c: CaseView, on: boolean, post: Send = send): Promise<CasePrefs | null> {
  if (!c.receipt) return null;
  const p = await setPrefs(c.receipt, { on });
  if (on) await syncShare(c, p, post); else await post('DELETE', { id: p.id });
  return p;
}

export function usePrefs(receipt?: string) {
  const [p, set] = useState<CasePrefs | null>(null);
  useEffect(() => { let on = true; if (receipt) getPrefs(receipt).then((x) => on && set(x)); else set(null); return () => { on = false; }; }, [receipt]);
  const update = async (patch: Partial<CasePrefs>) => { if (!receipt) return null; const n = await setPrefs(receipt, patch); set(n); return n; };
  return { prefs: p, setPrefsState: set, update };
}
