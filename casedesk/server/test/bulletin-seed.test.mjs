// Backup copy of the Visa Bulletin (GitHub job → site/visa-bulletin.json): taken only when newer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'));
process.env.BULLETIN_FILE = path.join(dir, 'bulletin.json');
const seed = path.join(dir, 'seed.json');
const rows = (d) => [{ cat: 'EB-2', label: 'Advanced degree', final: { all: d, china: d, india: d, mexico: d, philippines: d }, filing: {} }];
const { adoptSeed, bulletinStatus } = await import('../src/bulletin.mjs');

test('seed: loads when the server has nothing, then only a newer month replaces it', () => {
  fs.writeFileSync(seed, JSON.stringify({ month: 'November 2026', rows: rows('2025-01-01'), history: [] }));
  assert.equal(adoptSeed({ file: seed, force: true }), true);
  assert.equal(bulletinStatus().month, 'November 2026');
  fs.writeFileSync(seed, JSON.stringify({ month: 'October 2026', rows: rows('2024-12-01'), history: [] }));
  assert.equal(adoptSeed({ file: seed, force: true }), false);
  fs.writeFileSync(seed, JSON.stringify({ month: 'December 2026', rows: rows('2025-02-01'), history: [] }));
  assert.equal(adoptSeed({ file: seed, force: true }), true);
  assert.equal(bulletinStatus().month, 'December 2026');
  assert.equal(bulletinStatus().historyMonths, 1); // November kept as the previous month
  assert.equal(JSON.parse(fs.readFileSync(process.env.BULLETIN_FILE, 'utf8')).month, 'December 2026');
});

test('seed: broken or empty files are ignored', () => {
  fs.writeFileSync(seed, '{oops');
  assert.equal(adoptSeed({ file: seed, force: true }), false);
  fs.writeFileSync(seed, JSON.stringify({ month: 'January 2027', rows: [] }));
  assert.equal(adoptSeed({ file: seed, force: true }), false);
  assert.equal(bulletinStatus().month, 'December 2026');
});
