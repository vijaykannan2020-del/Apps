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

// ---------- 4. dependent installer ----------
import { setupSteps, setupProgress, nextStep, prevStep, applies, isDependentStatus, principalStatusFor, suggestStatus, DEPENDENT_STATUSES } from '../src/core/onboarding';
import { evaluateFamily, principalFor, deriveRecord, type Person, type StatusCategory } from '../src/core';
import { person } from './helpers';

test('fix8 dependents: H-4 / L-2 / F-2 / J-2 / TD installers get the principal step right after their status questions', () => {
  for (const s of ['H-4', 'L-2', 'F-2', 'J-2', 'TD'] as StatusCategory[]) {
    const st = setupSteps({ status: s, notif: 'undetermined' });
    assert.ok(st.includes('principal'), s);
    assert.ok(st.indexOf('principal') > st.indexOf('status') && st.indexOf('principal') < st.indexOf('family'), `${s}: principal before family`);
    assert.ok(isDependentStatus(s));
  }
  for (const s of ['H-1B', 'L-1A', 'F-1', 'green-card', 'citizen', 'other', undefined] as (StatusCategory | undefined)[]) assert.equal(applies('principal', { status: s }), false, String(s));
  const h4 = setupSteps({ status: 'H-4', notif: 'undetermined' });
  assert.equal(nextStep('details', h4), 'principal', 'after the H-4 EAD question');
  assert.equal(nextStep('principal', h4), 'gc');
  assert.equal(prevStep('gc', h4), 'principal');
  const l2 = setupSteps({ status: 'L-2', notif: 'undetermined' });
  assert.equal(nextStep('status', l2), 'principal', 'L-2: no details step, principal comes straight after the status');
  assert.deepEqual(setupProgress('principal', l2), { at: 4, total: 10 }, 'the bar counts the principal step');
  assert.deepEqual([...DEPENDENT_STATUSES], ['H-4', 'L-2', 'F-2', 'J-2', 'TD']);
});
test('fix8 dependents: principal visa suggested from yours, children follow your dependent status', () => {
  assert.equal(principalStatusFor('H-4'), 'H-1B');
  assert.equal(principalStatusFor('L-2'), 'L-1');
  assert.equal(principalStatusFor('F-2'), 'F-1');
  assert.equal(principalStatusFor('J-2'), 'J-1');
  assert.equal(principalStatusFor('TD'), 'TN');
  assert.equal(suggestStatus('H-4', 'child'), 'H-4');
  assert.equal(suggestStatus('TN', 'spouse'), 'TD', 'a TN worker’s spouse is suggested TD');
});
test('fix8 dependents: the installer (self) is linked as dependent of the principal; the principal follows no one', () => {
  const me: Person = person('me', 'self', { name: 'Mira Testdep', status: 'H-4', facts: { location: 'US', dependentOf: 'p1' } });
  const sp: Person = person('p1', 'spouse', { name: 'Dev Testdep', status: 'H-1B', facts: { location: 'US', trackOnly: true } });
  const kid: Person = person('k1', 'child', { name: 'Ana Testdep', status: 'H-4', facts: { location: 'US', dependentOf: 'p1' } });
  const members = [me, sp, kid].map((p) => ({ person: p, rec: deriveRecord(p, []) }));
  assert.equal(principalFor(members[0], members)?.person.id, 'p1', 'self on H-4 follows the spouse');
  assert.equal(principalFor(members[1], members), undefined, 'the principal never follows their own dependent');
  assert.equal(principalFor(members[2], members)?.person.id, 'p1');
  const res = evaluateFamily({ members, docs: [], cases: [] } as never);
  assert.equal(res.me.principalId, 'p1');
  assert.equal(res.p1.principalId, undefined);
  // an installer on a work visa is never a dependent, even with a stale link
  const w = person('me', 'self', { status: 'H-1B', facts: { location: 'US' } });
  assert.equal(principalFor({ person: w, rec: deriveRecord(w, []) }, members), undefined);
});
test('fix8 dependents: setup screen asks principal first, children optional, tracked principals are not in the checklist', () => {
  const s = src('src/screens/setup.tsx');
  const ps = fnBody('src/screens/setup.tsx', 'PrincipalStep');
  for (const w of ['Who is your visa based on?', 'Spouse', 'Parent', 'Their full name', 'Add their documents too', 'Only track them']) assert.ok(ps.includes(w), w);
  assert.match(fnBody('src/screens/setup.tsx', 'saveStep'), /setFacts\(me\.id, \{ dependentOf: d\.id \}\)/);
  const fam = fnBody('src/screens/setup.tsx', 'FamilyStep');
  assert.match(fam, /'Any children\?'/);
  assert.match(fam, /Optional\. Children/);
  assert.match(s, /filter\(\(p\) => !p\.facts\.trackOnly\)/);
});

