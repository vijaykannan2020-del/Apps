// Community v2.7 (Reddit-style) app logic: avatars and pastels, votes, comment threads (tree, sort,
// collapse), feed sort / query / paging, polls, timeline shares, drafts per post type, share links,
// keeping lists in step, the Google button guard, and the "one tip on the feed" rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {
  AVATARS, FLAIRS, MAX_DEPTH, POST_TYPES, SORTS, applyVote, avatarOf, buildTree, byline, commentProblem, countReplies, daysBetween, draftProblem, feedQuery, fmtCount, googleRedirect, hotScore,
  initials, joined, mergePage, nextVote, pastelFor, pollPercents, postIdFromLink, postLink, reversedClientId, shareText, threadRows, timelineProblem, timelineTitle, timelineView, typeLabel,
} from '../src/core/community';
import { INK, PASTEL, PASTEL_NAMES } from '../src/core/communityColors';
import { contrast } from '../src/ui/tokens';
import { TOURS } from '../src/content/tours';

const S = require(path.join(__dirname, 'stubs/community-modules.cjs'));
const M = Module as any;
const virtual: Record<string, any> = { 'expo-constants': S.constants, 'expo-apple-authentication': S.apple };
const origLoad = M._load, origResolve = M._resolveFilename;
M._load = function (req: string, ...a: any[]) {
  if (req in virtual) return virtual[req];
  if (req === '@react-native-async-storage/async-storage' || req === 'expo-secure-store' || req === 'expo-notifications') throw new Error('not in tests');
  return origLoad.call(this, req, ...a);
};
M._resolveFilename = function (req: string, ...a: any[]) { return req === 'react-native' ? path.join(__dirname, 'stubs/react-native.cjs') : origResolve.call(this, req, ...a); };

