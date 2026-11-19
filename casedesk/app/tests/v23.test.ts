// v2.3 (Round 3): citizenship answers, notifications, rename, backups, About, data sources. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { answerState, ANSWER_LABEL, quizSummary } from '../src/core/quiz';
import { alertOn, bulletinAlert, caseChanges, permText, shouldAskNotifications, statusMap } from '../src/core/notify';
import { backupFileName, encryptBackup, readHeader, KDF } from '../src/core/backup';
import { versionRows } from '../src/core/appinfo';
import { DISCLAIMER, NOT_OFFICIAL_ID, SOURCES } from '../src/content/legal';
import { DATA_SOURCES } from '../src/content/sources';
import { BULLETIN } from '../src/content/bulletin';
import Module from 'node:module';
import path from 'node:path';

// src/native/reminders.ts needs react-native: load it against the small stand-in.
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return req === 'react-native' ? path.join(__dirname, 'stubs/react-native.cjs') : orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reminderItems } = require('../src/native/reminders') as typeof import('../src/native/reminders');

// ---------- A3 citizenship test ----------
test('quiz: chosen right = correct; chosen wrong = wrong and the right one shown; others dim; nothing before a choice', () => {
  assert.equal(answerState(1, null, 2), 'idle');
  assert.equal(answerState(2, 2, 2), 'correct');
  assert.equal(answerState(0, 0, 2), 'wrong');
  assert.equal(answerState(2, 0, 2), 'answer');
  assert.equal(answerState(1, 0, 2), 'dim');
  assert.equal(ANSWER_LABEL.correct, 'Correct');
  assert.equal(ANSWER_LABEL.wrong, 'Not quite');
  assert.ok(ANSWER_LABEL.answer, 'right answer has a word, not just colour');
});
test('quiz: score summary uses the real test share (12 of 20 = 60%) and lists the misses', () => {
  const r = (ok: boolean, i: number) => ({ q: `Q${i}`, chosen: ok ? 'a' : 'b', right: 'a', ok });
  const s = quizSummary([...Array(6)].map((_, i) => r(true, i)).concat([...Array(4)].map((_, i) => r(false, i + 6))));
  assert.deepEqual([s.right, s.total, s.pct, s.passMark, s.passed], [6, 10, 60, 6, true]);
  assert.equal(s.missed.length, 4);
  assert.equal(quizSummary([r(true, 0), r(false, 1), r(false, 2), r(false, 3), r(false, 4)]).passed, false);
  assert.equal(quizSummary([]).pct, 0);
});

// ---------- D12 notifications ----------
test('notify: ask only after the first case or document, once, and only if iOS has not been asked', () => {
  const s = {};
  assert.equal(shouldAskNotifications({ perm: 'undetermined', settings: s, docs: 0, cases: 0 }), false);
  assert.equal(shouldAskNotifications({ perm: 'undetermined', settings: s, docs: 1, cases: 0 }), true);
  assert.equal(shouldAskNotifications({ perm: 'undetermined', settings: s, docs: 0, cases: 1 }), true);
  assert.equal(shouldAskNotifications({ perm: 'undetermined', settings: { notifAskedAt: '2026-11-18T00:00:00Z' }, docs: 3, cases: 0 }), false);
  assert.equal(shouldAskNotifications({ perm: 'granted', settings: s, docs: 3, cases: 0 }), false);
  assert.equal(shouldAskNotifications({ perm: 'denied', settings: s, docs: 3, cases: 0 }), false);
  assert.equal(shouldAskNotifications({ perm: 'unavailable', settings: s, docs: 3, cases: 0 }), false);
});
test('notify: case status change alerts; first load and new cases do not', () => {
  const now = [{ id: 'c1', status: 'Approved', form: 'I-129', ownerName: 'Arun' }, { id: 'c2', status: 'Pending' }];
  assert.deepEqual(caseChanges(null, now), []);
  const a = caseChanges({ c1: 'Pending' }, now);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /I-129 status: Approved/);
  assert.match(a[0].body, /Arun’s case changed from Pending to Approved/);
  assert.equal(a[0].url, '/case/c1');
  assert.match(caseChanges({ c2: 'Pending' }, [{ id: 'c2', status: 'RFE' }])[0].title, /Request for Evidence/);
  assert.deepEqual(statusMap(now), { c1: 'Approved', c2: 'Pending' });
});
test('notify: new Visa Bulletin alerts only on a different live month after one was seen', () => {
  assert.deepEqual(bulletinAlert(undefined, 'November 2026', false), {});
  assert.deepEqual(bulletinAlert(undefined, 'November 2026', true), { seen: 'November 2026' });
  assert.deepEqual(bulletinAlert('November 2026', 'November 2026', true), {});
  const r = bulletinAlert('November 2026', 'December 2026', true);
  assert.equal(r.seen, 'December 2026');
  assert.match(r.alert!.title, /December 2026 Visa Bulletin/);
});
test('notify: alert kinds default on; Settings text says how to fix a denied permission', () => {
  assert.equal(alertOn({}, 'cases'), true);
  assert.equal(alertOn({ alerts: { cases: false } }, 'cases'), false);
  assert.equal(alertOn({ alerts: { cases: false } }, 'bulletin'), true);
  assert.match(permText('denied').sub, /iOS Settings/);
  assert.equal(permText('granted').title, 'On');
});
test('notify: document expiry reminders include the visa stamp, and are worded with the new name', () => {
  const people = [{ id: 'p', name: 'Test', relation: 'self', facts: {}, createdAt: '2026-01-01', reminders: { on: true, lead: [30] } }] as never;
  const items = reminderItems(people, { p: { visaStamp: { expires: '2030-06-01' } } as never }, {}, []);
  assert.ok(items.some((x) => /visa stamp expires/.test(x.title)));
  assert.ok(items.every((x) => /Immigration Wallet/.test(x.body) && !/CaseDesk/.test(x.body)));
});

