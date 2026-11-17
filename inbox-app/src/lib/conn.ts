// Is each app (WhatsApp / Instagram / Messenger) still linked to Inbox? Asked from the server every minute (every few
// seconds while one is reconnecting or syncing) and shown at the top of the chat list. Also tells the server this
// phone's push token so it can alert you when a link drops, even with the app closed.
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { S, api, NETS, Net, netOf } from '@/lib/matrix';
import { pushCapable } from '@/lib/push';

export type ConnState = 'ok' | 'syncing' | 'connecting' | 'blip' | 'down' | 'off' | 'unknown';
export type Conn = { net: Net; state: ConnState; raw: string; message: string; since: number; account: string };

let conns: Partial<Record<Net, Conn>> = {};
let checkedAt = 0;
let ver = 0;
const subs = new Set<() => void>();
const emit = () => { ver++; subs.forEach(f => f()); };

function classify(raw: string): ConnState {
  switch (raw) {
    case 'CONNECTED': return 'ok';
    case 'BACKFILLING': return 'syncing';
    case 'CONNECTING': return 'connecting';
    case 'TRANSIENT_DISCONNECT': return 'blip';
    case 'BAD_CREDENTIALS': case 'LOGGED_OUT': case 'UNKNOWN_ERROR': return 'down';
    case 'NOT_LOGGED_IN': return 'off';
    default: return 'unknown';
  }
}

let pushTok: string | null = null;
async function tokenForAlerts() {
  if (pushTok || !pushCapable || Platform.OS !== 'ios') return pushTok;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') pushTok = (await Notifications.getDevicePushTokenAsync()).data as string;
  } catch {}
  return pushTok;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
export async function refreshConns() {
  if (busy || !S.token) return; busy = true;
  try {
    const tok = await tokenForAlerts();
    const r = await api('GET', '/push/bridges' + (tok ? `?device=${tok}&sandbox=0` : ''));
    const next: Partial<Record<Net, Conn>> = {};
    for (const n of Object.keys(NETS) as Net[]) {
      const x = r?.nets?.[n]; if (!x) continue;
      next[n] = { net: n, state: classify(x.state), raw: x.state, message: x.message || '', since: (x.since || 0) * 1000, account: x.logins?.[0]?.name || '' };
    }
    conns = next; checkedAt = Date.now(); emit();
  } catch {}
  busy = false;
  schedule();
}
function schedule() {
  if (timer) clearTimeout(timer);
  if (AppState.currentState !== 'active') return;
  const moving = Object.values(conns).some(c => c && (c.state === 'syncing' || c.state === 'connecting' || c.state === 'blip'));
  timer = setTimeout(refreshConns, moving ? 5000 : 60000);
}
let started = false;
export function startConns() {
  if (started) return; started = true;
  refreshConns();
  AppState.addEventListener('change', s => { if (s === 'active') refreshConns(); else if (timer) clearTimeout(timer); });
}

/** Apps to show: ones you've connected (or that have chats). */
export function useConns() {
  if (!started && S.token) setTimeout(startConns, 0);
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ver, () => ver);
  const has = new Set([...S.rooms.values()].map(r => netOf(r)).filter(Boolean) as Net[]);
  const list = (Object.keys(NETS) as Net[]).map(n => conns[n]).filter((c): c is Conn => !!c && (c.state !== 'off' || has.has(c.net)));
  return { list, checkedAt };
}

/** Newest message time in an app's chats — "last message 2 min ago" helps confirm messages are flowing. */
export function lastMessageAt(n: Net) {
  let t = 0; for (const r of S.rooms.values()) if (netOf(r) === n && r.lastTs > t) t = r.lastTs;
  return t;
}
export function ago(ts: number) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
export const connLabel: Record<ConnState, string> = {
  ok: 'Connected', syncing: 'Syncing chats…', connecting: 'Connecting…', blip: 'Reconnecting…', down: 'Disconnected — tap to log in', off: 'Not connected — tap to connect', unknown: 'Status unknown',
};
export const connColor: Record<ConnState, string> = { ok: '#30D158', syncing: '#0A84FF', connecting: '#FF9F0A', blip: '#FF9F0A', down: '#FF453A', off: '#FF453A', unknown: '#8E8E93' };
