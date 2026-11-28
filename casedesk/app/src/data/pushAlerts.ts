// Server alerts (news + Visa Bulletin): sends this phone's anonymous Expo push token and the topics it
// follows to /api/alerts. Never asks for permission (that happens in the explainer); no-op without it.
import { Platform } from 'react-native';
import { native } from '../native/safe';
import { apiBase } from './api';
import type { PushTopics } from '../core/notify';

let last = '';

async function pushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const N = native.notifications();
  if (!N?.getExpoPushTokenAsync || !N?.getPermissionsAsync) return null;
  try {
    const p = await N.getPermissionsAsync();
    if (!p.granted && p.ios?.status !== 3) return null;
    let projectId: string | undefined;
    try { projectId = require('expo-constants').default?.expoConfig?.extra?.eas?.projectId; } catch {}
    const t = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return t?.data ?? null;
  } catch { return null; }
}

/** Returns true when the server now has this phone's topics (or has removed it when everything is off). */
export async function syncPushAlerts(topics: PushTopics): Promise<boolean> {
  const b = apiBase();
  if (!b) return false;
  const token = await pushToken();
  if (!token) return false;
  const off = !topics.news.enabled && !topics.bulletin.enabled;
  const body = JSON.stringify(off ? { token } : { token, platform: Platform.OS, ...topics });
  const key = (off ? 'DELETE' : 'POST') + body;
  if (key === last) return true;
  try {
    const r = await fetch(b + '/api/alerts', { method: off ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
    if (!r.ok) return false;
    last = key;
    return true;
  } catch { return false; }
}

/** Settings → Notifications: ask the server to push one test notification to this phone. */
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const b = apiBase();
  if (!b) return { ok: false, error: 'No server connection' };
  const token = await pushToken();
  if (!token) return { ok: false, error: 'Notifications aren’t allowed for this app yet' };
  try {
    const r = await fetch(b + '/api/alerts/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.error || `Server error ${r.status}` };
    return j?.ok ? { ok: true } : { ok: false, error: j?.error || 'Not delivered' };
  } catch { return { ok: false, error: 'No internet connection' }; }
}
