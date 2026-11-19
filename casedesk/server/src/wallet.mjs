// Apple Wallet "Immigration status card" (v2.5). POST /api/wallet/pass takes the card fields from the app,
// builds and signs a .pkpass IN MEMORY and returns it. Nothing is stored or logged (privacy.html).
// The card is for personal reference only — NOT an official document; the pass says so front and back.
//
// Signing: a Pass Type ID certificate for pass.com.vijaykannan.casedesk + Apple's WWDR intermediate.
//   Env (any one form): PASS_CERT_P12 (base64) + PASS_CERT_PASSWORD, or PASS_CERT_PEM + PASS_KEY_PEM
//   (PEM text or a file path). Or the default files: the key the server generated itself in
//   data/wallet/pass.key (never leaves the server) + the public certificate wallet/pass.cer (committed by
//   the Wallet certificate workflow or uploaded by the owner). WWDR: PASS_WWDR_PEM, or wallet/AppleWWDRCAG4.cer,
//   or data/wallet/wwdr.cer (downloaded from apple.com on first start).
//   PASS_TYPE_ID (default pass.com.vijaykannan.casedesk), PASS_TEAM_ID (default: from the certificate).
// Not configured → GET /api/wallet/status says enabled:false and POST answers 503 (the app hides the button).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

export const DEFAULT_PASS_TYPE_ID = 'pass.com.vijaykannan.casedesk';
export const WWDR_URL = 'https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer';
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'wallet');
export const FRONT_DISCLAIMER = 'For personal reference — not an official document';
const BG = { blue: '#1F4FA8', teal: '#0F6E6E', indigo: '#3B3A98', green: '#1E6B3A', navy: '#1B2A4A', grey: '#3A3D44' }; // = app PASS_BG

