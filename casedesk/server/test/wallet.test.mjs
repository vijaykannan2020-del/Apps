// v2.5 Wallet pass: structure, manifest hashes, PKCS#7 signature (test certificates made here), card
// validation (no document numbers), 503 when not configured, rate limit, the server's own key + CSR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import forge from 'node-forge';
import { buildPass, unzip, sha1, validateCard, createWallet, loadWalletConfig, ensureKeyAndCsr, passJson, fmtDate, crc32, zip, teamFromCert, ensureWwdr } from '../src/wallet.mjs';

const PASS_TYPE = 'pass.com.vijaykannan.casedesk';
const TEAM = 'TEAM123456';

function makeCert({ subject, issuer, issuerKey, key, ca = false, days = 365 }) {
  const c = forge.pki.createCertificate();
  c.publicKey = key.publicKey;
  c.serialNumber = '0' + crypto.randomBytes(8).toString('hex');
  c.validity.notBefore = new Date(Date.now() - 86400000);
  c.validity.notAfter = new Date(Date.now() + days * 86400000);
  c.setSubject(subject); c.setIssuer(issuer);
  c.setExtensions(ca ? [{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true }] : [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true }]);
  c.sign(issuerKey, forge.md.sha256.create());
  return c;
}
// A fake "WWDR" CA and a Pass Type ID certificate it issued (same subject layout as Apple's).
const caKeys = forge.pki.rsa.generateKeyPair(2048);
const caSubj = [{ name: 'commonName', value: 'Test Worldwide Developer Relations CA' }, { name: 'organizationName', value: 'Test' }];
const wwdr = makeCert({ subject: caSubj, issuer: caSubj, issuerKey: caKeys.privateKey, key: caKeys, ca: true });
const passKeys = forge.pki.rsa.generateKeyPair(2048);
const passSubj = [{ type: '0.9.2342.19200300.100.1.1', value: PASS_TYPE }, { name: 'commonName', value: `Pass Type ID: ${PASS_TYPE}` }, { name: 'organizationalUnitName', value: TEAM }, { name: 'countryName', value: 'US' }];
const passCert = makeCert({ subject: passSubj, issuer: caSubj, issuerKey: caKeys.privateKey, key: passKeys });
const signer = { cert: passCert, key: passKeys.privateKey, wwdr };

const card = { serial: 'iw-0a1b2c3d', name: 'Priya', status: 'L-2S dependent', validUntil: '2027-09-30', validLabel: 'I-94', visaUntil: '2028-01-15', passportUntil: '2031-05-01', nextDeadline: { what: 'Passport expires', date: '2027-01-01' }, colour: 'teal', relevantDate: '2027-09-30', updated: '2026-11-18', disclaimer: 'ignored', sources: ['ignored'], extra: 'dropped' };

function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'));
  const dataDir = path.join(root, 'data'), assets = path.join(root, 'assets');
  fs.mkdirSync(dataDir); fs.mkdirSync(assets);
  for (const n of ['icon.png', 'icon@2x.png', 'logo.png']) fs.copyFileSync(new URL(`../wallet/${n}`, import.meta.url), path.join(assets, n));
  return { root, dataDir, assets };
}
const pem = (c) => forge.pki.certificateToPem(c);
const der = (c) => Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes(), 'binary');

test('pass: zip has pass.json, images, manifest with the SHA-1 of every file, and a detached signature', () => {
  const pk = buildPass(validateCard(card), signer, { passTypeId: PASS_TYPE, teamId: TEAM });
  const files = unzip(pk);
  for (const n of ['pass.json', 'icon.png', 'manifest.json', 'signature']) assert.ok(files[n], `missing ${n}`);
  const manifest = JSON.parse(files['manifest.json']);
  assert.deepEqual(Object.keys(manifest).sort(), Object.keys(files).filter((n) => n !== 'manifest.json' && n !== 'signature').sort());
  for (const [n, h] of Object.entries(manifest)) assert.equal(h, sha1(files[n]), `hash of ${n}`);
  const pj = JSON.parse(files['pass.json']);
  assert.equal(pj.formatVersion, 1); assert.equal(pj.passTypeIdentifier, PASS_TYPE); assert.equal(pj.teamIdentifier, TEAM); assert.equal(pj.serialNumber, 'iw-0a1b2c3d');
  assert.equal(pj.relevantDate, '2027-09-30T09:00:00Z');
  assert.ok(!pj.barcode && !pj.barcodes, 'nothing to scan');
  const front = [...pj.generic.headerFields, ...pj.generic.primaryFields, ...pj.generic.secondaryFields, ...pj.generic.auxiliaryFields].map((f) => `${f.label} ${f.value}`).join(' | ');
  assert.match(front, /FOR PERSONAL REFERENCE Not an official document/);
  assert.match(front, /Priya/); assert.match(front, /L-2S dependent/); assert.match(front, /Sep 30, 2027/); assert.match(front, /Jan 15, 2028/); assert.match(front, /May 1, 2031/);
  assert.match(front, /NEXT: PASSPORT EXPIRES Jan 1, 2027/);
  const back = pj.generic.backFields.map((f) => f.value).join(' ');
  assert.match(back, /NOT an official document/); assert.match(back, /i94\.cbp\.dhs\.gov/); assert.match(back, /not stored/);
  assert.ok(!JSON.stringify(pj).includes('dropped'));
});

