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
/** What the document picker is asked for. The web preview filters by extension; the installed
 *  iOS / Android builds declare no backup file type, so they must list every file. */
export const BACKUP_PICKER_TYPES = { web: ['.casedesk'], native: '*/*' } as const;

/** A backup file's name as shown in the app: never the old app name or the internal extension.
 *  iCloud backups (CaseDesk-2026-11-18-093000.casedesk) → "iCloud backup · Nov 18, 2026". */
export function backupLabel(name: string): string {
  const m = /^casedesk-(\d{4})-(\d{2})-(\d{2})-\d{4,6}\.casedesk$/i.exec(name.trim());
  if (m) {
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] ?? m[2];
    return `iCloud backup · ${mon} ${+m[3]}, ${m[1]}`;
  }
  const base = name.trim().replace(/\.casedesk$/i, '').replace(/^case\s*desk\b[\s_-]*/i, 'Immigration Wallet ').replace(/casedesk/gi, 'Immigration Wallet').trim();
  return base || 'Immigration Wallet backup';
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

/** The sealed-file format shared by backups (.casedesk) and family shares (.iwshare):
 *  MAGIC line, JSON header line, base64 ciphertext. scrypt(secret, salt) -> AES-256-GCM.
 *  bindHeader: the exact header line is also authenticated (GCM associated data), so changing any
 *  header field (for a share: the expiry date) makes the file fail to open. Backups keep
 *  bindHeader off so files made by older versions still restore. */
export type SealOptions = { kdf?: typeof KDF; onProgress?: Progress; extra?: Record<string, string | number>; bindHeader?: boolean };

export async function sealText(magic: string, payload: string, secret: string, o: SealOptions = {}): Promise<string> {
  const kdf = o.kdf ?? KDF;
  const salt = randomBytes(16), nonce = randomBytes(12);
  const key = await scryptAsync(utf8(secret), salt, { ...kdf, onProgress: o.onProgress });
  const header: Header = { v: 1, kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: toBase64(salt), nonce: toBase64(nonce), createdAt: new Date().toISOString(), ...(o.extra ?? {}) } as Header;
  const head = JSON.stringify(header);
  const ct = o.bindHeader ? gcm(key, nonce, utf8(`${magic}\n${head}`)).encrypt(utf8(payload)) : gcm(key, nonce).encrypt(utf8(payload));
  return `${magic}\n${head}\n${toBase64(ct)}`;
}

/** Split a sealed file into its header line (raw text, as authenticated) and parsed header. */
export function splitSealed(text: string, magic: string, notOurs: string): { head: string; header: Header & Record<string, unknown>; body: string } {
  const a = text.indexOf('\n'), b = a < 0 ? -1 : text.indexOf('\n', a + 1);
  if (a < 0 || b < 0 || text.slice(0, a).replace(/\r$/, '') !== magic) throw new Error(notOurs);
  const head = text.slice(a + 1, b);
  let header: Header & Record<string, unknown>;
  try { header = JSON.parse(head); } catch { throw new Error(notOurs); }
  return { head, header, body: text.slice(b + 1) };
}

/** Sanity limits on the KDF parameters read from a file, so a crafted file can't make the phone
 *  run out of memory or spin for minutes before the code is even checked. */
export function checkKdf(h: { N: number; r: number; p: number }) {
  const ok = Number.isInteger(h.N) && h.N >= 2 ** 10 && h.N <= 2 ** 18 && (h.N & (h.N - 1)) === 0 && Number.isInteger(h.r) && h.r >= 1 && h.r <= 16 && 128 * h.N * h.r <= 64 * 1024 * 1024 && Number.isInteger(h.p) && h.p >= 1 && h.p <= 4;
  if (!ok) throw new Error('This file isn’t valid');
}

export async function openSealed(text: string, magic: string, secret: string, o: { onProgress?: Progress; bindHeader?: boolean; notOurs: string; wrong: string }): Promise<string> {
  const { head, header: h, body } = splitSealed(text, magic, o.notOurs);
  if (h.v !== 1 || h.kdf !== 'scrypt') throw new Error('This file was made by a newer Immigration Wallet — update the app first');
  if (o.bindHeader) checkKdf(h);
  const key = await scryptAsync(utf8(secret), fromBase64(h.salt), { N: h.N, r: h.r, p: h.p, dkLen: 32, onProgress: o.onProgress });
  try {
    const nonce = fromBase64(h.nonce);
    const c = o.bindHeader ? gcm(key, nonce, utf8(`${magic}\n${head}`)) : gcm(key, nonce);
    return fromUtf8(c.decrypt(fromBase64(body)));
  } catch {
    throw new Error(o.wrong);
  }
}

export async function encryptBackup(payload: string, password: string, onProgress?: Progress, kdf = KDF): Promise<string> {
  if (password.length < 8) throw new Error('Use at least 8 characters');
  return sealText(MAGIC, payload, password, { kdf, onProgress });
}

export function readHeader(text: string): Header {
  const [magic, head] = text.split('\n', 2);
  if (magic !== MAGIC) throw new Error('This isn’t an Immigration Wallet backup file');
  const h = JSON.parse(head) as Header;
  if (h.v !== 1 || h.kdf !== 'scrypt') throw new Error('This backup was made by a newer Immigration Wallet — update the app first');
  return h;
}

export async function decryptBackup(text: string, password: string, onProgress?: Progress): Promise<string> {
  readHeader(text);
  return openSealed(text, MAGIC, password, { onProgress, notOurs: 'This isn’t an Immigration Wallet backup file', wrong: 'Wrong password, or the file is damaged' });
}

/** What's inside a backup (the payload, after decrypting). Files are base64 by document file name. */
export type BackupPayload = {
  app: 'casedesk'; schema: number; exportedAt: string;
  people: unknown[]; docs: unknown[]; cases: unknown[]; settings: unknown;
  files: Record<string, { name: string; mime: string; data: string }>;
};