// ---------- small helpers ----------
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const fmtDate = (s) => (isISO(s) ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}` : '—');
const readMaybe = (v) => { if (!v) return undefined; const s = String(v); if (s.includes('-----BEGIN')) return s.replace(/\\n/g, '\n'); try { return fs.readFileSync(s); } catch { return undefined; } };
const fileIf = (p) => { try { return fs.readFileSync(p); } catch { return undefined; } };

function certFrom(buf) {
  if (!buf) return undefined;
  const s = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
  const txt = s.toString('latin1');
  if (txt.includes('-----BEGIN CERTIFICATE')) return forge.pki.certificateFromPem(txt);
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(txt)));
}
function keyFrom(buf) {
  if (!buf) return undefined;
  const txt = (Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))).toString('latin1');
  if (txt.includes('ENCRYPTED')) return undefined;
  return forge.pki.privateKeyFromPem(txt);
}

// ---------- forbidden numbers (the same rules as the app) ----------
const FORBIDDEN = [/\b[A-Z]{3}\d{10}\b/i, /\bA[- ]?\d{8,9}\b/i, /\b\d{3}-\d{2}-\d{4}\b/, /\b[A-Z]{0,2}\d{6,}\b/i];
export const looksSensitive = (s) => FORBIDDEN.some((re) => re.test(String(s)));

export class CardError extends Error { constructor(m) { super(m); this.status = 400; } }

/** Whitelist + limits. Unknown keys are dropped; anything that looks like a document number is refused. */
export function validateCard(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CardError('Bad card');
  const str = (k, max, req = false) => {
    const v = body[k];
    if (v === undefined || v === null || v === '') { if (req) throw new CardError(`Missing ${k}`); return undefined; }
    if (typeof v !== 'string') throw new CardError(`Bad ${k}`);
    const t = v.replace(/\s+/g, ' ').trim();
    if (t.length > max) throw new CardError(`${k} is too long`);
    if (looksSensitive(t)) throw new CardError('Document numbers can’t go on the card');
    return t;
  };
  const date = (k) => { const v = body[k]; if (v === undefined || v === null || v === '') return undefined; if (!isISO(v)) throw new CardError(`Bad ${k}`); return v; };
  const serial = body.serial;
  if (typeof serial !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(serial)) throw new CardError('Bad serial');
  const nd = body.nextDeadline;
  let nextDeadline;
  if (nd !== undefined && nd !== null) {
    if (typeof nd !== 'object' || typeof nd.what !== 'string' || !isISO(nd.date)) throw new CardError('Bad nextDeadline');
    const what = nd.what.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (looksSensitive(what)) throw new CardError('Document numbers can’t go on the card');
    nextDeadline = { what, date: nd.date };
  }
  const colour = Object.hasOwn(BG, body.colour) ? body.colour : 'grey';
  const validLabel = ['I-94', 'Card', 'Status'].includes(body.validLabel) ? body.validLabel : undefined;
  return {
    serial, colour, validLabel, nextDeadline,
    name: str('name', 40, true), status: str('status', 40, true),
    validUntil: date('validUntil'), visaUntil: date('visaUntil'), passportUntil: date('passportUntil'),
    relevantDate: date('relevantDate'), updated: date('updated') ?? new Date().toISOString().slice(0, 10),
  };
}

export const BACK_DISCLAIMER = 'This card is a personal reminder made by the Immigration Wallet app from documents saved on your own phone. It is NOT an official document, ID or proof of status, and it is not issued, endorsed or checked by USCIS, CBP, DHS, the Department of State or any government agency. Always rely on your original documents (I-94, approval notice, visa, passport, green card). Dates can be wrong if a document was read wrongly or is out of date. Not legal advice.';
export const SOURCES = 'I-94: i94.cbp.dhs.gov (your most recent I-94 record). Visa stamp and passport dates: as printed on your documents. Status rules: uscis.gov and travel.state.gov, linked in the app.';

/** pass.json for a generic pass. No barcode (it isn't something to scan or show as ID). */
export function passJson(card, { passTypeId, teamId }) {
  const label = card.validLabel === 'Card' ? 'CARD VALID UNTIL' : card.validLabel === 'I-94' ? 'VALID UNTIL (I-94)' : 'VALID UNTIL';
  const p = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: card.serial,
    organizationName: 'Immigration Wallet',
    description: 'Immigration status card — personal reference, not an official document',
    logoText: 'Immigration Wallet',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(214, 222, 235)',
    backgroundColor: rgb(BG[card.colour] ?? BG.grey),
    sharingProhibited: true,
    generic: {
      headerFields: [{ key: 'ref', label: 'STATUS CARD', value: 'Not official' }],
      primaryFields: [{ key: 'name', label: 'NAME', value: card.name }],
      secondaryFields: [
        { key: 'status', label: 'STATUS', value: card.status },
        { key: 'valid', label, value: fmtDate(card.validUntil) },
      ],
      auxiliaryFields: [
        { key: 'visa', label: 'VISA STAMP UNTIL', value: fmtDate(card.visaUntil) },
        { key: 'passport', label: 'PASSPORT UNTIL', value: fmtDate(card.passportUntil) },
        { key: 'next', label: card.nextDeadline ? `NEXT: ${card.nextDeadline.what.toUpperCase()}` : 'NEXT DEADLINE', value: card.nextDeadline ? fmtDate(card.nextDeadline.date) : 'None coming up' },
        { key: 'disclaimer', label: 'FOR PERSONAL REFERENCE', value: 'Not an official document' },
      ],
      backFields: [
        { key: 'notice', label: 'Not an official document', value: `${FRONT_DISCLAIMER}. ${BACK_DISCLAIMER}` },
        { key: 'sources', label: 'Where the dates come from', value: SOURCES },
        { key: 'updated', label: 'Card made', value: `${fmtDate(card.updated)} by the Immigration Wallet app. Add the card again from the app after a change to update it.` },
        { key: 'privacy', label: 'Privacy', value: 'The fields on this card were sent once to the Immigration Wallet server to sign it, and were not stored. No passport, receipt or A-numbers are on this card.' },
      ],
    },
  };
  if (card.relevantDate) p.relevantDate = `${card.relevantDate}T09:00:00Z`;
  return p;
}

export const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
export function manifestFor(files) { return Object.fromEntries(Object.entries(files).map(([n, b]) => [n, sha1(b)])); }

/** PKCS#7 detached signature of manifest.json (SHA-256, signing cert + WWDR in the bag). */
export function signManifest(manifest, { cert, key, wwdr }, when = new Date()) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(cert);
  if (wwdr) p7.addCertificate(wwdr);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: when },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

// ---------- zip (deflate) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b) => { if (typeof zlib.crc32 === 'function') return zlib.crc32(b) >>> 0; let c = 0xffffffff; for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
/** Minimal reader for tests: name → data. */
export function unzip(buf) {
  const out = {}; let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString('utf8');
    const data = buf.subarray(i + 30 + nlen + xlen, i + 30 + nlen + xlen + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    i += 30 + nlen + xlen + size;
  }
  return out;
}

// ---------- images ----------
export function passImages(dir = ASSETS) {
  const out = {};
  for (const n of ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png']) { const b = fileIf(path.join(dir, n)); if (b) out[n] = b; }
  return out;
}

/** Build the whole .pkpass (Buffer). */
export function buildPass(card, signer, { passTypeId, teamId, images = passImages(), when } = {}) {
  const files = { 'pass.json': Buffer.from(JSON.stringify(passJson(card, { passTypeId, teamId }), null, 1)), ...images };
  if (!files['icon.png']) throw new Error('icon.png missing');
  const manifest = Buffer.from(JSON.stringify(manifestFor(files)));
  const signature = signManifest(manifest, signer, when);
  return zip({ ...files, 'manifest.json': manifest, signature });
}

// ---------- configuration ----------
export function teamFromCert(cert) {
  const ou = cert?.subject?.getField('OU');
  return ou?.value;
}
export function passTypeFromCert(cert) {
  const uid = cert?.subject?.attributes?.find((a) => a.type === '0.9.2342.19200300.100.1.1'); // UID = pass type id
  return uid?.value;
}
const samePublicKey = (cert, key) => cert.publicKey.n.equals(key.n) && cert.publicKey.e.equals(key.e);

/** Reads the signer from env / files. Returns { ok, reason?, signer?, passTypeId, teamId }. */
export function loadWalletConfig(env = process.env, { dataDir = path.join(process.cwd(), 'data', 'wallet'), assets = ASSETS } = {}) {
  const passTypeId = env.PASS_TYPE_ID || DEFAULT_PASS_TYPE_ID;
  let cert, key;
  try {
    if (env.PASS_CERT_P12) {
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(env.PASS_CERT_P12.replace(/\s+/g, ''))), env.PASS_CERT_PASSWORD || '');
      cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
      const kb = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
      key = kb?.key;
    } else if (env.PASS_CERT_PEM || env.PASS_KEY_PEM) {
      cert = certFrom(readMaybe(env.PASS_CERT_PEM)); key = keyFrom(readMaybe(env.PASS_KEY_PEM));
    } else {
      cert = certFrom(fileIf(path.join(assets, 'pass.cer')) ?? fileIf(path.join(dataDir, 'pass.cer')));
      key = keyFrom(fileIf(path.join(dataDir, 'pass.key')));
    }
  } catch (e) { return { ok: false, reason: `certificate unreadable: ${e.message}`, passTypeId }; }
  if (!cert) return { ok: false, reason: 'no Pass Type ID certificate yet', passTypeId };
  if (!key) return { ok: false, reason: 'no private key for the certificate', passTypeId };
  if (!samePublicKey(cert, key)) return { ok: false, reason: 'certificate and key don’t match', passTypeId };
  if (cert.validity.notAfter < new Date()) return { ok: false, reason: 'certificate expired', passTypeId };
  let wwdr;
  try { wwdr = certFrom(readMaybe(env.PASS_WWDR_PEM) ?? fileIf(path.join(assets, 'AppleWWDRCAG4.cer')) ?? fileIf(path.join(dataDir, 'wwdr.cer'))); } catch { wwdr = undefined; }
  if (!wwdr) return { ok: false, reason: 'Apple WWDR intermediate certificate missing', passTypeId };
  const certType = passTypeFromCert(cert);
  if (certType && certType !== passTypeId) return { ok: false, reason: `certificate is for ${certType}, not ${passTypeId}`, passTypeId };
  const teamId = env.PASS_TEAM_ID || teamFromCert(cert);
  if (!teamId) return { ok: false, reason: 'PASS_TEAM_ID missing', passTypeId };
  return { ok: true, signer: { cert, key, wwdr }, passTypeId, teamId, expires: cert.validity.notAfter.toISOString().slice(0, 10) };
}

// ---------- the server's own key + CSR (owner never handles a private key) ----------
export function makeCsr(keyPem, { cn = 'Immigration Wallet Pass Type ID', email } = {}) {
  const key = forge.pki.privateKeyFromPem(keyPem);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  const attrs = [{ name: 'commonName', value: cn }, { name: 'countryName', value: 'US' }];
  if (email) attrs.push({ name: 'emailAddress', value: email });
  csr.setSubject(attrs);
  csr.sign(key, forge.md.sha256.create());
  return forge.pki.certificationRequestToPem(csr);
}

/** Create data/wallet/pass.key (0600) + pass.csr once, unless signing is configured some other way. */
export function ensureKeyAndCsr(env = process.env, { dataDir = path.join(process.cwd(), 'data', 'wallet') } = {}) {
  if (env.PASS_CERT_P12 || env.PASS_CERT_PEM) return null;
  const keyPath = path.join(dataDir, 'pass.key'), csrPath = path.join(dataDir, 'pass.csr');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(keyPath)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs1', format: 'pem' }), { mode: 0o600 });
  }
  if (!fs.existsSync(csrPath)) fs.writeFileSync(csrPath, makeCsr(fs.readFileSync(keyPath, 'utf8')));
  return fs.readFileSync(csrPath, 'utf8');
}

/** Download Apple's WWDR G4 intermediate once (public file) when it isn't bundled. */
export async function ensureWwdr({ dataDir = path.join(process.cwd(), 'data', 'wallet'), assets = ASSETS, fetchFn = fetch } = {}) {
  const target = path.join(dataDir, 'wwdr.cer');
  if (fs.existsSync(path.join(assets, 'AppleWWDRCAG4.cer')) || fs.existsSync(target)) return false;
  const r = await fetchFn(WWDR_URL);
  if (!r.ok) throw new Error(`WWDR download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const c = certFrom(buf);
  if (!/Apple Worldwide Developer Relations/i.test(c.subject.getField('CN')?.value ?? '') && !/Apple Worldwide Developer Relations/i.test(c.subject.getField('O')?.value ?? '') && !/Apple Worldwide Developer Relations/i.test(c.subject.getField('OU')?.value ?? '')) throw new Error('unexpected WWDR certificate');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(target, buf);
  return true;
}

