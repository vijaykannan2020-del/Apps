// Community v2.7 (Reddit-style): comment tree, up / down votes, hot sort, post types, polls, reposts,
// saved posts, profiles and karma, notifications, safety on comments and profiles, v2.4 → v2.7 migration,
// account deletion that keeps threads, and Google audiences from deploy.conf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createForum, migrate, hotScore, wilson, commentTree, RULES_VERSION, MAX_DEPTH, DELETED, HIDE_AFTER_REPORTS, AVATARS } from '../src/forum.mjs';
import { createJwks, googleAudiences, googleVerifier, readConf } from '../src/auth.mjs';
import { fakeProvider, nowS } from './helpers.mjs';

const ADMIN = 'admin-token-for-tests-123456';
const PUSH = 'ExponentPushToken[abcdefghijklmn]';
const Q = (o = {}) => new URLSearchParams(o);
function setup(extra = {}) {
  let clock = Date.parse('2026-11-18T12:00:00Z');
  const pushes = [];
  const f = createForum({ now: () => clock, adminToken: ADMIN, verifyApple: async (tok) => ({ provider: 'apple', sub: tok }), notify: async (m) => { pushes.push(...m); }, ...extra });
  const call = (method, p, { body, token, query, ip = '1.1.1.1' } = {}) => f.route({ method, path: p, body: body || {}, token, query: query || Q(), ip });
  let n = 0;
  const user = async (sub, { push = false } = {}) => {
    const r = await call('POST', '/api/auth/apple', { body: { identityToken: sub }, ip: `9.9.9.${n++}` });
    await call('POST', '/api/me', { token: r.token, body: { acceptRules: RULES_VERSION, ...(push ? { pushToken: PUSH } : {}) } });
    return r;
  };
  const post = async (token, o = {}) => (await call('POST', '/api/forum/posts', { token, body: { title: `L-1A extension filed early ${n++}`, body: 'Filed the I-129 six months early at EAC. Is premium worth paying for?', tags: ['L-1', 'I-129'], ...o } })).post;
  const say = async (token, postId, body, parentId) => (await call('POST', `/api/forum/posts/${postId}/comments`, { token, body: { body, parentId } })).comment;
  const vote = (token, kind, id, dir) => call('POST', `/api/forum/${kind}/${id}/vote`, { token, body: { dir } });
  return { f, call, user, post, say, vote, pushes, tick: (ms) => { clock += ms; }, now: () => clock };
}

test('comment tree: replies nest up to 4 levels, deeper replies stay on the last level', async () => {
  const { call, user, post, say } = setup();
  const a = await user('a'), b = await user('b');
  const p = await post(a.token);
  const c0 = await say(b.token, p.id, 'Premium made sense for us, 9 business days.');
  assert.equal(c0.parentId, null); assert.equal(c0.depth, 0); assert.equal(c0.op, false);
  const c1 = await say(a.token, p.id, 'Thanks. Did you get an RFE?', c0.id);
  assert.equal(c1.parentId, c0.id); assert.equal(c1.depth, 1); assert.equal(c1.op, true, 'original poster badge');
  const c2 = await say(b.token, p.id, 'No RFE at all.', c1.id);
  const c3 = await say(a.token, p.id, 'Good to know.', c2.id);
  assert.equal(c3.depth, MAX_DEPTH - 1);
  const c4 = await say(b.token, p.id, 'One more level down?', c3.id);
  assert.equal(c4.depth, MAX_DEPTH - 1, 'no fifth level');
  assert.equal(c4.parentId, c2.id);
  await assert.rejects(say(b.token, p.id, 'Reply to nothing', 'c_missing'), (e) => e.status === 404);
  const other = await post(a.token);
  await assert.rejects(say(b.token, other.id, 'Wrong thread reply', c0.id), (e) => e.status === 404, 'parent must be on the same post');
  await assert.rejects(say(b.token, p.id, 'x'), /Comment/);
  await assert.rejects(say(b.token, p.id, 'My receipt is EAC2612345678'), /receipt number/, 'filter runs on comments');

  const d = await call('GET', `/api/forum/posts/${p.id}`, {});
  assert.equal(d.comments.length, 5); assert.equal(d.post.comments, 5);
  assert.deepEqual(d.answers.map((x) => x.id), [c0.id], 'v2.4 apps see top-level comments as answers');
  const tree = commentTree(d.comments);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].replies[0].replies[0].replies.length, 2);
});

