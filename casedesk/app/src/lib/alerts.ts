// Alerts the user chooses. Personal things stay on the phone:
//  • Date reminders (I-94, approval, passport, visa, EAD, I-9 reverification, saved documents) are
//    LOCAL notifications scheduled on the phone — no server involved.
//  • Case status changes are checked by the phone in the background (receipt numbers stay on the phone).
//  • News and Visa Bulletin alerts are push messages from the CaseDesk server. The server only gets an
//    anonymous push token + the topics chosen (e.g. "H-1B", "India EB-2") — no name, dates or receipts.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from './api';
import { Profile, loadProfile } from './profile';
import type { Tag } from '../data/news';
import type { Country } from '../data/bulletin';

export type AlertPrefs = {
  caseUpdates: boolean;
  statusReminders: boolean;
  reminderDays: number[]; // days before an expiry
  i9Reminders: boolean;
  docReminders: boolean;
  news: { enabled: boolean; tags: Tag[]; importantOnly: boolean; webNews: boolean };
  bulletin: { enabled: boolean; country: Country; categories: string[] };
  hour: number; // time of day for reminders (local)
};

export const DEFAULT_PREFS: AlertPrefs = {
  caseUpdates: true,
  statusReminders: true,
  reminderDays: [180, 90, 30, 7, 1],
  i9Reminders: true,
  docReminders: true,
  news: { enabled: true, tags: ['H-1B', 'I-9', 'Fees'], importantOnly: true, webNews: false },
  bulletin: { enabled: false, country: 'india', categories: ['EB-2', 'EB-3'] },
  hour: 9,
};

const KEY = 'cd.alerts.v1';
const listeners = new Set<() => void>();
export async function loadPrefs(): Promise<AlertPrefs> {
  try { const r = await AsyncStorage.getItem(KEY); return r ? { ...DEFAULT_PREFS, ...JSON.parse(r) } : DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
}
export async function savePrefs(p: AlertPrefs) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  listeners.forEach((l) => l());
  await applyAlerts(p);
}
export function useAlertPrefs(): [AlertPrefs, (p: AlertPrefs) => Promise<void>] {
  const [p, setP] = useState(DEFAULT_PREFS);
  const load = useCallback(() => { loadPrefs().then(setP); }, []);
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, [load]);
  return [p, async (v) => { setP(v); await savePrefs(v); }];
}

// ---------- native modules (not in the web preview) ----------
const native = Platform.OS !== 'web';
const N = () => require('expo-notifications') as typeof import('expo-notifications');

export async function ensurePermission(): Promise<boolean> {
  if (!native) return false;
  const n = N();
  const cur = await n.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await n.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  return req.granted;
}

export function setupNotificationHandling() {
  if (!native) return;
  const n = N();
  n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
  if (Platform.OS === 'android') {
    n.setNotificationChannelAsync('reminders', { name: 'Date reminders', importance: n.AndroidImportance.HIGH });
    n.setNotificationChannelAsync('cases', { name: 'Case status', importance: n.AndroidImportance.HIGH });
    n.setNotificationChannelAsync('news', { name: 'Updates & Visa Bulletin', importance: n.AndroidImportance.DEFAULT });
  }
}

// ---------- local date reminders ----------
type Reminder = { id: string; date: string; title: string; body: string; url: string };

const DATE_FIELDS: { k: keyof Profile; label: string }[] = [
  { k: 'i94Expiry', label: 'Your I-94' },
  { k: 'petitionEnd', label: 'Your approval (I-797)' },
  { k: 'eadExpiry', label: 'Your EAD card' },
  { k: 'passportExpiry', label: 'Your passport' },
  { k: 'visaStampExpiry', label: 'Your visa stamp' },
];

