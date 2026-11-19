// QA: a restore (any source) never copies the old phone's iCloud backup settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { Store } from '../src/data/store';
import { memoryKV } from '../src/data/kv';
import type { BackupPayload } from '../src/core/backup';

const stubs: Record<string, string> = {
  'react-native': path.join(__dirname, 'stubs/react-native.cjs'),
  'expo-file-system': path.join(__dirname, 'stubs/expo-file-system.cjs'),
};
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return stubs[req] ?? orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { restore, buildPayload } = require('../src/data/backupIO') as typeof import('../src/data/backupIO');

const old: BackupPayload = {
  app: 'casedesk', schema: 1, exportedAt: '2026-11-10T00:00:00Z',
  people: [{ id: 'me', name: 'Riya', relation: 'self', facts: {}, createdAt: '2026-11-01' }], docs: [], cases: [],
  settings: { reminderLeadDays: [30], theme: 'dark', icloud: { on: true, wifiOnly: false, lastAt: '2026-11-10T08:00:00Z' }, faceId: true },
  files: {},
};

test('replace: iCloud backup is off on this phone and Home asks to turn it on; other settings come back', async () => {
  const s = new Store(memoryKV());
  await restore(s, old, 'replace');
  const st = await s.settings();
  assert.ok(!st.icloud?.on, 'iCloud off');
  assert.equal(st.icloud?.lastAt, undefined, 'no last-backup time from the old phone');
  assert.equal(st.icloudAsk, true);
  assert.ok(!st.faceId, 'Face ID belongs to the phone');
  assert.equal(st.theme, 'dark');
  assert.deepEqual(st.reminderLeadDays, [30]);
});

test('replace on a phone that had iCloud on: turned off until set up again here', async () => {
  const s = new Store(memoryKV());
  await s.updateSettings({ icloud: { on: true, wifiOnly: true, lastAt: '2026-11-17T08:00:00Z' } });
  await restore(s, old, 'replace');
  const st = await s.settings();
  assert.equal(st.icloud?.on, false);
  assert.equal(st.icloud?.wifiOnly, true, 'this phone’s Wi-Fi choice is kept');
  assert.equal(st.icloudAsk, true);
});

test('merge copies no iCloud settings; asks only if this phone’s iCloud backup is off', async () => {
  const s = new Store(memoryKV());
  await s.updateSettings({ icloud: { on: true, wifiOnly: true, lastAt: '2026-11-17T08:00:00Z' } });
  await s.savePeople([{ id: 'p1', name: 'Arun', relation: 'self', facts: {}, createdAt: '2026-11-01' }]);
  await restore(s, old, 'merge');
  const st = await s.settings();
  assert.equal(st.icloud?.on, true);
  assert.equal(st.icloud?.lastAt, '2026-11-17T08:00:00Z');
  assert.equal(st.icloudAsk, false);
});

test('new backups never carry iCloud or Face ID settings', async () => {
  const s = new Store(memoryKV());
  await s.updateSettings({ icloud: { on: true, wifiOnly: true }, faceId: true, icloudAsk: true, theme: 'light' });
  const { payload } = await buildPayload(s);
  const st = payload.settings as Record<string, unknown>;
  assert.equal(st.icloud, undefined); assert.equal(st.faceId, undefined); assert.equal(st.icloudAsk, undefined);
  assert.equal(st.theme, 'light');
});