test('commentTree sorts Best (accepted, then vote confidence) and New at every level', () => {
  const c = (id, parentId, up, down, at, accepted = false) => ({ id, parentId, up, down, score: up - down, createdAt: `2026-11-18T12:0${at}:00Z`, accepted });
  const list = [c('a', null, 1, 0, 1), c('b', null, 40, 4, 2), c('c', null, 3, 3, 3), c('d', null, 0, 0, 4, true), c('b1', 'b', 0, 0, 5), c('b2', 'b', 5, 0, 6), c('orphan', 'zzz', 9, 0, 7)];
  assert.deepEqual(commentTree(list, 'best').map((n) => n.id), ['d', 'b', 'a', 'c']);
  assert.deepEqual(commentTree(list, 'best')[1].replies.map((n) => n.id), ['b2', 'b1']);
  assert.deepEqual(commentTree(list, 'new').map((n) => n.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(commentTree(list, 'new')[2].replies.map((n) => n.id), ['b2', 'b1']);
  assert.ok(wilson(40, 4) > wilson(1, 0), 'many votes beat one lucky vote');
  assert.equal(wilson(0, 0), 0);
});

test('votes: up, down, switch and clear on posts and comments; one vote each; not on your own', async () => {
  const { call, user, post, say, vote } = setup();
  const a = await user('a'), b = await user('b'), c = await user('c');
  const p = await post(a.token);
  assert.deepEqual(await vote(b.token, 'posts', p.id, 1), { score: 1, voted: true, myVote: 1 });
  assert.deepEqual(await vote(b.token, 'posts', p.id, 1), { score: 1, voted: true, myVote: 1 }, 'same vote twice counts once');
  assert.deepEqual(await vote(c.token, 'posts', p.id, -1), { score: 0, voted: false, myVote: -1 });
  assert.deepEqual(await vote(b.token, 'posts', p.id, -1), { score: -2, voted: false, myVote: -1 }, 'switching moves two points');
  assert.deepEqual(await vote(b.token, 'posts', p.id, 0), { score: -1, voted: false, myVote: 0 });
  await assert.rejects(vote(a.token, 'posts', p.id, 1), /own post/);
  const cm = await say(b.token, p.id, 'Premium is worth it close to the I-94 end date.');
  assert.equal((await vote(a.token, 'comments', cm.id, 1)).score, 1);
  assert.equal((await vote(c.token, 'comments', cm.id, -1)).score, 0);
  const d = await call('GET', `/api/forum/posts/${p.id}`, { token: c.token });
  assert.equal(d.post.myVote, -1); assert.equal(d.comments[0].myVote, -1); assert.equal(d.comments[0].up, 1); assert.equal(d.comments[0].down, 1);
  assert.equal((await call('POST', `/api/forum/posts/${p.id}/vote`, { token: b.token, body: { up: true } })).score, 0, 'v2.4 upvote still works');
  assert.equal((await call('POST', `/api/forum/answers/${cm.id}/vote`, { token: a.token, body: { up: false } })).score, -1, 'v2.4 clear still works');
  await assert.rejects(vote(undefined, 'posts', p.id, 1), (e) => e.code === 'auth');
});

test('hot sort: votes decay with time; new, top by range and unanswered', async () => {
  const { call, user, post, say, vote, tick, now } = setup();
  const a = await user('a'); const voters = [];
  for (let i = 0; i < 12; i++) voters.push(await user(`v${i}`));
  const old = await post(a.token, { title: 'Old post with many upvotes' });
  for (const v of voters) await vote(v.token, 'posts', old.id, 1);
  tick(3 * 864e5);
  const mid = await post(a.token, { title: 'Two day old post, few votes' });
  await vote(voters[0].token, 'posts', mid.id, 1);
  tick(2 * 864e5);
  const fresh = await post(a.token, { title: 'Fresh post without votes' });
  await say(voters[1].token, mid.id, 'A comment so it is answered.');
  const ids = async (q) => (await call('GET', '/api/forum/posts', { query: Q(q) })).posts.map((x) => x.id);
  assert.deepEqual(await ids({ sort: 'hot' }), [fresh.id, mid.id, old.id], 'age outweighs 12 old votes after five days');
  assert.deepEqual(await ids({ sort: 'top' }), [old.id, mid.id, fresh.id]);
  assert.deepEqual(await ids({ sort: 'top', t: 'all' }), [old.id, mid.id, fresh.id]);
  assert.deepEqual(await ids({ sort: 'top', t: 'week' }), [old.id, mid.id, fresh.id]);
  assert.deepEqual(await ids({ sort: 'top', t: 'day' }), [fresh.id]);
  assert.deepEqual(await ids({ sort: 'new' }), [fresh.id, mid.id, old.id]);
  assert.deepEqual(await ids({ sort: 'unanswered' }), [fresh.id, old.id]);
  // pure function: 10x the votes ≈ 12.5 hours of freshness
  const t = now();
  assert.ok(hotScore(100, 0, t) > hotScore(10, 0, t));
  assert.ok(hotScore(10, 0, t + 13 * 3600_000) > hotScore(100, 0, t));
  assert.ok(hotScore(100, 0, t + 12 * 3600_000) > hotScore(1000, 0, t) - 1);
  assert.ok(hotScore(-5, 0, t) < hotScore(0, 0, t));
  assert.ok(hotScore(0, 6, t) > hotScore(0, 0, t), 'comments count a little');
});

test('post types: discussion, timeline share and validation', async () => {
  const { call, user, post } = setup();
  const a = await user('a');
  const d = await post(a.token, { type: 'discussion' });
  assert.equal(d.type, 'discussion');
  assert.equal((await post(a.token, { type: 'nonsense' })).type, 'question');
  const steps = [{ label: 'Approved', date: '2026-11-03' }, { label: 'Filed', date: '2026-08-14' }, { label: 'Biometrics', date: '2026-09-02' }];
  const tl = await post(a.token, { type: 'timeline', title: 'H-4 EAD renewal: filed Aug, approved Nov', body: '', tags: ['H-4', 'I-765'], timeline: { form: 'I-765', office: 'IOE', premium: false, steps } });
  assert.equal(tl.type, 'timeline');
  assert.deepEqual(tl.timeline.steps.map((s) => s.label), ['Filed', 'Biometrics', 'Approved'], 'sorted by date');
  assert.equal(tl.timeline.form, 'I-765'); assert.equal(tl.timeline.office, 'IOE');
  const bad = (timeline) => post(a.token, { type: 'timeline', title: 'Another timeline post to share', body: '', timeline });
  await assert.rejects(bad({ form: 'I-999', office: 'IOE', steps }), /form/);
  await assert.rejects(bad({ form: 'I-765', office: 'Mars', steps }), /office/);
  await assert.rejects(bad({ form: 'I-765', office: 'IOE', steps: steps.slice(0, 1) }), /dates/);
  await assert.rejects(bad({ form: 'I-765', office: 'IOE', steps: [{ label: 'Filed', date: '2026-08-14' }, { label: 'Approved', date: '2031-01-01' }] }), /future/);
  await assert.rejects(bad({ form: 'I-765', office: 'IOE', steps: [{ label: 'Filed', date: '2026-08-14' }, { label: 'Filed', date: '2026-09-01' }] }), /once/);
  await assert.rejects(bad({ form: 'I-765', office: 'IOE', steps: [{ label: 'Filed', date: '2026-08-14' }, { label: 'My receipt EAC2612345678', date: '2026-09-01' }] }), /list/, 'no free text in timelines');
  await assert.rejects(post(a.token, { type: 'discussion', body: 'too short' }), /Details/);
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ type: 'timeline' }) })).posts.map((x) => x.id), [tl.id]);
});

