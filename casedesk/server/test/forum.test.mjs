import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createForum, RULES_VERSION, HIDE_AFTER_REPORTS } from '../src/forum.mjs';

const ADMIN = 'admin-token-for-tests-123456';
const Q = (o = {}) => new URLSearchParams(o);
function setup(extra = {}) {
  let clock = Date.parse('2026-11-18T12:00:00Z');
  const pushes = [];
  const revoked = [];
  const f = createForum({ welcome: false,
    now: () => clock, adminToken: ADMIN,
    verifyApple: async (tok, nonce) => { if (!tok.startsWith('ok:')) throw Object.assign(new Error('bad'), { status: 401 }); return { provider: 'apple', sub: tok.slice(3) }; },
    exchangeAppleCode: async (c) => (c ? `refresh-${c}` : null),
    revokeApple: async (r) => { revoked.push(r); return true; },
    notify: async (m) => { pushes.push(...m); },
    ...extra,
  });
  const call = (method, p, { body, token, query, ip = '1.1.1.1' } = {}) => f.route({ method, path: p, body: body || {}, token, query: query || Q(), ip });
  const user = async (sub, { rules = true } = {}) => {
    const r = await call('POST', '/api/auth/apple', { body: { identityToken: `ok:${sub}`, authorizationCode: `code-${sub}` } });
    if (rules) await call('POST', '/api/me', { token: r.token, body: { acceptRules: RULES_VERSION } });
    return r;
  };
  const ask = (token, o = {}) => call('POST', '/api/forum/posts', { token, body: { title: 'H-1B extension stuck after RFE response', body: 'Filed I-129 extension at EAC, answered the RFE six weeks ago. Is that normal?', tags: ['H-1B', 'RFE'], ...o } });
  return { f, call, user, ask, pushes, revoked, tick: (ms) => { clock += ms; } };
}

test('sign in makes a pseudonymous account; same Apple id → same account; email never stored', async () => {
  const { call, f } = setup();
  const a = await call('POST', '/api/auth/apple', { body: { identityToken: 'ok:sub1' } });
  assert.match(a.user.name, /^\w+ \w+ \d{2}$/);
  assert.equal(a.user.rulesAccepted, false);
  const b = await call('POST', '/api/auth/apple', { body: { identityToken: 'ok:sub1' } });
  assert.equal(b.user.id, a.user.id);
  assert.notEqual(b.token, a.token);
  assert.ok(!JSON.stringify(f._db()).includes('sub1'), 'provider id stored only hashed');
  assert.ok(!JSON.stringify(f._db()).includes(a.token), 'session token stored only hashed');
  await assert.rejects(call('POST', '/api/auth/apple', { body: { identityToken: 'nope' } }), /bad/);
  assert.equal((await call('GET', '/api/me', { token: a.token })).user.id, a.user.id);
  await call('POST', '/api/auth/signout', { token: a.token });
  await assert.rejects(call('GET', '/api/me', { token: a.token }), /Sign in/);
});

test('posting needs sign-in and accepted rules; validation and filter', async () => {
  const { call, user, ask } = setup();
  await assert.rejects(call('POST', '/api/forum/posts', { body: {} }), (e) => e.status === 401 && e.code === 'auth');
  const fresh = await user('r', { rules: false });
  await assert.rejects(ask(fresh.token), (e) => e.status === 403 && e.code === 'rules');
  await assert.rejects(call('POST', '/api/me', { token: fresh.token, body: { acceptRules: 99 } }), /changed/);
  const u = await user('a');
  await assert.rejects(ask(u.token, { title: 'short' }), /Title/);
  await assert.rejects(ask(u.token, { tags: ['Nope'] }), /tag/);
  await assert.rejects(ask(u.token, { body: 'My receipt is EAC2612345678 please check it' }), /receipt number/);
  await assert.rejects(ask(u.token, { title: 'This f*cking USCIS delay is insane' }), /respectful/);
  const p = await ask(u.token, { tags: ['H-1B', 'RFE', 'Bogus'] });
  assert.deepEqual(p.post.tags, ['H-1B', 'RFE']);
  await assert.rejects(ask(u.token), /already asked/);
});

