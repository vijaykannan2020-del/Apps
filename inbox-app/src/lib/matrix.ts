// Connection to your own server (Matrix), ported from the web Inbox.
// Holds the chat list in memory and tells screens when anything changes.
import { getItem, setItem, removeItem } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SERVER = 'https://vijayinbox.duckdns.org';

export type Net = 'whatsapp' | 'instagram' | 'messenger';
export const NETS: Record<Net, { label: string; color: string; bot: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', bot: 'whatsappbot' },
  instagram: { label: 'Instagram', color: '#E1306C', bot: 'instagrambot' },
  messenger: { label: 'Messenger', color: '#0084FF', bot: 'messengerbot' },
};
export const PALETTE = ['#5b6cff', '#e0664f', '#2fa37a', '#c25bd6', '#d99a2b', '#3c9bd6', '#d6517a', '#6e8a3a'];

export type MEvent = {
  event_id: string; type: string; sender: string; origin_server_ts: number;
  content: any; state_key?: string; unsigned?: any; redacts?: string;
  pending?: boolean; failed?: boolean; redacted?: boolean; edited?: boolean; txn?: string;
};
type Member = { name?: string; avatar?: string; membership?: string };
export type Room = {
  id: string; name: string | null; avatar: string | null; members: Map<string, Member>; heroes: string[]; joined: number;
  events: MEvent[]; idx: Map<string, MEvent>; txns: Map<string, MEvent>; reacts: Map<string, Map<string, Set<string>>>;
  reactIdx: Map<string, { target: string; key: string; sender: string }>; pendingEdits: Map<string, any>;
  unread: number; net: Net | null; bridgeName: string | null; bridgeAvatar: string | null; channelId: string | null;
  isSpace: boolean; prevBatch: string | null | undefined; lastTs: number; tags: Record<string, unknown>; markedUnread: boolean; myRead?: string; prevUnread?: number;
  readBy: Map<string, string>; typing: string[]; loadingOlder: boolean; isDM?: boolean;
};

export type Starred = { room: string; event: string; ts: number; sender: string; body: string };
export type Prefs = { fontScale: number; receipts: boolean; typing: boolean; theme: 'auto' | 'light' | 'dark' };
export type Banner = { room: string; title: string; body: string; at: number };
// ---------------- state + change notifications ----------------
export const S = {
  server: DEFAULT_SERVER, token: null as string | null, userId: null as string | null, since: null as string | null,
  rooms: new Map<string, Room>(), ready: false, status: '' as string, current: null as string | null,
  muted: new Set<string>(), starred: [] as Starred[], reminders: {} as Record<string, number>, drafts: {} as Record<string, string>,
  prefs: { fontScale: 1, receipts: true, typing: true, theme: 'auto' } as Prefs,
  banner: null as Banner | null,
};
let version = 0;
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getVersion = () => version;
let pending = false;
export function changed() {
  if (pending) return; pending = true;
  setTimeout(() => { pending = false; version++; listeners.forEach(f => f()); }, 30);
}

// ---------------- API ----------------
export class ApiError extends Error { status = 0; errcode?: string; retry?: number; }
export async function api(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(S.server + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new ApiError(data.error || res.statusText || 'Request failed');
    e.status = res.status; e.errcode = data.errcode; e.retry = data.retry_after_ms;
    if (res.status === 401 && data.errcode === 'M_UNKNOWN_TOKEN') logout(true);
    throw e;
  }
  return data;
}
const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let txnN = 0;
const newTxn = () => 'app' + Date.now() + '-' + (txnN++);

