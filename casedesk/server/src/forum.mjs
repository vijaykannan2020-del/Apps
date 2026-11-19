// Community Q&A: questions, answers, upvotes, accepted answers, reports, blocks and moderation.
// Storage: one JSON file (data/forum.json) flushed every few seconds and on shutdown, like community.mjs.
// People sign in with Apple (or Google once it's configured) and appear only under a made-up display
// name. No emails, no real names; receipt numbers and other personal numbers are refused in posts.
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
export const LIMITS = { title: [10, 150], body: [20, 5000], answer: [10, 5000], name: [3, 24], tags: 5, note: 300, contact: 1000, q: 100, pageMax: 50 };
export const HIDE_AFTER_REPORTS = 3;
const SESSION_DAYS = 180;
const MAX_SESSIONS = 10;
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,100}\]$/;

const err = (status, message, code) => Object.assign(new Error(message), { status, code });
const rid = (p) => `${p}_${crypto.randomBytes(9).toString('base64url')}`;
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n').trim();

const ADJ = ['Calm', 'Bright', 'Kind', 'Swift', 'Quiet', 'Brave', 'Clever', 'Gentle', 'Lucky', 'Sunny', 'Steady', 'Patient', 'Curious', 'Cheerful', 'Wise', 'Bold'];
const NOUN = ['Falcon', 'Maple', 'River', 'Comet', 'Harbor', 'Cedar', 'Otter', 'Lotus', 'Meadow', 'Sparrow', 'Summit', 'Pebble', 'Willow', 'Heron', 'Canyon', 'Orchid'];
const RESERVED = /\b(admin|administrator|moderator|mod|uscis|dhs|casedesk|immigration wallet|official|support|staff|lawyer|attorney|esq)\b/i;

function emptyDb() {
  return { v: 1, users: {}, byProvider: {}, sessions: {}, posts: {}, answers: {}, votes: {}, reports: [], blocks: {}, bannedSubs: {}, messages: [] };
}

