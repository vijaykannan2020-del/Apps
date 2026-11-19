// v2.9: the pinned Welcome post — made on start when missing, official (team author), pinned above the
// first page of the plain feed, never voted down, reported, edited or deleted by members, kept by
// migrate() and by reloads, and shaped like a normal post for older apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createForum, migrate, RULES_VERSION, WELCOME_ID, WELCOME } from '../src/forum.mjs';

const ADMIN = 'admin-token-for-tests-123456';
const Q = (o = {}) => new URLSearchParams(o);
function setup(extra = {}) {
  let clock = Date.parse('2026-11-18T12:00:00Z');
  const f = createForum({ now: () => clock, adminToken: ADMIN, verifyApple: async (tok) => ({ provider: 'apple', sub: tok }), ...extra });
  const call = (method, p, { body, token, query } = {}) => f.route({ method, path: p, body: body || {}, token, query: query || Q(), ip: '1.1.1.1' });
  let n = 0;
  const user = async (sub) => {
    const r = await call('POST', '/api/auth/apple', { body: { identityToken: sub } });
    await call('POST', '/api/me', { token: r.token, body: { acceptRules: RULES_VERSION } });
    return r;
  };
  const post = async (token, o = {}) => (await call('POST', '/api/forum/posts', { token, body: { title: `Stamping wait in Chennai ${n++}`, body: 'Passport came back in six working days after the interview.', tags: ['H-1B', 'Stamping'], ...o } })).post;
  return { f, call, user, post, tick: (ms) => { clock += ms; } };
}

test('welcome post: made on start, pinned first on the plain feed only, not counted or paged', async () => {
  const { call, user, post, tick } = setup();
  const empty = await call('GET', '/api/forum/posts', {});
  assert.deepEqual(empty.posts.map((p) => p.id), [WELCOME_ID]);
  assert.equal(empty.total, 0, 'not counted'); assert.equal(empty.next, null);
  const w = empty.posts[0];
  assert.equal(w.pinned, true); assert.equal(w.official, true); assert.equal(w.title, WELCOME.title);
  assert.deepEqual(w.author, { id: null, name: 'Immigration Wallet team', avatar: null, flair: null, official: true });
  assert.ok(!w.author.deleted, 'not shown as [deleted] in older apps');
  // the fields an older app reads are all there
  for (const k of ['id', 'type', 'title', 'excerpt', 'tags', 'author', 'createdAt', 'score', 'myVote', 'comments', 'answers', 'saved', 'mine', 'hidden', 'deleted']) assert.ok(k in w, k);
  assert.match(w.excerpt, /receipt numbers/);

  const a = await user('a');
  for (let i = 0; i < 3; i++) { await post(a.token); tick(60_000); }
  for (const sort of ['hot', 'new', 'top']) {
    const r = await call('GET', '/api/forum/posts', { query: Q({ sort, limit: '2' }) });
    assert.equal(r.posts[0].id, WELCOME_ID, sort); assert.equal(r.posts.length, 3, 'pin + a full page'); assert.equal(r.total, 3);
    const p2 = await call('GET', '/api/forum/posts', { query: Q({ sort, limit: '2', cursor: r.next }) });
    assert.ok(!p2.posts.some((p) => p.id === WELCOME_ID), 'only on the first page');
  }
  for (const q of [{ sort: 'unanswered' }, { tags: 'H-1B' }, { q: 'welcome' }, { type: 'discussion' }]) {
    assert.ok(!(await call('GET', '/api/forum/posts', { query: Q(q) })).posts.some((p) => p.id === WELCOME_ID), JSON.stringify(q));
  }
  const full = await call('GET', `/api/forum/posts/${WELCOME_ID}`);
  assert.equal(full.post.body, WELCOME.body); assert.equal(full.post.pinned, true);
});