test('polls: 2–4 options, one vote per person (voting again moves it), filter on options', async () => {
  const { call, user, post } = setup();
  const a = await user('a'), b = await user('b'), c = await user('c');
  const mk = (options) => post(a.token, { type: 'poll', title: 'How long did your STEM OPT approval take?', body: '', tags: ['STEM OPT'], poll: { options } });
  await assert.rejects(mk(['Only one']), /2–4/);
  await assert.rejects(mk(['1', '2', '3', '4', '5']), /2–4/);
  await assert.rejects(mk(['Same', 'same']), /different/);
  await assert.rejects(mk(['Under 2 months', 'whatsapp me for help']), /Ads/);
  const p = await mk(['Under 2 months', '2–4 months', 'Over 4 months']);
  assert.deepEqual(p.poll, { options: [{ text: 'Under 2 months', votes: 0 }, { text: '2–4 months', votes: 0 }, { text: 'Over 4 months', votes: 0 }], total: 0, myVote: null });
  const vote = (u, option) => call('POST', `/api/forum/posts/${p.id}/poll`, { token: u.token, body: { option } });
  assert.equal((await vote(b, 1)).poll.myVote, 1);
  await vote(c, 1);
  const moved = (await vote(b, 2)).poll;
  assert.equal(moved.total, 2, 'still one vote for b'); assert.deepEqual(moved.options.map((o) => o.votes), [0, 1, 1]); assert.equal(moved.myVote, 2);
  await assert.rejects(vote(b, 7), /options/);
  await assert.rejects(vote(b, 'x'), /options/);
  await assert.rejects(call('POST', `/api/forum/posts/${p.id}/poll`, { body: { option: 0 } }), (e) => e.code === 'auth');
  const q = await post(a.token);
  await assert.rejects(call('POST', `/api/forum/posts/${q.id}/poll`, { token: b.token, body: { option: 0 } }), (e) => e.status === 404);
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, { token: c.token })).post.poll.myVote, 1);
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).post.poll.myVote, null);
});

test('repost: a new post that embeds the original card; a repost of a repost points at the first post', async () => {
  const { call, user, post } = setup();
  const a = await user('a'), b = await user('b'), c = await user('c');
  const orig = await post(a.token, { title: 'Original question about premium processing' });
  const r = (await call('POST', '/api/forum/posts', { token: b.token, body: { repostOf: orig.id, body: 'Same situation here — worth a read.' } })).post;
  assert.equal(r.title, orig.title, 'title defaults to the original'); assert.deepEqual(r.tags, orig.tags);
  assert.equal(r.repost.id, orig.id); assert.equal(r.repost.author.id, a.user.id); assert.equal(r.repost.title, orig.title);
  assert.equal(r.author.id, b.user.id);
  await assert.rejects(call('POST', '/api/forum/posts', { token: b.token, body: { repostOf: orig.id } }), /already reposted/);
  const r2 = (await call('POST', '/api/forum/posts', { token: c.token, body: { repostOf: r.id, title: 'Reposting with my own title', tags: ['Premium'] } })).post;
  assert.equal(r2.repost.id, orig.id); assert.equal(r2.title, 'Reposting with my own title'); assert.deepEqual(r2.tags, ['Premium']);
  await assert.rejects(call('POST', '/api/forum/posts', { token: b.token, body: { repostOf: 'p_missing' } }), (e) => e.status === 404);
  await assert.rejects(call('POST', '/api/forum/posts', { token: c.token, body: { repostOf: orig.id, title: 'Different title for this one', body: 'My number is 214-555-0188' } }), /emails and phone/);
  await call('DELETE', `/api/forum/posts/${orig.id}`, { token: a.token });
  assert.deepEqual((await call('GET', `/api/forum/posts/${r.id}`, {})).post.repost, { id: orig.id, removed: true });
});

