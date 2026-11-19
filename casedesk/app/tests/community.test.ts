// Community Q&A (v2.4): tag logic, draft checks, feed queries, error handling, the API client
// (session token, 401 sign-out) and Sign in with Apple (nonce, no name/email requested).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  familyCommunityTags, orderedTags, toggleTag, draftProblem, answerProblem, nameProblem, privacyProblem, timeAgo, feedQuery, errorAction, ALL_TAGS, MAX_TAGS, COMMUNITY_RULES,
} from '../src/core/community';

const stubPath = path.join(__dirname, 'stubs/community-modules.cjs');
const S = require(stubPath);
const M = Module as any;
const orig = M._resolveFilename;
const virtual: Record<string, any> = { 'expo-constants': S.constants, 'expo-apple-authentication': S.apple };
const origLoad = M._load;
M._load = function (req: string, ...a: any[]) {
  if (req in virtual) return virtual[req];
  if (req === '@react-native-async-storage/async-storage' || req === 'expo-secure-store' || req === 'expo-notifications') throw new Error('not in tests');
  return origLoad.call(this, req, ...a);
};
M._resolveFilename = function (req: string, ...a: any[]) { return req === 'react-native' ? path.join(__dirname, 'stubs/react-native.cjs') : orig.call(this, req, ...a); };

test('family tags: dependants map to the principal visa, case forms added, unknowns dropped, max 8', () => {
  assert.deepEqual(familyCommunityTags(['H-1B', 'H-4', undefined], ['I-129', 'I539', 'X-1']), ['H-1B', 'H-4', 'I-129', 'I-539']);
  assert.deepEqual(familyCommunityTags(['L-2S']), ['L-2', 'L-1']);
  assert.deepEqual(familyCommunityTags(['Green card pending']), ['Green card', 'I-485']);
  assert.deepEqual(familyCommunityTags(['US citizen']), []);
  assert.ok(familyCommunityTags(['H-1B', 'L-1A', 'TN', 'F-1 OPT', 'STEM OPT', 'O-1', 'E-3'], ['I-140', 'I-485']).length <= 8);
});

test('composer tags: family first, all tags once, at most 5', () => {
  const o = orderedTags(['I-129', 'H-1B']);
  assert.deepEqual(o.slice(0, 2), ['I-129', 'H-1B']);
  assert.equal(new Set(o).size, ALL_TAGS.length);
  let list: string[] = [];
  for (const t of ALL_TAGS.slice(0, 7)) list = toggleTag(list, t);
  assert.equal(list.length, MAX_TAGS);
  assert.deepEqual(toggleTag(list, list[0]), list.slice(1));
});

test('draft checks mirror the server limits and privacy rules', () => {
  const ok = { title: 'H-1B transfer while extension pending', body: 'My extension is pending at WAC, can a new employer file a transfer now?', tags: ['H-1B'] };
  assert.equal(draftProblem(ok), null);
  assert.match(draftProblem({ ...ok, title: 'short' })!, /Title/);
  assert.match(draftProblem({ ...ok, body: 'too short' })!, /detail/);
  assert.match(draftProblem({ ...ok, tags: [] })!, /tag/);
  assert.match(draftProblem({ ...ok, body: ok.body + ' Receipt WAC2612345678' })!, /receipt number/);
  assert.match(privacyProblem('reach me at a@b.co')!, /emails/);
  assert.equal(privacyProblem('Filed on 2026-03-14 at EAC, I-129'), null);
  assert.match(answerProblem('ok')!, /at least/);
  assert.equal(answerProblem('Took 9 weeks for me at EAC.'), null);
  assert.equal(nameProblem('Calm Falcon 42'), null);
  assert.ok(nameProblem('x'));
  assert.ok(nameProblem('<script>'));
  assert.ok(COMMUNITY_RULES.some((r) => /not lawyers/.test(r)));
});

test('feed query: tab, chip, search, cursor', () => {
  assert.equal(feedQuery({ tab: 'All', famTags: ['H-1B'] }), '?sort=new');
  assert.equal(feedQuery({ tab: 'For my visa', famTags: ['H-1B', 'H-4'] }), '?sort=new&tags=H-1B%2CH-4');
  assert.equal(feedQuery({ tab: 'For my visa', famTags: ['H-1B'], tag: 'RFE' }), '?sort=new&tags=RFE');
  assert.equal(feedQuery({ tab: 'Unanswered', famTags: [], q: ' stamping chennai ', cursor: '20' }), '?sort=unanswered&q=stamping%20chennai&cursor=20');
});