// ---------------- media (your server needs your login to show photos) ----------------
export function mxcParts(mxc?: string | null) {
  const m = /^mxc:\/\/([^/]+)\/([^?#]+)/.exec(mxc || '');
  return m ? { server: m[1], id: m[2] } : null;
}
export function mediaSource(mxc?: string | null, size?: number) {
  const p = mxcParts(mxc); if (!p || !S.token) return null;
  const uri = size
    ? `${S.server}/_matrix/client/v1/media/thumbnail/${p.server}/${p.id}?width=${size}&height=${size}&method=${size <= 128 ? 'crop' : 'scale'}`
    : `${S.server}/_matrix/client/v1/media/download/${p.server}/${p.id}`;
  return { uri, headers: { Authorization: 'Bearer ' + S.token }, cacheKey: (mxc || '') + '|' + (size || 0) };
}

// ---------------- rooms ----------------
const domain = () => (S.userId || '').split(':').slice(1).join(':');
export const botId = (n: Net) => `@${NETS[n].bot}:${domain()}`;
export const isBot = (id: string) => (Object.keys(NETS) as Net[]).some(n => id === botId(n));
function netFrom(s?: string | null): Net | null {
  s = (s || '').toLowerCase();
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('facebook') || s.includes('messenger') || s.includes('meta')) return 'messenger';
  return null;
}
function room(id: string): Room {
  let r = S.rooms.get(id);
  if (!r) {
    r = { id, name: null, avatar: null, members: new Map(), heroes: [], joined: 0, events: [], idx: new Map(), txns: new Map(),
      reacts: new Map(), reactIdx: new Map(), pendingEdits: new Map(), unread: 0, net: null, bridgeName: null, bridgeAvatar: null,
      channelId: null, isSpace: false, prevBatch: undefined, lastTs: 0, tags: {}, markedUnread: false, readBy: new Map(), typing: [],
      loadingOlder: false };
    S.rooms.set(id, r);
  }
  return r;
}
function applyState(r: Room, ev: MEvent) {
  const c = ev.content || {};
  switch (ev.type) {
    case 'm.room.name': r.name = c.name || null; break;
    case 'm.room.avatar': r.avatar = c.url || null; break;
    case 'm.room.create': if (c.type === 'm.space') r.isSpace = true; break;
    case 'm.room.member': r.members.set(ev.state_key!, { name: c.displayname, avatar: c.avatar_url, membership: c.membership }); break;
    case 'm.bridge': case 'uk.half-shot.bridge':
      r.net = netFrom(c.protocol && c.protocol.id) || r.net;
      if (c['com.beeper.room_type'] === 'dm') r.isDM = true;
      if (c.channel) { r.bridgeName = c.channel.displayname || r.bridgeName; r.bridgeAvatar = c.channel.avatar_url || r.bridgeAvatar; r.channelId = c.channel.id || r.channelId; }
      break;
  }
}
function allOthers(r: Room) {
  const ids = new Set(r.heroes);
  for (const [id, m] of r.members) { if (m.membership === 'join' || m.membership === 'invite') ids.add(id); else ids.delete(id); }
  ids.delete(S.userId || '');
  return [...ids];
}
export const others = (r: Room) => allOthers(r).filter(id => !isBot(id));
export function memberCount(r: Room) {
  if (r.isDM) return 2;
  const bots = allOthers(r).filter(isBot).length;
  const n = r.joined ? Math.max(1, r.joined - bots) : others(r).length + 1;
  // A bridged chat with you, one person and the (unlisted) bridge bot is a 1-to-1 chat, not a group
  if (n === 3 && bots === 0 && r.net && others(r).length <= 1) return 2;
  return n;
}
export function netOf(r: Room): Net | null {
  if (r.net) return r.net;
  for (const id of others(r)) { const n = netFrom(id.split(':')[0]); if (n) return n; }
  return null;
}
export function botNetOf(r: Room): Net | null {
  const o = allOthers(r);
  if (o.length !== 1) return null;
  for (const n of Object.keys(NETS) as Net[]) if (o[0] === botId(n)) return n;
  return null;
}
export const cleanName = (n?: string | null) => (n || '').replace(/\s*\((WA|WhatsApp|IG|Instagram|FB|Facebook|Messenger)\)\s*$/i, '');
export function memberName(r: Room, id: string) {
  for (const n of Object.keys(NETS) as Net[]) if (id === botId(n)) return NETS[n].label;
  return cleanName(r.members.get(id)?.name) || id.split(':')[0].slice(1);
}
export function roomName(r: Room) {
  const b = botNetOf(r);
  if (b) return NETS[b].label + ' setup';
  if (r.name) return cleanName(r.name);
  if (r.bridgeName) return cleanName(r.bridgeName);
  const o = others(r);
  if (o.length) return o.slice(0, 4).map(id => memberName(r, id)).join(', ');
  return 'Chat';
}
export function roomAvatar(r: Room) {
  if (r.avatar) return r.avatar;
  if (r.bridgeAvatar) return r.bridgeAvatar;
  const o = others(r);
  return o.length === 1 ? r.members.get(o[0])?.avatar || null : null;
}
export const isGroup = (r: Room) => memberCount(r) > 2;
export const isPinned = (r: Room) => !!(r.tags && r.tags['m.favourite']);
export const isArchived = (r: Room) => !!(r.tags && r.tags['m.lowpriority']);
export const isUnread = (r: Room) => r.unread > 0 || r.markedUnread;
/** Messages from others after my read receipt. The server's count skips muted chats (no notifications = 0), so muted
 *  chats would look read; this counts them the same as any chat. */
function unreadAfterReceipt(r: Room) {
  if (!r.myRead) return 0;
  let n = 0;
  for (let i = r.events.length - 1; i >= 0; i--) {
    const ev = r.events[i];
    if (ev.event_id === r.myRead || ev.sender === S.userId) return n;
    if (!ev.redacted && !ev.pending && SHOWN_UNREAD.has(ev.type) && !isBot(ev.sender)) n++;
  }
  return n; // receipt is older than what's loaded: at least this many
}
const SHOWN_UNREAD = new Set(['m.room.message', 'm.sticker', 'm.call.invite']);
const isStatusRoom = (r: Room) => /status@broadcast/i.test(r.channelId || '') || /status broadcast/i.test(r.name || r.bridgeName || '');
// ---- online / last seen (people on your server; WhatsApp/Instagram contacts when the bridge shares it) ----
const presence = new Map<string, { p?: string; active: boolean; seen: number }>();
export function presenceText(userId: string): string {
  const x = presence.get(userId); if (!x) return '';
  if (x.p === 'online' && (x.active || Date.now() - x.seen < 5 * 60e3)) return 'online';
  if (!x.seen) return '';
  const mins = Math.floor((Date.now() - x.seen) / 60e3);
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins} min ago`;
  const d = new Date(x.seen), today = new Date();
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `last seen today at ${t}`;
  if (Date.now() - x.seen < 2 * 86400e3) return `last seen yesterday at ${t}`;
  return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

// ---- your profile ----
export async function getMyProfile(): Promise<{ displayname?: string; avatar_url?: string }> {
  try { return await api('GET', `/_matrix/client/v3/profile/${enc(S.userId!)}`); } catch { return {}; }
}
export async function setMyName(name: string) {
  await api('PUT', `/_matrix/client/v3/profile/${enc(S.userId!)}/displayname`, { displayname: name.trim() });
}
export async function setMyPhoto(uri: string, mime = 'image/jpeg') {
  const blob = await (await fetch(uri)).blob();
  const up = await fetch(`${S.server}/_matrix/media/v3/upload?filename=avatar.jpg`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': mime }, body: blob });
  const j = await up.json(); if (!up.ok || !j.content_uri) throw new Error(j.error || 'Upload failed');
  await api('PUT', `/_matrix/client/v3/profile/${enc(S.userId!)}/avatar_url`, { avatar_url: j.content_uri });
  return j.content_uri as string;
}

let callHook: ((r: Room, ev: MEvent) => void) | null = null;
export function setCallHook(f: (r: Room, ev: MEvent) => void) { callHook = f; }
export { allOthers };

export function visibleRooms() {
  return [...S.rooms.values()].filter(r => !r.isSpace && !botNetOf(r) && !isStatusRoom(r) && (r.events.length || r.name));
}

// ---------------- events ----------------
const SHOWN = new Set(['m.room.message', 'm.sticker', 'm.call.invite']);

// ---- call history: the invite shows in the chat; answer/hangup/reject decide what it says ----
type CallInfo = { answeredAt?: number; endedAt?: number; rejected?: boolean; reason?: string };
const callInfo = new Map<string, CallInfo>();
function noteCall(ev: MEvent) {
  const id = ev.content?.call_id; if (!id) return;
  const i = callInfo.get(id) || {};
  if (ev.type === 'm.call.answer' && !i.answeredAt) i.answeredAt = ev.origin_server_ts;
  if (ev.type === 'm.call.hangup' && !i.endedAt) { i.endedAt = ev.origin_server_ts; i.reason = ev.content?.reason; }
  if (ev.type === 'm.call.reject') { i.rejected = true; i.endedAt = i.endedAt || ev.origin_server_ts; }
  callInfo.set(id, i);
}
export type CallSummary = { text: string; missed: boolean; video: boolean; mine: boolean; live: boolean };
export function callSummary(ev: MEvent): CallSummary {
  const c = ev.content || {}; const i = callInfo.get(c.call_id) || {};
  const video = /m=video/.test(c.offer?.sdp || ''); const mine = ev.sender === S.userId;
  const kind = video ? 'video call' : 'voice call';
  const dur = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const expired = Date.now() - ev.origin_server_ts > (c.lifetime || 60000) + 5000;
  if (i.answeredAt) {
    const live = !i.endedAt && Date.now() - i.answeredAt < 4 * 3600e3;
    return { text: `${mine ? 'Outgoing' : 'Incoming'} ${kind}${i.endedAt ? ' · ' + dur(i.endedAt - i.answeredAt) : live ? ' · in progress' : ''}`, missed: false, video, mine, live };
  }
  if (i.rejected) return { text: mine ? `${cap(kind)} declined` : `Declined ${kind}`, missed: false, video, mine, live: false };
  if (i.endedAt || expired) return mine ? { text: `${cap(kind)} · no answer`, missed: false, video, mine, live: false } : { text: `Missed ${kind}`, missed: true, video, mine, live: false };
  return { text: mine ? `Calling… (${kind})` : `Incoming ${kind}…`, missed: false, video, mine, live: true };
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function addEvent(r: Room, ev: MEvent, prepend = false) {
  if (ev.state_key !== undefined) { applyState(r, ev); return; }
  const c = ev.content || {};
  if (ev.type === 'm.room.redaction') {
    const tid = ev.redacts || c.redacts; const t = r.idx.get(tid);
    if (t) { t.redacted = true; return; }
    const re = r.reactIdx.get(tid);
    if (re) r.reacts.get(re.target)?.get(re.key)?.delete(re.sender);
    return;
  }
  if (ev.type === 'm.reaction') {
    const rel = c['m.relates_to'] || {};
    if (!rel.event_id || r.reactIdx.has(ev.event_id)) return;
    if (!r.reacts.has(rel.event_id)) r.reacts.set(rel.event_id, new Map());
    const m = r.reacts.get(rel.event_id)!;
    if (!m.has(rel.key)) m.set(rel.key, new Set());
    m.get(rel.key)!.add(ev.sender);
    r.reactIdx.set(ev.event_id, { target: rel.event_id, key: rel.key, sender: ev.sender });
    return;
  }
  if (ev.type.startsWith('m.call.') && ev.type !== 'm.call.invite') { noteCall(ev); return; }
  if (!SHOWN.has(ev.type)) return;
  const rel = c['m.relates_to'];
  if (rel && rel.rel_type === 'm.replace') {
    const nc = c['m.new_content']; const t = r.idx.get(rel.event_id);
    if (t && nc) { t.content = nc; t.edited = true; } else if (nc) r.pendingEdits.set(rel.event_id, nc);
    return;
  }
  if (!ev.content || (!c.msgtype && ev.type === 'm.room.message')) ev.redacted = true;
  const txn = ev.unsigned && ev.unsigned.transaction_id;
  const existing = r.idx.get(ev.event_id) || (txn && r.txns.get(txn));
  if (existing) { Object.assign(existing, ev, { pending: false, failed: false }); r.idx.set(ev.event_id, existing); return; }
  if (r.pendingEdits.has(ev.event_id)) { ev.content = r.pendingEdits.get(ev.event_id); ev.edited = true; r.pendingEdits.delete(ev.event_id); }
  r.idx.set(ev.event_id, ev);
  if (prepend) r.events.unshift(ev); else r.events.push(ev);
  if (ev.origin_server_ts > r.lastTs) r.lastTs = ev.origin_server_ts;
}
export const mdPlain = (t?: string) => (t || '').replace(/\[([^\]\n]{1,400})\]\((https?:\/\/[^)\s]+)\)/g, '$1');
export const captionOf = (c: any) => (c && c.filename && c.body && c.body !== c.filename) ? c.body : '';
export function stripReply(b: string) {
  const lines = b.split('\n'); let i = 0;
  while (i < lines.length && lines[i].startsWith('> ')) i++;
  if (i > 0 && lines[i] === '') i++;
  return i ? lines.slice(i).join('\n') : b;
}
export function bodyPreview(ev: MEvent) {
  const c = ev.content || {};
  if (ev.type === 'm.sticker') return 'Sticker';
  if (ev.type === 'm.call.invite') { const k = callSummary(ev); return (k.video ? '📹 ' : '📞 ') + k.text; }
  const capt = mdPlain(captionOf(c)).replace(/\s+/g, ' ').trim();
  if (/instagram\.com\/(reel|reels)\//.test(c.body || '') && (c.msgtype === 'm.video' || !capt)) return '🎬 Reel';
  switch (c.msgtype) {
    case 'm.image': return '📷 ' + (capt || 'Photo');
    case 'm.video': return '🎥 ' + (capt || 'Video');
    case 'm.audio': return '🎤 Voice message';
    case 'm.file': return '📎 ' + (c.body || 'File');
    case 'm.location': return '📍 Location';
    default: return mdPlain(stripReply(c.body || '')).replace(/\s+/g, ' ');
  }
}
export function preview(r: Room) {
  for (let i = r.events.length - 1; i >= 0; i--) {
    const ev = r.events[i]; if (ev.redacted) continue;
    if (ev.type === 'm.call.invite') return bodyPreview(ev);
    const who = ev.sender === S.userId ? 'You: ' : (isGroup(r) ? memberName(r, ev.sender).split(' ')[0] + ': ' : '');
    return who + bodyPreview(ev);
  }
  return '';
}
export function lastMine(r: Room) {
  const ev = r.events[r.events.length - 1];
  if (!ev || ev.sender !== S.userId) return null;
  if (ev.pending) return 'pending';
  for (const eid of r.readBy.values()) { const t = r.idx.get(eid); if (t && t.origin_server_ts >= ev.origin_server_ts) return 'read'; }
  return 'sent';
}

// ---------------- sync ----------------
function processSync(d: any, first: boolean) {
  const rooms = d.rooms || {};
  for (const [id, j] of Object.entries<any>(rooms.join || {})) {
    const r = room(id);
    (j.state?.events || []).forEach((ev: MEvent) => applyState(r, ev));
    if (j.summary) {
      if (j.summary['m.heroes']) r.heroes = j.summary['m.heroes'];
      if (j.summary['m.joined_member_count'] != null) r.joined = j.summary['m.joined_member_count'];
    }
    const tl = j.timeline || {};
    if (tl.limited && !first) { r.events = r.events.filter(e => e.pending); r.idx = new Map(r.events.map(e => [e.event_id, e])); }
    if (r.prevBatch === undefined || tl.limited) r.prevBatch = tl.prev_batch || null;
    const before = r.events.length;
    (tl.events || []).forEach((ev: MEvent) => { if (ev.type.startsWith('m.call.') && callHook) { try { callHook(r, ev); } catch (e) { console.warn('call', e); } } addEvent(r, ev); });
    if (!first && id !== S.current && r.events.length > before && !S.muted.has(id) && !botNetOf(r)) {
      const ev = r.events[r.events.length - 1];
      if (ev.sender !== S.userId && !ev.pending && Date.now() - ev.origin_server_ts < 120e3)
        S.banner = { room: id, title: roomName(r), body: (isGroup(r) ? memberName(r, ev.sender).split(' ')[0] + ': ' : '') + bodyPreview(ev), at: Date.now() };
    }
    if (j.unread_notifications) r.unread = j.unread_notifications.notification_count || 0;
    for (const ev of j.account_data?.events || []) {
      if (ev.type === 'm.tag') r.tags = ev.content?.tags || {};
      else if (/marked_unread$/.test(ev.type)) r.markedUnread = !!ev.content?.unread;
    }
    for (const ev of j.ephemeral?.events || []) {
      if (ev.type === 'm.typing') r.typing = (ev.content.user_ids || []).filter((u: string) => u !== S.userId && !isBot(u));
      else if (ev.type === 'm.receipt') {
        for (const [eid, rc] of Object.entries<any>(ev.content || {}))
          for (const u of Object.keys(rc['m.read'] || {})) if (u !== S.userId && !isBot(u)) r.readBy.set(u, eid);
        for (const [eid, rc] of Object.entries<any>(ev.content || {}))
          if (rc['m.read']?.[S.userId!] || rc['m.read.private']?.[S.userId!]) r.myRead = eid;
      }
    }
    if (S.muted.has(id) && id !== S.current) {
      // No receipt known yet (chat muted before this version): new messages from others still count as unread.
      const fresh = r.myRead ? 0 : r.events.slice(before).filter(e => e.sender !== S.userId && !e.pending && SHOWN_UNREAD.has(e.type) && !isBot(e.sender)).length;
      r.unread = Math.max(r.unread, r.myRead ? unreadAfterReceipt(r) : (r.prevUnread || 0) + fresh);
    }
    r.prevUnread = r.unread;
    if (id === S.current) { r.unread = 0; markRead(r); }
  }
  for (const ev of d.presence?.events || []) {
    if (ev.type === 'm.presence' && ev.sender) presence.set(ev.sender, { p: ev.content?.presence, active: !!ev.content?.currently_active, seen: Date.now() - (ev.content?.last_active_ago ?? 0) });
  }
  for (const id of Object.keys(rooms.leave || {})) S.rooms.delete(id);
  for (const ev of d.account_data?.events || []) {
    if (ev.type === 'inbox.starred') S.starred = ev.content?.items || [];
    else if (ev.type === 'inbox.reminders') S.reminders = ev.content?.reminders || {};
    else if (ev.type === 'm.push_rules') {
      const quiet = (x: any) => x.enabled !== false && (!x.actions || !x.actions.length || x.actions.includes('dont_notify'));
      const roomMuted = new Set<string>((ev.content?.global?.room || []).filter(quiet).map((x: any) => x.rule_id));
      const ovr = (ev.content?.global?.override || []).filter((x: any) => String(x.rule_id).startsWith(MUTE_PREFIX));
      S.muted = new Set([...roomMuted, ...ovr.filter(quiet).map((x: any) => x.rule_id.slice(MUTE_PREFIX.length))]);
      syncMuteOverrides(roomMuted, new Set(ovr.map((x: any) => x.rule_id.slice(MUTE_PREFIX.length))));
      for (const id of S.muted) { const r = S.rooms.get(id); if (r && id !== S.current) r.unread = Math.max(r.unread, unreadAfterReceipt(r)); }
    }
  }
  for (const id of Object.keys(rooms.invite || {})) api('POST', `/_matrix/client/v3/join/${enc(id)}`, {}).catch(() => {});
}
let syncing = false;
export async function startSync() {
  if (syncing) return; syncing = true;
  const filter = enc(JSON.stringify({
    room: { timeline: { limit: 25 }, state: { lazy_load_members: true },
      account_data: { types: ['m.tag', 'm.marked_unread', 'com.famedly.marked_unread'] },
      ephemeral: { types: ['m.receipt', 'm.typing'] } },
    presence: { types: ['m.presence'] },
    account_data: { types: ['m.push_rules', 'inbox.starred', 'inbox.reminders'] },
  }));
  let backoff = 1000;
  while (S.token) {
    try {
      const first = !S.since;
      const d = await api('GET', `/_matrix/client/v3/sync?filter=${filter}&timeout=${S.since ? 30000 : 0}${S.since ? '&since=' + enc(S.since) : ''}`);
      if (!S.token) break;
      processSync(d, first);
      S.since = d.next_batch; S.ready = true; S.status = ''; backoff = 1000; changed(); saveSnapshot();
    } catch (e: any) {
      if (!S.token) break;
      if (e.status === 400 && S.since) S.since = null;
      S.status = 'Reconnecting…'; changed();
      await sleep(e.retry || backoff); backoff = Math.min(backoff * 2, 30000);
    }
  }
  syncing = false;
}

// ---------------- actions ----------------
export async function login(server: string, user: string, password: string) {
  S.server = server.replace(/\/+$/, '') || DEFAULT_SERVER;
  const d = await api('POST', '/_matrix/client/v3/login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: user.trim().toLowerCase() }, password,
    initial_device_display_name: 'Inbox iPhone app',
  });
  S.token = d.access_token; S.userId = d.user_id;
  await setItem('inbox.server', S.server); await setItem('inbox.token', S.token!); await setItem('inbox.user', S.userId!);
  startSync();
}
export async function restore() {
  S.server = (await getItem('inbox.server')) || DEFAULT_SERVER;
  S.token = await getItem('inbox.token'); S.userId = await getItem('inbox.user');
  try { S.prefs = { ...S.prefs, ...JSON.parse((await AsyncStorage.getItem('inbox.prefs')) || '{}') }; } catch {}
  try { S.drafts = JSON.parse((await AsyncStorage.getItem('inbox.drafts')) || '{}'); } catch {}
  if (S.token) { await loadSnapshot(); startSync(); }
  return !!S.token;
}
export async function logout(expired = false) {
  const tok = S.token;
  S.token = null; S.userId = null; S.since = null; S.rooms.clear(); S.ready = false;
  await removeItem('inbox.token'); await removeItem('inbox.user'); AsyncStorage.removeItem(SNAP).catch(() => {});
  if (!expired && tok) fetch(S.server + '/_matrix/client/v3/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {});
  changed();
}
export function markRead(r: Room) {
  const last = [...r.events].reverse().find(e => !e.pending && e.event_id && !e.event_id.startsWith('~'));
  r.unread = 0; r.prevUnread = 0;
  if (last) r.myRead = last.event_id;
  if (r.markedUnread) { r.markedUnread = false; api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/rooms/${enc(r.id)}/account_data/m.marked_unread`, { unread: false }).catch(() => {}); }
  if (last) api('POST', `/_matrix/client/v3/rooms/${enc(r.id)}/read_markers`, S.prefs.receipts ? { 'm.fully_read': last.event_id, 'm.read': last.event_id } : { 'm.fully_read': last.event_id, 'm.read.private': last.event_id }).catch(() => {});
  changed();
}
const PREFIX: Record<Net, string> = { whatsapp: '!wa', instagram: '!ig', messenger: '!fb' };
const CMD_RE = /^(login|list-logins|help|cancel|logout|ping)(\s|$)/i;
export async function sendText(r: Room, text: string, replyTo?: MEvent | null) {
  const b = botNetOf(r);
  const body = b && CMD_RE.test(text.trim()) ? PREFIX[b] + ' ' + text.trim() : text;
  const content: any = { msgtype: 'm.text', body };
  if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo.event_id } };
  const txn = newTxn();
  const ev: MEvent = { event_id: '~' + txn, type: 'm.room.message', sender: S.userId!, origin_server_ts: Date.now(), content, pending: true, txn };
  r.txns.set(txn, ev); r.idx.set(ev.event_id, ev); r.events.push(ev); r.lastTs = ev.origin_server_ts; changed();
  try {
    const res = await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${txn}`, content);
    const real = r.idx.get(res.event_id);
    if (real && real !== ev) { r.events = r.events.filter(e => e !== ev); }
    else { ev.event_id = res.event_id; ev.pending = false; r.idx.set(res.event_id, ev); }
  } catch { ev.pending = false; ev.failed = true; }
  changed();
}
export async function react(r: Room, ev: MEvent, key: string) {
  const mine = [...r.reactIdx.entries()].find(([, v]) => v.target === ev.event_id && v.key === key && v.sender === S.userId);
  if (mine) { await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/redact/${enc(mine[0])}/${newTxn()}`, {}).catch(() => {}); return; }
  await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.reaction/${newTxn()}`,
    { 'm.relates_to': { rel_type: 'm.annotation', event_id: ev.event_id, key } }).catch(() => {});
}
/** Photo or video: upload, then post as m.image / m.video (the bridges pass both to WhatsApp/Instagram/Messenger). */
export async function sendMedia(r: Room, m: { uri: string; mime: string; kind: 'image' | 'video'; name?: string; width?: number; height?: number; durationMs?: number }) {
  if (m.kind === 'image') return sendImage(r, m.uri, m.mime, m.width, m.height, m.name || 'photo.jpg');
  const name = m.name || 'video.mp4';
  const blob = await (await fetch(m.uri)).blob();
  const up = await fetch(`${S.server}/_matrix/media/v3/upload?filename=${enc(name)}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': m.mime }, body: blob,
  });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.content_uri) throw new Error(up.status === 413 ? 'Video is too large' : j.error || 'Upload failed');
  await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}`, {
    msgtype: 'm.video', body: name, url: j.content_uri,
    info: { mimetype: m.mime, size: blob.size, ...(m.width ? { w: Math.round(m.width) } : {}), ...(m.height ? { h: Math.round(m.height) } : {}), ...(m.durationMs ? { duration: Math.round(m.durationMs) } : {}) },
  });
}
export async function sendImage(r: Room, uri: string, mime: string, w?: number, h?: number, name = 'photo.jpg') {
  const blob = await (await fetch(uri)).blob();
  const up = await fetch(`${S.server}/_matrix/media/v3/upload?filename=${enc(name)}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': mime }, body: blob,
  });
  const j = await up.json();
  if (!up.ok || !j.content_uri) throw new Error(j.error || 'Upload failed');
  await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}`, {
    msgtype: 'm.image', body: name, info: { mimetype: mime, w, h, size: blob.size }, url: j.content_uri,
  });
}
export async function loadOlder(r: Room) {
  if (r.loadingOlder || !r.prevBatch) return;
  r.loadingOlder = true; changed();
  try {
    const d = await api('GET', `/_matrix/client/v3/rooms/${enc(r.id)}/messages?dir=b&limit=40&from=${enc(r.prevBatch)}`);
    (d.state || []).forEach((ev: MEvent) => applyState(r, ev));
    for (const ev of d.chunk || []) addEvent(r, ev, true);
    r.prevBatch = d.end || null;
  } catch {}
  r.loadingOlder = false; changed();
}
export async function setTag(r: Room, tag: string, on: boolean) {
  r.tags = { ...r.tags }; if (on) r.tags[tag] = {}; else delete r.tags[tag]; changed();
  const p = `/_matrix/client/v3/user/${enc(S.userId!)}/rooms/${enc(r.id)}/tags/${enc(tag)}`;
  await (on ? api('PUT', p, {}) : api('DELETE', p)).catch(() => {});
}
export async function setMarkedUnread(r: Room, on: boolean) {
  r.markedUnread = on; changed();
  await api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/rooms/${enc(r.id)}/account_data/m.marked_unread`, { unread: on }).catch(() => {});
}

