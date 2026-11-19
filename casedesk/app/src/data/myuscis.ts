// Case status syncs on the phone: saved snapshots per case (cd2.myuscis.v1 — wiped by Delete all data,
// not part of backups), "changes since last sync", unseen badges, the notice checklist's dismissed
// items, the raw answers of the last myUSCIS sync (for "Share raw data for support"), the weekly
// "Check your open cases" reminder and the optional Live check (official USCIS Case Status API via
// our server — shown only when the server says it runs with production keys).
// Nothing here is sent anywhere, except the receipt number for a Live check the person turned on.
import { useEffect, useState } from 'react';
import type { KV } from './kv';
import { asyncKV } from '../native/asyncKV';
import { native } from '../native/safe';
import { getJSON, apiBase } from './api';
import type { Actions } from './actions';
import type { CaseView } from '../core/cases';
import type { Settings } from '../core/model';
import { alertOn } from '../core/notify';
import { applySync, buildSnapshot, changeAlert, diffSnapshots, liveDue, liveToPart, type Change, type Diff, type MySnapshot, type ParseOk } from '../core/myuscis';
import type { EndpointReport } from '../core/myuscisWeb';

const KEY = 'cd2.myuscis.v1';
const RAW = 'cd2.myuscis.raw.v1';
const KEEP = 12;

export type CaseSync = {
  snaps: MySnapshot[]; // oldest → newest, last KEEP
  changes?: { at: string; list: Change[]; silentAt?: string }; // last sync that found something
  lastAt?: string; lastSource?: string; // last saved sync (any result)
  unseen?: boolean; // badge on the case until its sync page is opened
  dismissed?: string[]; // notice checklist entries the person hid
  lastLiveAt?: string;
  report?: { at: string; items: EndpointReport[] }; // last in-app myUSCIS sync: per endpoint
};
export type SyncPrefs = { weekly?: boolean; live?: boolean; webNoticeSeen?: boolean };
type State = { v: 1; cases: Record<string, CaseSync>; prefs: SyncPrefs };
const EMPTY: State = { v: 1, cases: {}, prefs: {} };

let kv: KV | null = null;
const store = () => (kv ??= asyncKV());
/** Tests: use a memory store. */
export const _useKV = (k: KV) => { kv = k; mem = null; };

let mem: State | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => { try { f(); } catch {} });

export async function loadSync(): Promise<State> {
  if (mem) return mem;
  try { const raw = await store().getItem(KEY); const x = raw ? JSON.parse(raw) : null; mem = x && x.v === 1 && x.cases ? x : { ...EMPTY, cases: {} }; } catch { mem = { ...EMPTY, cases: {} }; }
  return mem!;
}
async function save(next: State) { mem = next; emit(); try { await store().setItem(KEY, JSON.stringify(next)); } catch {} }
async function patchCase(id: string, fn: (c: CaseSync) => CaseSync) { const s = await loadSync(); await save({ ...s, cases: { ...s.cases, [id]: fn(s.cases[id] ?? { snaps: [] }) } }); }

export function useSyncState(): State {
  const [s, set] = useState<State>(mem ?? EMPTY);
  useEffect(() => { let on = true; const up = () => { if (on && mem) set(mem); }; subs.add(up); loadSync().then(up); return () => { on = false; subs.delete(up); }; }, []);
  return s;
}
export const useCaseSync = (id?: string): CaseSync | undefined => { const s = useSyncState(); return id ? s.cases[id] : undefined; };
export const lastSnap = (c?: CaseSync) => c?.snaps[c.snaps.length - 1];

export async function setPrefs(p: Partial<SyncPrefs>) { const s = await loadSync(); await save({ ...s, prefs: { ...s.prefs, ...p } }); }
export const markSeen = (id: string) => patchCase(id, (c) => (c.unseen ? { ...c, unseen: false } : c));
export const dismissNotice = (id: string, key: string) => patchCase(id, (c) => ({ ...c, dismissed: [...new Set([...(c.dismissed ?? []), key])] }));
export const saveReport = (id: string, items: EndpointReport[]) => patchCase(id, (c) => ({ ...c, report: { at: new Date().toISOString(), items } }));