// ---------- C10 rename + backups ----------
test('backup file name: Immigration Wallet backup <date>.casedesk, old files still open (same format id)', async () => {
  assert.equal(backupFileName(new Date(2026, 10, 8, 23, 50)), 'Immigration Wallet backup 2026-11-08.casedesk');
  const text = await encryptBackup('{"app":"casedesk"}', 'password1', undefined, { ...KDF, N: 2 ** 4 });
  assert.ok(text.startsWith('CASEDESK-BACKUP 1\n'), 'format id unchanged so CaseDesk backups restore');
  assert.equal(readHeader(text).v, 1);
  assert.throws(() => readHeader('nope\n{}'), /Immigration Wallet backup/);
});
test('rename: no user-facing CaseDesk left in the app (comments, ids and storage keys excepted)', () => {
  const root = new URL('../', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  walk(join(root, 'src')); walk(join(root, 'app'));
  const bad: string[] = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (!l.includes('CaseDesk') || /^\s*(\/\/|\*|\/\*)/.test(l)) return;
    if (/ICLOUD_DIR|const RE = |return `CaseDesk-|\/\*\*/.test(l)) return; // iCloud folder + file names stay (private container)
    bad.push(`${f.replace(root, '')}:${i + 1}`);
  });
  assert.deepEqual(bad, []);
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
  assert.equal(app.name, 'Immigration Wallet');
  assert.equal(app.slug, 'casedesk');
  assert.equal(app.scheme, 'casedesk');
  assert.equal(app.ios.bundleIdentifier, 'com.vijaykannan.casedesk');
  assert.ok(!JSON.stringify(app.plugins).includes('CaseDesk'), 'permission strings renamed');
});

// ---------- B5 / B7 / B9 / C11 ----------
test('disclaimer: exact launch wording; every source is an official https link', () => {
  assert.equal(DISCLAIMER, 'Immigration Wallet is not affiliated with USCIS, DHS, DOL, the State Department or any government agency. Information comes from official public sources linked in the app. Not legal advice.');
  for (const s of Object.values(SOURCES)) assert.match(s.url, /^https:\/\/([a-z0-9-]+\.)*(uscis|state|dol|cbp)\.gov\//);
  assert.match(NOT_OFFICIAL_ID, /not an official ID/);
});
test('About: version, build and OTA update id rows', () => {
  const r = versionRows({ version: '1.0.0', build: '12', updateId: 'a1b2c3d4-e5f6', updateAt: '2026-11-18T10:00:00Z', embedded: false, channel: 'production' });
  assert.deepEqual(r.map((x) => x.label), ['Version', 'Update', 'Channel']);
  assert.equal(r[0].value, '1.0.0 (build 12)');
  assert.match(r[1].value, /^a1b2c3d4 · Nov 18, 2026$/);
  assert.match(versionRows({ version: '1.0.0', embedded: true, updateId: 'x' })[1].value, /Built-in/);
});
test('data sources: every built-in data set has a date, an official source and a check status', () => {
  for (const d of DATA_SOURCES) { assert.ok(d.asOf && d.asOf !== '—', d.id); assert.match(d.source.url, /^https:\/\//); assert.ok(d.note.length > 10); }
  for (const id of ['bulletin', 'processing', 'fees', 'waits', 'wage', 'h1b']) assert.ok(DATA_SOURCES.some((d) => d.id === id), id);
});
test('bulletin: built-in EB-2 India matches the November 2026 bulletin (final Nov 1, 2013 · filing Jan 15, 2015)', () => {
  const eb2 = BULLETIN.rows.find((r) => r.cat === 'EB-2')!;
  assert.equal(BULLETIN.month, 'November 2026');
  assert.equal(eb2.final.india, '2013-11-01');
  assert.equal(eb2.filing.india, '2015-01-15');
  const news = readFileSync(new URL('../src/content/news.ts', import.meta.url), 'utf8');
  assert.match(news, /India EB-2 held at Nov 1, 2013/, 'news item quotes the final action date');
});

test('quiz colours: answer text, labels and icons meet contrast in light and dark (not colour-only: ✓/✕ + words)', async () => {
  const { DARK, LIGHT, contrast, tintOf } = await import('../src/ui/tokens');
  for (const [name, t] of [['light', LIGHT], ['dark', DARK]] as const) {
    const okBg = tintOf(t.green, name === 'dark' ? 0.28 : 0.2), badBg = tintOf(t.red, name === 'dark' ? 0.28 : 0.16);
    assert.ok(contrast(t.text, okBg, t.card) >= 7, `${name}: answer text on green`);
    assert.ok(contrast(t.text, badBg, t.card) >= 7, `${name}: answer text on red`);
    assert.ok(contrast(t.inkGreen, okBg, t.card) >= 4.5, `${name}: “Correct” label ${contrast(t.inkGreen, okBg, t.card).toFixed(2)}`);
    assert.ok(contrast(t.inkRed, badBg, t.card) >= 4.5, `${name}: “Not quite” label ${contrast(t.inkRed, badBg, t.card).toFixed(2)}`);
    assert.ok(contrast(t.inkGreen, t.card) >= 4.5 && contrast(t.inkRed, t.card) >= 4.5, `${name}: right answer label on card`);
    const disc = name === 'dark' ? [t.green, t.red] : [t.inkGreen, t.inkRed];
    for (const c of disc) assert.ok(contrast(c, okBg, t.card) >= 3 || contrast(c, t.card) >= 3, `${name}: icon disc stands out (3:1 non-text)`);
  }
});
