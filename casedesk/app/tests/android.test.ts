// Android build: config and the pure bits that differ from iPhone. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareImportPath } from '../src/core/shareLink';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

test('android: share files opened from other apps (content://) go to the import screen', () => {
  assert.equal(shareImportPath('content://com.android.providers.downloads.documents/document/42'), '/share-import?file=' + encodeURIComponent('content://com.android.providers.downloads.documents/document/42'));
  assert.equal(shareImportPath('casedesk://person/a'), null);
  assert.equal(shareImportPath('content://'), null);
});

test('android: package, share-file intent, widget and biometric permission are configured', () => {
  assert.equal(app.android.package, 'com.vijaykannan.casedesk');
  const mimes = app.android.intentFilters.flatMap((f: any) => f.data.map((d: any) => d.mimeType));
  assert.ok(mimes.includes('application/x-immigration-wallet-share'));
  const w = app.plugins.find((p: any) => Array.isArray(p) && p[0] === 'react-native-android-widget');
  assert.equal(w[1].widgets[0].name, 'Family');
  assert.ok(app.android.permissions.includes('android.permission.USE_BIOMETRIC'));
});

test('android-only native packages stay out of the iPhone build', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const m of ['@react-native-google-signin/google-signin', 'react-native-android-widget']) assert.ok(pkg.expo.autolinking.ios.exclude.includes(m), m);
});