/** Raw answers of the last in-app myUSCIS sync (one case at a time), for "Share raw data for support". */
export async function saveRaw(id: string, items: { id: string; method: string; status: number; text: string }[]) {
  try { await store().setItem(RAW, JSON.stringify({ caseId: id, at: new Date().toISOString(), items })); } catch {}
}
export async function readRaw(id: string): Promise<string | null> {
  try { const raw = await store().getItem(RAW); const x = raw ? JSON.parse(raw) : null; return x?.caseId === id ? JSON.stringify(x, null, 2) : null; } catch { return null; }
}

export type SaveResult = { ok: true; diff: Diff; snap: MySnapshot } | { ok: false; message: string };
/**
 * Save one sync: snapshot → diff with the previous one → case status/history (applySync) →
 * badge + notification when something changed. In the foreground a status change is already
 * announced by the app's case-change alert, so only the other changes notify here.
 */
export async function saveSync(view: CaseView, parts: ParseOk[], actions: Pick<Actions, 'editCase'>, o: { settings?: Pick<Settings, 'alerts'>; foreground?: boolean; source: string }): Promise<SaveResult> {
  if (!view.receipt) return { ok: false, message: 'This case has no receipt number.' };
  const s = await loadSync();
  const rec = s.cases[view.id] ?? { snaps: [] };
  const prev = rec.snaps[rec.snaps.length - 1];
  const now = new Date().toISOString();
  const b = buildSnapshot(parts, view.receipt, prev, now);
  if (!b.ok) return b;
  const diff = diffSnapshots(prev, b.snap);
  await patchCase(view.id, (c) => ({
    ...c,
    snaps: [...c.snaps, b.snap].slice(-KEEP),
    lastAt: now, lastSource: o.source,
    ...(parts.some((p) => p.kind === 'live') ? { lastLiveAt: now } : {}),
    ...(diff.any ? { changes: { at: now, list: diff.changes, silentAt: diff.silent?.at }, unseen: true } : {}),
  }));
  await actions.editCase(view, (c) => applySync(c, b.snap, diff));
  const alert = changeAlert(diff, view.form);
  if (alert && (!o.settings || alertOn(o.settings, 'cases')) && !(o.foreground && diff.statusChanged)) notify({ ...alert, url: `/case/sync?id=${encodeURIComponent(view.id)}` });
  return { ok: true, diff, snap: b.snap };
}

async function notify(a: { title: string; body: string; url: string }) {
  const N = native.notifications();
  try {
    if (!N?.scheduleNotificationAsync) return;
    const p = await N.getPermissionsAsync();
    if (!p.granted) return;
    await N.scheduleNotificationAsync({ content: { title: a.title, body: a.body, data: { cd2sync: true, url: a.url } }, trigger: null });
  } catch {}
}

