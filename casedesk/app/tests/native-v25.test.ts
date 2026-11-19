// v2.5: home-screen widget snapshot and Apple Wallet card fields. Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { caseViews, deriveRecord, evaluateFamily, setToday, type Document, type Person } from '../src/core';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/model';
import { BULLETIN } from '../src/content/bulletin';
import { buildWidgetSnapshot, clean, initials, nextBulletinDate, sameSnapshot, urgencyFor, widgetsLocked, caseKey, WIDGET_DISCLAIMER } from '../src/core/widgets';
import { passFields, passSerial, assertNoForbidden, forbiddenNumbers, ForbiddenOnPass, passColour, PASS_FRONT_DISCLAIMER, previewRows } from '../src/core/walletPass';
import { TOURS } from '../src/content/tours';
import { helpTopic } from '../src/content/help';
import { doc, person, T } from './helpers';

const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return req === 'react-native' ? path.join(__dirname, 'stubs/react-native.cjs') : orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const widgetsNative = require('../src/native/widgets') as typeof import('../src/native/widgets');

const TODAY = '2026-11-18';
const RECEIPT = 'EAC2690012345', PASSPORT = 'Z9876543', PASSPORT2 = 'Y1234567', RECEIPT2 = 'IOE0912345678';

function family(settings: Partial<Settings> = {}) {
  setToday(TODAY);
  const me: Person = person('me', 'self', { name: 'Arun Kumar', status: 'H-1B' });
  const sp: Person = person('sp', 'spouse', { name: 'Priya Kumar', status: 'H-4' });
  const docs: Document[] = [
    doc('me', T.passport(PASSPORT, 'KUMAR', 'ARUN', '11/05/2024', '10/05/2034')),
    doc('me', T.i94('09/30/2027', '10/02/2025', 'H1B', PASSPORT)),
    doc('me', T.receipt(RECEIPT, '10/01/2026')),
    doc('sp', T.passport(PASSPORT2, 'KUMAR', 'PRIYA', '01/02/2018', '01/01/2027')),
    doc('sp', T.i94('09/30/2027', '10/02/2025', 'H4', PASSPORT2)),
  ];
  const people = [me, sp];
  const records = Object.fromEntries(people.map((p) => [p.id, deriveRecord(p, docs)]));
  const s: Settings = { ...DEFAULT_SETTINGS, ...settings };
  const results = evaluateFamily({ members: people.map((p) => ({ person: p, rec: records[p.id] })), docs, settings: s, cases: [], bulletin: BULLETIN });
  const manual = [{ id: 'c_manual1', receipt: RECEIPT2, form: 'I-765', ownerId: 'sp', status: 'rfe' as const, keyDates: [{ kind: 'rfe-due' as const, date: '2026-12-15' }], history: [{ date: '2026-11-10', text: `Request for Evidence sent for ${RECEIPT2}` }] }];
  const caseList = caseViews(people, records, docs, manual);
  return { people, records, results, caseList, settings: s, docs };
}

test('widgets: snapshot has initials by default, statuses, valid-until, nearest deadlines first, latest case and bulletin', () => {
  const f = family();
  const s = buildWidgetSnapshot({ ...f, bulletin: { ...BULLETIN, month: 'December 2026' }, today: TODAY, now: '2026-11-18T10:00:00Z' });
  assert.equal(s.locked, false);
  assert.deepEqual(s.people.map((p) => p.name), ['AK', 'PK']);
  assert.equal(s.people[0].status, 'H-1B');
  assert.equal(s.people[0].until, '2027-09-30');
  assert.equal(s.people[0].untilLabel, 'I-94');
  assert.equal(s.people[0].url, 'casedesk://person/me');
  assert.ok(s.deadlines.length >= 2 && s.deadlines.length <= 5);
  assert.deepEqual([...s.deadlines].map((d) => d.date), [...s.deadlines].map((d) => d.date).sort(), 'sorted by date');
  assert.equal(s.deadlines[0].date, '2026-12-15', 'RFE due is the nearest');
  assert.equal(s.deadlines[0].who, 'PK');
  assert.ok(s.deadlines.every((d) => d.date >= TODAY));
  assert.ok(!s.deadlines.some((d) => /visa stamp/i.test(d.what)), 'visa stamp is never the next deadline');
  assert.ok(s.latestCase);
  assert.equal(s.latestCase!.url, 'casedesk://open/case/c_manual1', 'case link carries no receipt');
  assert.deepEqual(s.bulletin, { month: 'December 2026', next: '2026-12-15' });
  assert.equal(s.disclaimer, WIDGET_DISCLAIMER);
});

