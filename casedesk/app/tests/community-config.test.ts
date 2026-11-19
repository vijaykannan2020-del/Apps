// Community (v2.4): the iOS build must carry the Sign in with Apple entitlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

test('app.json: usesAppleSignIn + plugin; resolved entitlement is Default', { timeout: 120_000 }, () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
  assert.equal(cfg.ios.usesAppleSignIn, true);
  assert.ok(cfg.plugins.includes('expo-apple-authentication'));
  const r = spawnSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 110_000 });
  assert.equal(r.status, 0, r.stderr);
  const ios = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).ios;
  assert.deepEqual(ios.entitlements['com.apple.developer.applesignin'], ['Default']);
});
