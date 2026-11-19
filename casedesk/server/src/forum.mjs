// Community (v2.7, Reddit-style): posts (question, discussion, timeline share, poll, repost), threaded
// comments (up to 4 levels), up / down votes, hot / new / top / unanswered feeds, saved posts, public
// profiles (avatar, visa flair, karma), in-app + push notifications, reports, blocks and moderation.
// Storage: one JSON file (data/forum.json) flushed every few seconds and on shutdown, like community.mjs.
// People sign in with Apple (or Google once it's configured) and appear only under a made-up display
// name. No emails, no real names; receipt numbers and other personal numbers are refused in all text.
// v2.4 "answers" are migrated to top-level comments on load; the old /answers endpoints still work.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkText } from './filter.mjs';
import { sha256, newSessionToken } from './auth.mjs';

export const RULES_VERSION = 1;
export const RULES = [
  'Be kind. No harassment, hate, threats, sexual content or personal attacks — zero tolerance: content is removed and accounts are banned.',
  'Keep your privacy. Never post receipt numbers, A-numbers, passport numbers, emails or phone numbers.',
  'No ads, paid services, “DM me”, or anything that looks like a scam.',
  'Stay on topic: US visas, green cards, citizenship and the paperwork around them.',
  'Community answers are from other users, not lawyers — not legal advice. For your own case, talk to an immigration attorney.',
  'See something wrong? Tap ••• → Report, or block the person. Reports are reviewed within 24 hours.',
];
export const TAGS = {
  visa: ['H-1B', 'H-4', 'L-1', 'L-2', 'F-1', 'OPT', 'STEM OPT', 'TN', 'E-3', 'O-1', 'J-1', 'B-1/B-2', 'Green card', 'Citizenship'],
  form: ['I-129', 'I-130', 'I-131', 'I-140', 'I-485', 'I-539', 'I-765', 'I-751', 'I-90', 'N-400', 'PERM', 'DS-160'],
  topic: ['Stamping', 'Travel', 'RFE', 'Layoff', 'Job change', 'Premium', 'Priority date', 'Lottery', 'Processing times'],
};
const ALL_TAGS = new Set([...TAGS.visa, ...TAGS.form, ...TAGS.topic]);
export const REASONS = ['spam', 'abuse', 'hate', 'sexual', 'personal-info', 'scam', 'off-topic', 'other'];
export const LIMITS = { title: [10, 150], body: [20, 5000], answer: [10, 5000], comment: [2, 5000], name: [3, 24], tags: 5, note: 300, contact: 1000, q: 100, pageMax: 50, pollOption: [1, 80], pollOptions: [2, 4], steps: [2, 6] };
export const HIDE_AFTER_REPORTS = 3;
export const POST_TYPES = ['question', 'discussion', 'timeline', 'poll'];
export const MAX_DEPTH = 4; // comment levels: 0 (top) … 3
// Built-in avatars (drawn by the app; the server only keeps the id) and optional visa flair.
export const AVATARS = ['fox', 'owl', 'cat', 'dog', 'panda', 'koala', 'tiger', 'penguin', 'whale', 'turtle', 'bee', 'butterfly', 'cactus', 'tulip', 'maple', 'mountain', 'wave', 'moon', 'sun', 'star', 'rocket', 'globe', 'compass', 'kite'];
export const FLAIRS = ['H-1B', 'H-4', 'L-1A', 'L-1B', 'L-2', 'F-1', 'OPT', 'STEM OPT', 'TN', 'E-3', 'O-1', 'J-1', 'B-1/B-2', 'Green card', 'Citizen'];
export const OFFICES = ['EAC', 'WAC', 'LIN', 'SRC', 'IOE', 'NBC', 'MSC', 'YSC', 'Consulate', 'Other'];
export const STEPS = ['Filed', 'Receipt notice', 'Biometrics', 'RFE received', 'RFE response', 'Interview', 'Transferred', 'Approved', 'Denied', 'Card received'];
export const MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000];
export const DELETED = '[deleted]';
const SESSION_DAYS = 180;
const MAX_SESSIONS = 10;
const MAX_NOTES = 100;
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,100}\]$/;

const err = (status, message, code) => Object.assign(new Error(message), { status, code });
const rid = (p) => `${p}_${crypto.randomBytes(9).toString('base64url')}`;
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n').trim();

const ADJ = ['Calm', 'Bright', 'Kind', 'Swift', 'Quiet', 'Brave', 'Clever', 'Gentle', 'Lucky', 'Sunny', 'Steady', 'Patient', 'Curious', 'Cheerful', 'Wise', 'Bold'];
const NOUN = ['Falcon', 'Maple', 'River', 'Comet', 'Harbor', 'Cedar', 'Otter', 'Lotus', 'Meadow', 'Sparrow', 'Summit', 'Pebble', 'Willow', 'Heron', 'Canyon', 'Orchid'];
const RESERVED = /\b(admin|administrator|moderator|mod|uscis|dhs|casedesk|immigration wallet|official|support|staff|lawyer|attorney|esq|deleted|removed)\b/i;

function emptyDb() {
  return { v: 2, users: {}, byProvider: {}, sessions: {}, posts: {}, comments: {}, votes: {}, reports: [], blocks: {}, bannedSubs: {}, messages: [], saved: {}, notes: {} };
}

/** v1 (questions + flat answers, upvotes only) → v2 (typed posts + comment tree, up / down votes). Safe to run twice. */
export function migrate(raw) {
  const db = { ...emptyDb(), ...(raw || {}) };
  if (db.answers) {
    for (const a of Object.values(db.answers)) {
      if (!db.comments[a.id]) db.comments[a.id] = { ...a, parentId: null };
    }
    delete db.answers;
  }
  for (const p of Object.values(db.posts)) {
    if (!p.commentIds) { p.commentIds = p.answerIds || []; }
    delete p.answerIds;
    p.type ||= 'question';
    if (p.up === undefined) { p.up = Math.max(0, p.score || 0); p.down = 0; }
    p.score = p.up - p.down;
  }
  for (const c of Object.values(db.comments)) {
    if (c.parentId === undefined) c.parentId = null;
    if (c.up === undefined) { c.up = Math.max(0, c.score || 0); c.down = 0; }
    c.score = c.up - c.down;
  }
  for (const r of db.reports) if (r.kind === 'answer') r.kind = 'comment';
  db.v = 2;
  return db;
}