test('time ago and error actions', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  assert.equal(timeAgo('2026-11-18T11:59:30Z', now), 'just now');
  assert.equal(timeAgo('2026-11-18T11:15:00Z', now), '45 min');
  assert.equal(timeAgo('2026-11-18T07:00:00Z', now), '5 h');
  assert.equal(timeAgo('2026-11-15T12:00:00Z', now), '3 d');
  assert.equal(timeAgo('2026-03-04T12:00:00Z', now), 'Mar 4');
  assert.equal(timeAgo('2025-03-04T12:00:00Z', now), 'Mar 4, 2025');
  assert.equal(errorAction({ status: 401, code: 'auth' }), 'signin');
  assert.equal(errorAction({ status: 403, code: 'rules' }), 'rules');
  assert.equal(errorAction({ status: 403, code: 'banned' }), 'banned');
  assert.equal(errorAction({ status: 0 }), 'retry');
  assert.equal(errorAction({ status: 400 }), 'show');
});

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
function mockFetch(handler: (c: Call) => { status?: number; body: any }) {
  const calls: Call[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const c = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(c);
    const r = handler(c);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body };
  };
  return calls;
}
const USER = { id: 'u_1', name: 'Calm Falcon 42', provider: 'apple', createdAt: '2026-11-18T00:00:00Z', rulesAccepted: false, rulesVersion: 1, banned: false, notify: false };

test('Sign in with Apple: hashed nonce to Apple, raw nonce + token to the server, no scopes; session sent as Bearer; 401 signs out', async () => {
  const api = require('../src/data/communityApi') as typeof import('../src/data/communityApi');
  const auth = require('../src/data/communityAuth') as typeof import('../src/data/communityAuth');
  assert.equal(await auth.appleSupport(), 'ok');
  S.state.appleResult = { identityToken: 'id.tok.en', authorizationCode: 'code1' };
  const calls = mockFetch((c) => (c.url.endsWith('/api/auth/apple') ? { body: { token: 'sess-1', user: USER } } : c.url.endsWith('/api/me') ? { body: { user: { ...USER, rulesAccepted: true } } } : { status: 401, body: { error: 'Sign in to do that.', code: 'auth' } }));
  assert.equal(await auth.signInWithApple(), true);
  const sent = calls[0].body;
  assert.equal(calls[0].url, 'https://api.test/api/auth/apple');
  assert.equal(sent.identityToken, 'id.tok.en');
  assert.equal(sent.authorizationCode, 'code1');
  assert.equal(S.state.lastNonce, bytesToHex(sha256(utf8ToBytes(sent.nonce))), 'Apple gets SHA-256 of the raw nonce');
  assert.deepEqual(S.state.lastScopes, [], 'no name or email requested');
  assert.equal(api.signedIn(), true);
  assert.equal(api.currentUser()?.name, 'Calm Falcon 42');
  await api.updateMe({ acceptRules: 1 });
  assert.equal(calls[1].headers.Authorization, 'Bearer sess-1');
  assert.equal(api.currentUser()?.rulesAccepted, true);
  await assert.rejects(api.createPost({ title: 't', body: 'b', tags: [] }), (e: any) => e.code === 'auth' && e.status === 401);
  assert.equal(api.signedIn(), false, 'an expired session signs out');
});

test('Sign in with Apple: cancel returns false, missing module asks for the TestFlight update', async () => {
  const auth = require('../src/data/communityAuth') as typeof import('../src/data/communityAuth');
  S.state.appleError = Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' });
  assert.equal(await auth.signInWithApple(), false);
  S.state.appleError = null;
  const saved = virtual['expo-apple-authentication'];
  delete virtual['expo-apple-authentication'];
  const prev = M._load;
  M._load = function (req: string, ...a: any[]) { if (req === 'expo-apple-authentication') throw new Error('Cannot find native module'); return prev.call(this, req, ...a); };
  try {
    assert.equal(await auth.appleSupport(), 'update');
    await assert.rejects(auth.signInWithApple(), /Update the app from TestFlight to join the community/);
  } finally { M._load = prev; virtual['expo-apple-authentication'] = saved; }
});

test('offline / server down gives a readable error', async () => {
  const api = require('../src/data/communityApi') as typeof import('../src/data/communityApi');
  (globalThis as any).fetch = async () => { throw new Error('network'); };
  await assert.rejects(api.getFeed('?sort=new'), (e: any) => e.code === 'offline' && /connection/.test(e.message));
  mockFetch(() => ({ status: 429, body: { error: 'You’re doing that too often.', code: 'rate' } }));
  await assert.rejects(api.getFeed('?sort=new'), (e: any) => e.status === 429 && /too often/.test(e.message));
});

test('Google button stays hidden until extra.googleIosClientId is set', () => {
  const auth = require('../src/data/communityAuth') as typeof import('../src/data/communityAuth');
  assert.equal(auth.googleConfig(), null);
  S.constants.default.expoConfig.extra.googleIosClientId = '123-abc.apps.googleusercontent.com';
  assert.equal(auth.googleConfig()?.iosClientId, '123-abc.apps.googleusercontent.com');
  delete S.constants.default.expoConfig.extra.googleIosClientId;
});