export function fmtTime(ts: number) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diff = (+now - +d) / 864e5;
  if (diff < 6) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
export function hueFor(id: string) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }


// ---------------- more actions ----------------
export async function redact(r: Room, ev: MEvent) {
  ev.redacted = true; changed();
  try { await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/redact/${enc(ev.event_id)}/${newTxn()}`, {}); }
  catch (e) { ev.redacted = false; changed(); throw e; }
}
export async function editMessage(r: Room, ev: MEvent, text: string) {
  const old = ev.content, oldEdited = ev.edited;
  ev.content = { ...old, body: text }; ev.edited = true; changed();
  try {
    await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}`,
      { msgtype: 'm.text', body: '* ' + text, 'm.new_content': { msgtype: 'm.text', body: text }, 'm.relates_to': { rel_type: 'm.replace', event_id: ev.event_id } });
  } catch (e) { ev.content = old; ev.edited = oldEdited; changed(); throw e; }
}
export async function forward(ev: MEvent, to: Room) {
  const c = { ...(ev.content || {}) }; delete c['m.relates_to']; delete c['m.new_content'];
  if (c.msgtype === 'm.text') c.body = mdPlain(stripReply(c.body || ''));
  await api('PUT', `/_matrix/client/v3/rooms/${enc(to.id)}/send/${ev.type === 'm.sticker' ? 'm.sticker' : 'm.room.message'}/${newTxn()}`, c);
}
// Mute = silent but still unread. A "room" rule alone lets @mentions and your name still ring (those rules rank higher),
// so each muted chat also gets a top-priority "override" rule. WhatsApp-side mutes (room rules from the bridge) are mirrored too.
const MUTE_PREFIX = 'inbox.mute.';
const muteOverride = (id: string) => ({ conditions: [{ kind: 'event_match', key: 'room_id', pattern: id }], actions: [] });
let muteSyncing = false;
async function syncMuteOverrides(roomMuted: Set<string>, overrides: Set<string>) {
  if (muteSyncing || !S.token) return; muteSyncing = true;
  try {
    for (const id of roomMuted) if (!overrides.has(id))
      await api('PUT', `/_matrix/client/v3/pushrules/global/override/${enc(MUTE_PREFIX + id)}`, muteOverride(id)).catch(() => {});
    for (const id of overrides) if (!roomMuted.has(id))
      await api('DELETE', `/_matrix/client/v3/pushrules/global/override/${enc(MUTE_PREFIX + id)}`).catch(() => {});
  } finally { muteSyncing = false; }
}
export async function setMuted(r: Room, on: boolean) {
  if (on) S.muted.add(r.id); else S.muted.delete(r.id); changed();
  const ign404 = (e: any) => { if (!(e.status === 404 && !on)) throw e; };
  if (on) {
    await api('PUT', `/_matrix/client/v3/pushrules/global/room/${enc(r.id)}`, { actions: [] });
    await api('PUT', `/_matrix/client/v3/pushrules/global/override/${enc(MUTE_PREFIX + r.id)}`, muteOverride(r.id));
  } else {
    await api('DELETE', `/_matrix/client/v3/pushrules/global/room/${enc(r.id)}`).catch(ign404);
    await api('DELETE', `/_matrix/client/v3/pushrules/global/override/${enc(MUTE_PREFIX + r.id)}`).catch(ign404);
  }
}
export const isStarred = (ev: MEvent) => S.starred.some(x => x.event === ev.event_id);
export async function toggleStar(r: Room, ev: MEvent) {
  if (isStarred(ev)) S.starred = S.starred.filter(x => x.event !== ev.event_id);
  else S.starred = [{ room: r.id, event: ev.event_id, ts: ev.origin_server_ts, sender: ev.sender, body: bodyPreview(ev).slice(0, 300) }, ...S.starred].slice(0, 500);
  changed();
  await api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/account_data/inbox.starred`, { items: S.starred });
}
export async function setReminder(r: Room, ts: number | null) {
  S.reminders = { ...S.reminders }; if (ts) S.reminders[r.id] = ts; else delete S.reminders[r.id]; changed();
  await api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/account_data/inbox.reminders`, { reminders: S.reminders }).catch(() => {});
}
export function dueReminders() {
  const due = Object.entries(S.reminders).filter(([, ts]) => ts <= Date.now()).map(([id]) => id);
  if (!due.length) return [];
  for (const id of due) { const r = S.rooms.get(id); if (r) { r.markedUnread = true; r.lastTs = Math.max(r.lastTs, Date.now()); setMarkedUnread(r, true); } delete S.reminders[id]; }
  api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/account_data/inbox.reminders`, { reminders: S.reminders }).catch(() => {});
  changed(); return due;
}
let draftTimer: ReturnType<typeof setTimeout> | null = null;
export function setDraft(roomId: string, text: string) {
  if (text.trim()) S.drafts[roomId] = text; else delete S.drafts[roomId];
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { AsyncStorage.setItem('inbox.drafts', JSON.stringify(S.drafts)).catch(() => {}); changed(); }, 400);
}
export async function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  S.prefs = { ...S.prefs, [k]: v }; changed();
  await AsyncStorage.setItem('inbox.prefs', JSON.stringify(S.prefs)).catch(() => {});
}
let typingAt = 0;
export function sendTyping(r: Room, on: boolean) {
  if (!S.prefs.typing || botNetOf(r)) return;
  if (on && Date.now() - typingAt < 4000) return;
  typingAt = on ? Date.now() : 0;
  api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/typing/${enc(S.userId!)}`, on ? { typing: true, timeout: 6000 } : { typing: false }).catch(() => {});
}
export async function searchMessages(term: string): Promise<{ room: Room; ev: MEvent }[]> {
  const d = await api('POST', '/_matrix/client/v3/search', { search_categories: { room_events: { search_term: term, order_by: 'recent', filter: { limit: 30 } } } });
  const out: { room: Room; ev: MEvent }[] = [];
  for (const res of d.search_categories?.room_events?.results || []) {
    const ev = res.result as MEvent; const r = S.rooms.get((res.result as any).room_id);
    if (r) out.push({ room: r, ev });
  }
  return out;
}
const DELAYED = ['/_matrix/client/unstable/org.matrix.msc4140/delayed_events', '/_matrix/client/v1/delayed_events'];
let delayedBase: string | false | null = null;
async function getDelayedBase() {
  if (delayedBase !== null) return delayedBase;
  for (const b of DELAYED) { try { await api('GET', b); delayedBase = b; return b; } catch (e: any) { if (e.status === 401) break; } }
  delayedBase = false; return false;
}
export async function scheduleSend(r: Room, text: string, ts: number) {
  const base = await getDelayedBase();
  if (!base) throw new Error('Scheduling isn’t switched on on your server yet');
  const res = await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}?org.matrix.msc4140.delay=${Math.round(ts - Date.now())}`, { msgtype: 'm.text', body: text });
  if (res.event_id && !res.delay_id) throw new Error('Sent now — scheduling isn’t available');
}
export async function listScheduled(roomId: string) {
  const base = await getDelayedBase(); if (!base) return [];
  try {
    const d = await api('GET', base);
    return (d.delayed_events || []).filter((x: any) => x.room_id === roomId && x.type === 'm.room.message')
      .map((x: any) => ({ id: x.delay_id as string, at: (x.running_since || Date.now()) + (x.delay || 0), text: (x.content?.body || '') as string }));
  } catch { return []; }
}
export async function cancelScheduled(id: string) {
  const base = await getDelayedBase(); if (!base) return;
  await api('POST', `${base}/${enc(id)}`, { action: 'cancel' });
}
export async function sendVoice(r: Room, uri: string, durationMs: number) {
  const blob = await (await fetch(uri)).blob();
  let mime = 'audio/mp4', url: string, size = blob.size, playable: string | undefined;
  if (netOf(r) === 'whatsapp') {
    // keep the original for playback inside Inbox (iPhone can't play the Ogg copy WhatsApp needs)
    try {
      const o = await fetch(`${S.server}/_matrix/media/v3/upload?filename=voice.m4a`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'audio/mp4' }, body: blob });
      playable = (await o.json()).content_uri;
    } catch {}
    // WhatsApp voice notes must be Ogg Opus; your server converts the iPhone recording
    const up = await fetch(`${S.server}/push/voice`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'audio/mp4' }, body: blob });
    const j = await up.json().catch(() => ({})); if (!up.ok || !j.content_uri) throw new Error(j.error || 'Could not prepare the voice note');
    mime = 'audio/ogg'; url = j.content_uri; size = j.size;
  } else {
    const up = await fetch(`${S.server}/_matrix/media/v3/upload?filename=voice.m4a`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': mime }, body: blob });
    const j = await up.json(); if (!up.ok || !j.content_uri) throw new Error(j.error || 'Upload failed');
    url = j.content_uri;
  }
  await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}`, {
    msgtype: 'm.audio', body: 'Voice message', url, info: { mimetype: mime, size, duration: Math.round(durationMs) }, ...(playable ? { 'com.myinbox.playable': playable } : {}),
    'org.matrix.msc3245.voice': {}, 'org.matrix.msc1767.audio': { duration: Math.round(durationMs) },
  });
}
const previews = new Map<string, any>();
export async function linkPreview(url: string) {
  if (previews.has(url)) return previews.get(url);
  const p = api('GET', `/_matrix/client/v1/media/preview_url?url=${enc(url)}`).catch(() => null);
  previews.set(url, p); const v = await p; previews.set(url, v); return v;
}
export function setupRoom(n: Net) {
  const bid = botId(n);
  const cands = [...S.rooms.values()].filter(x => !x.isSpace && botNetOf(x) === n);
  const isMgmt = (x: Room) => x.events.some(e => /management room/i.test(e.content?.body || ''));
  return cands.find(isMgmt) || cands.sort((a, b) => b.events.length - a.events.length)[0] || null;
}
export async function startWhatsAppChat(number: string) {
  const r = setupRoom('whatsapp'); if (!r) throw new Error('Connect WhatsApp first');
  const digits = number.replace(/[^\d]/g, ''); if (digits.length < 8) throw new Error('Enter the full number with country code');
  await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${newTxn()}`, { msgtype: 'm.text', body: '!wa start-chat +' + digits });
  return digits;
}
export async function roomMembers(r: Room) {
  const d = await api('GET', `/_matrix/client/v3/rooms/${enc(r.id)}/joined_members`);
  return Object.entries<any>(d.joined || {}).filter(([id]) => id !== S.userId && !isBot(id))
    .map(([id, m]) => ({ id, name: cleanName(m.display_name) || id.split(':')[0].slice(1), avatar: m.avatar_url as string | undefined }));
}
export function reelLink(c: any) {
  return (/(https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+\/?)/.exec((c?.body || '') + ' ' + (c?.external_url || '')) || [])[1] || null;
}


// ---------------- instant open: keep a copy of the chat list on the phone ----------------
const SNAP = 'inbox.snapshot.v1';
let snapTimer: ReturnType<typeof setTimeout> | null = null;
export function saveSnapshot() {
  if (snapTimer) return;
  snapTimer = setTimeout(async () => {
    snapTimer = null;
    if (!S.token || !S.since) return;
    const rooms = [...S.rooms.values()].map(r => ({
      id: r.id, name: r.name, avatar: r.avatar, heroes: r.heroes, joined: r.joined, unread: r.unread, net: r.net,
      bridgeName: r.bridgeName, bridgeAvatar: r.bridgeAvatar, channelId: r.channelId, isSpace: r.isSpace, lastTs: r.lastTs,
      tags: r.tags, markedUnread: r.markedUnread, myRead: r.myRead, prevBatch: r.prevBatch ?? null,
      members: [...r.members.entries()].filter(([id]) => r.heroes.includes(id) || id === S.userId || isBot(id) || r.members.size < 30),
      readBy: [...r.readBy.entries()],
      events: r.events.filter(e => !e.pending && !e.failed).slice(-20),
      reacts: [...r.reacts.entries()].filter(([eid]) => r.events.slice(-20).some(e => e.event_id === eid)).map(([eid, m]) => [eid, [...m.entries()].map(([k, set]) => [k, [...set]])]),
    }));
    try { await AsyncStorage.setItem(SNAP, JSON.stringify({ uid: S.userId, since: S.since, muted: [...S.muted], starred: S.starred, reminders: S.reminders, rooms, calls: [...callInfo].slice(-300) })); } catch {}
  }, 3000);
}
async function loadSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(SNAP); if (!raw) return;
    const snap = JSON.parse(raw); if (snap.uid !== S.userId) return;
    S.muted = new Set(snap.muted || []); S.starred = snap.starred || []; S.reminders = snap.reminders || {};
    for (const [k, v] of snap.calls || []) callInfo.set(k, v);
    for (const x of snap.rooms || []) {
      const r = room(x.id);
      Object.assign(r, { name: x.name, avatar: x.avatar, heroes: x.heroes || [], joined: x.joined, unread: x.unread, net: x.net,
        bridgeName: x.bridgeName, bridgeAvatar: x.bridgeAvatar, channelId: x.channelId, isSpace: x.isSpace, lastTs: x.lastTs,
        tags: x.tags || {}, markedUnread: x.markedUnread, myRead: x.myRead, prevUnread: x.unread || 0, prevBatch: x.prevBatch });
      r.members = new Map(x.members || []); r.readBy = new Map(x.readBy || []);
      r.events = x.events || []; r.idx = new Map(r.events.map((e: MEvent) => [e.event_id, e]));
      r.reacts = new Map((x.reacts || []).map(([eid, list]: any) => [eid, new Map(list.map(([k, arr]: any) => [k, new Set(arr)]))]));
    }
    S.since = snap.since; S.ready = true; changed();
  } catch {}
}

// ---------------- @mentions + password + backup ----------------
export async function sendRich(r: Room, text: string, mentions: { id: string; name: string }[], replyTo?: MEvent | null) {
  const used = mentions.filter(m => text.includes('@' + m.name));
  if (!used.length) return sendText(r, text, replyTo);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let html = esc(text);
  for (const m of used) html = html.split(esc('@' + m.name)).join(`<a href="https://matrix.to/#/${esc(m.id)}">@${esc(m.name)}</a>`);
  const content: any = { msgtype: 'm.text', body: text, format: 'org.matrix.custom.html', formatted_body: html.replace(/\n/g, '<br>'), 'm.mentions': { user_ids: [...new Set(used.map(m => m.id))] } };
  if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo.event_id } };
  const txn = newTxn();
  const ev: MEvent = { event_id: '~' + txn, type: 'm.room.message', sender: S.userId!, origin_server_ts: Date.now(), content, pending: true, txn };
  r.txns.set(txn, ev); r.idx.set(ev.event_id, ev); r.events.push(ev); r.lastTs = ev.origin_server_ts; changed();
  try { const res = await api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.room.message/${txn}`, content); ev.event_id = res.event_id; ev.pending = false; r.idx.set(res.event_id, ev); }
  catch { ev.pending = false; ev.failed = true; }
  changed();
}
export async function changePassword(oldPw: string, newPw: string) {
  const body: any = { new_password: newPw, logout_devices: false };
  try { await api('POST', '/_matrix/client/v3/account/password', body); return; }
  catch (e: any) {
    if (e.status !== 401) throw e;
  }
  // server asks for your current password first (user-interactive auth)
  const res = await fetch(S.server + '/_matrix/client/v3/account/password', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  body.auth = { type: 'm.login.password', identifier: { type: 'm.id.user', user: S.userId }, password: oldPw, session: j.session };
  await api('POST', '/_matrix/client/v3/account/password', body);
}
export const backupApi = {
  status: () => api('GET', '/push/backup/status'),
  authUrl: () => api('GET', '/push/backup/authurl'),
  connect: (pasted: string) => api('POST', '/push/backup/connect', { pasted }),
  run: () => api('POST', '/push/backup/run'),
  disconnect: () => api('POST', '/push/backup/disconnect'),
};
export function igMediaId(url: string) {
  const m = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/.exec(url); if (!m) return null;
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0); for (const ch of m[1].slice(0, 11)) { const v = A.indexOf(ch); if (v < 0) return null; id = id * BigInt(64) + BigInt(v); }
  return id.toString();
}
export function setupChips(r: Room): string[] {
  let cmds = ['login', 'list-logins', 'cancel', 'help'];
  for (let i = r.events.length - 1; i >= 0; i--) {
    const ev = r.events[i]; if (ev.sender === S.userId) continue;
    const body = ev.content?.body || '';
    if (/specify a login flow/i.test(body)) {
      const flows = [...body.matchAll(/^\s*\*\s*`([a-z0-9-]+)`/gim)].map(m => 'login ' + m[1]);
      if (flows.length) cmds = flows.concat(['help']);
    } else if (/Options:\s*`/i.test(body)) {
      const opts = [...body.slice(body.search(/Options:/i)).matchAll(/`([^`]{1,40})`/g)].map(m => m[1]);
      if (opts.length) cmds = opts;
    }
    break;
  }
  return cmds;
}

