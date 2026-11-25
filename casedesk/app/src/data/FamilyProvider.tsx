// App-wide state: loads the store once, derives every person's record, the compliance results,
// missing steps and the case list (all in src/core), and re-derives after every save.
// Screens read from useFamily() and change things through `actions` — no logic in screens.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Case, Document, Person, Settings } from '../core/model';
import { DEFAULT_SETTINGS } from '../core/model';
import { deriveRecord, type PersonRecord } from '../core/record';
import { evaluateFamily, type PersonResult } from '../core/rules/engine';
import { missingSteps, type Step } from '../core/steps';
import { caseViews, type CaseView } from '../core/cases';
import { supersededIds } from '../core/docs';
import { Store, type Snapshot } from './store';
import { makeActions, type Actions } from './actions';
import { asyncKV } from '../native/asyncKV';
import { BULLETIN } from '../content/bulletin';
import type { VisaBulletin } from '../core/bulletin';
import { fetchOr } from './api';
import { bindDraft, draftFiles, restoreDraft, type Flow } from './flow';
import { sweepOrphans } from '../native/files';
import { referencedFiles } from '../core/files';
import { notifyNow, reminderItems, scheduleReminders } from '../native/reminders';
import { alertOn, bulletinAlert, caseChanges, pushTopics, statusMap } from '../core/notify';
import { syncPushAlerts } from './pushAlerts';
import { useICloudAuto } from './icloudBackup';
import { useWidgetSync } from './widgetSync';

export type FamilyState = Snapshot & {
  ready: boolean;
  records: Record<string, PersonRecord>;
  results: Record<string, PersonResult>;
  missing: Record<string, Step[]>;
  superseded: Set<string>;
  cases: Case[];
  caseList: CaseView[];
  main?: Person;
  store: Store;
  actions: Actions;
  bulletin: { data: VisaBulletin; live: boolean; fetchedAt?: string };
};

const empty: Snapshot = { people: [], docs: [], cases: [], settings: DEFAULT_SETTINGS };
const Ctx = createContext<FamilyState | null>(null);
let shared: Store | undefined;
export const appStore = () => (shared ??= new Store(asyncKV()));

const ORDER: Record<string, number> = { self: 0, spouse: 1, child: 2, parent: 3, other: 4 };

