// Launch-day reset (Nov 2026). Imported FIRST by server.mjs, so it runs before the forum, the shared
// timelines and the notification list are loaded from data/.
// How to use: put LAUNCH_RESET=<any new word, e.g. launch-2026-12-01> in deploy.conf and push. On the
// next start the server moves forum.json (posts, comments, accounts), community.json (shared timelines),
// subscribers.json and notified.json (notification sign-ups) into data/backup-before-<word>/ and starts
// clean; the pinned Welcome post is made again on start. It runs once per word (data/launch-reset.done).
// Documents never live on the server, so nothing on anyone's phone changes.
import fs from 'node:fs';
import path from 'node:path';
import { readConf } from './auth.mjs';

export const RESET_FILES = ['forum.json', 'community.json', 'subscribers.json', 'notified.json'];

export function launchReset({ word = readConf('LAUNCH_RESET'), dataDir = path.resolve('data'), log = console.log } = {}) {
  word = String(word || '').trim();
  if (!word) return { done: false, why: 'LAUNCH_RESET is not set' };
  if (!/^[\w.-]{3,64}$/.test(word)) return { done: false, why: 'LAUNCH_RESET must be 3–64 letters, digits, dot, dash or underscore' };
  const mark = path.join(dataDir, 'launch-reset.done');
  let last = '';
  try { last = fs.readFileSync(mark, 'utf8').trim(); } catch {}
  if (last === word) return { done: false, why: 'already done for this word' };
  const backup = path.join(dataDir, `backup-before-${word}`);
  fs.mkdirSync(backup, { recursive: true });
  const moved = [];
  for (const f of RESET_FILES) {
    const from = path.join(dataDir, f);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(backup, f));
    fs.rmSync(from);
    moved.push(f);
  }
  fs.writeFileSync(mark, word);
  log(`launch reset "${word}": moved ${moved.join(', ') || 'nothing'} to ${backup}`);
  return { done: true, moved, backup };
}

if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_LAUNCH_RESET) {
  try { launchReset(); } catch (e) { console.error('launch reset failed', e.message); }
}
