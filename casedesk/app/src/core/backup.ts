// Password-protected backups (.casedesk). Pure JS crypto (@noble): scrypt derives a key from the
// password and a random salt; AES-256-GCM encrypts and authenticates the payload, so a wrong
// password or a damaged file is detected. No native code.
//
// File: "CASEDESK-BACKUP 1\n" + JSON header + "\n" + base64(ciphertext)
import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export const MAGIC = 'CASEDESK-BACKUP 1'; // file format id: unchanged by the rename, so old backups still open

/** File-backup name: "Immigration Wallet backup 2026-11-18.casedesk" (local date). The .casedesk
 *  extension and the format stay the same, so files made by CaseDesk still restore. */
export function backupFileName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Immigration Wallet backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.casedesk`;
}
// scrypt cost chosen for phones running JavaScript without a JIT (Hermes): N = 2^13, r = 8, p = 1
// (8 MB, about 2–4 s on a recent iPhone). Stored in each file's header, so it can be raised later
// without breaking older backups.
export const KDF = { N: 2 ** 13, r: 8, p: 1, dkLen: 32 };

// ---- bytes helpers (no Buffer / TextEncoder dependency) ----
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
export function fromUtf8(b: Uint8Array): string {
  let s = '';
  const parts: string[] = [];
  for (let i = 0; i < b.length;) {
    const c = b[i++];
    let cp = c;
    if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(cp);
    if (s.length > 8192) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(b: Uint8Array): string {
  const parts: string[] = [];
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    if (s.length > 16384) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}
const REV = (() => { const r = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) r[B64.charCodeAt(i)] = i; return r; })();
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (REV[clean.charCodeAt(i)] << 18) | (REV[clean.charCodeAt(i + 1)] << 12) | ((REV[clean.charCodeAt(i + 2)] & 63) << 6) | (REV[clean.charCodeAt(i + 3)] & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Random bytes: the platform CSPRNG when present. Salt and nonce only need to be unique, never secret. */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) { c.getRandomValues(out); return out; }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256) ^ ((Date.now() >> (i % 8)) & 255);
  return out;
}

type Header = { v: 1; kdf: 'scrypt'; N: number; r: number; p: number; salt: string; nonce: string; createdAt: string };
export type Progress = (fraction: number) => void;

export async function encryptBackup(payload: string, password: string, onProgress?: Progress, kdf = KDF): Promise<string> {
  if (password.length < 8) throw new Error('Use at least 8 characters');
  const salt = randomBytes(16), nonce = randomBytes(12);
  const key = await scryptAsync(utf8(password), salt, { ...kdf, onProgress });
  const ct = gcm(key, nonce).encrypt(utf8(payload));
  const header: Header = { v: 1, kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: toBase64(salt), nonce: toBase64(nonce), createdAt: new Date().toISOString() };
  return `${MAGIC}\n${JSON.stringify(header)}\n${toBase64(ct)}`;
}

export function readHeader(text: string): Header {
  const [magic, head] = text.split('\n', 2);
  if (magic !== MAGIC) throw new Error('This isn’t an Immigration Wallet backup file');
  const h = JSON.parse(head) as Header;
  if (h.v !== 1 || h.kdf !== 'scrypt') throw new Error('This backup was made by a newer Immigration Wallet — update the app first');
  return h;
}

export async function decryptBackup(text: string, password: string, onProgress?: Progress): Promise<string> {
  const h = readHeader(text);
  const body = text.slice(text.indexOf('\n', text.indexOf('\n') + 1) + 1);
  const key = await scryptAsync(utf8(password), fromBase64(h.salt), { N: h.N, r: h.r, p: h.p, dkLen: 32, onProgress });
  try {
    return fromUtf8(gcm(key, fromBase64(h.nonce)).decrypt(fromBase64(body)));
  } catch {
    throw new Error('Wrong password, or the file is damaged');
  }
}

/** What's inside a backup (the payload, after decrypting). Files are base64 by document file name. */
export type BackupPayload = {
  app: 'casedesk'; schema: number; exportedAt: string;
  people: unknown[]; docs: unknown[]; cases: unknown[]; settings: unknown;
  files: Record<string, { name: string; mime: string; data: string }>;
};
