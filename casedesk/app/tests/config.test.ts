// The resolved iOS config: iCloud Documents entitlements for the CaseDesk container, and the
// container kept private (no folder in the Files app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('iOS config: iCloud container entitlements, private container', { timeout: 120_000 }, () => {
  const r = spawnSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 110_000 });
  assert.equal(r.status, 0, r.stderr);
  const ios = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).ios;
  const id = 'iCloud.com.vijaykannan.casedesk';
  assert.deepEqual(ios.entitlements['com.apple.developer.icloud-container-identifiers'], [id]);
  assert.deepEqual(ios.entitlements['com.apple.developer.ubiquity-container-identifiers'], [id]);
  assert.deepEqual(ios.entitlements['com.apple.developer.icloud-services'], ['CloudDocuments']);
  assert.equal(ios.entitlements['com.apple.developer.icloud-container-environment'], 'Production');
  assert.equal(ios.infoPlist.NSUbiquitousContainers[id].NSUbiquitousContainerIsDocumentScopePublic, false);
});