test('widgets: never a passport, receipt or A-number anywhere in the snapshot', () => {
  const f = family({ widgetNames: 'first' });
  const json = JSON.stringify(buildWidgetSnapshot({ ...f, bulletin: BULLETIN, today: TODAY }));
  for (const n of [PASSPORT, PASSPORT2, RECEIPT, RECEIPT2, '218-473-112', '123456789A1']) assert.ok(!json.includes(n), `leaked ${n}`);
  assert.ok(!/[A-Z]{3}\d{10}/.test(json), 'no receipt-shaped text');
  assert.match(json, /"name":"Arun"/, 'first names when chosen');
  assert.equal(clean('Case Was Approved EAC2690012345 for A123456789'), 'Case Was Approved ••• for •••');
});

test('widgets: Face ID lock + hide setting (default on) writes only a locked snapshot', () => {
  assert.equal(widgetsLocked({ faceId: true }), true, 'default: hide when locked');
  assert.equal(widgetsLocked({ faceId: true, widgetHideLocked: false }), false);
  assert.equal(widgetsLocked({ faceId: false }), false);
  const f = family({ faceId: true });
  const s = buildWidgetSnapshot({ ...f, bulletin: BULLETIN, today: TODAY });
  assert.equal(s.locked, true);
  assert.deepEqual([s.people, s.deadlines, s.latestCase, s.bulletin], [[], [], null, null]);
  assert.ok(!JSON.stringify(s).includes('Kumar') && !JSON.stringify(s).includes('AK'));
});

test('widgets: helpers — urgency thresholds match Swift, initials, bulletin estimate, change detection, case key', () => {
  assert.deepEqual([urgencyFor(0), urgencyFor(30), urgencyFor(31), urgencyFor(90), urgencyFor(91), urgencyFor(null)], ['red', 'red', 'amber', 'amber', 'green', 'none']);
  const swift = readFileSync(path.join(__dirname, '../targets/widget/Snapshot.swift'), 'utf8');
  assert.match(swift, /if d <= 30 \{ return \.red \}/); assert.match(swift, /if d <= 90 \{ return \.amber \}/);
  assert.match(swift, /group\.com\.vijaykannan\.casedesk/); assert.match(swift, /snapshot\.v1/);
  assert.equal(initials('arun  kumar'), 'AK'); assert.equal(initials('Dad'), 'D'); assert.equal(initials(''), '?');
  assert.equal(nextBulletinDate('November 2026', '2026-11-01'), '2026-11-15');
  assert.equal(nextBulletinDate('November 2026', '2026-11-20'), undefined, 'late → just the month');
  assert.equal(nextBulletinDate('junk', TODAY), undefined);
  const f = family();
  const a = buildWidgetSnapshot({ ...f, today: TODAY, now: '2026-11-18T10:00:00Z' });
  const b = buildWidgetSnapshot({ ...f, today: TODAY, now: '2026-11-18T11:00:00Z' });
  assert.ok(sameSnapshot(a, b), 'timestamp alone is not a change');
  assert.ok(!sameSnapshot(a, buildWidgetSnapshot({ ...f, settings: { ...f.settings, widgetNames: 'first' }, today: TODAY })));
  const docCase = f.caseList.find((c) => !c.manual)!;
  assert.equal(caseKey(docCase), docCase.docIds[0]);
});

test('widgets: native writer is a no-op without the module (older builds) and writes JSON + reloads with it', () => {
  const g = globalThis as any;
  const saved = g.expo;
  try {
    delete g.expo;
    assert.equal(widgetsNative.widgetsAvailable(), false);
    assert.equal(widgetsNative.writeWidgetSnapshot(buildWidgetSnapshot({ ...family(), today: TODAY })), false);
    const calls: any[] = [];
    g.expo = { modules: { ExtensionStorage: { setString: (...a: any[]) => calls.push(['set', ...a]), reloadWidget: (...a: any[]) => calls.push(['reload', ...a]), remove: () => {} } } };
    assert.equal(widgetsNative.widgetsAvailable(), true);
    assert.equal(widgetsNative.writeWidgetSnapshot(buildWidgetSnapshot({ ...family(), today: TODAY })), true);
    assert.equal(calls[0][1], 'snapshot.v1'); assert.equal(calls[0][3], 'group.com.vijaykannan.casedesk');
    assert.equal(JSON.parse(calls[0][2]).v, 1);
    assert.equal(calls[1][0], 'reload');
  } finally { g.expo = saved; }
});