test('answers, votes, accept, sort, search, tags, pagination, push to asker', async () => {
  const { call, user, ask, pushes, tick } = setup();
  const asker = await user('asker'); const helper = await user('helper');
  await call('POST', '/api/me', { token: asker.token, body: { pushToken: 'ExponentPushToken[abcdefghijklmn]' } });
  const p1 = (await ask(asker.token)).post;
  tick(1000);
  const p2 = (await ask(asker.token, { title: 'Green card interview waiver for EB-2', body: 'My I-485 shows interview was waived, what happens next for EB-2?', tags: ['Green card', 'I-485'] })).post;
  tick(1000);
  const a = (await call('POST', `/api/forum/posts/${p1.id}/answers`, { token: helper.token, body: { body: 'Yes, six to eight weeks after an RFE response is common at EAC.' } })).answer;
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, 'ExponentPushToken[abcdefghijklmn]');
  assert.equal(pushes[0].data.url, `/community/post/${p1.id}`);
  await call('POST', `/api/forum/posts/${p1.id}/answers`, { token: asker.token, body: { body: 'Thanks, that helps a lot. Will wait.' } });
  assert.equal(pushes.length, 1, 'no push for own answer');

  await assert.rejects(call('POST', `/api/forum/posts/${p1.id}/vote`, { token: asker.token, body: { up: true } }), /own post/);
  assert.deepEqual(await call('POST', `/api/forum/posts/${p1.id}/vote`, { token: helper.token, body: { up: true } }), { score: 1, voted: true, myVote: 1 });
  assert.deepEqual(await call('POST', `/api/forum/posts/${p1.id}/vote`, { token: helper.token, body: { up: true } }), { score: 1, voted: true, myVote: 1 }, 'idempotent');
  assert.equal((await call('POST', `/api/forum/answers/${a.id}/vote`, { token: asker.token, body: {} })).score, 1);
  await assert.rejects(call('POST', `/api/forum/posts/${p1.id}/accept`, { token: helper.token, body: { answerId: a.id } }), /own posts/);
  await call('POST', `/api/forum/posts/${p1.id}/accept`, { token: asker.token, body: { answerId: a.id } });
  const d = await call('GET', `/api/forum/posts/${p1.id}`, {});
  assert.equal(d.answers[0].id, a.id); assert.equal(d.answers[0].accepted, true); assert.equal(d.post.accepted, true);

  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ sort: 'new' }) })).posts.map((x) => x.id), [p2.id, p1.id]);
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ sort: 'top' }) })).posts.map((x) => x.id), [p1.id, p2.id]);
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ sort: 'unanswered' }) })).posts.map((x) => x.id), [p2.id]);
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ tags: 'I-485,TN' }) })).posts.map((x) => x.id), [p2.id]);
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ q: 'rfe eac' }) })).posts.map((x) => x.id), [p1.id]);
  const pg = await call('GET', '/api/forum/posts', { query: Q({ limit: '1' }) });
  assert.equal(pg.posts.length, 1); assert.equal(pg.next, '1');
  assert.equal((await call('GET', '/api/forum/posts', { query: Q({ limit: '1', cursor: pg.next }) })).next, null);
  const listed = (await call('GET', '/api/forum/posts', { token: helper.token })).posts.find((x) => x.id === p1.id);
  assert.equal(listed.voted, true); assert.equal(listed.answers, 2); assert.ok(!('email' in listed.author));
  assert.equal((await call('GET', '/api/forum/posts', { token: asker.token, query: Q({ mine: '1' }) })).total, 2);
});

test('edit and delete own content only', async () => {
  const { call, user, ask } = setup();
  const a = await user('a'), b = await user('b');
  const p = (await ask(a.token)).post;
  await assert.rejects(call('POST', `/api/forum/posts/${p.id}/edit`, { token: b.token, body: { title: 'Hijacked title here', body: 'x'.repeat(30), tags: ['TN'] } }), /own posts/);
  const e = await call('POST', `/api/forum/posts/${p.id}/edit`, { token: a.token, body: { title: 'H-1B extension still pending after RFE', body: 'Updated details about my I-129 extension case at EAC.', tags: ['H-1B'] } });
  assert.ok(e.post.editedAt);
  const ans = (await call('POST', `/api/forum/posts/${p.id}/answers`, { token: b.token, body: { body: 'Same here, waited about 2 months.' } })).answer;
  await assert.rejects(call('DELETE', `/api/forum/answers/${ans.id}`, { token: a.token }), /own posts/);
  await call('DELETE', `/api/forum/answers/${ans.id}`, { token: b.token });
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).answers.length, 0);
  await call('DELETE', `/api/forum/posts/${p.id}`, { token: a.token });
  await assert.rejects(call('GET', `/api/forum/posts/${p.id}`, {}), /removed/);
});

test('rate limit on questions', async () => {
  const { user, ask } = setup();
  const u = await user('spammy');
  for (let i = 0; i < 5; i++) await ask(u.token, { title: `Question number ${i} about H-1B transfer` });
  await assert.rejects(ask(u.token, { title: 'Question number 6 about H-1B transfer' }), (e) => e.status === 429);
});

