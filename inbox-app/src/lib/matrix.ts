// Connection to your own server (Matrix), ported from the web Inbox.
// Holds the chat list in memory and tells screens when anything changes.
import { getItem, setItem, removeItem } from './storage';

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
  isSpace: boolean; prevBatch: string | null | undefined; lastTs: number; tags: Record<string, unknown>; markedUnread: boolean;
  readBy: Map<string, string>; typing: string[]; loadingOlder: boolean;
};

// ---------------- state + change notifications ----------------
export const S = {
  server: DEFAULT_SERVER, token: null as string | null, userId: null as string | null, since: null as string | null,
  rooms: new Map<string, Room>(), ready: false, status: '' as string, current: null as string | null,
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
  const bots = allOthers(r).filter(isBot).length;
  return r.joined ? Math.max(1, r.joined - bots) : others(r).length + 1;
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
const isStatusRoom = (r: Room) => /status@broadcast/i.test(r.channelId || '') || /status broadcast/i.test(r.name || r.bridgeName || '');
export function visibleRooms() {
  return [...S.rooms.values()].filter(r => !r.isSpace && !botNetOf(r) && !isStatusRoom(r) && (r.events.length || r.name));
}

// ---------------- events ----------------
const SHOWN = new Set(['m.room.message', 'm.sticker']);
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
    (tl.events || []).forEach((ev: MEvent) => addEvent(r, ev));
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
      }
    }
    if (id === S.current) { r.unread = 0; markRead(r); }
  }
  for (const id of Object.keys(rooms.leave || {})) S.rooms.delete(id);
}
let syncing = false;
export async function startSync() {
  if (syncing) return; syncing = true;
  const filter = enc(JSON.stringify({
    room: { timeline: { limit: 25 }, state: { lazy_load_members: true },
      account_data: { types: ['m.tag', 'm.marked_unread', 'com.famedly.marked_unread'] },
      ephemeral: { types: ['m.receipt', 'm.typing'] } },
    presence: { types: [] },
  }));
  let backoff = 1000;
  while (S.token) {
    try {
      const first = !S.since;
      const d = await api('GET', `/_matrix/client/v3/sync?filter=${filter}&timeout=${S.since ? 30000 : 0}${S.since ? '&since=' + enc(S.since) : ''}`);
      if (!S.token) break;
      processSync(d, first);
      S.since = d.next_batch; S.ready = true; S.status = ''; backoff = 1000; changed();
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
  if (S.token) startSync();
  return !!S.token;
}
export async function logout(expired = false) {
  const tok = S.token;
  S.token = null; S.userId = null; S.since = null; S.rooms.clear(); S.ready = false;
  await removeItem('inbox.token'); await removeItem('inbox.user');
  if (!expired && tok) fetch(S.server + '/_matrix/client/v3/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {});
  changed();
}
export function markRead(r: Room) {
  const last = [...r.events].reverse().find(e => !e.pending && e.event_id && !e.event_id.startsWith('~'));
  r.unread = 0;
  if (r.markedUnread) { r.markedUnread = false; api('PUT', `/_matrix/client/v3/user/${enc(S.userId!)}/rooms/${enc(r.id)}/account_data/m.marked_unread`, { unread: false }).catch(() => {}); }
  if (last) api('POST', `/_matrix/client/v3/rooms/${enc(r.id)}/read_markers`, { 'm.fully_read': last.event_id, 'm.read': last.event_id }).catch(() => {});
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
