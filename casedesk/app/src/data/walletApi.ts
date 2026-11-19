// Apple Wallet status card (v2.5): asks the server to sign a pass. The card fields are sent once and
// the server stores nothing (privacy.html). If the server isn't set up for Wallet it answers 503 and
// the app hides the button.
import { apiBase } from './api';
import type { PassCard } from '../core/walletPass';

let enabled: Promise<boolean> | undefined;

/** Is signing configured on the server? Asked once per app run; false when offline. */
export function walletEnabled(force = false): Promise<boolean> {
  if (enabled && !force) return enabled;
  enabled = (async () => {
    const b = apiBase();
    if (!b) return false;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timer = setTimeout(() => ctl?.abort(), 6000);
      try {
        const r = await fetch(`${b}/api/wallet/status`, { headers: { Accept: 'application/json' }, signal: ctl?.signal });
        if (!r.ok) return false;
        const j = await r.json();
        return !!j?.enabled;
      } finally { clearTimeout(timer); }
    } catch { return false; }
  })();
  enabled.then((ok) => { if (!ok) setTimeout(() => { enabled = undefined; }, 60_000); }).catch(() => {});
  return enabled;
}

export class WalletUnavailable extends Error {}

/** POST the card, get the signed .pkpass back as base64. */
export async function requestPass(card: PassCard, timeoutMs = 20000): Promise<string> {
  const b = apiBase();
  if (!b) throw new WalletUnavailable('Wallet cards need an internet connection.');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const r = await fetch(`${b}/api/wallet/pass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.apple.pkpass' },
      body: JSON.stringify(card),
      signal: ctl?.signal,
    });
    if (r.status === 503) { enabled = Promise.resolve(false); throw new WalletUnavailable('Wallet cards aren’t available right now.'); }
    if (r.status === 429) throw new Error('Too many cards in a short time — try again in a few minutes.');
    if (!r.ok) { let msg = ''; try { msg = (await r.json())?.error ?? ''; } catch {} throw new Error(msg || `Couldn’t make the card (${r.status}).`); }
    return toBase64(new Uint8Array(await r.arrayBuffer()));
  } finally { clearTimeout(timer); }
}

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '=');
  }
  return out;
}
