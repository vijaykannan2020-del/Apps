// iCloud automatic backup: names, keep the last 3, when it is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupName, backupTime, sortBackups, toPrune, backupDueNow, ICLOUD_DEFAULT } from '../src/core/icloud';

test('names sort by time; only the newest 3 are kept; other files are never touched', () => {
  const n = backupName(new Date('2026-11-18T09:30:05Z'));
  assert.equal(n, 'CaseDesk-2026-11-18-093005.casedesk');
  assert.equal(backupTime(n), '2026-11-18T09:30:05Z');
  const files = ['CaseDesk-2026-11-15-080000.casedesk', 'notes.txt', 'CaseDesk-2026-11-18-093005.casedesk', 'CaseDesk-2026-11-16-080000.casedesk', 'CaseDesk-2026-11-17-080000.casedesk'];
  assert.equal(sortBackups(files)[0], n);
  assert.deepEqual(toPrune(files), ['CaseDesk-2026-11-15-080000.casedesk']);
  assert.deepEqual(toPrune(files.slice(0, 3)), []);
});

test('due: off never; daily; debounced after a change; Wi-Fi only', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  assert.equal(backupDueNow(ICLOUD_DEFAULT, now), null);
  const on = { ...ICLOUD_DEFAULT, on: true };
  assert.equal(backupDueNow(on, now), 'daily', 'never backed up');
  assert.equal(backupDueNow({ ...on, lastAt: '2026-11-17T11:00:00Z' }, now), 'daily');
  assert.equal(backupDueNow({ ...on, lastAt: '2026-11-18T11:00:00Z' }, now), null);
  assert.equal(backupDueNow({ ...on, lastAt: '2026-11-18T11:00:00Z', changedAt: '2026-11-18T11:55:00Z' }, now), 'changed');
  assert.equal(backupDueNow({ ...on, lastAt: '2026-11-18T11:00:00Z', changedAt: '2026-11-18T11:59:30Z' }, now), null, 'still changing (debounce)');
  assert.equal(backupDueNow({ ...on, lastAt: '2026-11-18T11:45:00Z', changedAt: '2026-11-18T11:50:00Z' }, now), null, 'at most every 30 minutes');
  assert.equal(backupDueNow(on, now, { wifi: false }), null, 'Wi-Fi only');
  assert.equal(backupDueNow({ ...on, wifiOnly: false }, now, { wifi: false }), 'daily');
  assert.equal(backupDueNow(on, now, { wifi: undefined }), 'daily', 'unknown network: iOS settings decide');
});

test('older builds without the iCloud module: no crash, a clear message', async () => {
  const Module = (await import('node:module')).default as any;
  const path = await import('node:path');
  const orig = Module._resolveFilename;
  const stubs: Record<string, string> = { 'react-native': path.join(__dirname, 'stubs/react-native.cjs') };
  Module._resolveFilename = function (req: string, ...a: any[]) { return stubs[req] ?? orig.call(this, req, ...a); };
  const ic = require('../src/native/icloud') as typeof import('../src/native/icloud');
  assert.equal(ic.hasICloudModule(), false);
  const s = await ic.iCloudSupport();
  assert.deepEqual(s, { ok: false, reason: 'old-build' });
  assert.equal(ic.supportText(s), 'Needs the latest app version from the App Store');
  assert.deepEqual(await ic.listBackups(), []);
  await assert.rejects(ic.writeBackup('x', 'y'), /isn’t available/);
});

test('back-off after failed automatic backups: 30 minutes, then 2 hours, then daily; a success clears it', async () => {
  const { retryAfterMs } = await import('../src/core/icloud');
  assert.deepEqual([0, 1, 2, 3, 7].map(retryAfterMs), [0, 30 * 60e3, 2 * 3600e3, 24 * 3600e3, 24 * 3600e3]);
  const now = new Date('2026-11-18T12:00:00Z');
  const base = { ...ICLOUD_DEFAULT, on: true, wifiOnly: false }; // never backed up → would be due
  assert.equal(backupDueNow({ ...base, failures: 1, lastAttemptAt: '2026-11-18T11:45:00Z' }, now), null, '15 min after 1st failure');
  assert.equal(backupDueNow({ ...base, failures: 1, lastAttemptAt: '2026-11-18T11:20:00Z' }, now), 'daily', '40 min after 1st failure');
  assert.equal(backupDueNow({ ...base, failures: 2, lastAttemptAt: '2026-11-18T10:30:00Z' }, now), null, '90 min after 2nd failure');
  assert.equal(backupDueNow({ ...base, failures: 3, lastAttemptAt: '2026-11-18T00:00:00Z' }, now), null, '12 h after 3rd failure');
  assert.equal(backupDueNow({ ...base, failures: 0, lastAttemptAt: '2026-11-18T11:59:00Z' }, now), 'daily', 'reset');
});

test('friendly iCloud errors', async () => {
  const { friendlyICloudError: f } = await import('../src/core/icloud');
  assert.match(f({ code: 'ERR_WRITE_ERROR', message: 'Failed to write file: The operation couldn’t be completed. (NSCocoaErrorDomain error 640.)' }), /^iCloud storage is full/);
  assert.match(f({ code: 'ERR_QUOTA_EXCEEDED', message: 'quota' }), /^iCloud storage is full/);
  assert.match(f(new Error('You don’t have enough storage in iCloud')), /^iCloud storage is full/);
  assert.equal(f(new Error('not signed in')), 'Sign in to iCloud in iOS Settings');
  assert.equal(f({ code: 'ERR_AUTHENTICATION_FAILED', message: 'x' }), 'Sign in to iCloud in iOS Settings');
  assert.match(f({ message: 'The operation couldn’t be completed. (NSUbiquitousFileErrorDomain error 4353.)' }), /^Turn on iCloud Drive for Immigration Wallet/);
  assert.equal(f(new Error('Needs the latest app version from the App Store')), 'Needs the latest app version from the App Store');
  assert.equal(f(undefined), 'Couldn’t back up to iCloud');
  // error 640 in another domain isn't "full"
  assert.doesNotMatch(f({ message: "NSPOSIXErrorDomain error 640" }), /full/);
});
