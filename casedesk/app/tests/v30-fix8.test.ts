// v3.0 fix8: owner corrections from his iPhone test (layout on a foldable with a side status column,
// restore wording, entry date, dependent installers, document checklist, bulk upload).
// Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsEntryDate, enteredAfterApproval } from '../src/core/onboarding';
import { backupLabel, BACKUP_PICKER_TYPES } from '../src/core/backup';
import { doc, T } from './helpers';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fnBody = (file: string, name: string) => { const s = src(file); const i = s.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const j = s.indexOf('\nfunction ', i + 10); return s.slice(i, j < 0 ? undefined : j); };

// ---------- 1. full-bleed layout ----------
test('fix8 layout: no screen container pads itself by the side insets (bars and content do)', () => {
  const kit = src('src/ui/kit.tsx');
  const screen = fnBody('src/ui/kit.tsx', 'Screen');
  assert.ok(!/backgroundColor: t\.bg, paddingLeft: insets\.left/.test(kit), 'Screen background is full-bleed');
  assert.ok(/paddingLeft: insets\.left, paddingRight: insets\.right/.test(screen), 'content column clears the side insets');
  assert.ok(/<Bar edge="bottom" style=\{\{[^}]*paddingLeft: insets\.left, paddingRight: insets\.right/.test(kit), 'footer bar pads itself once');
  const setup = src('src/screens/setup.tsx');
  assert.ok(!/backgroundColor: t\.bg, paddingLeft: insets\.left/.test(setup), 'setup shell background is full-bleed');
  assert.ok(/paddingTop: insets\.top \+ 4, paddingLeft: insets\.left, paddingRight: insets\.right/.test(setup), 'setup header clears the side insets');
  const welcome = fnBody('src/screens/setup.tsx', 'WelcomeStep');
  assert.ok(/paddingTop: insets\.top, paddingLeft: insets\.left, paddingRight: insets\.right/.test(welcome), 'welcome slides clear the side insets');
});

// ---------- 2. restore ----------
test('fix8 restore: no CaseDesk or .casedesk in user-facing text', () => {
  for (const f of ['src/screens/profile.tsx', 'src/screens/settings.tsx', 'src/content/help.ts', 'src/content/tours.ts', 'src/screens/icloud.tsx']) {
    const lines = src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    const bad = lines.filter((l) => /['`"][^'`"]*\.casedesk[^'`"]*['`"]|CaseDesk/i.test(l) && !/import /.test(l));
    assert.deepEqual(bad, [], f);
  }
  assert.match(src('src/screens/profile.tsx'), /backup file you saved from Immigration Wallet/);
});
test('fix8 restore: file names are shown without the old name or the extension', () => {
  assert.equal(backupLabel('CaseDesk-2026-11-18-093005.casedesk'), 'iCloud backup · Nov 18, 2026');
  assert.equal(backupLabel('Immigration Wallet backup 2026-11-18.casedesk'), 'Immigration Wallet backup 2026-11-18');
  assert.equal(backupLabel('CaseDesk backup 2026-10-01.casedesk'), 'Immigration Wallet backup 2026-10-01');
  assert.equal(backupLabel('my-family.casedesk'), 'my-family');
  for (const n of ['CaseDesk-2026-01-02-0930.casedesk', 'casedesk.casedesk', 'x.CASEDESK']) assert.ok(!/case\s*desk/i.test(backupLabel(n)), n);
});
test('fix8 restore: picker opens on arrival (not on web) and filters where it can', () => {
  const p = src('src/screens/profile.tsx');
  assert.match(p, /<RestorePanel autoPick /);
  assert.match(p, /if \(!autoPick \|\| initial \|\| Platform\.OS === 'web'\) return;/);
  assert.deepEqual([...BACKUP_PICKER_TYPES.web], ['.casedesk']);
  assert.equal(BACKUP_PICKER_TYPES.native, '*/*', 'native builds declare no backup type: listing all files keeps backups pickable');
});

// ---------- 3. entry date ----------
test('fix8 entry date: not asked on Where are you now', () => {
  assert.ok(!/Most recent entry/.test(fnBody('src/screens/setup.tsx', 'WhereStep')));
  assert.ok(!/lastEntry/.test(fnBody('src/screens/setup.tsx', 'saveStep')), 'the where step never writes the entry date');
});
test('fix8 entry date: asked only when an I-797A tear-off is the only I-94', () => {
  const appr = doc('me', T.approval('WAC2612345678', '03/01/2026', '03/01/2026', '02/28/2029'));
  assert.ok(appr.fields.i94Until, 'sample approval has a tear-off I-94');
  assert.equal(needsEntryDate([appr])?.id, appr.id);
  const i94 = doc('me', T.i94('02/28/2029', '06/15/2026', 'H1B', 'Z1234567'));
  assert.equal(needsEntryDate([appr, i94]), undefined, 'a separate I-94 record has its own entry date');
  assert.equal(needsEntryDate([]), undefined);
  const plain = { type: 'approval', fields: { noticeDate: '2026-03-01' } };
  assert.equal(needsEntryDate([plain]), undefined, 'an approval without a tear-off I-94 (I-797B) does not ask');
  assert.equal(enteredAfterApproval('2026-06-15', appr), true, 'a re-entry after the notice means a newer I-94');
  assert.equal(enteredAfterApproval('2025-12-01', appr), false);
  assert.equal(enteredAfterApproval(undefined, appr), false);
});
