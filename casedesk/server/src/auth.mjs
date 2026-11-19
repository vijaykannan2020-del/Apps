// Sign in for Community: verifies Apple / Google ID tokens (RS256 JWTs) against the providers' public
// keys, and issues our own random session tokens (only their SHA-256 is stored). No dependencies.
// We never keep the email from the token — only a hash of the provider's stable user id.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPLE_ISS = 'https://appleid.apple.com';
export const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
export const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
export const APPLE_AUD_DEFAULT = 'com.vijaykannan.casedesk';

const err = (status, message, code) => Object.assign(new Error(message), { status, code });
const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Cached JSON Web Key Set. Refetches when stale (6 h) or when a token names an unknown key id (at most every 60 s). */
export function createJwks(url, { fetchFn = (...a) => globalThis.fetch(...a), ttlMs = 6 * 3600_000, now = Date.now } = {}) {
  let keys = null, at = 0, lastMiss = 0, inflight = null;
  async function load() {
    if (!inflight) inflight = (async () => {
      const r = await fetchFn(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw err(503, 'Could not reach the sign-in service. Try again.');
      const j = await r.json();
      keys = new Map((j.keys || []).filter((k) => k.kty === 'RSA' && k.kid).map((k) => [k.kid, k]));
      at = now();
    })().finally(() => { inflight = null; });
    return inflight;
  }
  return {
    async get(kid) {
      if (!keys || now() - at > ttlMs) await load();
      if (!keys.has(kid) && now() - lastMiss > 60_000) { lastMiss = now(); await load(); }
      return keys.get(kid) || null;
    },
  };
}

/** Verify an RS256 JWT: signature with the key set, iss, aud, exp/iat (2 min leeway). Returns the claims. */
export async function verifyJwt(token, { jwks, issuers, audiences, now = Date.now }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))) throw err(401, 'Sign-in token is not valid.', 'token');
  let header, claims;
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { throw err(401, 'Sign-in token is not valid.', 'token'); }
  if (header.alg !== 'RS256' || !header.kid) throw err(401, 'Sign-in token is not valid.', 'token');
  const jwk = await jwks.get(header.kid);
  if (!jwk) throw err(401, 'Sign-in token is not valid.', 'token');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw err(401, 'Sign-in token is not valid.', 'token');
  const t = Math.floor(now() / 1000);
  if (!issuers.includes(claims.iss)) throw err(401, 'Sign-in token is from the wrong issuer.', 'token');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((a) => audiences.includes(a))) throw err(401, 'Sign-in token is for another app.', 'token');
  if (typeof claims.exp !== 'number' || claims.exp + 120 < t) throw err(401, 'Sign-in expired. Try again.', 'token');
  if (typeof claims.iat === 'number' && claims.iat - 120 > t) throw err(401, 'Sign-in token is not valid.', 'token');
  if (!claims.sub) throw err(401, 'Sign-in token is not valid.', 'token');
  return claims;
}

/** Apple: the app hashes a random nonce (SHA-256 hex) into the request; we check the raw nonce matches. */
export function appleVerifier({ jwks = createJwks(APPLE_JWKS), audiences = (process.env.APPLE_AUDIENCES || APPLE_AUD_DEFAULT).split(',').map((s) => s.trim()).filter(Boolean), now = Date.now } = {}) {
  return async (identityToken, rawNonce) => {
    const c = await verifyJwt(identityToken, { jwks, issuers: [APPLE_ISS], audiences, now });
    if (c.nonce || rawNonce) {
      if (!rawNonce || !c.nonce || (c.nonce !== sha256(rawNonce) && c.nonce !== rawNonce)) throw err(401, 'Sign-in check failed. Try again.', 'nonce');
    }
    return { provider: 'apple', sub: String(c.sub) };
  };
}

// Google client ids are public (they ship inside the app), so they may live in the environment (.env)
// or in deploy.conf, the public settings file next to this folder that is kept in GitHub.
export const DEPLOY_CONF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy.conf');
/** One KEY=value from a deploy.conf-style file ('' when the file or key is missing; # lines are comments). */
export function readConf(key, file = DEPLOY_CONF) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  let out = '';
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) out = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
/** Allowed Google audiences: GOOGLE_CLIENT_ID from the environment, else from deploy.conf (comma-separated: iOS + web ids). */
export function googleAudiences({ env = process.env, file = DEPLOY_CONF } = {}) {
  const raw = (env.GOOGLE_CLIENT_ID || '').trim() || readConf('GOOGLE_CLIENT_ID', file);
  return raw.split(',').map((s) => s.trim()).filter((s) => /^[\w.-]+\.apps\.googleusercontent\.com$/.test(s));
}

/** Google: the token's aud must be one of our client ids (see googleAudiences). Off until one is set. */
export function googleVerifier({ jwks = createJwks(GOOGLE_JWKS), audiences = googleAudiences(), now = Date.now } = {}) {
  return async (idToken) => {
    if (!audiences.length) throw err(503, 'Google sign-in is not set up yet.', 'google-off');
    const c = await verifyJwt(idToken, { jwks, issuers: GOOGLE_ISS, audiences, now });
    return { provider: 'google', sub: String(c.sub) };
  };
}

export const newSessionToken = () => crypto.randomBytes(32).toString('base64url');

// ---------- Apple token revocation on account deletion (optional) ----------
// Apple asks apps with Sign in with Apple to revoke tokens when an account is deleted. That needs a
// Sign in with Apple key (.p8) from developer.apple.com: APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID and
// APPLE_SIGNIN_KEY (the .p8 text; \n allowed). Without them, sign-in still works and revocation is skipped.
const appleKeyConfigured = () => !!(process.env.APPLE_TEAM_ID && process.env.APPLE_SIGNIN_KEY_ID && process.env.APPLE_SIGNIN_KEY);
export function appleClientSecret({ teamId = process.env.APPLE_TEAM_ID, keyId = process.env.APPLE_SIGNIN_KEY_ID, key = process.env.APPLE_SIGNIN_KEY, clientId = APPLE_AUD_DEFAULT, now = Date.now } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(now() / 1000);
  const head = enc({ alg: 'ES256', kid: keyId }), body = enc({ iss: teamId, iat: t, exp: t + 3000, aud: APPLE_ISS, sub: clientId });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: String(key).replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}
async function applePost(path, form, fetchFn) {
  const r = await fetchFn(`${APPLE_ISS}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  if (!r.ok) throw err(502, `Apple ${path} ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}
/** Authorization code (single use, 5 min) → refresh token we can later revoke. Null when not configured or it fails. */
export async function appleExchangeCode(code, fetchFn = (...a) => globalThis.fetch(...a)) {
  if (!code || !appleKeyConfigured()) return null;
  try {
    const j = await applePost('/auth/token', { client_id: APPLE_AUD_DEFAULT, client_secret: appleClientSecret(), code, grant_type: 'authorization_code' }, fetchFn);
    return j.refresh_token || null;
  } catch (e) { console.error('apple code exchange failed', e.message); return null; }
}
export async function appleRevoke(refreshToken, fetchFn = (...a) => globalThis.fetch(...a)) {
  if (!refreshToken || !appleKeyConfigured()) return false;
  try { await applePost('/auth/revoke', { client_id: APPLE_AUD_DEFAULT, client_secret: appleClientSecret(), token: refreshToken, token_type_hint: 'refresh_token' }, fetchFn); return true; } catch (e) { console.error('apple revoke failed', e.message); return false; }
}