test('pass: signature verifies with OpenSSL against the CA, covers manifest.json, and carries the WWDR cert', () => {
  const files = unzip(buildPass(validateCard(card), signer, { passTypeId: PASS_TYPE, teamId: TEAM }));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sig-'));
  fs.writeFileSync(path.join(d, 'manifest.json'), files['manifest.json']);
  fs.writeFileSync(path.join(d, 'signature'), files.signature);
  fs.writeFileSync(path.join(d, 'ca.pem'), pem(wwdr));
  const out = execFileSync('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', path.join(d, 'signature'), '-content', path.join(d, 'manifest.json'), '-CAfile', path.join(d, 'ca.pem'), '-purpose', 'any', '-out', '/dev/null'], { stdio: ['ignore', 'pipe', 'pipe'] });
  void out;
  // tampering breaks it
  fs.writeFileSync(path.join(d, 'manifest.json'), Buffer.concat([files['manifest.json'], Buffer.from(' ')]));
  assert.throws(() => execFileSync('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', path.join(d, 'signature'), '-content', path.join(d, 'manifest.json'), '-CAfile', path.join(d, 'ca.pem'), '-purpose', 'any', '-out', '/dev/null'], { stdio: 'pipe' }));
  const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(files.signature.toString('binary'))));
  assert.equal(p7.certificates.length, 2, 'signing cert + WWDR');
  assert.ok(!p7.content || p7.content.length() === 0, 'detached');
});

test('card validation: whitelist, dates, and no passport / receipt / A-numbers / SSNs', () => {
  const v = validateCard(card);
  assert.deepEqual(Object.keys(v).sort(), ['colour', 'name', 'nextDeadline', 'passportUntil', 'relevantDate', 'serial', 'status', 'updated', 'validLabel', 'validUntil', 'visaUntil'].sort());
  for (const bad of ['Priya Z9876543', 'EAC2690012345', 'A123456789', '123-45-6789', 'Priya 61234567890']) assert.throws(() => validateCard({ ...card, name: bad }), /Document numbers/, bad);
  assert.throws(() => validateCard({ ...card, nextDeadline: { what: 'RFE for IOE0912345678', date: '2027-01-01' } }), /Document numbers/);
  assert.throws(() => validateCard({ ...card, validUntil: '30/09/2027' }), /Bad validUntil/);
  assert.throws(() => validateCard({ ...card, serial: 'x' }), /Bad serial/);
  assert.throws(() => validateCard({ ...card, name: 'x'.repeat(41) }), /too long/);
  assert.throws(() => validateCard({ ...card, name: '' }), /Missing name/);
  assert.equal(validateCard({ ...card, colour: 'gold' }).colour, 'grey');
  assert.equal(fmtDate('2027-09-30'), 'Sep 30, 2027'); assert.equal(fmtDate(undefined), '—');
  assert.equal(passJson(validateCard({ ...card, nextDeadline: null, relevantDate: undefined }), { passTypeId: PASS_TYPE, teamId: TEAM }).relevantDate, undefined);
});

