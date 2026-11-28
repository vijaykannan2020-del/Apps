// Push alerts for news and the Visa Bulletin, sent through Expo's push service.
// Stores only: anonymous Expo push token, platform, chosen topics. No names, dates or receipt numbers.
import fs from 'node:fs';
import path from 'node:path';

const SUBS = path.resolve('data/subscribers.json');
const SENT = path.resolve('data/notified.json');
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,100}\]$/;
const MAX_SUBS = 200_000;

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };
let subs = read(SUBS, {});
const err = (status, message) => Object.assign(new Error(message), { status });

const TAGS = new Set(['H-1B', 'L-1', 'TN', 'OPT', 'STEM OPT', 'H-4', 'L-2', 'I-9', 'Fees', 'Wages', 'Green card', 'Citizenship']);
const COUNTRIES = new Set(['all', 'china', 'india', 'mexico', 'philippines']);
const CATS = new Set(['EB-1', 'EB-2', 'EB-3', 'EB-3 OW', 'EB-5']);

export function subscribe(body) {
  const { token, platform, news = {}, bulletin = {} } = body || {};
  if (!TOKEN_RE.test(token || '')) throw err(400, 'Invalid push token');
  if (!subs[token] && Object.keys(subs).length >= MAX_SUBS) throw err(503, 'Subscriber limit reached');
  subs[token] = {
    platform: platform === 'android' ? 'android' : 'ios',
    news: { enabled: !!news.enabled, tags: (news.tags || []).filter((t) => TAGS.has(t)).slice(0, 12), importantOnly: !!news.importantOnly, webNews: !!news.webNews },
    bulletin: { enabled: !!bulletin.enabled, country: COUNTRIES.has(bulletin.country) ? bulletin.country : 'all', categories: (bulletin.categories || []).filter((c) => CATS.has(c)).slice(0, 5) },
    updated: new Date().toISOString().slice(0, 10),
  };
  write(SUBS, subs);
  return { ok: true };
}

export function unsubscribe(body) {
  if (body?.token && subs[body.token]) { delete subs[body.token]; write(SUBS, subs); }
  return { ok: true };
}

// Settings → Notifications → Send a test notification: one push to the asking phone, with Expo's answer,
// so delivery problems (e.g. missing Apple push credentials) show up instead of failing silently.
const lastTest = new Map();
export async function testPush(body) {
  const token = body?.token;
  if (!TOKEN_RE.test(token || '')) throw err(400, 'Invalid push token');
  const now = Date.now();
  if (now - (lastTest.get(token) || 0) < 30_000) throw err(429, 'Wait a few seconds and try again');
  lastTest.set(token, now);
  if (lastTest.size > 5000) lastTest.clear();
  try {
    const r = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ to: token, title: 'Immigration Wallet', body: 'Test notification — alerts from the server reach this phone ✓', sound: 'default', channelId: 'news', data: { url: '/settings-page/notifications' } }]) });
    const j = await r.json();
    const t = j?.data?.[0];
    if (t?.status === 'ok') return { ok: true };
    return { ok: false, error: t?.details?.error || t?.message || j?.errors?.[0]?.message || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

export const pushStatus = () => ({ subscribers: Object.keys(subs).length });

// Community: one-off pushes (e.g. 'New answer to your question') to tokens the forum stores per account.
export const sendPush = (messages) => send(messages.filter((m) => TOKEN_RE.test(m.to || '')));

async function send(messages) {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const r = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch) });
      const j = await r.json();
      (j.data || []).forEach((res, k) => {
        if (res.status === 'error' && res.details?.error === 'DeviceNotRegistered') delete subs[batch[k].to];
      });
    } catch (e) { console.error('push send failed', e.message); }
  }
  write(SUBS, subs);
}

// New items since last run → one push per subscriber per item that matches their topics
export async function notifyNews(items) {
  const sent = read(SENT, null);
  if (!sent) { write(SENT, items.map((i) => i.id)); return; } // first run: remember, don't blast old news
  const seen = new Set(sent);
  const fresh = items.filter((i) => !seen.has(i.id));
  if (!fresh.length) return;
  const msgs = [];
  for (const [token, s] of Object.entries(subs)) {
    if (!s.news.enabled) continue;
    for (const it of fresh) {
      const official = it.kind !== 'news';
      if (!official && !(s.news.webNews && (it.sources?.length || 1) >= 3)) continue;
      if (official && s.news.importantOnly && it.impact !== 'high') continue;
      if (s.news.tags.length && !it.tags.some((t) => s.news.tags.includes(t))) continue;
      msgs.push({ to: token, title: official ? `${it.agency}: ${it.title}`.slice(0, 120) : it.title.slice(0, 120), body: it.summary.slice(0, 180), data: { url: `/news/${it.id}` }, channelId: 'news', sound: null });
    }
  }
  write(SENT, [...seen, ...fresh.map((i) => i.id)].slice(-2000));
  if (msgs.length) await send(msgs.slice(0, 50_000));
}

const fmt = (c) => (c === 'C' ? 'Current' : c === 'U' ? 'Unavailable' : c ? new Date(c + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const NAMES = { all: 'All countries', china: 'China', india: 'India', mexico: 'Mexico', philippines: 'Philippines' };

// New monthly bulletin → tell each subscriber what happened to their country + categories
export async function notifyBulletin(prev, next) {
  if (!prev || !next || prev.month === next.month) return;
  const msgs = [];
  for (const [token, s] of Object.entries(subs)) {
    if (!s.bulletin.enabled || !s.bulletin.categories.length) continue;
    const parts = [];
    for (const cat of s.bulletin.categories) {
      const a = prev.rows.find((r) => r.cat === cat), b = next.rows.find((r) => r.cat === cat);
      if (!b) continue;
      const before = a?.final[s.bulletin.country], after = b.final[s.bulletin.country];
      parts.push(before === after ? `${cat} no change (${fmt(after)})` : `${cat} ${fmt(before)} → ${fmt(after)}`);
    }
    if (parts.length) msgs.push({ to: token, title: `${next.month} Visa Bulletin · ${NAMES[s.bulletin.country]}`, body: parts.join(' · '), data: { url: '/tools/vb' }, channelId: 'news' });
  }
  if (msgs.length) await send(msgs);
}