// ---------- weekly "Check your open cases" reminder ----------
/** Reschedule the weekly local reminder (Saturday 10:00). Off, or no open cases → none. Never asks for permission. */
export async function scheduleWeekly(on: boolean, openCount: number): Promise<boolean> {
  const N = native.notifications();
  if (!N?.scheduleNotificationAsync) return false;
  try {
    const pending = await N.getAllScheduledNotificationsAsync();
    for (const n of pending) if (n?.content?.data?.cd2weekly) await N.cancelScheduledNotificationAsync(n.identifier);
    if (!on || openCount < 1) return true;
    const p = await N.getPermissionsAsync();
    if (!p.granted) return false;
    await N.scheduleNotificationAsync({
      content: { title: 'Check your open cases', body: `${openCount} open case${openCount === 1 ? '' : 's'} — a quick status check keeps your history up to date.`, data: { cd2weekly: true, url: '/(tabs)/cases' } },
      trigger: { type: N.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly', weekday: 7, hour: 10, minute: 0 },
    });
    return true;
  } catch { return false; }
}

// ---------- Live check (official API through our server) ----------
let health: { at: number; ok: boolean } | null = null;
/** Live check is offered only when the server has production USCIS keys (GET /api/health → uscisMode). */
export async function liveAvailable(getArg?: <T>(p: string) => Promise<T>): Promise<boolean> {
  if (!getArg && !apiBase()) return false;
  const get = getArg ?? ((p: string) => getJSON(p, 5000));
  if (!getArg && health && Date.now() - health.at < 30 * 60_000) return health.ok;
  try { const h: any = await get<{ uscis?: boolean; uscisMode?: string | null }>('/api/health'); health = { at: Date.now(), ok: !!h?.uscis && h?.uscisMode === 'production' }; }
  catch { health = { at: Date.now(), ok: false }; }
  return health.ok;
}
export function useLiveAvailable(): boolean {
  const [ok, set] = useState(!!health?.ok);
  useEffect(() => { let on = true; liveAvailable().then((x) => on && set(x)); return () => { on = false; }; }, []);
  return ok;
}
/** One Live check for one case (the receipt goes to our server only to ask USCIS). */
export async function liveCheck(view: CaseView, actions: Pick<Actions, 'editCase'>, o: { settings?: Pick<Settings, 'alerts'>; foreground: boolean }): Promise<SaveResult> {
  if (!view.receipt) return { ok: false, message: 'No receipt number.' };
  let j: any;
  try { j = await getJSON(`/api/case/${encodeURIComponent(view.receipt)}`, 12000); }
  catch (e: any) { return { ok: false, message: /404/.test(String(e?.message)) ? 'USCIS has no case with that receipt number.' : /429/.test(String(e?.message)) ? 'USCIS is busy — try again later.' : 'Live check isn’t available right now.' }; }
  const p = liveToPart(j);
  if (!p.ok) return { ok: false, message: p.message };
  return saveSync(view, [p], actions, { ...o, source: 'live' });
}
/** On app open (and from the background task): Live check every open case that is due (≥3 h). */
export async function liveCheckDue(cases: CaseView[], actions: Pick<Actions, 'editCase'>, o: { settings?: Pick<Settings, 'alerts'>; foreground: boolean }): Promise<number> {
  const s = await loadSync();
  if (!s.prefs.live || !(await liveAvailable())) return 0;
  const now = new Date().toISOString();
  let n = 0;
  for (const c of cases) {
    if (!liveDue(c, s.cases[c.id]?.lastLiveAt, now)) continue;
    const r = await liveCheck(c, actions, o);
    if (r.ok && r.diff.any) n++;
  }
  return n;
}

// ---------- background task (Live check only; registered only while the person has it on) ----------
export const LIVE_TASK = 'iw-live-check';
let defined = false;
export function defineLiveTask() {
  if (defined) return;
  defined = true;
  try {
    const TM = require('expo-task-manager');
    const BT = require('expo-background-task');
    TM.defineTask(LIVE_TASK, async () => {
      try {
        const { appStore } = require('./FamilyProvider');
        const { makeActions } = require('./actions');
        const { caseViews } = require('../core/cases');
        const { deriveRecord } = require('../core/record');
        const st = appStore();
        const snap = await st.snapshot();
        const records = Object.fromEntries(snap.people.map((p: any) => [p.id, deriveRecord(p, snap.docs)]));
        const views: CaseView[] = caseViews(snap.people, records, snap.docs, snap.cases);
        await liveCheckDue(views, makeActions(st), { settings: snap.settings, foreground: false });
        return BT.BackgroundTaskResult?.Success ?? 1;
      } catch { return BT.BackgroundTaskResult?.Failed ?? 2; }
    });
  } catch {}
}
/** Register or unregister the background Live check (~ every 4 h, iOS decides). */
export async function setLiveBackground(on: boolean) {
  try {
    const TM = require('expo-task-manager');
    const BT = require('expo-background-task');
    defineLiveTask();
    const has = await TM.isTaskRegisteredAsync(LIVE_TASK);
    if (on && !has) await BT.registerTaskAsync(LIVE_TASK, { minimumInterval: 240 });
    if (!on && has) await BT.unregisterTaskAsync(LIVE_TASK);
  } catch {}
}