test('wallet: card fields — name style, status, dates, next deadline, colour, relevant date, disclaimers', () => {
  const f = family();
  const sp = f.people[1];
  const c = passFields({ person: sp, rec: f.records.sp, res: f.results.sp, cases: f.caseList.filter((x) => x.ownerId === 'sp'), style: 'full', today: TODAY });
  assert.equal(c.name, 'Priya Kumar');
  assert.match(c.status, /^H-4/);
  assert.match(c.status, /dependent/);
  assert.equal(c.validUntil, '2027-09-30');
  assert.equal(c.passportUntil, '2027-01-01');
  assert.equal(c.relevantDate, '2027-09-30', 'Wallet surfaces it before the valid-until date');
  assert.deepEqual(c.nextDeadline?.date, '2026-12-15');
  assert.equal(c.colour, 'teal');
  assert.equal(c.disclaimer, PASS_FRONT_DISCLAIMER);
  assert.match(c.backDisclaimer, /NOT an official document/);
  assert.equal(passFields({ person: sp, rec: f.records.sp, res: f.results.sp, style: 'first', today: TODAY }).name, 'Priya');
  assert.equal(passFields({ person: sp, rec: f.records.sp, res: f.results.sp, style: 'initials', today: TODAY }).name, 'PK');
  assert.equal(passColour(f.records.me), 'blue');
  assert.equal(passSerial('sp'), passSerial('sp')); assert.notEqual(passSerial('sp'), passSerial('me'));
  assert.match(passSerial('sp'), /^iw-[0-9a-f]{8}$/);
  assert.equal(previewRows(c).length, 5);
});

test('wallet: no passport, receipt or A-numbers ever on the card — the builder refuses', () => {
  const f = family();
  for (const p of f.people) {
    const c = passFields({ person: p, rec: f.records[p.id], res: f.results[p.id], cases: f.caseList, style: 'full', today: TODAY });
    const json = JSON.stringify(c);
    for (const n of [PASSPORT, PASSPORT2, RECEIPT, RECEIPT2]) assert.ok(!json.includes(n), `leaked ${n}`);
  }
  const nums = forbiddenNumbers(f.records.me, f.caseList);
  assert.ok(nums.includes(PASSPORT) && nums.includes(RECEIPT) && nums.includes(RECEIPT2));
  const base = passFields({ person: f.people[0], rec: f.records.me, res: f.results.me, style: 'first', today: TODAY });
  assert.throws(() => assertNoForbidden({ ...base, name: `Arun ${PASSPORT}` }, nums), ForbiddenOnPass);
  assert.throws(() => assertNoForbidden({ ...base, status: 'H-1B A123456789' }, []), ForbiddenOnPass);
  assert.throws(() => assertNoForbidden({ ...base, nextDeadline: { what: `RFE for ${RECEIPT}`, date: '2026-12-01' } }, []), ForbiddenOnPass);
  // A nickname that IS a passport number is refused rather than printed.
  const odd: Person = { ...f.people[0], name: PASSPORT };
  assert.throws(() => passFields({ person: odd, rec: { ...f.records.me, legalName: undefined }, res: f.results.me, style: 'first', today: TODAY }), ForbiddenOnPass);
});

test('v2.5: tours and help topics for widgets and the Wallet card; target + modules wired', () => {
  assert.ok(TOURS['wallet-preview'] && TOURS['wallet-preview'].help === 'wallet-card');
  assert.ok(helpTopic('widgets') && helpTopic('wallet-card'));
  assert.ok(TOURS.family.steps.some((s) => s.target === 'wallet'));
  assert.ok(TOURS.settings.steps.some((s) => s.target === 'widgets'));
  assert.ok(helpTopic('wallet-card')!.body.join(' ').includes('NOT an official document'));
  const app = JSON.parse(readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo;
  assert.deepEqual(app.ios.entitlements['com.apple.security.application-groups'], ['group.com.vijaykannan.casedesk']);
  assert.ok(app.plugins.includes('@bacons/apple-targets'));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cfg = require('../targets/widget/expo-target.config.js')(app);
  assert.equal(cfg.bundleIdentifier, '.widget');
  assert.deepEqual(cfg.entitlements['com.apple.security.application-groups'], ['group.com.vijaykannan.casedesk']);
  for (const f of ['index.swift', 'Provider.swift', 'Views.swift', 'Snapshot.swift', 'Info.plist']) assert.ok(existsSync(path.join(__dirname, '../targets/widget', f)), f);
  assert.ok(existsSync(path.join(__dirname, '../modules/add-pass-button/ios/AddPassButtonModule.swift')));
});