export function createForum({ file = null, now = Date.now, notify = async () => {}, verifyApple, verifyGoogle, exchangeAppleCode = async () => null, revokeApple = async () => false, adminToken = process.env.ADMIN_TOKEN || '', flushMs = 10_000 } = {}) {
  let db = emptyDb();
  if (file) { try { db = { ...emptyDb(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {} }
  let dirty = false;
  const touch = () => { dirty = true; };
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
  const me = (u) => ({ id: u.id, name: u.name, provider: u.provider, createdAt: u.createdAt, rulesAccepted: u.rules === RULES_VERSION, rulesVersion: RULES_VERSION, banned: !!u.banned, notify: !!u.pushToken });
  const pub = (uid) => { const u = db.users[uid]; return u ? { id: u.id, name: u.name } : { id: uid, name: 'Former member' }; };

  function userFrom(token) {
    if (!token) return null;
    const h = sha256(token);
    const s = db.sessions[h];
    if (!s) return null;
    const t = now();
    if (t - s.used > SESSION_DAYS * 864e5) { delete db.sessions[h]; touch(); return null; }
    const u = db.users[s.uid];
    if (!u) { delete db.sessions[h]; touch(); return null; }
    if (t - s.used > 3600_000) { s.used = t; touch(); }
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
      u = { id: rid('u'), provider: who.provider, key, name: makeName(), createdAt: new Date(t).toISOString(), rules: 0, banned: !!db.bannedSubs[key], pushToken: null, refresh: null };
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
    if (b.pushToken !== undefined) {
      if (b.pushToken === null || b.pushToken === '') u.pushToken = null;
      else if (TOKEN_RE.test(String(b.pushToken))) u.pushToken = String(b.pushToken);
      else throw err(400, 'Invalid push token');
    }
    if (b.acceptRules !== undefined) {
      if (Number(b.acceptRules) !== RULES_VERSION) throw err(409, 'The community rules changed — please read them again.', 'rules');
      u.rules = RULES_VERSION; u.rulesAt = new Date(now()).toISOString();
    }
    touch();
    return { user: me(u) };
  }

  /** Delete the account and everything it wrote (App Store 5.1.1(v)). Bans survive deletion. */
  async function deleteMe(token) {
    const u = needUser(token);
    const uid = u.id;
    for (const p of Object.values(db.posts)) if (p.uid === uid) removePost(p.id);
    for (const a of Object.values(db.answers)) if (a.uid === uid) removeAnswer(a.id);
    for (const k of Object.keys(db.votes)) if (k.startsWith(uid + '|')) { const id = k.split('|')[1]; const it = db.posts[id] || db.answers[id]; if (it) it.score = Math.max(0, (it.score || 0) - 1); delete db.votes[k]; }
    db.reports = db.reports.filter((r) => r.by !== uid);
    delete db.blocks[uid];
    for (const k of Object.keys(db.blocks)) db.blocks[k] = db.blocks[k].filter((x) => x !== uid);
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
    if (viewer && item.uid === viewer.id) return true;
    if (item.hidden) return false;
    if (db.users[item.uid]?.banned) return false;
    if (blocked.has(item.uid) || reported.has(item.id)) return false;
    return true;
  }
  const liveAnswers = (p) => (p.answerIds || []).map((id) => db.answers[id]).filter((a) => a && !a.hidden && !db.users[a.uid]?.banned);
  const voted = (viewer, id) => !!(viewer && db.votes[`${viewer.id}|${id}`]);
  const excerpt = (s) => (s.length > 200 ? s.slice(0, 197).trimEnd() + '…' : s);

  function summary(p, viewer) {
    return { id: p.id, title: p.title, excerpt: excerpt(p.body), tags: p.tags, author: pub(p.uid), createdAt: p.createdAt, editedAt: p.editedAt || null, score: p.score || 0, answers: liveAnswers(p).length, accepted: !!p.acceptedId, voted: voted(viewer, p.id), mine: !!viewer && viewer.id === p.uid, hidden: p.hidden ? 'review' : null };
  }
  function answerView(a, p, viewer) {
    return { id: a.id, postId: a.postId, body: a.body, author: pub(a.uid), createdAt: a.createdAt, editedAt: a.editedAt || null, score: a.score || 0, accepted: p.acceptedId === a.id, voted: voted(viewer, a.id), mine: !!viewer && viewer.id === a.uid, hidden: a.hidden ? 'review' : null };
  }

  // ---------- reading ----------
  function list(q, token) {
    const viewer = userFrom(token);
    const sort = ['new', 'top', 'unanswered'].includes(q.get('sort')) ? q.get('sort') : 'new';
    const tags = (q.get('tags') || q.get('tag') || '').split(',').map((s) => s.trim()).filter((t) => ALL_TAGS.has(t));
    const words = clean(q.get('q') || '').slice(0, LIMITS.q).toLowerCase().split(/\s+/).filter(Boolean);
    const mine = q.get('mine') === '1';
    if (mine && !viewer) throw err(401, 'Sign in to see your posts.', 'auth');
    const limitN = Math.min(LIMITS.pageMax, Math.max(1, Number(q.get('limit')) || 20));
    const offset = Math.max(0, Number(q.get('cursor')) || 0);
    const blocked = blockedBy(viewer), reported = reportedBy(viewer);
    let rows = Object.values(db.posts).filter((p) => (mine ? p.uid === viewer.id : visible(p, viewer, blocked, reported)));
    if (tags.length) rows = rows.filter((p) => p.tags.some((t) => tags.includes(t)));
    if (words.length) rows = rows.filter((p) => { const h = `${p.title}\n${p.body}\n${p.tags.join(' ')}`.toLowerCase(); return words.every((w) => h.includes(w)); });
    if (sort === 'unanswered') rows = rows.filter((p) => liveAnswers(p).length === 0);
    const byNew = (a, b) => b.createdAt.localeCompare(a.createdAt);
    rows.sort(sort === 'top' ? (a, b) => (b.score || 0) - (a.score || 0) || liveAnswers(b).length - liveAnswers(a).length || byNew(a, b) : byNew);
    const page = rows.slice(offset, offset + limitN);
    return { posts: page.map((p) => summary(p, viewer)), next: offset + limitN < rows.length ? String(offset + limitN) : null, total: rows.length };
  }

  function getPost(id, token) {
    const viewer = userFrom(token);
    const p = db.posts[id];
    if (!p || !visible(p, viewer)) throw err(404, 'This question was removed or isn’t available.');
    const blocked = blockedBy(viewer), reported = reportedBy(viewer);
    const answers = (p.answerIds || []).map((x) => db.answers[x]).filter((a) => visible(a, viewer, blocked, reported))
      .sort((a, b) => (b.id === p.acceptedId) - (a.id === p.acceptedId) || (b.score || 0) - (a.score || 0) || a.createdAt.localeCompare(b.createdAt));
    return { post: { ...summary(p, viewer), body: p.body }, answers: answers.map((a) => answerView(a, p, viewer)) };
  }

  // ---------- writing ----------
  function validPost(b) {
    const title = clean(b.title).replace(/\s+/g, ' '), body = clean(b.body);
    if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) throw err(400, `Title: ${LIMITS.title[0]}–${LIMITS.title[1]} characters.`);
    if (body.length < LIMITS.body[0] || body.length > LIMITS.body[1]) throw err(400, `Details: ${LIMITS.body[0]}–${LIMITS.body[1]} characters.`);
    const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(String))].filter((t) => ALL_TAGS.has(t)).slice(0, LIMITS.tags);
    if (!tags.length) throw err(400, 'Pick at least one tag (visa type, form or topic).');
    const bad = checkText(title, { kind: 'title' }) || checkText(body);
    if (bad) throw err(400, bad, 'filter');
    return { title, body, tags };
  }

  function createPost(token, b) {
    const u = needUser(token); canWrite(u);
    const v = validPost(b);
    limit(`post:h:${u.id}`, 5, 3600_000, 'You can ask 5 questions an hour. Try again a bit later.');
    limit(`post:d:${u.id}`, 15, 864e5, 'You’ve reached today’s limit of 15 questions.');
    const t = now();
    if (Object.values(db.posts).some((p) => p.uid === u.id && p.title.toLowerCase() === v.title.toLowerCase() && t - Date.parse(p.createdAt) < 864e5)) throw err(409, 'You already asked this today.');
    const p = { id: rid('p'), uid: u.id, ...v, createdAt: new Date(t).toISOString(), editedAt: null, score: 0, answerIds: [], acceptedId: null, hidden: null, reviewedAt: null };
    db.posts[p.id] = p; touch();
    return { post: { ...summary(p, u), body: p.body } };
  }

  function own(kind, id, u) {
    const it = kind === 'post' ? db.posts[id] : db.answers[id];
    if (!it) throw err(404, 'Not found.');
    if (it.uid !== u.id) throw err(403, 'You can only change your own posts.');
    return it;
  }
  function editPost(token, id, b) {
    const u = needUser(token); if (u.banned) canWrite(u);
    const p = own('post', id, u);
    limit(`edit:${u.id}`, 30, 3600_000);
    Object.assign(p, validPost(b), { editedAt: new Date(now()).toISOString() }); touch();
    return { post: { ...summary(p, u), body: p.body } };
  }
  function removePost(id) {
    const p = db.posts[id]; if (!p) return;
    for (const a of p.answerIds || []) removeAnswer(a, true);
    for (const k of Object.keys(db.votes)) if (k.endsWith('|' + id)) delete db.votes[k];
    db.reports = db.reports.filter((r) => r.id !== id);
    delete db.posts[id]; touch();
  }
  function removeAnswer(id, withPost = false) {
    const a = db.answers[id]; if (!a) return;
    const p = db.posts[a.postId];
    if (p && !withPost) { p.answerIds = p.answerIds.filter((x) => x !== id); if (p.acceptedId === id) p.acceptedId = null; }
    for (const k of Object.keys(db.votes)) if (k.endsWith('|' + id)) delete db.votes[k];
    db.reports = db.reports.filter((r) => r.id !== id);
    delete db.answers[id]; touch();
  }
  function deletePost(token, id) { const u = needUser(token); own('post', id, u); removePost(id); return { ok: true }; }

  async function answer(token, postId, b) {
    const u = needUser(token); canWrite(u);
    const p = db.posts[postId];
    if (!p || !visible(p, u)) throw err(404, 'This question was removed or isn’t available.');
    const body = clean(b.body);
    if (body.length < LIMITS.answer[0] || body.length > LIMITS.answer[1]) throw err(400, `Answer: ${LIMITS.answer[0]}–${LIMITS.answer[1]} characters.`);
    const bad = checkText(body);
    if (bad) throw err(400, bad, 'filter');
    limit(`ans:h:${u.id}`, 20, 3600_000, 'You can post 20 answers an hour. Try again a bit later.');
    limit(`ans:d:${u.id}`, 60, 864e5, 'You’ve reached today’s limit of 60 answers.');
    const t = now();
    const a = { id: rid('a'), postId, uid: u.id, body, createdAt: new Date(t).toISOString(), editedAt: null, score: 0, hidden: null, reviewedAt: null };
    db.answers[a.id] = a; p.answerIds.push(a.id); touch();
    // Tell the asker (not themselves, not if they blocked this person; at most one push per question per 10 min).
    const asker = db.users[p.uid];
    if (asker?.pushToken && asker.id !== u.id && !(db.blocks[asker.id] || []).includes(u.id) && t - (p.notifiedAt || 0) > 600_000) {
      p.notifiedAt = t;
      try { await notify([{ to: asker.pushToken, title: 'New answer to your question', body: `${u.name}: ${p.title}`.slice(0, 160), data: { url: `/community/post/${p.id}` }, sound: 'default' }]); } catch (e) { console.error('forum notify failed', e.message); }
    }
    return { answer: answerView(a, p, u) };
  }
  function editAnswer(token, id, b) {
    const u = needUser(token); if (u.banned) canWrite(u);
    const a = own('answer', id, u);
    const body = clean(b.body);
    if (body.length < LIMITS.answer[0] || body.length > LIMITS.answer[1]) throw err(400, `Answer: ${LIMITS.answer[0]}–${LIMITS.answer[1]} characters.`);
    const bad = checkText(body);
    if (bad) throw err(400, bad, 'filter');
    limit(`edit:${u.id}`, 30, 3600_000);
    a.body = body; a.editedAt = new Date(now()).toISOString(); touch();
    return { answer: answerView(a, db.posts[a.postId], u) };
  }
  function deleteAnswer(token, id) { const u = needUser(token); own('answer', id, u); removeAnswer(id); return { ok: true }; }

  function vote(token, kind, id, b) {
    const u = needUser(token); canWrite(u);
    const it = kind === 'post' ? db.posts[id] : db.answers[id];
    if (!it || !visible(it, u)) throw err(404, 'Not found.');
    if (it.uid === u.id) throw err(400, 'You can’t upvote your own post.');
    limit(`vote:${u.id}`, 120, 3600_000);
    const k = `${u.id}|${id}`;
    const up = b.up !== false;
    if (up && !db.votes[k]) { db.votes[k] = 1; it.score = (it.score || 0) + 1; }
    if (!up && db.votes[k]) { delete db.votes[k]; it.score = Math.max(0, (it.score || 0) - 1); }
    touch();
    return { score: it.score || 0, voted: !!db.votes[k] };
  }

  function accept(token, postId, b) {
    const u = needUser(token);
    const p = own('post', postId, u);
    const aid = b.answerId ? String(b.answerId) : null;
    if (aid && (!db.answers[aid] || db.answers[aid].postId !== p.id)) throw err(400, 'That answer isn’t on this question.');
    p.acceptedId = aid; touch();
    return { acceptedId: aid };
  }

  // ---------- reports & blocks ----------
  function report(token, b) {
    const u = needUser(token);
    const kind = b.kind === 'answer' ? 'answer' : 'post';
    const id = String(b.id || '');
    const it = kind === 'post' ? db.posts[id] : db.answers[id];
    if (!it) throw err(404, 'Not found.');
    if (it.uid === u.id) throw err(400, 'You can’t report your own post.');
    const reason = REASONS.includes(b.reason) ? b.reason : 'other';
    const note = clean(b.note).slice(0, LIMITS.note);
    if (!db.reports.some((r) => r.id === id && r.by === u.id)) {
      limit(`report:${u.id}`, 30, 864e5);
      db.reports.push({ rid: rid('r'), kind, id, by: u.id, reason, note, at: new Date(now()).toISOString(), status: 'open' });
    }
    const since = it.reviewedAt || '';
    const n = new Set(db.reports.filter((r) => r.id === id && r.status === 'open' && r.at > since).map((r) => r.by)).size;
    if (n >= HIDE_AFTER_REPORTS && !it.hidden) it.hidden = 'reports';
    touch();
    return { ok: true, hidden: !!it.hidden };
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
    db.messages.push({ id: rid('m'), uid: u?.id || null, message, about: b.about ? String(b.about).slice(0, 40) : null, at: new Date(now()).toISOString() });
    db.messages = db.messages.slice(-2000); touch();
    return { ok: true };
  }

  // ---------- admin (Authorization: Bearer ADMIN_TOKEN) ----------
  function needAdmin(token) {
    const a = Buffer.from(String(adminToken || '')), b = Buffer.from(String(token || ''));
    if (!adminToken || adminToken.length < 16 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw err(401, 'Admin only.');
  }
  const itemOf = (kind, id) => (kind === 'answer' ? db.answers[id] : db.posts[id]);
  function adminReports(token, q) {
    needAdmin(token);
    const status = q.get('status') === 'all' ? null : 'open';
    const groups = new Map();
    for (const r of db.reports) {
      if (status && r.status !== status) continue;
      const g = groups.get(r.id) || { kind: r.kind, id: r.id, reports: [] };
      g.reports.push({ reason: r.reason, note: r.note, at: r.at, status: r.status }); groups.set(r.id, g);
    }
    const hiddenUnreported = [...Object.values(db.posts), ...Object.values(db.answers)].filter((it) => it.hidden === 'reports' && !groups.has(it.id));
    for (const it of hiddenUnreported) groups.set(it.id, { kind: it.postId ? 'answer' : 'post', id: it.id, reports: [] });
    return {
      items: [...groups.values()].map((g) => {
        const it = itemOf(g.kind, g.id);
        return { ...g, count: g.reports.length, exists: !!it, hidden: it?.hidden || null, author: it ? { ...pub(it.uid), banned: !!db.users[it.uid]?.banned } : null, title: it?.title || (it?.postId ? db.posts[it.postId]?.title : null) || null, body: it?.body?.slice(0, 1000) || null, postId: it?.postId || g.id };
      }).sort((a, b) => b.count - a.count),
    };
  }
  function resolve(id) { for (const r of db.reports) if (r.id === id && r.status === 'open') r.status = 'resolved'; }
  function adminAction(token, action, b) {
    needAdmin(token);
    const kind = b.kind === 'answer' ? 'answer' : 'post';
    const id = String(b.id || '');
    if (action === 'ban') {
      const u = db.users[String(b.userId || '')];
      if (!u) throw err(404, 'No such user.');
      u.banned = b.banned !== false;
      if (u.banned) for (const [h, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[h];
      touch();
      return { ok: true, user: { ...pub(u.id), banned: u.banned } };
    }
    const it = itemOf(kind, id);
    if (!it) throw err(404, 'Not found.');
    if (action === 'hide') { it.hidden = 'admin'; resolve(id); }
    else if (action === 'restore') { it.hidden = null; it.reviewedAt = new Date(now()).toISOString(); resolve(id); }
    else if (action === 'delete') { if (kind === 'post') removePost(id); else removeAnswer(id); }
    else throw err(404, 'Unknown action.');
    touch();
    return { ok: true };
  }
  function adminMessages(token) { needAdmin(token); return { messages: db.messages.slice(-200).reverse() }; }

  const status = () => ({ users: Object.keys(db.users).length, posts: Object.keys(db.posts).length, answers: Object.keys(db.answers).length, openReports: db.reports.filter((r) => r.status === 'open').length, admin: !!adminToken && adminToken.length >= 16 });
  const rules = () => ({ version: RULES_VERSION, rules: RULES, contact: process.env.MODERATION_EMAIL || null, disclaimer: 'Community answers are from other users, not lawyers — not legal advice.' });
  const tags = () => TAGS;

  // ---------- routes ----------
  // ctx: { method, path, query (URLSearchParams), body, token (Bearer), ip }. Returns the JSON body or null (not ours).
  async function route({ method, path: p, query, body = {}, token, ip }) {
    let m;
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
    if (p === '/api/forum/posts') { if (method === 'GET') return list(query, token); if (method === 'POST') return createPost(token, body); }
    if ((m = p.match(/^\/api\/forum\/posts\/([\w-]{3,40})$/))) { if (method === 'GET') return getPost(m[1], token); if (method === 'DELETE') return deletePost(token, m[1]); }
    if ((m = p.match(/^\/api\/forum\/posts\/([\w-]{3,40})\/(edit|answers|vote|accept)$/)) && method === 'POST') {
      if (m[2] === 'edit') return editPost(token, m[1], body);
      if (m[2] === 'answers') return answer(token, m[1], body);
      if (m[2] === 'vote') return vote(token, 'post', m[1], body);
      return accept(token, m[1], body);
    }
    if ((m = p.match(/^\/api\/forum\/answers\/([\w-]{3,40})$/)) && method === 'DELETE') return deleteAnswer(token, m[1]);
    if ((m = p.match(/^\/api\/forum\/answers\/([\w-]{3,40})\/(edit|vote)$/)) && method === 'POST') return m[2] === 'edit' ? editAnswer(token, m[1], body) : vote(token, 'answer', m[1], body);
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