test('pastels: the four colours live in one file and carry dark ink at AA contrast', () => {
  assert.deepEqual(PASTEL, { sage: '#A9CDB9', blush: '#F8D2D3', butter: '#FDD78C', sky: '#BFD9F8' });
  assert.equal(INK, '#1D2A24');
  for (const n of PASTEL_NAMES) assert.ok(contrast(INK, PASTEL[n]) >= 4.5, `${n}: ${contrast(INK, PASTEL[n]).toFixed(2)}`);
  // …and nowhere else: screens import them instead of repeating the hex values
  const dir = path.join(__dirname, '..', 'src');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const offenders = walk(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('communityColors.ts') && /#(A9CDB9|F8D2D3|FDD78C|BFD9F8|1D2A24)/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(dir, f)), []);
});

test('avatars: initials on a stable pastel, or one of 24 built-in avatars; [deleted] has neither', () => {
  assert.equal(initials('Quiet Falcon 42'), 'QF');
  assert.equal(initials('dallasdad'), 'DA');
  assert.equal(initials('Bright_River-7'), 'BR');
  assert.equal(initials('[deleted]'), 'DE');
  assert.equal(initials('42'), '–');
  assert.equal(AVATARS.length, 24);
  assert.equal(new Set(AVATARS.map((a) => a.id)).size, 24);
  const a = { id: 'u_1', name: 'Quiet Falcon 42', avatar: null, flair: 'L-1A' };
  assert.deepEqual(avatarOf(a), { pastel: pastelFor('u_1'), text: 'QF', emoji: false });
  assert.equal(avatarOf(a).pastel, avatarOf({ ...a, name: 'Renamed Person' }).pastel, 'colour follows the account, not the name');
  assert.deepEqual(avatarOf({ ...a, avatar: 'fox' }), { pastel: pastelFor('u_1'), text: '🦊', emoji: true });
  assert.equal(avatarOf({ ...a, avatar: 'not-a-real-one' }).text, 'QF', 'unknown avatar id falls back to initials');
  const spread = new Set(Array.from({ length: 40 }, (_, i) => pastelFor(`u_${i}`)));
  assert.equal(spread.size, 4, 'all four pastels get used');
  const now = Date.parse('2026-11-18T12:00:00Z');
  assert.equal(byline(a, '2026-11-18T10:00:00Z', now), 'Quiet Falcon 42 · L-1A · 2 h');
  assert.equal(byline({ id: null, name: '[deleted]', flair: 'H-1B', deleted: true }, '2026-11-18T10:00:00Z', now), '[deleted] · 2 h');
  assert.equal(joined('2026-11-18T10:00:00Z'), 'Joined Nov 2026');
  assert.ok(FLAIRS.includes('L-1A'));
  assert.equal(fmtCount(999), '999'); assert.equal(fmtCount(1200), '1.2k'); assert.equal(fmtCount(2000), '2k'); assert.equal(fmtCount(15300), '15k'); assert.equal(fmtCount(-3), '-3');
});

test('votes: tap again clears, the other arrow switches; the score moves at once', () => {
  assert.equal(nextVote(0, 1), 1); assert.equal(nextVote(1, 1), 0); assert.equal(nextVote(1, -1), -1); assert.equal(nextVote(-1, -1), 0); assert.equal(nextVote(-1, 1), 1);
  const p = { id: 'p', score: 10, myVote: 0 as const, voted: false };
  assert.deepEqual(applyVote(p, 1), { id: 'p', score: 11, myVote: 1, voted: true });
  assert.deepEqual(applyVote(applyVote(p, 1), -1), { id: 'p', score: 9, myVote: -1, voted: false });
  assert.deepEqual(applyVote(applyVote(p, -1), 0), { id: 'p', score: 10, myVote: 0, voted: false });
});

const c = (id: string, parentId: string | null, up: number, down: number, min: number, accepted = false) => ({ id, parentId, up, down, score: up - down, createdAt: `2026-11-18T12:${String(min).padStart(2, '0')}:00Z`, accepted });
const THREAD = [c('a', null, 1, 0, 1), c('b', null, 40, 4, 2), c('c', null, 3, 3, 3), c('d', null, 0, 0, 4, true), c('b1', 'b', 0, 0, 5), c('b2', 'b', 5, 0, 6), c('b2x', 'b2', 1, 0, 7), c('b2y', 'b2x', 0, 0, 8), c('lost', 'gone', 9, 0, 9)];

test('comment threads: tree, Best and New sort, depth, orphans dropped', () => {
  const best = buildTree(THREAD, 'best');
  assert.deepEqual(best.map((n) => n.id), ['d', 'b', 'a', 'c'], 'accepted first, then confidence in the votes');
  assert.deepEqual(best[1].replies.map((n) => n.id), ['b2', 'b1']);
  assert.equal(best[1].replies[0].replies[0].replies[0].id, 'b2y');
  assert.equal(best[1].replies[0].replies[0].replies[0].depth, 3);
  assert.equal(countReplies(best[1]), 4);
  assert.deepEqual(buildTree(THREAD, 'new').map((n) => n.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(buildTree(THREAD, 'new')[2].replies.map((n) => n.id), ['b2', 'b1']);
  assert.ok(!JSON.stringify(best).includes('"lost"'), 'a reply whose parent is hidden is not shown');
  assert.deepEqual(buildTree([]), []);
  assert.equal(THREAD[0].parentId, null, 'input is not changed');
});

test('comment threads: rows to draw, collapse hides the replies below and says how many', () => {
  const tree = buildTree(THREAD, 'best');
  const open = threadRows(tree, new Set());
  assert.deepEqual(open.map((r) => `${r.c.id}:${r.depth}`), ['d:0', 'b:0', 'b2:1', 'b2x:2', 'b2y:3', 'b1:1', 'a:0', 'c:0']);
  assert.ok(open.every((r) => r.depth < MAX_DEPTH && !r.collapsed && r.hidden === 0));
  const shut = threadRows(tree, new Set(['b']));
  assert.deepEqual(shut.map((r) => r.c.id), ['d', 'b', 'a', 'c']);
  assert.deepEqual(shut[1], { c: tree[1], depth: 0, collapsed: true, hidden: 4 });
  assert.deepEqual(threadRows(tree, new Set(['b2'])).map((r) => r.c.id), ['d', 'b', 'b2', 'b1', 'a', 'c']);
  assert.match(commentProblem(' ')!, /Write a comment/);
  assert.equal(commentProblem('Thanks!'), null);
  assert.match(commentProblem('my A-number is A123456789')!, /personal numbers/);
});

test('feed: hot ranks like the server, query string for every sort, pages merge without repeats', () => {
  const t = Date.parse('2026-11-18T12:00:00Z');
  assert.ok(hotScore(100, 0, t) > hotScore(10, 0, t));
  assert.ok(hotScore(10, 0, t + 13 * 3600_000) > hotScore(100, 0, t), 'a newer post overtakes 10x the votes after ~12.5 h');
  assert.ok(hotScore(-5, 0, t) < hotScore(0, 0, t));
  assert.equal(hotScore(0, 0, 45_000_000), 1);
  assert.deepEqual(SORTS.map((s) => s.id), ['hot', 'new', 'top', 'unanswered']);
  assert.equal(feedQuery({ tab: 'All', famTags: [], sort: 'hot' }), '?sort=hot');
  assert.equal(feedQuery({ tab: 'All', famTags: [], sort: 'top', range: 'week' }), '?sort=top&t=week');
  assert.equal(feedQuery({ tab: 'All', famTags: [], sort: 'top', range: 'all' }), '?sort=top');
  assert.equal(feedQuery({ tab: 'All', famTags: [], sort: 'new', range: 'day' }), '?sort=new', 'the range only applies to Top');
  assert.equal(feedQuery({ tab: 'For my visa', famTags: ['L-1', 'I-129'], sort: 'unanswered', q: 'premium', cursor: '20' }), '?sort=unanswered&tags=L-1%2CI-129&q=premium&cursor=20');
  const page1 = [{ id: 'a' }, { id: 'b' }], page2 = [{ id: 'b' }, { id: 'c' }];
  assert.deepEqual(mergePage(page1, page2), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('polls: percentages add up to 100; nothing before the first vote', () => {
  assert.deepEqual(pollPercents([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(pollPercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(pollPercents([2, 1]), [67, 33]);
  assert.deepEqual(pollPercents([5, 0, 0, 0]), [100, 0, 0, 0]);
  for (const v of [[3, 4, 5, 1], [7, 7, 7], [1, 2]]) assert.equal(pollPercents(v).reduce((a, b) => a + b, 0), 100);
});

const TL = { form: 'I-765', office: 'IOE', premium: false, steps: [{ label: 'Approved', date: '2026-11-03' }, { label: 'Filed', date: '2026-08-14' }, { label: 'Biometrics', date: '2026-09-02' }] };
test('timeline share: steps in date order with the days between, total, outcome, suggested title', () => {
  const v = timelineView(TL);
  assert.deepEqual(v.rows, [{ label: 'Filed', date: '2026-08-14', gap: null }, { label: 'Biometrics', date: '2026-09-02', gap: 19 }, { label: 'Approved', date: '2026-11-03', gap: 62 }]);
  assert.equal(v.totalDays, 81); assert.equal(v.outcome, 'approved');
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2, 'no daylight-saving surprises');
  assert.equal(timelineView({ ...TL, steps: [{ label: 'Filed', date: '2026-08-14' }, { label: 'Denied', date: '2026-08-20' }] }).outcome, 'denied');
  assert.equal(timelineView({ ...TL, steps: [{ label: 'Filed', date: '2026-08-14' }, { label: 'RFE received', date: '2026-08-20' }] }).outcome, 'pending');
  assert.equal(timelineTitle(TL), 'I-765 at IOE: filed Aug 2026, approved Nov 2026 (81 days)');
  const today = '2026-11-18';
  assert.equal(timelineProblem(TL, today), null);
  assert.match(timelineProblem({ ...TL, form: '' }, today)!, /form/);
  assert.match(timelineProblem({ ...TL, office: '' }, today)!, /office/);
  assert.match(timelineProblem({ ...TL, steps: TL.steps.slice(0, 1) }, today)!, /at least 2/);
  assert.match(timelineProblem({ ...TL, steps: [...TL.steps, { label: 'Card received', date: '2027-01-01' }] }, today)!, /future/);
  assert.match(timelineProblem({ ...TL, steps: [...TL.steps, { label: 'Filed', date: '2026-08-15' }] }, today)!, /once/);
  assert.match(timelineProblem({ ...TL, steps: [...TL.steps, { label: 'Interview', date: '' }] }, today)!, /name and a date/);
  assert.match(timelineProblem({ ...TL, steps: [...TL.steps, { label: 'Interview', date: '11/03/2026' }] }, today)!, /YYYY-MM-DD/);
});

test('drafts per post type mirror the server', () => {
  const base = { title: 'How long did your STEM OPT approval take?', body: '', tags: ['STEM OPT'] };
  assert.match(draftProblem({ ...base, type: 'question' })!, /detail/);
  assert.match(draftProblem({ ...base, type: 'discussion' })!, /detail/);
  assert.match(draftProblem({ ...base, type: 'poll', poll: ['Only one'] })!, /at least 2 options/);
  assert.match(draftProblem({ ...base, type: 'poll', poll: ['a', 'b', 'c', 'd', 'e'] })!, /at most 4/);
  assert.match(draftProblem({ ...base, type: 'poll', poll: ['Same', 'same'] })!, /different/);
  assert.match(draftProblem({ ...base, type: 'poll', poll: ['Under 2 months', 'email me a@b.co'] })!, /emails/);
  assert.equal(draftProblem({ ...base, type: 'poll', poll: ['Under 2 months', 'Over 2 months'] }), null, 'a poll needs no details');
  assert.equal(draftProblem({ ...base, type: 'timeline', timeline: TL }, '2026-11-18'), null);
  assert.match(draftProblem({ ...base, type: 'timeline', timeline: { ...TL, steps: [] } }, '2026-11-18')!, /at least 2/);
  assert.match(draftProblem({ ...base, type: 'timeline', timeline: TL, tags: [] }, '2026-11-18')!, /tag/);
  assert.equal(draftProblem({ title: '', body: '', tags: [], repost: true }), null, 'a repost can go out with no comment');
  assert.match(draftProblem({ title: '', body: 'call 214-555-0188', tags: [], repost: true })!, /phone/);
  assert.deepEqual(POST_TYPES.map((t) => t.id), ['question', 'discussion', 'timeline', 'poll']);
  assert.equal(typeLabel('poll'), 'Poll'); assert.equal(typeLabel('whatever'), 'Post');
});

test('share: title + in-app link; links open the right post', () => {
  assert.equal(postLink('p_AbC-12'), 'casedesk://community/post/p_AbC-12');
  assert.equal(shareText({ id: 'p_AbC-12', title: 'L-1A extension filed 6 months early' }), 'L-1A extension filed 6 months early\ncasedesk://community/post/p_AbC-12');
  assert.equal(postIdFromLink('casedesk://community/post/p_AbC-12'), 'p_AbC-12');
  assert.equal(postIdFromLink('/community/post/p_AbC-12?x=1'), 'p_AbC-12');
  assert.equal(postIdFromLink('https://casedeskapp.duckdns.org/community/post/p_AbC-12'), 'p_AbC-12');
  assert.equal(postIdFromLink('casedesk://community/account'), null);
  assert.equal(postIdFromLink('https://evil.example/?next=community/post/p_1'), null);
  // the route file that the casedesk:// link lands on exists
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'app', 'community', 'post', '[id].tsx')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo.scheme, 'casedesk');
});

test('lists stay in step: a vote on the post page updates the card; a deleted post leaves every list', () => {
  const api = require('../src/data/communityApi') as typeof import('../src/data/communityApi');
  const p = (id: string, score: number) => ({ id, score, excerpt: `excerpt ${id}`, title: id } as any);
  const list = [p('a', 1), p('b', 2)];
  const voted = api.applyBus(list, { kind: 'post', post: { ...p('b', 3), excerpt: 'FULL BODY', myVote: 1 } as any });
  assert.equal(voted[1].score, 3); assert.equal((voted[1] as any).myVote, 1); assert.equal(voted[1].excerpt, 'excerpt b', 'the card keeps its short preview');
  assert.equal(api.applyBus(list, { kind: 'post', post: p('zzz', 9) }), list, 'unknown post: same list object, no re-render');
  assert.deepEqual(api.applyBus(list, { kind: 'removed', id: 'a' }).map((x) => x.id), ['b']);
  assert.equal(api.applyBus(list, { kind: 'removed', id: 'zzz' }), list);
});

test('API client: new endpoints and payloads', async () => {
  const api = require('../src/data/communityApi') as typeof import('../src/data/communityApi');
  const calls: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => { calls.push({ url: url.replace('https://api.test', ''), method: init.method, body: init.body ? JSON.parse(init.body) : undefined }); return { ok: true, status: 200, json: async () => ({}) }; };
  await api.vote('post', 'p_1', -1);
  await api.vote('comment', 'c_1', 0);
  await api.postComment('p_1', 'A reply', 'c_1');
  await api.postComment('p_1', 'Top level');
  await api.votePoll('p_1', 2);
  await api.savePost('p_1', false);
  await api.repost('p_1', 'Worth a read');
  await api.acceptAnswer('p_1', 'c_1');
  await api.report('user', 'u_9', 'abuse');
  await api.getProfile('u_9');
  await api.updateMe({ avatar: 'fox', flair: 'L-1A' }).catch(() => {});
  await api.createPost({ title: 't', body: '', tags: ['OPT'], type: 'poll', poll: { options: ['a', 'b'] } });
  assert.deepEqual(calls.map((x) => [x.method, x.url, x.body]), [
    ['POST', '/api/forum/posts/p_1/vote', { dir: -1 }],
    ['POST', '/api/forum/comments/c_1/vote', { dir: 0 }],
    ['POST', '/api/forum/posts/p_1/comments', { body: 'A reply', parentId: 'c_1' }],
    ['POST', '/api/forum/posts/p_1/comments', { body: 'Top level' }],
    ['POST', '/api/forum/posts/p_1/poll', { option: 2 }],
    ['POST', '/api/forum/posts/p_1/save', { on: false }],
    ['POST', '/api/forum/posts', { repostOf: 'p_1', body: 'Worth a read' }],
    ['POST', '/api/forum/posts/p_1/accept', { commentId: 'c_1' }],
    ['POST', '/api/forum/report', { kind: 'user', id: 'u_9', reason: 'abuse' }],
    ['GET', '/api/forum/users/u_9', undefined],
    ['POST', '/api/me', { avatar: 'fox', flair: 'L-1A' }],
    ['POST', '/api/forum/posts', { title: 't', body: '', tags: ['OPT'], type: 'poll', poll: { options: ['a', 'b'] } }],
  ]);
});

const ID = '1234-abcd.apps.googleusercontent.com', SCHEME = 'com.googleusercontent.apps.1234-abcd';
test('Google button: hidden until a client id is set AND this installed build has the URL scheme', async () => {
  assert.equal(reversedClientId(ID), SCHEME);
  assert.equal(reversedClientId(''), null); assert.equal(reversedClientId('not an id'), null); assert.equal(reversedClientId(undefined), null);
  const base = { platform: 'ios', iosClientId: ID, hasModule: true, schemeInBuild: true, bundleId: 'com.vijaykannan.casedesk' };
  assert.deepEqual(googleRedirect(base), { show: true, redirectUri: `${SCHEME}:/oauthredirect` });
  assert.deepEqual(googleRedirect({ ...base, schemeInBuild: false }), { show: false }, 'an over-the-air update on the old build hides the button');
  assert.deepEqual(googleRedirect({ ...base, schemeInBuild: false, allowBundleScheme: true }), { show: true, redirectUri: 'com.vijaykannan.casedesk:/oauthredirect' }, 'opt-in for the current build');
  assert.deepEqual(googleRedirect({ ...base, iosClientId: '' }), { show: false });
  assert.deepEqual(googleRedirect({ ...base, hasModule: false }), { show: false });
  assert.deepEqual(googleRedirect({ ...base, platform: 'android' }), { show: false });
  assert.deepEqual(googleRedirect({ ...base, platform: 'web' }), { show: false });
  assert.deepEqual(googleRedirect({ ...base, platform: 'web', webClientId: 'w.apps.googleusercontent.com' }), { show: true });

  // the real wiring: app.json extra → googleConfig → Linking.canOpenURL → googleSupport
  const auth = require('../src/data/communityAuth') as typeof import('../src/data/communityAuth');
  virtual['expo-auth-session/providers/google'] = { useIdTokenAuthRequest: () => [null, null, () => {}] };
  const extra = S.constants.default.expoConfig.extra;
  assert.equal(auth.googleConfig(), null); assert.equal(await auth.googleSupport(), null, 'no client id → no button');
  extra.googleIosClientId = ID;
  (globalThis as any).__canOpen = new Set();
  assert.equal(await auth.googleSupport(), null, 'client id set but the installed build lacks the scheme → no button');
  (globalThis as any).__canOpen = new Set([SCHEME]);
  assert.deepEqual(await auth.googleSupport(), { iosClientId: ID, webClientId: undefined, redirectUri: `${SCHEME}:/oauthredirect` });
  delete virtual['expo-auth-session/providers/google'];
  const prev = M._load;
  M._load = function (req: string, ...a: any[]) { if (req === 'expo-auth-session/providers/google') throw new Error('Cannot find native module'); return prev.call(this, req, ...a); };
  try { assert.equal(await auth.googleSupport(), null, 'module missing → no button'); } finally { M._load = prev; }
  delete extra.googleIosClientId; delete (globalThis as any).__canOpen;
});

test('Google config plugin: adds the reversed-client-id scheme only when a client id is set', () => {
  const plugin = require('../plugins/withGoogleSignIn.js');
  assert.equal(plugin.reversed(ID), SCHEME);
  const none = { name: 'x', slug: 'x', extra: { googleIosClientId: '' } };
  assert.equal(plugin(none), none, 'no id → config untouched');
  const withId: any = plugin({ name: 'x', slug: 'x', extra: { googleIosClientId: ID } });
  assert.ok(withId.mods?.ios?.infoPlist, 'an Info.plist change is queued for the next build');
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
  assert.ok(cfg.plugins.includes('./plugins/withGoogleSignIn'));
  assert.ok('googleIosClientId' in cfg.extra, 'the place to paste the client id exists');
  assert.equal(reversedClientId(cfg.extra.googleIosClientId) === null, cfg.extra.googleIosClientId === '', 'empty, or a real client id');
});

test('tips: exactly one first-visit tip on the feed; other community screens only show tips from their ?', () => {
  assert.equal(TOURS.communityFeed.steps.length, 1);
  assert.ok(TOURS.communityFeed.steps[0].text.length <= 150);
  const dir = path.join(__dirname, '..', 'src', 'screens');
  const src = fs.readdirSync(dir).filter((f) => /^community.*\.tsx$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const uses = [...src.matchAll(/use(?:Sheet)?Tour\('(\w+)'([^)]*)\)/g)].map((m) => ({ id: m[1], args: m[2] }));
  assert.ok(uses.length >= 6, `found ${uses.length}`);
  for (const u of uses) if (u.id !== 'communityFeed') assert.match(u.args, /auto: false/, `${u.id} must not auto-show`);
  assert.ok(uses.some((u) => u.id === 'communityFeed' && !/auto: false/.test(u.args)));
});
