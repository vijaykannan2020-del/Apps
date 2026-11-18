// N1: document files are referenced by name; the orphan sweep survives iOS moving the app container.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { migrateDocs, migrateFile, orphanNames, referencedFiles, storedRef } from '../src/core/files';
import { Store, KEYS } from '../src/data/store';
import { memoryKV } from '../src/data/kv';
import type { Document } from '../src/core/model';

// Load src/native/files.ts against small stand-ins for react-native and expo-file-system.
const stubs: Record<string, string> = {
  'react-native': path.join(__dirname, 'stubs/react-native.cjs'),
  'expo-file-system': path.join(__dirname, 'stubs/expo-file-system.cjs'),
};
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return stubs[req] ?? orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require('../src/native/files') as typeof import('../src/native/files');
const g = globalThis as any;
const OLD = 'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/cd2-docs/';
const NOW = Date.parse('2026-11-18T12:00:00Z');
const DAY = 864e5;
const run = (files: { name: string; mtime?: number }[], keep: Iterable<string> | null) => {
  g.__fsFiles = files; g.__fsDeleted = [];
  native.sweepOrphans(keep, NOW);
  return (g.__fsDeleted as string[]).map((u) => u.split('/').pop());
};

test('moved container: a file referenced by its OLD absolute path is kept, the orphan goes', () => {
  const del = run([{ name: 'doc_a-passport.jpg', mtime: NOW - 3 * DAY }, { name: 'doc_b-orphan.jpg', mtime: NOW - 3 * DAY }], [OLD + 'doc_a-passport.jpg']);
  assert.deepEqual(del, ['doc_b-orphan.jpg']);
});

test('names only: stored names are matched in today’s folder', () => {
  const del = run([{ name: 'doc_a-passport.jpg', mtime: NOW - 3 * DAY }, { name: 'doc_b-orphan.jpg', mtime: NOW - 3 * DAY }], ['doc_a-passport.jpg']);
  assert.deepEqual(del, ['doc_b-orphan.jpg']);
});

test('nothing is deleted when the reference list is empty or storage failed (null)', () => {
  const files = [{ name: 'doc_a.jpg', mtime: NOW - 9 * DAY }];
  assert.deepEqual(run(files, []), []);
  assert.deepEqual(run(files, null), []);
});

test('files younger than 24 h are never deleted', () => {
  const del = run([{ name: 'keep.jpg', mtime: NOW - 9 * DAY }, { name: 'new.jpg', mtime: NOW - 2 * 3600e3 }, { name: 'old.jpg', mtime: NOW - 25 * 3600e3 }], ['keep.jpg']);
  assert.deepEqual(del, ['old.jpg']);
  // seconds-based timestamps are understood too
  assert.deepEqual(run([{ name: 'k.jpg' }, { name: 'n.jpg', mtime: (NOW - 3600e3) / 1000 }], ['k.jpg']), []);
});

test('fileUri rebuilds the path from the name in the current container', () => {
  g.__fsRoot = 'file:///var/mobile/Containers/Data/Application/NEWER/Documents/';
  assert.equal(native.fileUri({ file: 'doc_a.jpg' }), 'file:///var/mobile/Containers/Data/Application/NEWER/Documents/cd2-docs/doc_a.jpg');
  assert.equal(native.fileUri({ file: 'blob:http://localhost/x' }), 'blob:http://localhost/x');
  delete g.__fsRoot;
});

test('migration: absolute paths from earlier builds become names; other URIs are kept', () => {
  assert.deepEqual(migrateFile({ uri: OLD + 'doc_a-pass%20port.jpg', name: 'p.jpg', mime: 'image/jpeg' }), { file: 'doc_a-pass port.jpg', name: 'p.jpg', mime: 'image/jpeg' });
  assert.equal(storedRef('blob:http://localhost/abc'), 'blob:http://localhost/abc');
  const docs = [{ id: 'd1', ownerId: 'me', type: 'passport', fields: {}, addedAt: '', files: [{ uri: OLD + 'a.jpg', name: 'a', mime: 'image/jpeg' }] }] as unknown as Document[];
  const m = migrateDocs(docs);
  assert.equal(m.changed, true);
  assert.equal(m.docs[0].files![0].file, 'a.jpg');
  assert.equal(migrateDocs(m.docs).changed, false);
  assert.deepEqual(referencedFiles(docs, [{ file: 'draft.jpg', name: 'd', mime: 'image/jpeg' }]), ['a.jpg', 'draft.jpg']);
});

test('store migrates saved documents on load and reports a failed load as null', async () => {
  const kv = memoryKV({ [KEYS.docs]: JSON.stringify({ v: 1, data: [{ id: 'd1', ownerId: 'me', type: 'passport', fields: {}, addedAt: '', files: [{ uri: OLD + 'a.jpg', name: 'a', mime: 'image/jpeg' }] }] }) });
  const s = new Store(kv);
  assert.equal((await s.docs())[0].files![0].file, 'a.jpg');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(!(await kv.getItem(KEYS.docs))!.includes('OLD-UUID'), 'migrated docs are written back');
  assert.equal((await s.docsOrNull())!.length, 1);
  assert.equal(await new Store(memoryKV({ [KEYS.docs]: 'garbage' })).docsOrNull(), null);
  const failing = { ...memoryKV(), getItem: async () => { throw new Error('io'); } };
  assert.equal(await new Store(failing).docsOrNull(), null);
  assert.deepEqual(await new Store(memoryKV()).docsOrNull(), []);
});

test('orphanNames (pure): unknown age is kept (safer), old unreferenced is deleted', () => {
  assert.deepEqual(orphanNames([{ name: 'a.jpg' }, { name: 'b.jpg' }], ['x/cd2-docs/a.jpg'], NOW), []);
  assert.deepEqual(orphanNames([{ name: 'a.jpg' }, { name: 'b.jpg', modifiedMs: NOW - 48 * 3600e3 }], ['x/cd2-docs/a.jpg'], NOW), ['b.jpg']);
});