// ---------- HTTP glue (used by server.mjs) ----------
export function createWallet({ env = process.env, dataDir, assets, limitPerHour = 10, now = () => Date.now() } = {}) {
  const opts = { ...(dataDir ? { dataDir } : {}), ...(assets ? { assets } : {}) };
  let cfg = loadWalletConfig(env, opts);
  let loadedAt = now();
  const config = () => { if (!cfg.ok && now() - loadedAt > 60_000) { cfg = loadWalletConfig(env, opts); loadedAt = now(); } return cfg; };
  const hits = new Map();
  const limited = (ip) => {
    const t = now(); const h = (hits.get(ip) || []).filter((x) => t - x < 3_600_000);
    h.push(t); hits.set(ip, h);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 3_600_000)) hits.delete(k);
    return h.length > limitPerHour;
  };
  return {
    reload() { cfg = loadWalletConfig(env, opts); loadedAt = now(); return cfg; },
    status() { const c = config(); return { enabled: c.ok, passTypeId: c.passTypeId, ...(c.ok ? { certExpires: c.expires } : { reason: c.reason }) }; },
    csr() { if (config().ok) return null; try { return fs.readFileSync(path.join(dataDir ?? path.join(process.cwd(), 'data', 'wallet'), 'pass.csr'), 'utf8'); } catch { return null; } },
    /** → { status, body (Buffer|object), type } — never logs or keeps the card. */
    handle(body, ip) {
      const c = config();
      if (!c.ok) return { status: 503, body: { error: 'Wallet cards aren’t set up on this server yet.' } };
      if (limited(ip)) return { status: 429, body: { error: 'Too many cards in a short time — try again later.' } };
      let card;
      try { card = validateCard(body); } catch (e) { return { status: e.status || 400, body: { error: e.message } }; }
      const pkpass = buildPass(card, c.signer, { passTypeId: c.passTypeId, teamId: c.teamId });
      return { status: 200, body: pkpass, type: 'application/vnd.apple.pkpass' };
    },
  };
}
