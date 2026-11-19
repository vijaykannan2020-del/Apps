// Test helpers: an RSA key pair published as a fake JWKS, and a signer for Apple/Google-like ID tokens.
import crypto from 'node:crypto';

export function fakeProvider(kid = 'k1') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  let fetches = 0;
  const fetchFn = async () => { fetches++; return { ok: true, json: async () => ({ keys: [jwk] }) }; };
  const sign = (claims, { k = kid, key = privateKey, alg = 'RS256' } = {}) => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = enc({ alg, kid: k }), body = enc(claims);
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
    return `${head}.${body}.${sig}`;
  };
  return { fetchFn, sign, fetches: () => fetches };
}
export const nowS = () => Math.floor(Date.now() / 1000);