test('saved posts: save, list newest first, unsave; private to the person', async () => {
  const { call, user, post } = setup();
  const a = await user('a'), b = await user('b');
  const p1 = await post(a.token), p2 = await post(a.token);
  const save = (id, on) => call('POST', `/api/forum/posts/${id}/save`, { token: b.token, body: { on } });
  assert.deepEqual(await save(p1.id), { saved: true });
  await save(p2.id); await save(p1.id);
  const saved = await call('GET', '/api/forum/posts', { token: b.token, query: Q({ saved: '1' }) });
  assert.deepEqual(saved.posts.map((x) => x.id), [p1.id, p2.id]); assert.equal(saved.posts[0].saved, true);
  assert.equal((await call('GET', '/api/forum/posts', { token: a.token, query: Q({ saved: '1' }) })).total, 0);
  await assert.rejects(call('GET', '/api/forum/posts', { query: Q({ saved: '1' }) }), (e) => e.code === 'auth');
  assert.deepEqual(await save(p1.id, false), { saved: false });
  assert.deepEqual((await call('GET', '/api/forum/posts', { token: b.token, query: Q({ saved: '1' }) })).posts.map((x) => x.id), [p2.id]);
});

test('profiles: avatar, flair, join date, karma and counts; public page lists posts and comments', async () => {
  const { call, user, post, say, vote } = setup();
  const a = await user('a'), b = await user('b'), c = await user('c');
  const me = (await call('POST', '/api/me', { token: a.token, body: { avatar: 'fox', flair: 'L-1A', name: 'Quiet Falcon' } })).user;
  assert.equal(me.avatar, 'fox'); assert.equal(me.flair, 'L-1A'); assert.equal(me.karma, 0);
  await assert.rejects(call('POST', '/api/me', { token: a.token, body: { avatar: 'https://example.com/me.png' } }), /built-in/, 'no photo uploads');
  await assert.rejects(call('POST', '/api/me', { token: a.token, body: { flair: 'Attorney' } }), /flair/);
  await assert.rejects(call('POST', '/api/me', { token: b.token, body: { name: 'deleted' } }), /official/);
  assert.equal(AVATARS.length, 24);
  const p = await post(a.token);
  const pb = await post(b.token);
  const cm = await say(a.token, pb.id, 'A helpful comment from the falcon.');
  await vote(b.token, 'posts', p.id, 1); await vote(c.token, 'posts', p.id, 1); await vote(c.token, 'comments', cm.id, 1); await vote(b.token, 'comments', cm.id, -1);
  const pr = await call('GET', `/api/forum/users/${a.user.id}`, { token: b.token });
  assert.deepEqual({ ...pr.user, createdAt: 0 }, { id: a.user.id, name: 'Quiet Falcon', avatar: 'fox', flair: 'L-1A', createdAt: 0, postKarma: 2, commentKarma: 0, posts: 1, comments: 1, karma: 2, mine: false });
  assert.ok(pr.user.createdAt.startsWith('2026-11-18'));
  assert.deepEqual(pr.posts.map((x) => x.id), [p.id]);
  assert.equal(pr.comments[0].id, cm.id); assert.equal(pr.comments[0].postTitle, pb.title);
  assert.ok(!JSON.stringify(pr).includes('provider') && !JSON.stringify(pr).includes('pushToken'));
  const feed = (await call('GET', '/api/forum/posts', {})).posts.find((x) => x.id === p.id);
  assert.deepEqual(feed.author, { id: a.user.id, name: 'Quiet Falcon', avatar: 'fox', flair: 'L-1A' }, 'avatar and flair travel with every post');
  assert.deepEqual((await call('GET', '/api/forum/posts', { query: Q({ author: a.user.id }) })).posts.map((x) => x.id), [p.id]);
  assert.equal((await call('GET', '/api/me', { token: a.token })).user.karma, 2);
  // blocked → profile shell only; banned → gone
  await call('POST', '/api/forum/blocks', { token: b.token, body: { userId: a.user.id } });
  const blocked = await call('GET', `/api/forum/users/${a.user.id}`, { token: b.token });
  assert.equal(blocked.blocked, true); assert.equal(blocked.posts.length, 0);
  await call('POST', '/api/admin/forum/ban', { token: ADMIN, body: { userId: a.user.id } });
  await assert.rejects(call('GET', `/api/forum/users/${a.user.id}`, {}), (e) => e.status === 404);
  await assert.rejects(call('GET', '/api/forum/users/u_nobody', {}), (e) => e.status === 404);
});

