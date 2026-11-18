import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, readHeader, toBase64, fromBase64, utf8, fromUtf8 } from '../src/core';
import { caseViews, deriveRecord, setToday } from '../src/core';
import { T, doc, person } from './helpers';

const FAST = { N: 2 ** 10, r: 8, p: 1, dkLen: 32 };

test('backup round-trip; wrong password is refused', async () => {
  const payload = JSON.stringify({ app: 'casedesk', note: 'Ünïcødé ✓ 😀', big: 'x'.repeat(5000) });
  const file = await encryptBackup(payload, 'correct horse', undefined, FAST);
  assert.equal(readHeader(file).kdf, 'scrypt');
  assert.equal(await decryptBackup(file, 'correct horse'), payload);
  await assert.rejects(decryptBackup(file, 'wrong password'), /Wrong password/);
  await assert.rejects(encryptBackup(payload, 'short', undefined, FAST), /8 characters/);
});

test('base64 and utf-8 helpers match Node', () => {
  const s = 'Résumé — 東京 🚀';
  assert.equal(fromUtf8(utf8(s)), s);
  assert.deepEqual(Buffer.from(utf8(s)), Buffer.from(s, 'utf8'));
  for (const n of [0, 1, 2, 3, 100]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255);
    assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
    assert.deepEqual(fromBase64(toBase64(b)), b);
  }
});

test('cases: receipt + approval for the same receipt is one approved case; manual status wins', () => {
  setToday('2026-11-18');
  const me = person('me', 'self');
  const docs = [doc('me', T.receipt('WAC2690000001', '04/01/2026')), doc('me', T.approval('WAC2690000001', '06/01/2026', '07/01/2026', '06/30/2029'))];
  const recs = { me: deriveRecord(me, docs) };
  const v = caseViews([me], recs, docs, []);
  assert.equal(v.length, 1);
  assert.equal(v[0].status, 'Approved');
  const m = caseViews([me], recs, docs, [{ id: 'c1', receipt: 'IOE0912345678', form: 'I-765', ownerId: 'me', status: 'rfe', keyDates: [{ kind: 'rfe-due', date: '2026-12-15' }], history: [] }]);
  assert.equal(m.find((x) => x.receipt === 'IOE0912345678')?.status, 'RFE');
});
