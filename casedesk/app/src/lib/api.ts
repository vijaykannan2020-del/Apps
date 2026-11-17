import Constants from 'expo-constants';
import { STARTER_NEWS, STARTER_WEB_NEWS, NewsItem } from '../data/news';
import { stripHtml } from './caseStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lookupOnPhone, phoneLookupAvailable } from '../components/UscisLookup';

// Set "extra.apiBase" in app.json to your Oracle server, e.g. https://api.casedesk.app
export const API_BASE: string = (Constants.expoConfig?.extra as any)?.apiBase || '';
export const isLive = () => !!API_BASE;

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${r.status}`);
  }
  return r.json();
}

export type CaseResult = { receipt: string; form?: string; status: string; detail: string; updated?: string; history: { date: string; status: string }[]; demo?: boolean };

// Case status: on the phone, read straight from USCIS Case Status Online (egov.uscis.gov) in an
// in-app browser — USCIS blocks servers, and this keeps the receipt number between the phone and USCIS.
// Background checks (no screen) use the server, which only works once USCIS API keys are set there.
export async function fetchCase(receipt: string, opts: { background?: boolean } = {}): Promise<CaseResult> {
  if (!opts.background && phoneLookupAvailable()) {
    const w = await lookupOnPhone(receipt);
    let history: CaseResult['history'] = [];
    try {
      const all = JSON.parse((await AsyncStorage.getItem('cd.cases.v1')) || '[]');
      history = all.find((c: any) => c.receipt === receipt)?.history || [];
    } catch {}
    const date = w.date || new Date().toISOString().slice(0, 10);
    if (!history.length || history[0].status !== w.status) history = [{ date, status: w.status }, ...history];
    return { receipt, form: w.form, status: w.status, detail: w.detail, updated: w.date || history[0]?.date, history };
  }
  if (!API_BASE) return demoCase(receipt);
  const d = await get<any>(`/api/case/${receipt}`);
  return { ...d, detail: stripHtml(d.detail) };
}

const BUILT_IN = [...STARTER_NEWS.map((n) => ({ ...n, kind: 'official' as const })), ...STARTER_WEB_NEWS];
export async function fetchNews(): Promise<{ items: NewsItem[]; live: boolean }> {
  if (!API_BASE) return { items: BUILT_IN, live: false };
  try {
    const d = await get<{ items: NewsItem[] }>('/api/news');
    return { items: d.items.length ? d.items : BUILT_IN, live: true };
  } catch {
    return { items: BUILT_IN, live: false };
  }
}

// Generic: use server data when available, else the built-in copy
export async function fetchOr<T>(path: string, fallback: T): Promise<{ data: T; live: boolean }> {
  if (!API_BASE) return { data: fallback, live: false };
  try { return { data: await get<T>(path), live: true }; } catch { return { data: fallback, live: false }; }
}

export type WageLevels = { soc: string; title: string; area: string; areaName: string; hourly: [number, number, number, number]; wageYear: string };
export const fetchWage = (soc: string, area: string) => get<WageLevels>(`/api/wage?soc=${soc}&area=${area}`);
export const searchSoc = (q: string) => get<{ items: { code: string; title: string }[] }>(`/api/wage/soc?q=${encodeURIComponent(q)}`);
export const wageStates = () => get<{ items: { code: string; name: string }[] }>('/api/wage/states');
export const wageCounties = (state: string) => get<{ items: { county: string; area: string; areaName: string }[] }>(`/api/wage/counties?state=${state}`);

export type EmployerYear = { fy: string; initialApproval: number; initialDenial: number; continuingApproval: number; continuingDenial: number };
export type EmployerResult = { name: string; state?: string; h1b: EmployerYear[]; perm: { fy: string; certified: number; denied: number; withdrawn: number }[]; lca: { fy: string; certified: number }[] };
export const searchEmployers = (q: string) => get<{ items: EmployerResult[] }>(`/api/employer?q=${encodeURIComponent(q)}`);

// ---- Demo mode (no server configured): clearly labelled sample data ----
function demoCase(receipt: string): CaseResult {
  const n = parseInt(receipt.slice(-2), 10) % 4;
  const today = new Date();
  const d = (days: number) => new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
  const options = [
    { form: 'I-129', status: 'Case Was Approved', detail: 'Sample: we approved your Form I-129 and mailed you an approval notice.', history: [{ date: d(2), status: 'Case Was Approved' }, { date: d(19), status: 'Case Was Received' }] },
    { form: 'I-765', status: 'Case Is Being Actively Reviewed By USCIS', detail: 'Sample: your case is being actively reviewed.', history: [{ date: d(9), status: 'Case Is Being Actively Reviewed By USCIS' }, { date: d(40), status: 'Fingerprint Fee Was Received' }, { date: d(55), status: 'Case Was Received' }] },
    { form: 'I-539', status: 'Request for Additional Evidence Was Sent', detail: 'Sample: we sent you a request for evidence. Respond by the deadline on the notice.', history: [{ date: d(5), status: 'Request for Additional Evidence Was Sent' }, { date: d(70), status: 'Case Was Received' }] },
    { form: 'I-485', status: 'Card Was Mailed To Me', detail: 'Sample: your new card was mailed.', history: [{ date: d(1), status: 'Card Was Mailed To Me' }, { date: d(6), status: 'Case Was Approved' }, { date: d(200), status: 'Case Was Received' }] },
  ][n];
  return { receipt, ...options, updated: options.history[0].date, demo: true };
}