test('notifications: replies to you and upvote milestones, in the app and by push', async () => {
  const { call, user, post, say, vote, pushes, tick } = setup();
  const a = await user('a', { push: true }), b = await user('b', { push: true });
  const p = await post(a.token, { type: 'discussion', title: 'Discussion about travel during extension' });
  const c0 = await say(b.token, p.id, 'I travelled while mine was pending.');
  assert.equal(pushes.length, 1); assert.equal(pushes[0].title, 'New comment on your post'); assert.equal(pushes[0].data.url, `/community/post/${p.id}`);
  const r = await say(a.token, p.id, 'Did you need a new visa stamp?', c0.id);
  assert.equal(pushes.length, 2); assert.equal(pushes[1].title, 'New reply to your comment');
  await say(b.token, p.id, 'Talking to myself here.', c0.id);
  assert.equal(pushes.length, 2, 'no notification for replying to yourself');
  await say(b.token, p.id, 'Second top-level comment right away.');
  assert.equal(pushes.length, 2, 'push throttled per thread');
  const na = await call('GET', '/api/forum/notifications', { token: a.token });
  assert.equal(na.unread, 2, 'but the in-app list has both'); assert.equal(na.items[0].kind, 'reply'); assert.equal(na.items[0].postId, p.id);
  assert.equal((await call('GET', '/api/me', { token: a.token })).user.unread, 2);
  assert.equal((await call('POST', '/api/forum/notifications/read', { token: a.token })).unread, 0);
  assert.equal((await call('GET', '/api/forum/notifications', { token: a.token })).unread, 0);
  // milestone at 5 upvotes, once
  tick(3600_000);
  const voters = []; for (let i = 0; i < 6; i++) voters.push(await user(`v${i}`));
  for (const v of voters.slice(0, 4)) await vote(v.token, 'comments', r.id, 1);
  assert.equal(pushes.length, 2);
  await vote(voters[4].token, 'comments', r.id, 1);
  assert.equal(pushes.length, 3); assert.equal(pushes[2].title, '5 upvotes'); assert.match(pushes[2].body, /reached 5 upvotes/);
  await vote(voters[4].token, 'comments', r.id, 0); await vote(voters[4].token, 'comments', r.id, 1);
  assert.equal(pushes.length, 3, 'a milestone is announced once');
  assert.equal((await call('GET', '/api/forum/notifications', { token: a.token })).items[0].kind, 'milestone');
  // a blocked person can't notify you
  await call('POST', '/api/forum/blocks', { token: a.token, body: { userId: b.user.id } });
  tick(3600_000);
  await say(b.token, p.id, 'You will not hear about this one.');
  assert.equal(pushes.length, 3);
  await assert.rejects(call('GET', '/api/forum/notifications', {}), (e) => e.code === 'auth');
});

test('own comments: edit and delete; a deleted comment with replies stays as [deleted]; accepted answer', async () => {
  const { call, user, post, say } = setup();
  const a = await user('a'), b = await user('b');
  const p = await post(a.token);
  const c0 = await say(b.token, p.id, 'Top-level answer to accept.');
  const c1 = await say(a.token, p.id, 'A reply below it.', c0.id);
  await assert.rejects(call('POST', `/api/forum/comments/${c0.id}/edit`, { token: a.token, body: { body: 'Hijacked comment text' } }), /own posts/);
  const e = (await call('POST', `/api/forum/comments/${c0.id}/edit`, { token: b.token, body: { body: 'Top-level answer, edited.' } })).comment;
  assert.ok(e.editedAt); assert.equal(e.body, 'Top-level answer, edited.');
  await assert.rejects(call('POST', `/api/forum/posts/${p.id}/accept`, { token: a.token, body: { commentId: c1.id } }), /top-level/);
  assert.equal((await call('POST', `/api/forum/posts/${p.id}/accept`, { token: a.token, body: { commentId: c0.id } })).acceptedId, c0.id);
  const disc = await post(a.token, { type: 'discussion' });
  const dc = await say(b.token, disc.id, 'Comment on a discussion.');
  await assert.rejects(call('POST', `/api/forum/posts/${disc.id}/accept`, { token: a.token, body: { commentId: dc.id } }), /Only questions/);
  // delete with a reply below → stub; then the reply goes → the stub goes too
  await call('DELETE', `/api/forum/comments/${c0.id}`, { token: b.token });
  let d = await call('GET', `/api/forum/posts/${p.id}`, {});
  const stub = d.comments.find((x) => x.id === c0.id);
  assert.equal(stub.body, DELETED); assert.equal(stub.deleted, true); assert.deepEqual(stub.author, { id: null, name: DELETED, avatar: null, flair: null, deleted: true });
  assert.equal(d.post.accepted, false); assert.equal(d.post.comments, 1, 'stubs are not counted');
  await assert.rejects(call('POST', `/api/forum/comments/${c0.id}/edit`, { token: b.token, body: { body: 'Back from the dead' } }), (x) => x.status === 404);
  await call('DELETE', `/api/forum/comments/${c1.id}`, { token: a.token });
  d = await call('GET', `/api/forum/posts/${p.id}`, {});
  assert.equal(d.comments.length, 0, 'an empty [deleted] stub is cleaned up');
});

