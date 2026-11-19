import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createJwks, appleVerifier, googleVerifier, sha256, appleClientSecret, APPLE_ISS } from '../src/auth.mjs';
import { fakeProvider, nowS } from './helpers.mjs';

const AUD = 'com.vijaykannan.casedesk';

test('apple: valid token with nonce passes, keys are cached', async () => {
  const p = fakeProvider();
  const verify = appleVerifier({ jwks: createJwks('x', { fetchFn: p.fetchFn }), audiences: [AUD] });
  const raw = 'n0nce-raw-value';
  const tok = () => p.sign({ iss: APPLE_ISS, aud: AUD, sub: '001234.abc', exp: nowS() + 600, iat: nowS(), nonce: sha256(raw), email: 'someone@example.com' });
  assert.deepEqual(await verify(tok(), raw), { provider: 'apple', sub: '001234.abc' });
  await verify(tok(), raw);
  assert.equal(p.fetches(), 1, 'JWKS fetched once');
});

test('apple: wrong aud, iss, expired, bad signature, wrong nonce, unknown kid are rejected', async () => {
  const p = fakeProvider();
  const other = fakeProvider();
  const verify = appleVerifier({ jwks: createJwks('x', { fetchFn: p.fetchFn }), audiences: [AUD] });
  const base = { iss: APPLE_ISS, aud: AUD, sub: 's', exp: nowS() + 600, iat: nowS() };
  await assert.rejects(verify(p.sign({ ...base, aud: 'com.other.app' })), /another app/);
  await assert.rejects(verify(p.sign({ ...base, iss: 'https://evil.example' })), /wrong issuer/);
  await assert.rejects(verify(p.sign({ ...base, exp: nowS() - 3600 })), /expired/);
  await assert.rejects(verify(other.sign(base)), /not valid/, 'signed by another key with the same kid');
  await assert.rejects(verify(p.sign({ ...base, nonce: sha256('a') }), 'b'), /check failed/);
  await assert.rejects(verify(p.sign({ ...base, nonce: sha256('a') }), ''), /check failed/);
  await assert.rejects(verify(p.sign(base, { k: 'nope' })), /not valid/);
  await assert.rejects(verify(p.sign(base, { alg: 'HS256' })), /not valid/);
  await assert.rejects(verify('garbage'), /not valid/);
  const t = p.sign(base).split('.'); t[1] = Buffer.from(JSON.stringify({ ...base, sub: 'other' })).toString('base64url');
  await assert.rejects(verify(t.join('.')), /not valid/, 'tampered claims');
});

test('jwks: refetches when a token names a new key id (key rotation)', async () => {
  let keys = [];
  const a = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  let n = 0;
  const jwks = createJwks('x', { fetchFn: async () => { n++; return { ok: true, json: async () => ({ keys }) }; } });
  keys = [{ ...a.publicKey.export({ format: 'jwk' }), kid: 'old' }];
  assert.ok(await jwks.get('old'));
  keys.push({ ...a.publicKey.export({ format: 'jwk' }), kid: 'new' });
  assert.ok(await jwks.get('new'));
  assert.equal(n, 2);
});

test('google: off without client id; aud must match GOOGLE_CLIENT_ID', async () => {
  const p = fakeProvider('g1');
  const jwks = createJwks('x', { fetchFn: p.fetchFn });
  await assert.rejects(googleVerifier({ jwks, audiences: [] })('a.b.c'), /not set up/);
  const verify = googleVerifier({ jwks, audiences: ['123-ios.apps.googleusercontent.com'] });
  const base = { iss: 'https://accounts.google.com', sub: '1098', exp: nowS() + 600, iat: nowS() };
  assert.equal((await verify(p.sign({ ...base, aud: '123-ios.apps.googleusercontent.com' }))).sub, '1098');
  await assert.rejects(verify(p.sign({ ...base, aud: 'other' })), /another app/);
});

test('apple client secret is a valid ES256 JWT', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const s = appleClientSecret({ teamId: 'TEAM', keyId: 'KEY', key: privateKey.export({ format: 'pem', type: 'pkcs8' }) });
  const [h, b, sig] = s.split('.');
  assert.equal(JSON.parse(Buffer.from(b, 'base64url')).sub, AUD);
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});
