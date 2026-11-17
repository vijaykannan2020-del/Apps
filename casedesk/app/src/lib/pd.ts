// Priority date tracker: compares the person's priority date with each month's Visa Bulletin,
// keeps a month-by-month history on the phone and notifies once when the date becomes current.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BULLETIN, Bulletin, Country, isCurrent } from '../data/bulletin';
import { fetchOr } from './api';

export type PdSettings = { pd: string; category: string; country: Country; notify: boolean; notified?: string[] };
export type PdSnap = { month: string; final: string | null; filing: string | null };
const KEY = 'cd.pd.v1';
const HIST = 'cd.pdhist.v1';

export async function loadPd(): Promise<PdSettings | null> {
  try { const r = await AsyncStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export async function savePd(p: PdSettings | null) {
  if (p) await AsyncStorage.setItem(KEY, JSON.stringify(p)); else await AsyncStorage.removeItem(KEY);
}
export async function loadHistory(): Promise<Record<string, PdSnap[]>> {
  try { return JSON.parse((await AsyncStorage.getItem(HIST)) || '{}'); } catch { return {}; }
}

export async function getBulletin(): Promise<{ b: Bulletin; live: boolean }> {
  const r = await fetchOr<Bulletin>('/api/visa-bulletin', BULLETIN);
  return { b: r.data, live: r.live };
}

const monthKey = (m: string) => { const d = new Date(`1 ${m}`); return isNaN(+d) ? m : d.toISOString().slice(0, 7); };

// Remember this month's cutoffs for every category/country so movement can be shown over time.
export async function recordBulletin(b: Bulletin) {
  const hist = await loadHistory();
  const mk = monthKey(b.month);
  for (const row of b.rows) {
    for (const c of Object.keys(row.final) as Country[]) {
      const k = `${row.cat}|${c}`;
      const list = (hist[k] || []).filter((s) => s.month !== mk);
      list.push({ month: mk, final: row.final[c], filing: row.filing[c] });
      hist[k] = list.sort((a, b2) => a.month.localeCompare(b2.month)).slice(-36);
    }
  }
  await AsyncStorage.setItem(HIST, JSON.stringify(hist));
  return hist;
}

export type PdResult = { month: string; final: string | null; filing: string | null; finalCurrent: boolean; filingCurrent: boolean; gapFinalDays: number | null; gapFilingDays: number | null; uscisChart: 'final' | 'filing' };
const gap = (pd: string, cut: string | null) => (!cut || cut === 'C' || cut === 'U' ? null : Math.round((new Date(pd).getTime() - new Date(cut).getTime()) / 864e5));

export function evaluate(p: PdSettings, b: Bulletin): PdResult | null {
  const row = b.rows.find((r) => r.cat === p.category);
  if (!row) return null;
  const final = row.final[p.country], filing = row.filing[p.country];
  return {
    month: b.month, final, filing, uscisChart: b.uscisChart,
    finalCurrent: isCurrent(p.pd, final), filingCurrent: filing ? isCurrent(p.pd, filing) : false,
    gapFinalDays: gap(p.pd, final), gapFilingDays: gap(p.pd, filing),
  };
}

// Average forward movement per month of the Final Action date over the stored history (days/month).
export function pace(snaps: PdSnap[], which: 'final' | 'filing' = 'final'): number | null {
  const pts = snaps.filter((s) => s[which] && /^\d{4}-\d{2}-\d{2}$/.test(s[which]!));
  if (pts.length < 3) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const months = (new Date(last.month + '-01').getTime() - new Date(first.month + '-01').getTime()) / (30.44 * 864e5);
  if (months < 2) return null;
  return (new Date(last[which]!).getTime() - new Date(first[which]!).getTime()) / 864e5 / months;
}

export const humanGap = (days: number) => {
  const m = Math.round(days / 30.44);
  if (m < 1) return 'less than a month';
  const y = Math.floor(m / 12), r = m % 12;
  return [y ? `${y} year${y > 1 ? 's' : ''}` : '', r ? `${r} month${r > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ');
};

// Background / launch check: notify once per bulletin month when the date turns current.
export async function checkPriorityDate(notify = true) {
  const p = await loadPd();
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.pd)) return null;
  const { b, live } = await getBulletin();
  if (live) await recordBulletin(b);
  const r = evaluate(p, b);
  if (!r || !notify || !p.notify || Platform.OS === 'web') return r;
  const usable = r.uscisChart === 'filing' ? r.filingCurrent : r.finalCurrent;
  const key = `${b.month}|${r.finalCurrent ? 'final' : usable ? 'filing' : 'no'}`;
  if ((r.finalCurrent || usable) && !(p.notified || []).includes(key)) {
    const N = require('expo-notifications');
    await N.scheduleNotificationAsync({
      content: {
        title: r.finalCurrent ? `Your priority date is current — ${b.month}` : `You can file your I-485 — ${b.month}`,
        body: r.finalCurrent ? `${p.category} ${p.country === 'all' ? '' : '(' + p.country + ') '}Final Action date passed your ${p.pd}.` : `USCIS is using Dates for Filing and your ${p.category} date is current.`,
        data: { url: '/tools/priority-date' },
      },
      trigger: null,
    });
    await savePd({ ...p, notified: [...(p.notified || []), key].slice(-24) });
  }
  return r;
}
