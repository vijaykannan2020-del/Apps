import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchReset, RESET_FILES } from '../src/launch-reset.mjs';

test('launch reset moves the community data aside once per word and leaves other files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-'));
  for (const f of [...RESET_FILES, 'form-stats.json']) fs.writeFileSync(path.join(dir, f), '{"x":1}');
  const quiet = () => {};
  assert.equal(launchReset({ word: '', dataDir: dir, log: quiet }).done, false);
  const r = launchReset({ word: 'launch-test', dataDir: dir, log: quiet });
  assert.equal(r.done, true);
  assert.deepEqual(r.moved.sort(), [...RESET_FILES].sort());
  for (const f of RESET_FILES) { assert.equal(fs.existsSync(path.join(dir, f)), false); assert.equal(fs.existsSync(path.join(dir, 'backup-before-launch-test', f)), true); }
  assert.equal(fs.existsSync(path.join(dir, 'form-stats.json')), true, 'public data stays');
  fs.writeFileSync(path.join(dir, 'forum.json'), '{"new":1}');
  assert.equal(launchReset({ word: 'launch-test', dataDir: dir, log: quiet }).done, false, 'runs once per word');
  assert.equal(fs.existsSync(path.join(dir, 'forum.json')), true);
  assert.equal(launchReset({ word: 'bad word!', dataDir: dir, log: quiet }).done, false);
});