test('config: not configured → 503 and status says why; files → enabled; mismatched key or wrong pass type refused', () => {
  const { dataDir, assets } = tmpDirs();
  const w0 = createWallet({ env: {}, dataDir, assets });
  assert.equal(w0.status().enabled, false);
  assert.equal(w0.handle(card, '1.1.1.1').status, 503);
  // the server's own key + CSR, then a certificate for that key
  const csrPem = ensureKeyAndCsr({}, { dataDir });
  assert.match(csrPem, /BEGIN CERTIFICATE REQUEST/);
  assert.equal(fs.statSync(path.join(dataDir, 'pass.key')).mode & 0o777, 0o600);
  assert.equal(ensureKeyAndCsr({}, { dataDir }), csrPem, 'made once');
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  assert.ok(csr.verify(), 'CSR self-signature valid');
  const issued = forge.pki.createCertificate();
  issued.publicKey = csr.publicKey; issued.serialNumber = '01'; issued.validity.notBefore = new Date(Date.now() - 1000); issued.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  issued.setSubject(passSubj); issued.setIssuer(caSubj); issued.sign(caKeys.privateKey, forge.md.sha256.create());
  fs.writeFileSync(path.join(assets, 'pass.cer'), der(issued)); // DER, as Apple/ASC give it
  assert.equal(loadWalletConfig({}, { dataDir, assets }).reason, 'Apple WWDR intermediate certificate missing');
  fs.writeFileSync(path.join(assets, 'AppleWWDRCAG4.cer'), der(wwdr));
  const cfg = loadWalletConfig({}, { dataDir, assets });
  assert.equal(cfg.ok, true, cfg.reason); assert.equal(cfg.teamId, TEAM); assert.equal(teamFromCert(issued), TEAM);
  const w = createWallet({ env: {}, dataDir, assets });
  assert.deepEqual(Object.keys(w.status()).sort(), ['certExpires', 'enabled', 'passTypeId']);
  assert.equal(w.csr(), null, 'CSR no longer offered once signing works');
  const r = w.handle(card, '2.2.2.2');
  assert.equal(r.status, 200); assert.equal(r.type, 'application/vnd.apple.pkpass');
  assert.equal(unzip(r.body)['pass.json'] ? 'ok' : '', 'ok');
  assert.equal(w.handle({ ...card, name: 'EAC2690012345' }, '2.2.2.2').status, 400);
  // a certificate for another key
  fs.writeFileSync(path.join(assets, 'pass.cer'), pem(passCert));
  assert.match(loadWalletConfig({}, { dataDir, assets }).reason, /don’t match/);
  // PEM env pair works and a wrong pass type id is refused
  const env = { PASS_CERT_PEM: pem(passCert), PASS_KEY_PEM: forge.pki.privateKeyToPem(passKeys.privateKey), PASS_WWDR_PEM: pem(wwdr) };
  assert.equal(loadWalletConfig(env, { dataDir, assets }).ok, true);
  assert.match(loadWalletConfig({ ...env, PASS_TYPE_ID: 'pass.com.other' }, { dataDir, assets }).reason, /not pass\.com\.other/);
  assert.equal(ensureKeyAndCsr(env, { dataDir }), null, 'no CSR when a certificate is configured by env');
});

test('config: P12 in env works', () => {
  const p12 = forge.pkcs12.toPkcs12Asn1(passKeys.privateKey, [passCert], 'pw', { algorithm: '3des' });
  const b64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
  const cfg = loadWalletConfig({ PASS_CERT_P12: b64, PASS_CERT_PASSWORD: 'pw', PASS_WWDR_PEM: pem(wwdr) }, tmpDirs());
  assert.equal(cfg.ok, true, cfg.reason);
});

test('rate limit: 10 cards per hour per IP', () => {
  const { assets, dataDir } = tmpDirs();
  let t = 0;
  const w = createWallet({ env: { PASS_CERT_PEM: pem(passCert), PASS_KEY_PEM: forge.pki.privateKeyToPem(passKeys.privateKey), PASS_WWDR_PEM: pem(wwdr) }, dataDir, assets, now: () => t });
  for (let i = 0; i < 10; i++) assert.equal(w.handle(card, '9.9.9.9').status, 200);
  assert.equal(w.handle(card, '9.9.9.9').status, 429);
  assert.equal(w.handle(card, '8.8.8.8').status, 200, 'other IPs unaffected');
  t += 3_600_001;
  assert.equal(w.handle(card, '9.9.9.9').status, 200, 'resets after an hour');
});

test('zip + crc32 are standard (unzip -t accepts the file), WWDR download is checked', async () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  fs.writeFileSync(path.join(d, 'a.pkpass'), zip({ 'pass.json': Buffer.from('{}'), 'x/y.txt': Buffer.from('hi'.repeat(100)) }));
  try { execFileSync('unzip', ['-t', path.join(d, 'a.pkpass')], { stdio: 'pipe' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const { dataDir, assets } = tmpDirs();
  const ok = await ensureWwdr({ dataDir, assets, fetchFn: async () => ({ ok: true, arrayBuffer: async () => der(makeCert({ subject: [{ name: 'commonName', value: 'Apple Worldwide Developer Relations Certification Authority' }], issuer: caSubj, issuerKey: caKeys.privateKey, key: caKeys, ca: true })) }) });
  assert.equal(ok, true);
  assert.equal(await ensureWwdr({ dataDir, assets, fetchFn: async () => { throw new Error('not called'); } }), false, 'only once');
  const { dataDir: d2, assets: a2 } = tmpDirs();
  await assert.rejects(ensureWwdr({ dataDir: d2, assets: a2, fetchFn: async () => ({ ok: true, arrayBuffer: async () => der(wwdr) }) }), /unexpected/);
});