export function FamilyProvider({ children, store = appStore() }: { children: React.ReactNode; store?: Store }) {
  const [snap, setSnap] = useState<Snapshot>(empty);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    try { setSnap(await store.snapshot()); } catch { /* keep the last good state */ }
    setReady(true);
  }, [store]);
  useEffect(() => { reload(); return store.subscribe(reload); }, [store, reload]);
  // The in-progress document flow is kept in cd2.draft; then unreferenced files are swept once.
  // The sweep compares stored file NAMES only and is skipped when anything failed to load.
  useEffect(() => {
    bindDraft((d) => { store.saveDraft(d); });
    (async () => {
      const d = await store.draftStrict<Flow>();
      restoreDraft(d.data);
      const docs = await store.docsOrNull();
      if (!d.ok || !docs) return;
      sweepOrphans(referencedFiles(docs, draftFiles()));
    })().catch(() => { restoreDraft(null); });
  }, [store]);
  useICloudAuto(store); // iCloud automatic backup (no-op on builds without the module)
  const actions = useMemo(() => makeActions(store), [store]);
  const [bulletin, setBulletin] = useState<{ data: VisaBulletin; live: boolean; fetchedAt?: string }>({ data: BULLETIN, live: false });
  useEffect(() => { fetchOr<VisaBulletin>('/api/visa-bulletin', BULLETIN).then((b) => { if (b.data?.rows?.length) setBulletin(b); }).catch(() => {}); }, []);

  const derived = useMemo(() => {
    const people = [...snap.people].sort((a, b) => (ORDER[a.relation] ?? 9) - (ORDER[b.relation] ?? 9) || a.createdAt.localeCompare(b.createdAt));
    const records: Record<string, PersonRecord> = {};
    for (const p of people) { try { records[p.id] = deriveRecord(p, snap.docs); } catch { /* one bad document must not hide the family */ } }
    let results: Record<string, PersonResult> = {};
    try { results = evaluateFamily({ members: people.filter((p) => records[p.id]).map((p) => ({ person: p, rec: records[p.id] })), docs: snap.docs, settings: snap.settings, cases: snap.cases, bulletin: bulletin.data }); } catch { results = {}; }
    const missing: Record<string, Step[]> = {};
    const superseded = new Set<string>();
    for (const p of people) {
      if (!records[p.id]) continue;
      // one source of truth: the engine's list (the QA runner checks the same field)
      try { missing[p.id] = results[p.id]?.missingSteps ?? missingSteps(p, records[p.id], snap.docs); } catch { missing[p.id] = []; }
      try { for (const id of supersededIds(records[p.id], snap.docs)) superseded.add(id); } catch {}
    }
    let caseList: CaseView[] = [];
    try { caseList = caseViews(people, records, snap.docs, snap.cases); } catch {}
    return { people, records, results, missing, superseded, caseList, main: people.find((p) => p.relation === 'self') ?? people[0] };
  }, [snap, bulletin]);

  // Keep reminders in step with the saved dates (no permission prompt here — asked from Reminders).
  useEffect(() => {
    if (!ready || !snap.people.length) return;
    const kd = derived.caseList.flatMap((c) => c.keyDates.map((k) => ({ ownerId: c.ownerId, label: `${c.form ?? 'Case'}: ${k.label}`, date: k.date, caseId: c.id })));
    scheduleReminders(alertOn(snap.settings, 'docs') ? reminderItems(derived.people, derived.records, derived.results, kd) : []).catch(() => {});
  }, [ready, derived, snap.people.length]);

  // Alerts (v2.3): a case's status changed (paste-back, pick, or any later check) …
  const lastStatus = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    const now = derived.caseList.map((c) => ({ id: c.id, status: c.status, form: c.form, ownerName: derived.people.find((p) => p.id === c.ownerId)?.name }));
    const alerts = caseChanges(lastStatus.current, now);
    lastStatus.current = statusMap(now);
    if (alertOn(snap.settings, 'cases')) for (const a of alerts) notifyNow(a).catch(() => {});
  }, [ready, derived.caseList]);
  // … and a new monthly Visa Bulletin arrived from the server.
  useEffect(() => {
    if (!ready) return;
    const r = bulletinAlert(snap.settings.bulletinSeen, bulletin.data.month, bulletin.live);
    if (r.seen && r.seen !== snap.settings.bulletinSeen) store.updateSettings({ bulletinSeen: r.seen }).catch(() => {});
    // The server sends the bulletin alert itself (with the family's dates) once this phone is signed up for it.
    if (r.alert && alertOn(snap.settings, 'bulletin') && !snap.settings.bulletinPush) notifyNow(r.alert).catch(() => {});
  }, [ready, bulletin.live, bulletin.data.month]);

  // Server alerts sign-up (news + Visa Bulletin): anonymous push token + topics, kept in step with Settings
  // and the family's visa types. Re-sent on each launch (cheap; the server de-duplicates by token).
  const topics = useMemo(() => pushTopics(snap.settings, derived.people, derived.records), [snap.settings.alerts, derived.people, derived.records]);
  const topicsKey = JSON.stringify(topics);
  const [wake, setWake] = useState(0); // back from iOS Settings or the permission prompt: try again
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setWake((n) => n + 1); }); return () => sub.remove(); }, []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    syncPushAlerts(topics).then((ok) => {
      if (!live) return;
      const server = ok && topics.bulletin.enabled;
      if (server !== !!snap.settings.bulletinPush) store.updateSettings({ bulletinPush: server }).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, topicsKey, wake]);

  // Home-screen widgets (v2.5): summary snapshot to the App Group; no-op on older builds.
  useWidgetSync(ready, { people: derived.people, records: derived.records, results: derived.results, caseList: derived.caseList, settings: snap.settings, bulletin: bulletin.data });

  const value = useMemo<FamilyState>(() => ({ ...snap, ...derived, ready, store, actions, bulletin }), [snap, derived, ready, store, actions, bulletin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): FamilyState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFamily outside FamilyProvider');
  return v;
}
export const usePerson = (id?: string) => {
  const f = useFamily();
  const p = f.people.find((x) => x.id === id);
  return { family: f, person: p, rec: p ? f.records[p.id] : undefined, result: p ? f.results[p.id] : undefined };
};
export type { Person, Document, Case, Settings };