test('reports: hidden for the reporter at once, auto-hidden after N reporters, admin review', async () => {
  const { call, user, ask } = setup();
  const author = await user('author');
  const p = (await ask(author.token)).post;
  const reporters = [];
  for (let i = 0; i < HIDE_AFTER_REPORTS; i++) reporters.push(await user(`rep${i}`));
  const viewer = await user('viewer');
  await assert.rejects(call('POST', '/api/forum/report', { token: author.token, body: { kind: 'post', id: p.id, reason: 'spam' } }), /own post/);
  const r1 = await call('POST', '/api/forum/report', { token: reporters[0].token, body: { kind: 'post', id: p.id, reason: 'spam', note: 'ad' } });
  assert.equal(r1.hidden, false);
  assert.equal((await call('GET', '/api/forum/posts', { token: reporters[0].token })).total, 0, 'reporter no longer sees it');
  assert.equal((await call('GET', '/api/forum/posts', { token: viewer.token })).total, 1);
  for (const r of reporters.slice(1)) await call('POST', '/api/forum/report', { token: r.token, body: { kind: 'post', id: p.id, reason: 'abuse' } });
  assert.equal((await call('GET', '/api/forum/posts', { token: viewer.token })).total, 0, 'auto-hidden pending review');
  assert.equal((await call('GET', '/api/forum/posts', {})).total, 0);
  const own = await call('GET', '/api/forum/posts', { token: author.token, query: Q({ mine: '1' }) });
  assert.equal(own.posts[0].hidden, 'review', 'author sees it is under review');

  await assert.rejects(call('GET', '/api/admin/forum/reports', { token: 'wrong' }), /Admin only/);
  const rep = await call('GET', '/api/admin/forum/reports', { token: ADMIN });
  assert.equal(rep.items[0].id, p.id); assert.equal(rep.items[0].count, HIDE_AFTER_REPORTS); assert.equal(rep.items[0].hidden, 'reports');
  await call('POST', '/api/admin/forum/restore', { token: ADMIN, body: { kind: 'post', id: p.id } });
  assert.equal((await call('GET', '/api/forum/posts', { token: viewer.token })).total, 1, 'restored');
  assert.equal((await call('GET', '/api/admin/forum/reports', { token: ADMIN })).items.length, 0, 'reports resolved');
  await call('POST', '/api/admin/forum/hide', { token: ADMIN, body: { kind: 'post', id: p.id } });
  assert.equal((await call('GET', '/api/forum/posts', {})).total, 0);
});

test('admin without ADMIN_TOKEN is disabled', async () => {
  const { call } = setup({ adminToken: '' });
  await assert.rejects(call('GET', '/api/admin/forum/reports', { token: '' }), /Admin only/);
});

test('ban: banned user content disappears, cannot post, ban survives account deletion', async () => {
  const { call, user, ask } = setup();
  const bad = await user('bad'), other = await user('other');
  await ask(bad.token);
  await call('POST', '/api/admin/forum/ban', { token: ADMIN, body: { userId: bad.user.id } });
  assert.equal((await call('GET', '/api/forum/posts', { token: other.token })).total, 0);
  await assert.rejects(call('GET', '/api/me', { token: bad.token }), /Sign in/, 'sessions ended');
  const again = await user('bad');
  await assert.rejects(ask(again.token, { title: 'Another try at an H-1B question' }), (e) => e.code === 'banned');
  await call('DELETE', '/api/me', { token: again.token });
  const third = await user('bad');
  assert.equal(third.user.banned, true, 'ban kept after delete + re-sign-in');
});

test('block hides that person for the blocker and stops their push', async () => {
  const { call, user, ask, pushes } = setup();
  const a = await user('a'), b = await user('b');
  await call('POST', '/api/me', { token: a.token, body: { pushToken: 'ExponentPushToken[abcdefghijklmn]' } });
  const pa = (await ask(a.token)).post;
  await ask(b.token, { title: 'TN to H-1B change of status timing' });
  await call('POST', '/api/forum/blocks', { token: a.token, body: { userId: b.user.id } });
  const seen = (await call('GET', '/api/forum/posts', { token: a.token })).posts;
  assert.deepEqual(seen.map((x) => x.author.id), [a.user.id]);
  await call('POST', `/api/forum/posts/${pa.id}/answers`, { token: b.token, body: { body: 'Answer from someone you blocked.' } });
  assert.equal(pushes.length, 0);
  assert.equal((await call('GET', `/api/forum/posts/${pa.id}`, { token: a.token })).answers.length, 0);
  assert.equal((await call('GET', '/api/forum/blocks', { token: a.token })).blocked[0].id, b.user.id);
  await call('DELETE', '/api/forum/blocks', { token: a.token, body: { userId: b.user.id } });
  assert.equal((await call('GET', '/api/forum/posts', { token: a.token })).total, 2);
});