function at(date: string, daysBefore: number, hour: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - daysBefore);
  d.setHours(hour, 0, 0, 0);
  return d;
}
const when = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export async function buildReminders(p: AlertPrefs): Promise<Reminder[]> {
  const out: Reminder[] = [];
  const prof = await loadProfile();
  if (p.statusReminders && prof) {
    for (const f of DATE_FIELDS) {
      const v = prof[f.k] as string | undefined;
      if (!v) continue;
      if (f.k === 'visaStampExpiry') { out.push({ id: `${f.k}-0`, date: v, title: 'Visa stamp expires today', body: 'Fine while you stay in the US — you need a new stamp before travelling back.', url: '/status' }); continue; }
      for (const d of [...p.reminderDays, 0]) out.push({ id: `${f.k}-${d}`, date: at(v, d, p.hour).toISOString(), title: `${f.label} ends ${when(d)}`, body: d >= 150 && f.k === 'i94Expiry' ? 'Your extension window is open — talk to your employer about filing.' : 'Open CaseDesk to check what to do next.', url: '/status' });
    }
  }
  if (p.statusReminders) {
    try {
      const fam = JSON.parse((await AsyncStorage.getItem('cd.family.v1')) || '[]') as { id: string; name: string; profile: any }[];
      for (const m of fam) for (const f of DATE_FIELDS) {
        const v = m.profile?.[f.k] as string | undefined;
        if (!v || f.k === 'visaStampExpiry') continue;
        const label = f.label.replace(/^Your /, `${m.name}'s `);
        for (const d of p.reminderDays) out.push({ id: `fam-${m.id}-${f.k}-${d}`, date: at(v, d, p.hour).toISOString(), title: `${label} ends ${when(d)}`, body: 'Open CaseDesk to check what to do next.', url: '/status' });
      }
    } catch {}
  }
  if (p.i9Reminders) {
    try {
      const recs = JSON.parse((await AsyncStorage.getItem('cd.i9.v1')) || '[]') as { id: string; name: string; expires: string }[];
      for (const r of recs) for (const d of [90, 30, 7, 0]) out.push({ id: `i9-${r.id}-${d}`, date: at(r.expires, d, p.hour).toISOString(), title: `I-9 reverification ${when(d)}`, body: `${r.name}: work authorization ends ${r.expires}.`, url: '/tools/i9?tab=records' });
    } catch {}
  }
  if (p.docReminders) {
    try {
      const docs = JSON.parse((await AsyncStorage.getItem('cd.vault.v1')) || '[]') as { id: string; title: string; expires?: string }[];
      for (const doc of docs) if (doc.expires) for (const d of [90, 30]) out.push({ id: `doc-${doc.id}-${d}`, date: at(doc.expires, d, p.hour).toISOString(), title: `${doc.title} expires ${when(d)}`, body: 'Saved in My documents.', url: '/status/vault' });
    } catch {}
  }
  const now = Date.now();
  return out.map((r) => ({ ...r, date: r.date.length === 10 ? at(r.date, 0, p.hour).toISOString() : r.date })).filter((r) => new Date(r.date).getTime() > now + 60_000)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60); // iOS allows 64 pending local notifications
}

export async function scheduleReminders(p?: AlertPrefs) {
  if (!native) return 0;
  const prefs = p ?? (await loadPrefs());
  const n = N();
  const pending = await n.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((x) => x.identifier.startsWith('cd-')).map((x) => n.cancelScheduledNotificationAsync(x.identifier)));
  if ((await n.getPermissionsAsync()).granted === false) return 0;
  const list = await buildReminders(prefs);
  for (const r of list) {
    await n.scheduleNotificationAsync({
      identifier: `cd-${r.id}`,
      content: { title: r.title, body: r.body, data: { url: r.url }, ...(Platform.OS === 'android' ? {} : {}) },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: new Date(r.date), channelId: 'reminders' } as any,
    });
  }
  return list.length;
}

// ---------- server push (news, Visa Bulletin) ----------
async function pushToken(): Promise<string | null> {
  if (!native) return null;
  try {
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return null;
    return (await N().getExpoPushTokenAsync({ projectId })).data;
  } catch { return null; }
}

export async function syncPushTopics(p: AlertPrefs) {
  if (!API_BASE || !native) return false;
  const token = await pushToken();
  if (!token) return false;
  const wantsPush = p.news.enabled || p.bulletin.enabled;
  try {
    await fetch(`${API_BASE}/api/alerts`, {
      method: wantsPush ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS, news: p.news, bulletin: p.bulletin }),
    });
    return true;
  } catch { return false; }
}

export async function applyAlerts(p?: AlertPrefs) {
  const prefs = p ?? (await loadPrefs());
  await scheduleReminders(prefs).catch(() => 0);
  await syncPushTopics(prefs).catch(() => false);
}

export async function sendTest() {
  if (!native) return false;
  if (!(await ensurePermission())) return false;
  await N().scheduleNotificationAsync({ content: { title: 'CaseDesk alerts are on', body: 'You’ll get reminders like this before your dates.' }, trigger: { type: N().SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 } as any });
  return true;
}

// Preview of upcoming reminders for the settings screen
export const upcoming = buildReminders;