test('safety: report and block on comments and profiles; admin sees and acts on comments', async () => {
  const { call, user, post, say } = setup();
  const a = await user('a'), bad = await user('bad');
  const p = await post(a.token);
  const c0 = await say(bad.token, p.id, 'An off-topic comment that gets reported.');
  const c1 = await say(a.token, p.id, 'Reply under the reported comment.', c0.id);
  const reporters = []; for (let i = 0; i < HIDE_AFTER_REPORTS; i++) reporters.push(await user(`r${i}`));
  await assert.rejects(call('POST', '/api/forum/report', { token: bad.token, body: { kind: 'comment', id: c0.id, reason: 'spam' } }), /own post/);
  await call('POST', '/api/forum/report', { token: reporters[0].token, body: { kind: 'comment', id: c0.id, reason: 'off-topic' } });
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, { token: reporters[0].token })).comments.length, 0, 'reporter no longer sees it or its replies');
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).comments.length, 2);
  for (const r of reporters.slice(1)) await call('POST', '/api/forum/report', { token: r.token, body: { kind: 'answer', id: c0.id, reason: 'abuse' } });
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).comments.length, 0, 'hidden for everyone after 3 reports');
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, { token: bad.token })).comments[0].hidden, 'review', 'the author sees it is under review');
  // profile report
  await assert.rejects(call('POST', '/api/forum/report', { token: bad.token, body: { kind: 'user', id: bad.user.id, reason: 'abuse' } }), /yourself/);
  assert.deepEqual(await call('POST', '/api/forum/report', { token: a.token, body: { kind: 'user', id: bad.user.id, reason: 'abuse', note: 'rude name' } }), { ok: true, hidden: false });
  const rep = await call('GET', '/api/admin/forum/reports', { token: ADMIN });
  const rc = rep.items.find((x) => x.id === c0.id), ru = rep.items.find((x) => x.id === bad.user.id);
  assert.equal(rc.kind, 'comment'); assert.equal(rc.count, HIDE_AFTER_REPORTS); assert.equal(rc.postId, p.id); assert.match(rc.body, /off-topic comment/);
  assert.equal(ru.kind, 'user'); assert.equal(ru.title, bad.user.name);
  await call('POST', '/api/admin/forum/restore', { token: ADMIN, body: { kind: 'comment', id: c0.id } });
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).comments.length, 2);
  await call('POST', '/api/admin/forum/hide', { token: ADMIN, body: { kind: 'comment', id: c0.id } });
  assert.equal((await call('GET', `/api/forum/posts/${p.id}`, {})).comments.length, 0);
  await call('POST', '/api/admin/forum/delete', { token: ADMIN, body: { kind: 'comment', id: c0.id } });
  const d = await call('GET', `/api/forum/posts/${p.id}`, {});
  assert.equal(d.comments.find((x) => x.id === c0.id).body, '[removed by moderators]');
  assert.equal(d.comments.find((x) => x.id === c1.id).body, 'Reply under the reported comment.', 'the thread below survives');
  await call('POST', '/api/admin/forum/ban', { token: ADMIN, body: { userId: bad.user.id } });
  assert.ok(!(await call('GET', '/api/admin/forum/reports', { token: ADMIN })).items.some((x) => x.id === bad.user.id), 'profile reports resolved by the ban');
  // block hides a person's comments and the replies under them
  const b2 = await user('b2');
  const c2 = await say(b2.token, p.id, 'Comment from someone a will block.');
  await call('POST', '/api/forum/blocks', { token: a.token, body: { userId: b2.user.id } });
  assert.ok(!(await call('GET', `/api/forum/posts/${p.id}`, { token: a.token })).comments.some((x) => x.id === c2.id));
  await assert.rejects(say(a.token, p.id, 'Replying to a blocked person', c2.id), (e) => e.status === 404);
});

test('rate limits on comments and posts', async () => {
  const { user, post, say } = setup();
  const a = await user('a'), b = await user('b');
  const p = await post(a.token);
  for (let i = 0; i < 30; i++) await say(b.token, p.id, `Comment number ${i}`);
  await assert.rejects(say(b.token, p.id, 'Comment number 31'), (e) => e.status === 429 && e.code === 'rate');
  for (let i = 0; i < 4; i++) await post(a.token);
  await assert.rejects(post(a.token), (e) => e.status === 429);
});

test('migration: v2.4 answers become top-level comments; votes, accepted answer and reports carry over', async () => {
  const v1 = {
    v: 1,
    users: { u_a: { id: 'u_a', provider: 'apple', key: 'ka', name: 'Calm Maple 11', createdAt: '2026-10-01T00:00:00.000Z', rules: 1, banned: false, pushToken: null, refresh: null }, u_b: { id: 'u_b', provider: 'apple', key: 'kb', name: 'Swift Otter 22', createdAt: '2026-10-02T00:00:00.000Z', rules: 1, banned: false, pushToken: null, refresh: null } },
    byProvider: { ka: 'u_a', kb: 'u_b' }, sessions: {},
    posts: { p_1: { id: 'p_1', uid: 'u_a', title: 'H-1B extension stuck after RFE response', body: 'Filed I-129 extension at EAC, answered the RFE six weeks ago.', tags: ['H-1B'], createdAt: '2026-11-01T00:00:00.000Z', editedAt: null, score: 3, answerIds: ['a_1', 'a_2'], acceptedId: 'a_2', hidden: null, reviewedAt: null } },
    answers: { a_1: { id: 'a_1', postId: 'p_1', uid: 'u_b', body: 'Six to eight weeks is common.', createdAt: '2026-11-02T00:00:00.000Z', editedAt: null, score: 0, hidden: null, reviewedAt: null }, a_2: { id: 'a_2', postId: 'p_1', uid: 'u_b', body: 'Mine took seven weeks at EAC.', createdAt: '2026-11-03T00:00:00.000Z', editedAt: null, score: 2, hidden: null, reviewedAt: null } },
    votes: { 'u_b|p_1': 1, 'u_a|a_2': 1 }, reports: [{ rid: 'r_1', kind: 'answer', id: 'a_1', by: 'u_a', reason: 'spam', note: '', at: '2026-11-04T00:00:00.000Z', status: 'open' }], blocks: {}, bannedSubs: {}, messages: [],
  };
  const m = migrate(JSON.parse(JSON.stringify(v1)));
  assert.equal(m.v, 2); assert.equal(m.answers, undefined);
  assert.deepEqual(m.posts.p_1.commentIds, ['a_1', 'a_2']); assert.equal(m.posts.p_1.answerIds, undefined);
  assert.equal(m.posts.p_1.type, 'question'); assert.equal(m.posts.p_1.up, 3); assert.equal(m.posts.p_1.down, 0); assert.equal(m.posts.p_1.acceptedId, 'a_2');
  assert.equal(m.comments.a_2.parentId, null); assert.equal(m.comments.a_2.up, 2); assert.equal(m.comments.a_2.score, 2);
  assert.equal(m.reports[0].kind, 'comment');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(m))), m, 'running it again changes nothing');

  // through the real loader: old file on disk → new API shape, old ids still work
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forum-mig-'));
  const file = path.join(dir, 'forum.json');
  fs.writeFileSync(file, JSON.stringify(v1));
  const f = createForum({ file, flushMs: 1e9, adminToken: ADMIN, verifyApple: async (t) => ({ provider: 'apple', sub: t }) });
  const call = (method, p, o = {}) => f.route({ method, path: p, body: o.body || {}, token: o.token, query: o.query || Q(), ip: 'i' });
  const d = await call('GET', '/api/forum/posts/p_1');
  assert.equal(d.post.type, 'question'); assert.equal(d.post.comments, 2); assert.equal(d.post.answers, 2); assert.equal(d.post.accepted, true);
  assert.deepEqual(d.comments.map((c) => [c.id, c.parentId, c.depth]), [['a_1', null, 0], ['a_2', null, 0]]);
  assert.deepEqual(d.answers.map((a) => a.id), ['a_2', 'a_1']); assert.equal(d.comments[1].accepted, true);
  assert.equal((await call('GET', '/api/forum/users/u_b')).user.karma, 2);
  assert.equal((await call('GET', '/api/admin/forum/reports', { token: ADMIN })).items[0].kind, 'comment');
  f.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.v, 1, 'nothing is rewritten until something changes');
  fs.rmSync(dir, { recursive: true });
});