/** Reddit's hot rank: votes on a log scale plus a steady bonus for newer posts (12.5 h ≈ 10× the votes). */
export function hotScore(score, comments, createdMs) {
  const s = score + comments * 0.5;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  return (s > 0 ? order : s < 0 ? -order : 0) + createdMs / 1000 / 45000;
}
/** Lower bound of the Wilson interval — "Best" for comments (many votes beat a single lucky one). */
export function wilson(up, down) {
  const n = up + down;
  if (!n) return 0;
  const z = 1.2816, ph = up / n;
  return (ph + (z * z) / (2 * n) - z * Math.sqrt((ph * (1 - ph) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}
/** Flat comment views → nested tree, sorted at every level. sort: 'best' | 'new'. The accepted answer is first. */
export function commentTree(list, sort = 'best') {
  const nodes = new Map(list.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : null;
    if (parent) parent.replies.push(n); else if (!n.parentId) roots.push(n);
  }
  const byNew = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const best = (a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0) || wilson(b.up ?? Math.max(0, b.score), b.down ?? 0) - wilson(a.up ?? Math.max(0, a.score), a.down ?? 0) || b.score - a.score || a.createdAt.localeCompare(b.createdAt);
  const cmp = sort === 'new' ? (a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0) || byNew(a, b) : best;
  const walk = (arr, depth) => { arr.sort(depth === 0 ? cmp : sort === 'new' ? byNew : best); for (const n of arr) { n.depth = depth; walk(n.replies, depth + 1); } return arr; };
  return walk(roots, 0);
}

export function createForum({ file = null, now = Date.now, notify = async () => {}, verifyApple, verifyGoogle, exchangeAppleCode = async () => null, revokeApple = async () => false, adminToken = process.env.ADMIN_TOKEN || '', flushMs = 10_000 } = {}) {
  let db = emptyDb();
  if (file) { try { db = migrate(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {} }
  let dirty = false;
  let statsCache = null;
  const touch = () => { dirty = true; statsCache = null; };
  function flush() {
    if (!file || !dirty) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
    dirty = false;
  }
  const timer = file ? setInterval(() => { try { flush(); } catch (e) { console.error('forum flush failed', e.message); } }, flushMs) : null;
  timer?.unref?.();
  const iso = () => new Date(now()).toISOString();

  // ---------- rate limits (memory only) ----------
  const hits = new Map();
  function limit(key, max, windowMs, message = 'You’re doing that too often. Try again later.') {
    const t = now();
    const h = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (h.length >= max) throw err(429, message, 'rate');
    h.push(t); hits.set(key, h);
    if (hits.size > 50_000) for (const k of [...hits.keys()].slice(0, 10_000)) hits.delete(k);
  }

  // ---------- refresh-token sealing (Apple revoke needs it; never stored in the clear) ----------
  const sealKey = () => crypto.createHash('sha256').update('forum-seal:' + (process.env.APPLE_SIGNIN_KEY || process.env.ADMIN_TOKEN || 'casedesk')).digest();
  const seal = (s) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', sealKey(), iv); const enc = Buffer.concat([c.update(s, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.'); };
  const unseal = (s) => { try { const [iv, tag, enc] = s.split('.').map((x) => Buffer.from(x, 'base64url')); const d = crypto.createDecipheriv('aes-256-gcm', sealKey(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch { return null; } };

  // ---------- users & sessions ----------
  const nameTaken = (name, exceptId) => Object.values(db.users).some((u) => u.id !== exceptId && u.name.toLowerCase() === name.toLowerCase());
  function makeName() {
    for (let i = 0; i < 200; i++) {
      const n = `${ADJ[crypto.randomInt(ADJ.length)]} ${NOUN[crypto.randomInt(NOUN.length)]} ${crypto.randomInt(10, 100)}`;
      if (!nameTaken(n)) return n;
    }
    return `Member ${crypto.randomInt(10000, 99999)}`;
  }
  /** Karma = net votes received on posts + comments; counts of live posts and comments. Cached until the next write. */
  function stats(uid) {
    if (!statsCache) {
      statsCache = new Map();
      const at = (id) => { let s = statsCache.get(id); if (!s) { s = { postKarma: 0, commentKarma: 0, posts: 0, comments: 0 }; statsCache.set(id, s); } return s; };
      for (const p of Object.values(db.posts)) if (p.uid && !p.gone) { const s = at(p.uid); s.posts++; s.postKarma += p.score || 0; }
      for (const c of Object.values(db.comments)) if (c.uid && !c.gone) { const s = at(c.uid); s.comments++; s.commentKarma += c.score || 0; }
    }
    const s = statsCache.get(uid) || { postKarma: 0, commentKarma: 0, posts: 0, comments: 0 };
    return { ...s, karma: Math.max(0, s.postKarma + s.commentKarma) };
  }
  const unread = (uid) => (db.notes[uid] || []).filter((n) => !n.read).length;
  const me = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null, flair: u.flair || null, provider: u.provider, createdAt: u.createdAt, rulesAccepted: u.rules === RULES_VERSION, rulesVersion: RULES_VERSION, banned: !!u.banned, notify: !!u.pushToken, unread: unread(u.id), ...stats(u.id) });
  const GONE_AUTHOR = { id: null, name: DELETED, avatar: null, flair: null, deleted: true };
  const pub = (uid) => { const u = uid ? db.users[uid] : null; return u ? { id: u.id, name: u.name, avatar: u.avatar || null, flair: u.flair || null } : GONE_AUTHOR; };

  function userFrom(token) {
    if (!token) return null;
    const h = sha256(token);
    const s = db.sessions[h];
    if (!s) return null;
    const t = now();
    if (t - s.used > SESSION_DAYS * 864e5) { delete db.sessions[h]; touch(); return null; }
    const u = db.users[s.uid];
    if (!u) { delete db.sessions[h]; touch(); return null; }
    if (t - s.used > 3600_000) { s.used = t; dirty = true; }
    return u;
  }
  function needUser(token) {
    const u = userFrom(token);
    if (!u) throw err(401, 'Sign in to do that.', 'auth');
    return u;
  }
  function canWrite(u) {
    if (u.banned) throw err(403, 'Your account can’t post because it broke the community rules.', 'banned');
    if (u.rules !== RULES_VERSION) throw err(403, 'Please accept the community rules first.', 'rules');
  }

  async function signIn(b, ip) {
    limit(`signin:${ip}`, 20, 3600_000);
    let who;
    if (b.provider === 'google') {
      if (!verifyGoogle) throw err(503, 'Google sign-in is not set up yet.', 'google-off');
      who = await verifyGoogle(String(b.idToken || ''));
    } else {
      if (!verifyApple) throw err(503, 'Sign in is not available.', 'apple-off');
      who = await verifyApple(String(b.identityToken || ''), b.nonce ? String(b.nonce) : '');
    }
    const key = sha256(`${who.provider}:${who.sub}`);
    let u = db.users[db.byProvider[key]];
    const t = now();
    if (!u) {
      u = { id: rid('u'), provider: who.provider, key, name: makeName(), avatar: null, flair: null, createdAt: new Date(t).toISOString(), rules: 0, banned: !!db.bannedSubs[key], pushToken: null, refresh: null };
      db.users[u.id] = u; db.byProvider[key] = u.id;
    }
    if (who.provider === 'apple' && b.authorizationCode && !u.refresh) {
      const r = await exchangeAppleCode(String(b.authorizationCode));
      if (r) u.refresh = seal(r);
    }
    const token = newSessionToken();
    db.sessions[sha256(token)] = { uid: u.id, created: t, used: t };
    const mine = Object.entries(db.sessions).filter(([, s]) => s.uid === u.id).sort((a, b2) => b2[1].used - a[1].used);
    for (const [h] of mine.slice(MAX_SESSIONS)) delete db.sessions[h];
    touch();
    return { token, user: me(u) };
  }

  function signOut(token) {
    if (token) { delete db.sessions[sha256(token)]; touch(); }
    return { ok: true };
  }

  function updateMe(token, b) {
    const u = needUser(token);
    if (b.name !== undefined) {
      limit(`name:${u.id}`, 10, 864e5);
      const name = clean(b.name).replace(/\s+/g, ' ');
      if (name.length < LIMITS.name[0] || name.length > LIMITS.name[1]) throw err(400, `Display name: ${LIMITS.name[0]}–${LIMITS.name[1]} characters.`);
      if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) throw err(400, 'Use letters, numbers, spaces, dots, dashes or underscores.');
      if (RESERVED.test(name)) throw err(400, 'Please pick a name that doesn’t sound official (no admin, USCIS, lawyer…).');
      const bad = checkText(name, { kind: 'name' });
      if (bad) throw err(400, bad);
      if (nameTaken(name, u.id)) throw err(409, 'That name is taken — try another.');
      u.name = name;
    }
    if (b.avatar !== undefined) {
      if (b.avatar === null || b.avatar === '') u.avatar = null;
      else if (AVATARS.includes(b.avatar)) u.avatar = b.avatar;
      else throw err(400, 'Pick one of the built-in avatars.');
    }
    if (b.flair !== undefined) {
      if (b.flair === null || b.flair === '') u.flair = null;
      else if (FLAIRS.includes(b.flair)) u.flair = b.flair;
      else throw err(400, 'Pick a visa flair from the list.');
    }
    if (b.pushToken !== undefined) {
      if (b.pushToken === null || b.pushToken === '') u.pushToken = null;
      else if (TOKEN_RE.test(String(b.pushToken))) u.pushToken = String(b.pushToken);
      else throw err(400, 'Invalid push token');
    }
    if (b.acceptRules !== undefined) {
      if (Number(b.acceptRules) !== RULES_VERSION) throw err(409, 'The community rules changed — please read them again.', 'rules');
      u.rules = RULES_VERSION; u.rulesAt = iso();
    }
    touch();
    return { user: me(u) };
  }

  // ---------- removing content (threads survive: an item other people replied to becomes a [deleted] stub) ----------
  const childrenOf = (c) => { const p = db.posts[c.postId]; return p ? p.commentIds.map((id) => db.comments[id]).filter((x) => x && x.parentId === c.id) : []; };
  function dropVotes(id) { for (const k of Object.keys(db.votes)) if (k.endsWith('|' + id)) delete db.votes[k]; db.reports = db.reports.filter((r) => r.id !== id); }
  function stubComment(c, text = DELETED) {
    Object.assign(c, { uid: null, gone: true, body: text, editedAt: null, up: 0, down: 0, score: 0, hidden: null });
    dropVotes(c.id);
    const p = db.posts[c.postId]; if (p?.acceptedId === c.id) p.acceptedId = null;
  }
  function hardRemoveComment(id) {
    const c = db.comments[id]; if (!c) return;
    const p = db.posts[c.postId];
    if (p) { p.commentIds = p.commentIds.filter((x) => x !== id); if (p.acceptedId === id) p.acceptedId = null; }
    dropVotes(id);
    delete db.comments[id];
  }
  /** Remove a [deleted] stub once nothing hangs below it any more (walks up the thread). */
  function prune(c) {
    while (c && c.gone && !childrenOf(c).length) {
      const parent = c.parentId ? db.comments[c.parentId] : null;
      const p = db.posts[c.postId];
      hardRemoveComment(c.id);
      if (!parent && p?.gone && !p.commentIds.length) hardRemovePost(p.id);
      c = parent;
    }
  }
  function removeComment(id, text = DELETED) {
    const c = db.comments[id]; if (!c) return;
    if (childrenOf(c).length) stubComment(c, text);
    else { const parent = c.parentId ? db.comments[c.parentId] : null; const p = db.posts[c.postId]; hardRemoveComment(id); if (parent) prune(parent); else if (p?.gone && !p.commentIds.length) hardRemovePost(p.id); }
    touch();
  }
  function hardRemovePost(id) {
    const p = db.posts[id]; if (!p) return;
    for (const cid of [...p.commentIds]) { dropVotes(cid); delete db.comments[cid]; }
    dropVotes(id);
    for (const uid of Object.keys(db.saved)) db.saved[uid] = db.saved[uid].filter((x) => x !== id);
    delete db.posts[id];
  }
  function stubPost(p, text = DELETED) {
    Object.assign(p, { uid: null, gone: true, title: text, body: text, tags: [], editedAt: null, up: 0, down: 0, score: 0, hidden: null, acceptedId: null });
    delete p.poll; delete p.timeline; delete p.repostOf;
    dropVotes(p.id);
  }
  /** A post with comments from others keeps its thread as a [deleted] stub; otherwise it goes completely. */
  function removePost(id, text = DELETED, { force = false } = {}) {
    const p = db.posts[id]; if (!p) return;
    const others = p.commentIds.map((c) => db.comments[c]).some((c) => c && !c.gone && c.uid !== p.uid);
    if (others && !force) stubPost(p, text); else hardRemovePost(id);
    touch();
  }

  /** Delete the account (App Store 5.1.1(v)): the person, their votes, saves, notifications and sessions go;
   *  what they wrote is removed, or — where others replied — anonymised to [deleted] so threads stay readable. Bans survive. */
  async function deleteMe(token) {
    const u = needUser(token);
    const uid = u.id;
    for (const [k, v] of Object.entries(db.votes)) if (k.startsWith(uid + '|')) { const id = k.split('|')[1]; const it = db.posts[id] || db.comments[id]; if (it) { if (v > 0) it.up = Math.max(0, it.up - 1); else it.down = Math.max(0, it.down - 1); it.score = it.up - it.down; } delete db.votes[k]; }
    for (const p of Object.values(db.posts)) if (p.poll?.voters?.[uid] !== undefined) delete p.poll.voters[uid];
    const mine = Object.values(db.comments).filter((c) => c.uid === uid);
    for (const c of mine) stubComment(c);
    for (const p of Object.values(db.posts)) if (p.uid === uid) removePost(p.id);
    for (const c of mine) if (db.comments[c.id]) prune(c);
    db.reports = db.reports.filter((r) => r.by !== uid && r.id !== uid);
    delete db.blocks[uid]; delete db.saved[uid]; delete db.notes[uid];
    for (const k of Object.keys(db.blocks)) db.blocks[k] = db.blocks[k].filter((x) => x !== uid);
    for (const k of Object.keys(db.notes)) db.notes[k] = db.notes[k].filter((n) => n.from !== uid);
    for (const [h, s] of Object.entries(db.sessions)) if (s.uid === uid) delete db.sessions[h];
    if (u.banned) db.bannedSubs[u.key] = true;
    delete db.byProvider[u.key];
    delete db.users[uid];
    touch();
    const refresh = u.refresh ? unseal(u.refresh) : null;
    const revoked = refresh ? await revokeApple(refresh) : false;
    return { ok: true, revoked };
  }

  // ---------- visibility ----------
  const blockedBy = (viewer) => new Set(viewer ? db.blocks[viewer.id] || [] : []);
  const reportedBy = (viewer) => new Set(viewer ? db.reports.filter((r) => r.by === viewer.id).map((r) => r.id) : []);
  function visible(item, viewer, blocked = blockedBy(viewer), reported = reportedBy(viewer)) {
    if (!item) return false;
    if (item.gone) return true;
    if (viewer && item.uid === viewer.id) return true;
    if (item.hidden) return false;
    if (db.users[item.uid]?.banned) return false;
    if (blocked.has(item.uid) || reported.has(item.id)) return false;
    return true;
  }
  const liveComments = (p) => p.commentIds.map((id) => db.comments[id]).filter((c) => c && !c.gone && !c.hidden && !db.users[c.uid]?.banned);
  const myVote = (viewer, id) => (viewer ? db.votes[`${viewer.id}|${id}`] || 0 : 0);
  const excerpt = (s) => (s.length > 280 ? s.slice(0, 277).trimEnd() + '…' : s);
  const isSaved = (viewer, id) => !!viewer && (db.saved[viewer.id] || []).includes(id);

  function pollView(p, viewer) {
    if (!p.poll) return null;
    const counts = p.poll.options.map(() => 0);
    for (const i of Object.values(p.poll.voters)) if (counts[i] !== undefined) counts[i]++;
    const mine = viewer ? p.poll.voters[viewer.id] : undefined;
    return { options: p.poll.options.map((text, i) => ({ text, votes: counts[i] })), total: counts.reduce((a, b) => a + b, 0), myVote: mine === undefined ? null : mine };
  }
  function embed(id, viewer) {
    const o = db.posts[id];
    if (!o || o.gone || !visible(o, viewer)) return { id, removed: true };
    return { id: o.id, type: o.type, title: o.title, excerpt: excerpt(o.body), tags: o.tags, author: pub(o.uid), createdAt: o.createdAt, score: o.score, comments: liveComments(o).length, timeline: o.timeline || null, poll: o.poll ? { options: o.poll.options.map((text) => ({ text })), total: Object.keys(o.poll.voters).length } : null };
  }
  function summary(p, viewer) {
    const n = liveComments(p).length;
    const v = myVote(viewer, p.id);
    return {
      id: p.id, type: p.type, title: p.title, excerpt: excerpt(p.body), tags: p.tags, author: pub(p.uid), createdAt: p.createdAt, editedAt: p.editedAt || null,
      score: p.score || 0, myVote: v, voted: v === 1, comments: n, answers: n, accepted: !!p.acceptedId, saved: isSaved(viewer, p.id), mine: !!viewer && viewer.id === p.uid,
      hidden: p.hidden ? 'review' : null, deleted: !!p.gone, timeline: p.timeline || null, poll: pollView(p, viewer), repost: p.repostOf ? embed(p.repostOf, viewer) : null,
    };
  }
  function depthOf(c) { let d = 0; for (let x = c; x?.parentId && d < 20; x = db.comments[x.parentId]) d++; return d; }
  function commentView(c, p, viewer) {
    const v = myVote(viewer, c.id);
    return { id: c.id, postId: c.postId, parentId: c.parentId || null, depth: depthOf(c), body: c.body, author: pub(c.uid), createdAt: c.createdAt, editedAt: c.editedAt || null, score: c.score || 0, up: c.up || 0, down: c.down || 0, myVote: v, voted: v === 1, accepted: p?.acceptedId === c.id, op: !!c.uid && c.uid === p?.uid, mine: !!viewer && viewer.id === c.uid, hidden: c.hidden ? 'review' : null, deleted: !!c.gone };
  }

  // ---------- reading ----------
  const TOP_RANGE = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 };
  function list(q, token) {
    const viewer = userFrom(token);
    const sort = ['hot', 'new', 'top', 'unanswered'].includes(q.get('sort')) ? q.get('sort') : 'new';
    const tags = (q.get('tags') || q.get('tag') || '').split(',').map((s) => s.trim()).filter((t) => ALL_TAGS.has(t));
    const words = clean(q.get('q') || '').slice(0, LIMITS.q).toLowerCase().split(/\s+/).filter(Boolean);
    const mine = q.get('mine') === '1', saved = q.get('saved') === '1';
    const author = q.get('author') || '';
    const type = POST_TYPES.includes(q.get('type')) ? q.get('type') : '';
    if ((mine || saved) && !viewer) throw err(401, 'Sign in to see your posts.', 'auth');
    const limitN = Math.min(LIMITS.pageMax, Math.max(1, Number(q.get('limit')) || 20));
    const offset = Math.max(0, Number(q.get('cursor')) || 0);
    const blocked = blockedBy(viewer), reported = reportedBy(viewer);
    let rows;
    if (saved) rows = (db.saved[viewer.id] || []).map((id) => db.posts[id]).filter((p) => p && !p.gone && visible(p, viewer, blocked, reported)).reverse();
    else rows = Object.values(db.posts).filter((p) => !p.gone && (mine ? p.uid === viewer.id : visible(p, viewer, blocked, reported)));
    if (author) rows = rows.filter((p) => p.uid === author);
    if (type) rows = rows.filter((p) => p.type === type);
    if (tags.length) rows = rows.filter((p) => p.tags.some((t) => tags.includes(t)));
    if (words.length) rows = rows.filter((p) => { const h = `${p.title}\n${p.body}\n${p.tags.join(' ')}`.toLowerCase(); return words.every((w) => h.includes(w)); });
    const count = new Map(rows.map((p) => [p.id, liveComments(p).length]));
    if (sort === 'unanswered') rows = rows.filter((p) => count.get(p.id) === 0);
    const byNew = (a, b) => b.createdAt.localeCompare(a.createdAt);
    if (sort === 'top') {
      const range = TOP_RANGE[q.get('t')];
      if (range) { const t = now(); rows = rows.filter((p) => t - Date.parse(p.createdAt) <= range); }
      rows.sort((a, b) => (b.score || 0) - (a.score || 0) || count.get(b.id) - count.get(a.id) || byNew(a, b));
    } else if (sort === 'hot') {
      const h = new Map(rows.map((p) => [p.id, hotScore(p.score || 0, count.get(p.id), Date.parse(p.createdAt))]));
      rows.sort((a, b) => h.get(b.id) - h.get(a.id) || byNew(a, b));
    } else if (!saved) rows.sort(byNew);
    const page = rows.slice(offset, offset + limitN);
    return { posts: page.map((p) => summary(p, viewer)), next: offset + limitN < rows.length ? String(offset + limitN) : null, total: rows.length };
  }

  /** Comments this viewer can see: an invisible comment takes its replies with it. */
  function visibleComments(p, viewer) {
    const blocked = blockedBy(viewer), reported = reportedBy(viewer);
    const ok = new Map();
    const check = (c) => {
      if (ok.has(c.id)) return ok.get(c.id);
      const parent = c.parentId ? db.comments[c.parentId] : null;
      const v = visible(c, viewer, blocked, reported) && (!c.parentId || (!!parent && check(parent)));
      ok.set(c.id, v); return v;
    };
    return p.commentIds.map((x) => db.comments[x]).filter((c) => c && check(c));
  }
  function getPost(id, token) {
    const viewer = userFrom(token);
    const p = db.posts[id];
    if (!p || !visible(p, viewer)) throw err(404, 'This post was removed or isn’t available.');
    const comments = visibleComments(p, viewer).map((c) => commentView(c, p, viewer));
    // v2.4 apps read `answers`: the top-level comments, accepted first, then by score.
    const answers = comments.filter((c) => !c.parentId && !c.deleted).sort((a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0) || b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    return { post: { ...summary(p, viewer), body: p.body }, comments, answers };
  }

  function profile(id, token) {
    const viewer = userFrom(token);
    const u = db.users[id];
    if (!u || (u.banned && viewer?.id !== u.id)) throw err(404, 'This profile isn’t available.');
    const user = { ...pub(u.id), createdAt: u.createdAt, ...stats(u.id), mine: viewer?.id === u.id };
    if (blockedBy(viewer).has(u.id)) return { user, blocked: true, posts: [], comments: [] };
    const reported = reportedBy(viewer), blocked = new Set();
    const posts = Object.values(db.posts).filter((p) => p.uid === u.id && !p.gone && visible(p, viewer, blocked, reported)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
    const comments = Object.values(db.comments).filter((c) => c.uid === u.id && !c.gone && visible(c, viewer, blocked, reported) && visible(db.posts[c.postId], viewer)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
    return { user, blocked: false, posts: posts.map((p) => summary(p, viewer)), comments: comments.map((c) => ({ ...commentView(c, db.posts[c.postId], viewer), postTitle: db.posts[c.postId].title })) };
  }

  // ---------- notifications (kept on the server so the bell works on every phone; push when a token is set) ----------
  async function addNote(uid, n, { push = true } = {}) {
    const u = db.users[uid];
    if (!u || u.banned) return;
    if (n.from && (db.blocks[uid] || []).includes(n.from)) return;
    const list2 = (db.notes[uid] ||= []);
    list2.push({ id: rid('n'), at: iso(), read: false, ...n });
    if (list2.length > MAX_NOTES) list2.splice(0, list2.length - MAX_NOTES);
    touch();
    if (push && u.pushToken) {
      try { await notify([{ to: u.pushToken, title: n.title, body: String(n.text || '').slice(0, 160), data: { url: `/community/post/${n.postId}` }, sound: 'default' }]); } catch (e) { console.error('forum notify failed', e.message); }
    }
  }
  function notifications(token) {
    const u = needUser(token);
    const items = (db.notes[u.id] || []).slice().reverse().map((n) => ({ id: n.id, kind: n.kind, title: n.title, text: n.text, postId: n.postId, commentId: n.commentId || null, at: n.at, read: !!n.read }));
    return { items, unread: items.filter((n) => !n.read).length };
  }
  function readNotifications(token) {
    const u = needUser(token);
    for (const n of db.notes[u.id] || []) n.read = true;
    touch();
    return { ok: true, unread: 0 };
  }

  // ---------- writing ----------
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
  function validTimeline(tl) {
    if (!tl || typeof tl !== 'object') throw err(400, 'Add the form, the office and at least two dates.');
    const form = String(tl.form || ''), office = String(tl.office || '');
    if (!TAGS.form.includes(form)) throw err(400, 'Pick the form from the list.');
    if (!OFFICES.includes(office)) throw err(400, 'Pick the office from the list.');
    const today = new Date(now() + 864e5).toISOString().slice(0, 10);
    const steps = (Array.isArray(tl.steps) ? tl.steps : []).map((s) => ({ label: String(s?.label || ''), date: String(s?.date || '') }));
    if (steps.length < LIMITS.steps[0] || steps.length > LIMITS.steps[1]) throw err(400, `A timeline has ${LIMITS.steps[0]}–${LIMITS.steps[1]} dates.`);
    for (const s of steps) {
      if (!STEPS.includes(s.label)) throw err(400, 'Pick each step from the list.');
      if (!isDate(s.date) || s.date < '2010-01-01' || s.date > today) throw err(400, 'Use real dates that aren’t in the future.');
    }
    if (new Set(steps.map((s) => s.label)).size !== steps.length) throw err(400, 'Use each step once.');
    steps.sort((a, b) => a.date.localeCompare(b.date) || STEPS.indexOf(a.label) - STEPS.indexOf(b.label));
    return { form, office, premium: !!tl.premium, steps };
  }
  function validPoll(poll) {
    const options = (Array.isArray(poll?.options) ? poll.options : []).map((o) => clean(o).replace(/\s+/g, ' ')).filter(Boolean);
    if (options.length < LIMITS.pollOptions[0] || options.length > LIMITS.pollOptions[1]) throw err(400, `A poll has ${LIMITS.pollOptions[0]}–${LIMITS.pollOptions[1]} options.`);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw err(400, 'Make each poll option different.');
    for (const o of options) {
      if (o.length > LIMITS.pollOption[1]) throw err(400, `Poll options can be at most ${LIMITS.pollOption[1]} characters.`);
      const bad = checkText(o, { kind: 'title' });
      if (bad) throw err(400, bad, 'filter');
    }
    return options;
  }
  function validPost(b, { type, repost = false, fallbackTitle = '' }) {
    const title = clean(b.title).replace(/\s+/g, ' ') || fallbackTitle, body = clean(b.body);
    if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) throw err(400, `Title: ${LIMITS.title[0]}–${LIMITS.title[1]} characters.`);
    const minBody = repost || type === 'timeline' || type === 'poll' ? 0 : LIMITS.body[0];
    if (body.length < minBody || body.length > LIMITS.body[1]) throw err(400, `Details: ${LIMITS.body[0]}–${LIMITS.body[1]} characters.`);
    const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(String))].filter((t) => ALL_TAGS.has(t)).slice(0, LIMITS.tags);
    if (!tags.length) throw err(400, 'Pick at least one tag (visa type, form or topic).');
    const bad = (repost && !clean(b.title) ? null : checkText(title, { kind: 'title' })) || (body ? checkText(body) : null);
    if (bad) throw err(400, bad, 'filter');
    return { title, body, tags };
  }

  function createPost(token, b) {
    const u = needUser(token); canWrite(u);
    let original = null;
    if (b.repostOf) {
      original = db.posts[String(b.repostOf)];
      if (original?.repostOf) original = db.posts[original.repostOf]; // a repost of a repost points at the first post
      if (!original || original.gone || original.hidden || !visible(original, u)) throw err(404, 'That post was removed or isn’t available.');
    }
    const type = original ? 'discussion' : POST_TYPES.includes(b.type) ? b.type : 'question';
    const v = validPost(original && !(Array.isArray(b.tags) && b.tags.length) ? { ...b, tags: original.tags } : b, { type, repost: !!original, fallbackTitle: original?.title || '' });
    const extra = {};
    if (type === 'timeline') extra.timeline = validTimeline(b.timeline);
    if (type === 'poll') extra.poll = { options: validPoll(b.poll), voters: {} };
    if (original) extra.repostOf = original.id;
    limit(`post:h:${u.id}`, 5, 3600_000, 'You can post 5 times an hour. Try again a bit later.');
    limit(`post:d:${u.id}`, 15, 864e5, 'You’ve reached today’s limit of 15 posts.');
    const t = now();
    if (Object.values(db.posts).some((p) => p.uid === u.id && (p.repostOf || null) === (original?.id || null) && p.title.toLowerCase() === v.title.toLowerCase() && t - Date.parse(p.createdAt) < 864e5)) throw err(409, original ? 'You already reposted this today.' : 'You already asked this today.');
    const p = { id: rid('p'), uid: u.id, type, ...v, ...extra, createdAt: new Date(t).toISOString(), editedAt: null, up: 0, down: 0, score: 0, commentIds: [], acceptedId: null, hidden: null, reviewedAt: null };
    db.posts[p.id] = p; touch();
    return { post: { ...summary(p, u), body: p.body } };
  }

  function own(kind, id, u) {
    const it = kind === 'post' ? db.posts[id] : db.comments[id];
    if (!it || it.gone) throw err(404, 'Not found.');
    if (it.uid !== u.id) throw err(403, 'You can only change your own posts.');
    return it;
  }
  function editPost(token, id, b) {
    const u = needUser(token); if (u.banned) canWrite(u);
    const p = own('post', id, u);
    limit(`edit:${u.id}`, 30, 3600_000);
    const v = validPost(b, { type: p.type, repost: !!p.repostOf, fallbackTitle: p.repostOf ? p.title : '' });
    const extra = p.type === 'timeline' && b.timeline ? { timeline: validTimeline(b.timeline) } : {};
    Object.assign(p, v, extra, { editedAt: iso() }); touch();
    return { post: { ...summary(p, u), body: p.body } };
  }
  function deletePost(token, id) { const u = needUser(token); own('post', id, u); removePost(id); return { ok: true }; }

  function validComment(b) {
    const body = clean(b.body);
    if (body.length < LIMITS.comment[0] || body.length > LIMITS.comment[1]) throw err(400, `Comment: ${LIMITS.comment[0]}–${LIMITS.comment[1]} characters.`);
    const bad = checkText(body);
    if (bad) throw err(400, bad, 'filter');
    return body;
  }
  async function comment(token, postId, b) {
    const u = needUser(token); canWrite(u);
    const p = db.posts[postId];
    if (!p || p.gone || !visible(p, u)) throw err(404, 'This post was removed or isn’t available.');
    const body = validComment(b);
    let parent = b.parentId ? db.comments[String(b.parentId)] : null;
    if (b.parentId && (!parent || parent.postId !== p.id || parent.gone || !visible(parent, u))) throw err(404, 'That comment was removed or isn’t available.');
    const target = parent; // who gets "replied to you"
    // Threads stop at MAX_DEPTH levels: a reply to the deepest level sits next to it instead of below it.
    if (parent && depthOf(parent) >= MAX_DEPTH - 1) parent = db.comments[parent.parentId];
    limit(`ans:h:${u.id}`, 30, 3600_000, 'You can post 30 comments an hour. Try again a bit later.');
    limit(`ans:d:${u.id}`, 100, 864e5, 'You’ve reached today’s limit of 100 comments.');
    const t = now();
    const c = { id: rid('c'), postId, parentId: parent?.id || null, uid: u.id, body, createdAt: new Date(t).toISOString(), editedAt: null, up: 0, down: 0, score: 0, hidden: null, reviewedAt: null };
    db.comments[c.id] = c; p.commentIds.push(c.id); touch();
    // Tell the person replied to (not themselves, not if they blocked this person; at most one push per thread per 10 min).
    const to = target ? target.uid : p.uid;
    const anchor = target || p;
    if (to && to !== u.id) {
      const push = t - (anchor.notifiedAt || 0) > 600_000;
      if (push) anchor.notifiedAt = t;
      await addNote(to, { kind: 'reply', from: u.id, postId: p.id, commentId: c.id, title: target ? 'New reply to your comment' : p.type === 'question' ? 'New answer to your question' : 'New comment on your post', text: `${u.name}: ${target ? excerpt(body) : p.title}` }, { push });
    }
    const view = commentView(c, p, u);
    return { comment: view, answer: view };
  }
  function editComment(token, id, b) {
    const u = needUser(token); if (u.banned) canWrite(u);
    const c = own('comment', id, u);
    const body = validComment(b);
    limit(`edit:${u.id}`, 30, 3600_000);
    c.body = body; c.editedAt = iso(); touch();
    const view = commentView(c, db.posts[c.postId], u);
    return { comment: view, answer: view };
  }
  function deleteComment(token, id) { const u = needUser(token); own('comment', id, u); removeComment(id); return { ok: true }; }

  /** {dir: 1 | -1 | 0}; v2.4 apps send {up: true | false} (upvote / clear). One vote per person per item. */
  async function vote(token, kind, id, b) {
    const u = needUser(token); canWrite(u);
    const it = kind === 'post' ? db.posts[id] : db.comments[id];
    if (!it || it.gone || !visible(it, u)) throw err(404, 'Not found.');
    if (it.uid === u.id) throw err(400, 'You can’t vote on your own post.');
    limit(`vote:${u.id}`, 240, 3600_000);
    const dir = b.dir === 1 || b.dir === -1 || b.dir === 0 ? b.dir : b.up === false ? 0 : 1;
    const k = `${u.id}|${id}`;
    const prev = db.votes[k] || 0;
    if (prev !== dir) {
      if (prev === 1) it.up--; else if (prev === -1) it.down--;
      if (dir === 1) it.up++; else if (dir === -1) it.down++;
      it.up = Math.max(0, it.up); it.down = Math.max(0, it.down);
      it.score = it.up - it.down;
      if (dir) db.votes[k] = dir; else delete db.votes[k];
      touch();
      const m = dir === 1 ? MILESTONES.find((x) => x === it.up && x > (it.milestone || 0)) : undefined;
      if (m && it.uid) {
        it.milestone = m;
        const p = kind === 'post' ? it : db.posts[it.postId];
        await addNote(it.uid, { kind: 'milestone', postId: p.id, commentId: kind === 'post' ? null : it.id, title: `${m} upvotes`, text: `Your ${kind === 'post' ? 'post' : 'comment'} reached ${m} upvotes: ${kind === 'post' ? it.title : excerpt(it.body)}` });
      }
    }
    return { score: it.score, voted: dir === 1, myVote: dir };
  }

  function accept(token, postId, b) {
    const u = needUser(token);
    const p = own('post', postId, u);
    if (p.type !== 'question') throw err(400, 'Only questions have an accepted answer.');
    const cid = b.commentId || b.answerId ? String(b.commentId || b.answerId) : null;
    const c = cid ? db.comments[cid] : null;
    if (cid && (!c || c.postId !== p.id || c.gone)) throw err(400, 'That answer isn’t on this question.');
    if (c?.parentId) throw err(400, 'Only a top-level answer can be accepted.');
    p.acceptedId = cid; touch();
    return { acceptedId: cid };
  }

  function pollVote(token, postId, b) {
    const u = needUser(token); canWrite(u);
    const p = db.posts[postId];
    if (!p || p.gone || !p.poll || !visible(p, u)) throw err(404, 'This poll was removed or isn’t available.');
    const i = Number(b.option);
    if (!Number.isInteger(i) || i < 0 || i >= p.poll.options.length) throw err(400, 'Pick one of the options.');
    limit(`poll:${u.id}`, 60, 3600_000);
    p.poll.voters[u.id] = i; touch(); // one vote per person: voting again moves it
    return { poll: pollView(p, u) };
  }

  function save(token, postId, b) {
    const u = needUser(token);
    const p = db.posts[postId];
    if (!p || p.gone || !visible(p, u)) throw err(404, 'This post was removed or isn’t available.');
    limit(`save:${u.id}`, 240, 3600_000);
    const cur = (db.saved[u.id] || []).filter((x) => x !== postId);
    if (b.on !== false) cur.push(postId);
    db.saved[u.id] = cur.slice(-500); touch();
    return { saved: b.on !== false };
  }

  // ---------- reports & blocks ----------
  const kindOf = (k) => (k === 'answer' || k === 'comment' ? 'comment' : k === 'user' ? 'user' : 'post');
  const itemOf = (kind, id) => (kind === 'comment' ? db.comments[id] : kind === 'user' ? db.users[id] : db.posts[id]);
  function report(token, b) {
    const u = needUser(token);
    const kind = kindOf(b.kind);
    const id = String(b.id || '');
    const it = itemOf(kind, id);
    if (!it || it.gone) throw err(404, 'Not found.');
    if ((kind === 'user' ? it.id : it.uid) === u.id) throw err(400, kind === 'user' ? 'You can’t report yourself.' : 'You can’t report your own post.');
    const reason = REASONS.includes(b.reason) ? b.reason : 'other';
    const note = clean(b.note).slice(0, LIMITS.note);
    if (!db.reports.some((r) => r.id === id && r.by === u.id)) {
      limit(`report:${u.id}`, 30, 864e5);
      db.reports.push({ rid: rid('r'), kind, id, by: u.id, reason, note, at: iso(), status: 'open' });
    }
    if (kind !== 'user') {
      const since = it.reviewedAt || '';
      const n = new Set(db.reports.filter((r) => r.id === id && r.status === 'open' && r.at > since).map((r) => r.by)).size;
      if (n >= HIDE_AFTER_REPORTS && !it.hidden) it.hidden = 'reports';
    }
    touch();
    return { ok: true, hidden: kind !== 'user' && !!it.hidden };
  }
  function block(token, b, on = true) {
    const u = needUser(token);
    const target = String(b.userId || '');
    if (!target || target === u.id) throw err(400, 'Pick someone else to block.');
    const cur = new Set(db.blocks[u.id] || []);
    if (on) { if (!db.users[target]) throw err(404, 'Not found.'); cur.add(target); } else cur.delete(target);
    db.blocks[u.id] = [...cur].slice(-1000); touch();
    return { ok: true, blocked: db.blocks[u.id].map(pub) };
  }
  const blocks = (token) => ({ blocked: (db.blocks[needUser(token).id] || []).map(pub) });

  function contact(token, b, ip) {
    const u = userFrom(token);
    limit(`contact:${u?.id || ip}`, 5, 864e5);
    const message = clean(b.message).slice(0, LIMITS.contact);
    if (message.length < 5) throw err(400, 'Write a short message.');
    db.messages.push({ id: rid('m'), uid: u?.id || null, message, about: b.about ? String(b.about).slice(0, 40) : null, at: iso() });
    db.messages = db.messages.slice(-2000); touch();
    return { ok: true };
  }

  // ---------- admin (Authorization: Bearer ADMIN_TOKEN) ----------
  function needAdmin(token) {
    const a = Buffer.from(String(adminToken || '')), b = Buffer.from(String(token || ''));
    if (!adminToken || adminToken.length < 16 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw err(401, 'Admin only.');
  }
  function adminReports(token, q) {
    needAdmin(token);
    const status = q.get('status') === 'all' ? null : 'open';
    const groups = new Map();
    for (const r of db.reports) {
      if (status && r.status !== status) continue;
      const g = groups.get(r.id) || { kind: r.kind, id: r.id, reports: [] };
      g.reports.push({ reason: r.reason, note: r.note, at: r.at, status: r.status }); groups.set(r.id, g);
    }
    const hiddenUnreported = [...Object.values(db.posts), ...Object.values(db.comments)].filter((it) => it.hidden === 'reports' && !groups.has(it.id));
    for (const it of hiddenUnreported) groups.set(it.id, { kind: it.postId ? 'comment' : 'post', id: it.id, reports: [] });
    return {
      items: [...groups.values()].map((g) => {
        const it = itemOf(g.kind, g.id);
        if (g.kind === 'user') return { ...g, count: g.reports.length, exists: !!it, hidden: null, author: it ? { ...pub(it.id), banned: !!it.banned } : null, title: it?.name || null, body: null, postId: null };
        return { ...g, count: g.reports.length, exists: !!it, hidden: it?.hidden || null, author: it ? { ...pub(it.uid), banned: !!db.users[it.uid]?.banned } : null, title: it?.title || (it?.postId ? db.posts[it.postId]?.title : null) || null, body: it?.body?.slice(0, 1000) || null, postId: it?.postId || g.id };
      }).sort((a, b) => b.count - a.count),
    };
  }
  function resolve(id) { for (const r of db.reports) if (r.id === id && r.status === 'open') r.status = 'resolved'; }
  function adminAction(token, action, b) {
    needAdmin(token);
    const kind = kindOf(b.kind);
    const id = String(b.id || '');
    if (action === 'ban') {
      const u = db.users[String(b.userId || '')];
      if (!u) throw err(404, 'No such user.');
      u.banned = b.banned !== false;
      if (u.banned) for (const [h, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[h];
      resolve(u.id);
      touch();
      return { ok: true, user: { ...pub(u.id), banned: u.banned } };
    }
    const it = kind === 'user' ? null : itemOf(kind, id);
    if (!it) throw err(404, 'Not found.');
    if (action === 'hide') { it.hidden = 'admin'; resolve(id); }
    else if (action === 'restore') { it.hidden = null; it.reviewedAt = iso(); resolve(id); }
    else if (action === 'delete') { if (kind === 'post') removePost(id, '[removed by moderators]'); else removeComment(id, '[removed by moderators]'); }
    else throw err(404, 'Unknown action.');
    touch();
    return { ok: true };
  }
  function adminMessages(token) { needAdmin(token); return { messages: db.messages.slice(-200).reverse() }; }

  const status = () => ({ users: Object.keys(db.users).length, posts: Object.keys(db.posts).length, comments: Object.keys(db.comments).length, openReports: db.reports.filter((r) => r.status === 'open').length, admin: !!adminToken && adminToken.length >= 16 });
  const rules = () => ({ version: RULES_VERSION, rules: RULES, contact: process.env.MODERATION_EMAIL || null, disclaimer: 'Community answers are from other users, not lawyers — not legal advice.' });
  const tags = () => TAGS;
  const meta = () => ({ tags: TAGS, types: POST_TYPES, avatars: AVATARS, flairs: FLAIRS, offices: OFFICES, steps: STEPS, maxDepth: MAX_DEPTH });

  // ---------- routes ----------
  // ctx: { method, path, query (URLSearchParams), body, token (Bearer), ip }. Returns the JSON body or null (not ours).
  async function route({ method, path: p, query, body = {}, token, ip }) {
    let m;
    const ID = '([\\w-]{3,40})';
    if (p === '/api/auth/apple' && method === 'POST') return signIn({ ...body, provider: 'apple' }, ip);
    if (p === '/api/auth/google' && method === 'POST') return signIn({ ...body, provider: 'google' }, ip);
    if (p === '/api/auth/signout' && method === 'POST') return signOut(token);
    if (p === '/api/me') {
      if (method === 'GET') return { user: me(needUser(token)) };
      if (method === 'POST') return updateMe(token, body);
      if (method === 'DELETE') return deleteMe(token);
    }
    if (p === '/api/forum/rules' && method === 'GET') return rules();
    if (p === '/api/forum/tags' && method === 'GET') return tags();
    if (p === '/api/forum/meta' && method === 'GET') return meta();
    if (p === '/api/forum/posts') { if (method === 'GET') return list(query, token); if (method === 'POST') return createPost(token, body); }
    if ((m = p.match(new RegExp(`^/api/forum/posts/${ID}$`)))) { if (method === 'GET') return getPost(m[1], token); if (method === 'DELETE') return deletePost(token, m[1]); }
    if ((m = p.match(new RegExp(`^/api/forum/posts/${ID}/(edit|answers|comments|vote|accept|poll|save)$`))) && method === 'POST') {
      if (m[2] === 'edit') return editPost(token, m[1], body);
      if (m[2] === 'answers' || m[2] === 'comments') return comment(token, m[1], body);
      if (m[2] === 'vote') return vote(token, 'post', m[1], body);
      if (m[2] === 'poll') return pollVote(token, m[1], body);
      if (m[2] === 'save') return save(token, m[1], body);
      return accept(token, m[1], body);
    }
    if ((m = p.match(new RegExp(`^/api/forum/(?:answers|comments)/${ID}$`))) && method === 'DELETE') return deleteComment(token, m[1]);
    if ((m = p.match(new RegExp(`^/api/forum/(?:answers|comments)/${ID}/(edit|vote)$`))) && method === 'POST') return m[2] === 'edit' ? editComment(token, m[1], body) : vote(token, 'comment', m[1], body);
    if ((m = p.match(new RegExp(`^/api/forum/users/${ID}$`))) && method === 'GET') return profile(m[1], token);
    if (p === '/api/forum/notifications' && method === 'GET') return notifications(token);
    if (p === '/api/forum/notifications/read' && method === 'POST') return readNotifications(token);
    if (p === '/api/forum/report' && method === 'POST') return report(token, body);
    if (p === '/api/forum/blocks') { if (method === 'GET') return blocks(token); if (method === 'POST') return block(token, body, true); if (method === 'DELETE') return block(token, body, false); }
    if (p === '/api/forum/contact' && method === 'POST') return contact(token, body, ip);
    if (p === '/api/admin/forum/reports' && method === 'GET') return adminReports(token, query);
    if (p === '/api/admin/forum/messages' && method === 'GET') return adminMessages(token);
    if ((m = p.match(/^\/api\/admin\/forum\/(hide|restore|delete|ban)$/)) && method === 'POST') return adminAction(token, m[1], body);
    if (p.startsWith('/api/forum/') || p.startsWith('/api/admin/') || p.startsWith('/api/auth/')) throw err(404, 'Not found');
    return null;
  }

  return { route, flush, status, close: () => { if (timer) clearInterval(timer); flush(); }, _db: () => db };
}

export const isForumPath = (p) => p === '/api/me' || p.startsWith('/api/forum') || p.startsWith('/api/auth/') || p.startsWith('/api/admin/');