test('display names: editable, unique, no official-sounding or abusive names', async () => {
  const { call, user } = setup();
  const a = await user('a'), b = await user('b');
  assert.equal((await call('POST', '/api/me', { token: a.token, body: { name: 'Dallas Dad' } })).user.name, 'Dallas Dad');
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { name: 'dallas dad' } }), /taken/);
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { name: 'USCIS Officer' } }), /official/);
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { name: 'sh1tlord bitch' } }), /respectful/);
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { name: 'x' } }), /3–24/);
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { pushToken: 'nope' } }), /push token/);
});

test('account deletion removes the user, their votes and childless content, and revokes the Apple token', async () => {
  const { call, user, ask, revoked, f } = setup();
  const a = await user('gone'), b = await user('stay');
  const pa = (await ask(a.token)).post;
  const pb = (await ask(b.token, { title: 'Question from the person who stays' })).post;
  await call('POST', `/api/forum/posts/${pb.id}/answers`, { token: a.token, body: { body: 'An answer that should vanish.' } });
  await call('POST', `/api/forum/posts/${pb.id}/vote`, { token: a.token, body: {} });
  const r = await call('DELETE', '/api/me', { token: a.token });
  assert.equal(r.revoked, true);
  assert.deepEqual(revoked, ['refresh-code-gone']);
  await assert.rejects(call('GET', '/api/me', { token: a.token }), /Sign in/);
  const d = await call('GET', `/api/forum/posts/${pb.id}`, {});
  assert.equal(d.answers.length, 0); assert.equal(d.comments.length, 0); assert.equal(d.post.score, 0);
  assert.equal((await call('GET', '/api/forum/posts', {})).total, 1);
  await assert.rejects(call('GET', `/api/forum/posts/${pa.id}`, {}), /removed/, 'a post nobody replied to goes completely');
  assert.equal(Object.keys(f._db().comments).length, 0);
  assert.ok(!JSON.stringify(f._db()).includes('refresh-code'), 'refresh token sealed, then gone');
});

test('persists to disk and reloads', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forum-'));
  const file = path.join(dir, 'forum.json');
  const verifyApple = async (t) => ({ provider: 'apple', sub: t });
  const f1 = createForum({ file, verifyApple, flushMs: 1e9 });
  const s = await f1.route({ method: 'POST', path: '/api/auth/apple', body: { identityToken: 'x' }, query: Q(), ip: 'i' });
  await f1.route({ method: 'POST', path: '/api/me', body: { acceptRules: RULES_VERSION }, token: s.token, query: Q(), ip: 'i' });
  await f1.route({ method: 'POST', path: '/api/forum/posts', token: s.token, body: { title: 'Saved question about OPT', body: 'Does the OPT unemployment clock pause during travel?', tags: ['OPT'] }, query: Q(), ip: 'i' });
  f1.close();
  const f2 = createForum({ file, verifyApple, flushMs: 1e9 });
  assert.equal((await f2.route({ method: 'GET', path: '/api/forum/posts', query: Q(), ip: 'i' })).total, 1);
  assert.equal((await f2.route({ method: 'GET', path: '/api/me', token: s.token, query: Q(), ip: 'i' })).user.rulesAccepted, true);
  f2.close();
});

test('unknown forum paths 404, other paths are not handled', async () => {
  const { call } = setup();
  await assert.rejects(call('GET', '/api/forum/nope'), (e) => e.status === 404);
  assert.equal(await call('GET', '/api/news'), null);
});

test('admin: password checked against a SHA-256 from deploy.conf', async () => {
  const { createForum } = await import('../src/forum.mjs');
  const crypto = await import('node:crypto');
  const pw = 'abcde-fghjk-mnpqr-stuvw-xyz23';
  const f = createForum({ welcome: false, adminToken: '', adminHash: crypto.createHash('sha256').update(pw).digest('hex') });
  const ok = await f.route({ method: 'GET', path: '/api/admin/forum/reports', query: new URLSearchParams(), token: pw }).catch((e) => e);
  assert.ok(Array.isArray(ok.items), 'right password opens reports');
  const bad = await f.route({ method: 'GET', path: '/api/admin/forum/reports', query: new URLSearchParams(), token: pw + 'x' }).catch((e) => e);
  assert.equal(bad.status, 401);
  const none = createForum({ welcome: false, adminToken: '', adminHash: '' });
  const off = await none.route({ method: 'GET', path: '/api/admin/forum/reports', query: new URLSearchParams(), token: pw }).catch((e) => e);
  assert.equal(off.status, 401);
});