test('account deletion anonymises to [deleted] where others replied, removes the rest, keeps threads', async () => {
  const { call, user, post, say, vote, f } = setup();
  const gone = await user('gone', { push: true }), stay = await user('stay'), third = await user('third');
  await call('POST', '/api/me', { token: gone.token, body: { name: 'Leaving Soon', avatar: 'owl', flair: 'H-1B' } });
  const mine = await post(gone.token, { title: 'Post by the person who leaves' });          // has a reply from stay → stub
  const lonely = await post(gone.token, { title: 'Post nobody replied to at all' });        // → removed
  const poll = await post(stay.token, { type: 'poll', title: 'A poll that stays in place', body: '', poll: { options: ['Yes', 'No'] } });
  const theirs = await post(stay.token, { title: 'Post by the person who stays' });
  const kept = await say(stay.token, mine.id, 'Reply from someone who stays.');
  const top = await say(gone.token, theirs.id, 'Comment by the leaver with a reply below.');  // → stub
  const below = await say(third.token, theirs.id, 'Reply that must survive.', top.id);
  const leaf = await say(gone.token, theirs.id, 'Leaf comment by the leaver.');                // → removed
  await vote(gone.token, 'posts', theirs.id, 1); await vote(gone.token, 'comments', below.id, -1);
  await call('POST', `/api/forum/posts/${poll.id}/poll`, { token: gone.token, body: { option: 0 } });
  await call('POST', `/api/forum/posts/${theirs.id}/save`, { token: gone.token });
  await call('POST', `/api/forum/posts/${mine.id}/save`, { token: stay.token });
  await vote(stay.token, 'posts', mine.id, 1);

  assert.equal((await call('DELETE', '/api/me', { token: gone.token })).ok, true);
  const db = JSON.stringify(f._db());
  assert.ok(!db.includes(gone.user.id), 'no trace of the user id');
  assert.ok(!db.includes('Leaving Soon') && !db.includes('Post by the person who leaves') && !db.includes('Comment by the leaver') && !db.includes('Leaf comment'), 'no name and none of their words');
  assert.ok(!db.includes(PUSH));

  const a = await call('GET', `/api/forum/posts/${mine.id}`, {});
  assert.equal(a.post.title, DELETED); assert.equal(a.post.body, DELETED); assert.equal(a.post.deleted, true); assert.equal(a.post.author.name, DELETED); assert.equal(a.post.score, 0);
  assert.deepEqual(a.comments.map((c) => c.id), [kept.id], 'the reply from someone else is still there');
  await assert.rejects(call('GET', `/api/forum/posts/${lonely.id}`, {}), (e) => e.status === 404);
  const b = await call('GET', `/api/forum/posts/${theirs.id}`, {});
  assert.deepEqual(b.comments.map((c) => [c.id, c.body, c.author.name]), [[top.id, DELETED, DELETED], [below.id, 'Reply that must survive.', third.user.name]]);
  assert.equal(b.post.score, 0, 'their upvote is gone'); assert.equal(b.comments[1].score, 0, 'and their downvote');
  assert.ok(!b.comments.some((c) => c.id === leaf.id));
  assert.equal((await call('GET', `/api/forum/posts/${poll.id}`, {})).post.poll.total, 0, 'poll vote removed');
  const feed = await call('GET', '/api/forum/posts', {});
  assert.deepEqual(feed.posts.map((x) => x.id).sort(), [poll.id, theirs.id].sort(), '[deleted] posts leave the feed');
  assert.equal((await call('GET', '/api/forum/posts', { token: stay.token, query: Q({ saved: '1' }) })).total, 0);
  await assert.rejects(call('GET', `/api/forum/users/${gone.user.id}`, {}), (e) => e.status === 404);
  await assert.rejects(say(stay.token, mine.id, 'Commenting on a deleted post'), (e) => e.status === 404, 'a [deleted] post is closed');
  // when the last reply under a stub goes, the stub goes too
  await call('DELETE', `/api/forum/comments/${below.id}`, { token: third.token });
  assert.equal((await call('GET', `/api/forum/posts/${theirs.id}`, {})).comments.length, 0);
  await call('DELETE', `/api/forum/comments/${kept.id}`, { token: stay.token });
  await assert.rejects(call('GET', `/api/forum/posts/${mine.id}`, {}), (e) => e.status === 404, 'and an empty [deleted] post');
  // signing in again makes a brand-new member
  const again = await user('gone');
  assert.notEqual(again.user.id, gone.user.id); assert.equal(again.user.karma, 0);
});