test('welcome post: upvote and comment yes; downvote, report, edit and delete no', async () => {
  const { call, user } = setup();
  const a = await user('a');
  await assert.rejects(call('POST', `/api/forum/posts/${WELCOME_ID}/vote`, { token: a.token, body: { dir: -1 } }), /voted down/);
  assert.equal((await call('POST', `/api/forum/posts/${WELCOME_ID}/vote`, { token: a.token, body: { dir: 1 } })).score, 1);
  assert.equal((await call('POST', `/api/forum/posts/${WELCOME_ID}/vote`, { token: a.token, body: { up: true } })).score, 1, 'v2.4 upvote');
  await assert.rejects(call('POST', '/api/forum/report', { token: a.token, body: { kind: 'post', id: WELCOME_ID, reason: 'spam' } }), /can’t be reported/);
  await assert.rejects(call('POST', `/api/forum/posts/${WELCOME_ID}/edit`, { token: a.token, body: { title: 'Changed title here', body: 'Changed body text here ok', tags: ['H-1B'] } }), /own posts/);
  await assert.rejects(call('DELETE', `/api/forum/posts/${WELCOME_ID}`, { token: a.token }), /own posts/);
  const c = (await call('POST', `/api/forum/posts/${WELCOME_ID}/comments`, { token: a.token, body: { body: 'Hello everyone, glad this exists.' } })).comment;
  assert.equal(c.op, false);
  assert.equal((await call('POST', `/api/forum/posts/${WELCOME_ID}/save`, { token: a.token })).saved, true);
  assert.equal((await call('DELETE', '/api/me', { token: a.token })).ok, true);
  const after = await call('GET', `/api/forum/posts/${WELCOME_ID}`);
  assert.equal(after.post.official, true); assert.equal(after.post.score, 0, 'their vote went with the account');
});

test('welcome post: survives migrate and restarts, is made again when missing, loading alone writes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forum-welcome-'));
  const file = path.join(dir, 'forum.json');
  const verifyApple = async (t) => ({ provider: 'apple', sub: t });
  const f1 = createForum({ file, flushMs: 1e9, verifyApple });
  const call1 = (m, p, o = {}) => f1.route({ method: m, path: p, body: o.body || {}, token: o.token, query: o.query || Q(), ip: 'i' });
  f1.close();
  assert.ok(!fs.existsSync(file), 'nothing written on a fresh start');
  const a = await call1('POST', '/api/auth/apple', { body: { identityToken: 'a' } });
  await call1('POST', '/api/me', { token: a.token, body: { acceptRules: RULES_VERSION } });
  await call1('POST', `/api/forum/posts/${WELCOME_ID}/vote`, { token: a.token, body: { dir: 1 } });
  f1.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.posts[WELCOME_ID].official, true);
  assert.equal(migrate(saved).posts[WELCOME_ID].official, true, 'migrate keeps it');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(migrate(saved)))).posts[WELCOME_ID], migrate(saved).posts[WELCOME_ID]);
  const f2 = createForum({ file, flushMs: 1e9, verifyApple });
  const r = await f2.route({ method: 'GET', path: `/api/forum/posts/${WELCOME_ID}`, query: Q(), ip: 'i' });
  assert.equal(r.post.score, 1, 'votes kept across restarts');
  f2.close();
  // an old file without it (or with an older copy) gets one again
  delete saved.posts[WELCOME_ID];
  fs.writeFileSync(file, JSON.stringify(saved));
  const f3 = createForum({ file, flushMs: 1e9, verifyApple });
  assert.equal((await f3.route({ method: 'GET', path: '/api/forum/posts', query: Q(), ip: 'i' })).posts[0].id, WELCOME_ID);
  f3.close();
  saved.posts[WELCOME_ID] = { id: WELCOME_ID, uid: null, official: true, pinned: true, welcomeV: 0, type: 'discussion', title: 'Old welcome', body: 'Old text', tags: [], createdAt: '2026-01-01T00:00:00Z', up: 4, down: 0, score: 4, commentIds: [] };
  fs.writeFileSync(file, JSON.stringify(saved));
  const f4 = createForum({ file, flushMs: 1e9, verifyApple });
  const w = (await f4.route({ method: 'GET', path: `/api/forum/posts/${WELCOME_ID}`, query: Q(), ip: 'i' })).post;
  assert.equal(w.title, WELCOME.title); assert.equal(w.score, 4, 'refreshed text, same votes'); assert.equal(w.createdAt, '2026-01-01T00:00:00Z');
  f4.close();
  fs.rmSync(dir, { recursive: true });
});

test('welcome: false leaves the feed empty (tests and tools)', async () => {
  const { call } = setup({ welcome: false });
  assert.equal((await call('GET', '/api/forum/posts', {})).posts.length, 0);
});