// ---------- 5 / 6. documents checklist ----------
import { docHasData, checklistRow, FIELDS } from '../src/core/docs';

test('fix8 checklist: an empty typed draft is not a document (the passport that showed Expires saved)', () => {
  assert.equal(docHasData({ fields: {}, files: [] }), false);
  assert.equal(docHasData({ fields: { form: 'I-129' }, files: [] }), false, 'step defaults are not data');
  assert.equal(docHasData({ fields: { category: 'C9' } }), false);
  assert.equal(docHasData({ fields: { validTo: '2033-05-01' } }), true);
  assert.equal(docHasData({ fields: {}, files: [{ file: 'x.jpg', name: 'x.jpg', mime: 'image/jpeg' }] }), true, 'a kept photo is real even if nothing was read');
  assert.equal(checklistRow({ fields: {}, files: [], addedAt: '2026-11-20T10:00:00Z' }, { label: 'Expires', field: 'validTo' }, FIELDS.passport[4]).state, 'missing', 'not ticked');
  // commit and the Save button refuse an empty draft
  assert.match(src('src/data/flow.ts'), /!u\.misfile && docHasData\(u\.doc\)\) docs\.push/);
  assert.match(src('src/screens/flow.tsx'), /const done = [^\n]*docHasData\(u\.doc\)/);
});
test('fix8 checklist: saved rows show the real key date, and Added earlier for documents from before setup', () => {
  const spec = FIELDS.passport.find((s) => s.key === 'validTo');
  const key = { label: 'Expires', field: 'validTo' as const };
  const d = { fields: { validTo: '2033-05-01' }, files: [], addedAt: '2026-11-20T10:05:00Z' };
  assert.deepEqual(checklistRow(d, key, spec, '2026-11-20T10:00:00Z'), { state: 'added', line: 'Expires May 1, 2033', dated: true });
  assert.deepEqual(checklistRow({ ...d, addedAt: '2026-10-01T08:00:00Z' }, key, spec, '2026-11-20T10:00:00Z'), { state: 'earlier', line: 'Added earlier · Expires May 1, 2033', dated: true });
  assert.equal(checklistRow(d, key, spec).state, 'added', 'no setup start known: nothing is called earlier');
  const photo = checklistRow({ fields: {}, files: [{ file: 'p.jpg', name: 'p.jpg', mime: 'image/jpeg' }], addedAt: '2026-11-20T10:05:00Z' }, key, spec);
  assert.deepEqual(photo, { state: 'added', line: 'Expires date not added yet', dated: false });
});
test('fix8 checklist: Enter or edit replaces Type; saved rows open the document and say Edit', () => {
  const ds = fnBody('src/screens/setup.tsx', 'DocsStep');
  assert.ok(!/'Type'/.test(ds), 'no Type button');
  assert.match(ds, /'Enter or edit'/);
  assert.match(ds, />Edit</);
  assert.match(ds, /go\(`\/document\/\$\{d\.id\}`\)/);
  assert.ok(!/saved'\}/.test(ds) && !/\|\| 'saved'/.test(ds), 'never "Expires saved"');
  assert.match(src('src/core/onboarding.ts'), /since: now/);
});

// ---------- 8. add several documents at once (matching: tests/bulk2.test.ts) ----------
test('fix8 bulk: documents step offers it, explains auto-assign and Move, and pickers allow multiple selection', () => {
  const b = fnBody('src/screens/setup.tsx', 'BulkAdd');
  for (const w of ['Add several documents at once', 'filed under the right person by the name, passport number or date of birth on it', 'move it', 'Just added', 'Move', 'Done']) assert.ok(b.includes(w), w);
  assert.match(fnBody('src/screens/setup.tsx', 'DocsStep'), /<BulkAdd f=\{f\} \/>/);
  const files = src('src/native/files.ts');
  assert.match(files, /multiple: true/);
  assert.match(files, /allowsMultipleSelection: true/);
  assert.ok(!/from 'expo-|require\('expo-/.test(src('src/data/bulk.ts')), 'no new native module: pickers come through native/safe');
});