test('deleting your own post keeps the thread when others commented', async () => {
  const { call, user, post, say } = setup();
  const a = await user('a'), b = await user('b');
  const p = await post(a.token);
  await say(a.token, p.id, 'My own follow-up only.');
  const q = await post(a.token);
  const cb = await say(b.token, q.id, 'A comment from someone else.');
  await call('DELETE', `/api/forum/posts/${p.id}`, { token: a.token });
  await assert.rejects(call('GET', `/api/forum/posts/${p.id}`, {}), (e) => e.status === 404);
  await call('DELETE', `/api/forum/posts/${q.id}`, { token: a.token });
  const d = await call('GET', `/api/forum/posts/${q.id}`, {});
  assert.equal(d.post.title, DELETED); assert.deepEqual(d.comments.map((c) => c.id), [cb.id]);
  await assert.rejects(call('POST', `/api/forum/posts/${q.id}/edit`, { token: a.token, body: { title: 'Bring it back please', body: 'x'.repeat(30), tags: ['TN'] } }), (e) => e.status === 404);
});

test('google: client id comes from the environment, or from deploy.conf; aud is checked against it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  const file = path.join(dir, 'deploy.conf');
  const ID = '1234-abcd.apps.googleusercontent.com', OTHER = '9999-zzzz.apps.googleusercontent.com';
  assert.deepEqual(googleAudiences({ env: {}, file: path.join(dir, 'missing.conf') }), [], 'no file → off');
  fs.writeFileSync(file, '# public settings\nCASEDESK_DOMAIN=example.org\nGOOGLE_CLIENT_ID=\n');
  assert.deepEqual(googleAudiences({ env: {}, file }), [], 'empty line → off');
  fs.writeFileSync(file, `# public settings\nCASEDESK_DOMAIN=example.org\n#GOOGLE_CLIENT_ID=commented.apps.googleusercontent.com\nGOOGLE_CLIENT_ID="${ID}"\r\n`);
  assert.equal(readConf('GOOGLE_CLIENT_ID', file), ID);
  assert.equal(readConf('CASEDESK_DOMAIN', file), 'example.org');
  assert.deepEqual(googleAudiences({ env: {}, file }), [ID]);
  assert.deepEqual(googleAudiences({ env: { GOOGLE_CLIENT_ID: ` ${OTHER} , ${ID}` }, file }), [OTHER, ID], 'the environment wins');
  assert.deepEqual(googleAudiences({ env: { GOOGLE_CLIENT_ID: 'not-a-client-id' }, file }), [], 'junk is ignored');

  const p = fakeProvider('g1');
  const verify = googleVerifier({ jwks: createJwks('x', { fetchFn: p.fetchFn }), audiences: googleAudiences({ env: {}, file }) });
  const base = { iss: 'https://accounts.google.com', sub: '1098', exp: nowS() + 600, iat: nowS(), email: 'someone@example.com' };
  assert.deepEqual(await verify(p.sign({ ...base, aud: ID })), { provider: 'google', sub: '1098' });
  await assert.rejects(verify(p.sign({ ...base, aud: OTHER })), /another app/, 'a token for another Google client is refused');
  await assert.rejects(verify(p.sign({ ...base, aud: ID, iss: 'https://evil.example' })), /wrong issuer/);
  const off = googleVerifier({ jwks: createJwks('x', { fetchFn: p.fetchFn }), audiences: googleAudiences({ env: {}, file: path.join(dir, 'missing.conf') }) });
  await assert.rejects(off(p.sign({ ...base, aud: ID })), /not set up/);
  // end to end through the forum: Google account → pseudonymous member
  const f = createForum({ verifyGoogle: verify, verifyApple: async () => { throw new Error('no'); } });
  const r = await f.route({ method: 'POST', path: '/api/auth/google', body: { idToken: p.sign({ ...base, aud: ID }) }, query: Q(), ip: 'i' });
  assert.equal(r.user.provider, 'google'); assert.ok(!JSON.stringify(f._db()).includes('someone@example.com'));
  fs.rmSync(dir, { recursive: true });
});

test('the real deploy.conf keeps Google sign-in off until a client id is pasted', () => {
  assert.equal(readConf('CASEDESK_DOMAIN'), 'casedeskapp.duckdns.org');
  const ids = googleAudiences({ env: {} });
  assert.ok(ids.every((x) => x.endsWith('.apps.googleusercontent.com')));
});