// ---------------- family & private chats (your own server only — never WhatsApp/Meta) ----------------
export type Person = { userId: string; displayname: string };
export const familyApi = {
  list: () => api('GET', '/push/family/list') as Promise<{ admin: boolean; people: Person[] }>,
  create: (username: string, displayname: string, password: string) => api('POST', '/push/family/create', { username, displayname, password }) as Promise<{ userId: string }>,
};
/** A chat with someone on your own server (not bridged from WhatsApp/Instagram/Messenger). */
export function isPrivateRoom(r: Room) {
  if (netOf(r) || botNetOf(r)) return false;
  const o = allOthers(r);
  return o.length >= 1 && o.every(id => id.split(':').slice(1).join(':') === (S.userId || '').split(':').slice(1).join(':') && !netFrom(id.split(':')[0]));
}
export function privateRoomWith(userId: string) {
  return [...S.rooms.values()].find(r => !r.isSpace && isPrivateRoom(r) && allOthers(r).length === 1 && allOthers(r)[0] === userId) || null;
}
/** Opens (or creates) the private 1-to-1 chat with a family member; resolves with the room id once it's synced. */
export async function startPrivateChat(userId: string): Promise<string> {
  const have = privateRoomWith(userId); if (have) return have.id;
  const { room_id } = await api('POST', '/_matrix/client/v3/createRoom', { preset: 'trusted_private_chat', is_direct: true, invite: [userId], visibility: 'private' });
  try {
    let direct: Record<string, string[]> = {};
    try { direct = await api('GET', `/_matrix/client/v3/user/${enc(S.userId!)}/account_data/m.direct`); } catch {}
    direct[userId] = [...new Set([...(direct[userId] || []), room_id])];
    await api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/account_data/m.direct`, direct);
  } catch {}
  for (let i = 0; i < 40 && !S.rooms.has(room_id); i++) await new Promise(r => setTimeout(r, 250));
  return room_id;
}

// ---------------- media, links & docs for a chat (like WhatsApp's chat info) ----------------
export type SharedItem = { ev: MEvent; kind: 'media' | 'link' | 'doc'; url?: string };
const URL_RE = /https?:\/\/[^\s<>()\]]+/g;
export function classifyShared(evs: MEvent[]): SharedItem[] {
  const out: SharedItem[] = [];
  for (const ev of evs) {
    if (ev.redacted || ev.type !== 'm.room.message' && ev.type !== 'm.sticker') continue;
    const c = ev.content || {};
    if (c.msgtype === 'm.image' || c.msgtype === 'm.video' || ev.type === 'm.sticker') out.push({ ev, kind: 'media' });
    else if (c.msgtype === 'm.file') out.push({ ev, kind: 'doc' });
    const links = (c.body || '').match(URL_RE);
    if (links) for (const u of [...new Set<string>(links)]) out.push({ ev, kind: 'link', url: u.replace(/[.,!?*]+$/, '') });
  }
  return out;
}
/** Pages back through the chat's history (up to `pages` × 100 messages) and returns everything shared. */
export async function loadShared(r: Room, pages = 6): Promise<SharedItem[]> {
  const seen = new Map<string, MEvent>();
  for (const ev of r.events) seen.set(ev.event_id, ev);
  let from: string | undefined;
  const filter = enc(JSON.stringify({ types: ['m.room.message', 'm.sticker'], lazy_load_members: true }));
  for (let i = 0; i < pages; i++) {
    try {
      const d = await api('GET', `/_matrix/client/v3/rooms/${enc(r.id)}/messages?dir=b&limit=100&filter=${filter}${from ? '&from=' + enc(from) : ''}`);
      for (const ev of d.chunk || []) if (!seen.has(ev.event_id)) seen.set(ev.event_id, ev);
      if (!d.end || !(d.chunk || []).length) break;
      from = d.end;
    } catch { break; }
  }
  return classifyShared([...seen.values()].sort((a, b) => b.origin_server_ts - a.origin_server_ts));
}
