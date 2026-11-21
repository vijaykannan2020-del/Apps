// v3.0 guided tour: which stops apply, their order and words, the one-time Home card, and that every
// stop points at a real <TourTarget> on its screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideInput, guideLabel, guideStep, guideStops, MAX_STOPS, showGuideCard, WIDGET_STEPS, type GuideInput } from '../src/core/guide';

const me = { id: 'p1', name: 'Alex Sample', self: true };
const full: GuideInput = { person: me, hasDocs: true, review: true, cases: 2, work: true, gc: true, wallet: true, widgets: true };
const ids = (g: GuideInput) => guideStops(g).map((s) => s.id);
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('guide: no person, no tour', () => {
  assert.deepEqual(guideStops({ ...full, person: undefined }), []);
});

test('guide: a work-visa family with documents and cases gets 10 stops; the last stop says where the tour lives', () => {
  const s = guideStops(full);
  assert.equal(s.length, MAX_STOPS);
  assert.deepEqual(s.map((x) => x.id), ['home', 'search', 'status', 'documents', 'wallet', 'cases', 'community', 'tools', 'widget', 'share']);
  assert.match(s.at(-1)!.text, /Settings → Help → Take the tour/);
  assert.equal(s.at(-1)!.id, 'share', 'no separate closing card');
});

test('guide: never more than 10 and never fewer than 8 stops', () => {
  for (const hasDocs of [true, false]) for (const cases of [0, 3]) for (const work of [true, false]) for (const wallet of [true, false]) for (const widgets of [true, false]) {
    const n = guideStops({ ...full, hasDocs, cases, work, gc: work, wallet, widgets }).length;
    assert.ok(n <= 10 && n >= 7, `${n} stops`);
    if (widgets) assert.ok(n >= 8, `${n} stops with widgets`);
  }
});

test('guide: stops that do not apply are skipped', () => {
  assert.ok(!ids({ ...full, cases: 0 }).includes('cases'), 'no cases → no Cases stop');
  assert.ok(!ids({ ...full, hasDocs: false }).includes('wallet'), 'no documents → no Wallet card yet');
  assert.ok(!ids({ ...full, wallet: false }).includes('wallet'), 'no Wallet on this device');
  assert.ok(!ids({ ...full, widgets: false }).includes('widget'), 'no widgets on this device (Android)');
  assert.ok(ids({ ...full, cases: 0 }).includes('share'), 'room for its own Share stop when there are fewer stops');
  // always: Home, Search, the person's status card and documents, Community, Tools, the end
  for (const g of [full, { ...full, hasDocs: false, cases: 0, wallet: false, widgets: false, work: false, gc: false }]) {
    for (const id of ['home', 'search', 'status', 'documents', 'community', 'tools', 'share'] as const) assert.ok(ids(g).includes(id), id);
  }
});

test('guide: Tools words follow the visa (I lost my job only for work visas, planner only when relevant)', () => {
  const tools = (g: GuideInput) => guideStops(g).find((s) => s.id === 'tools')!.text;
  assert.match(tools(full), /Can I travel\?/);
  assert.match(tools(full), /Green card planner/);
  assert.match(tools(full), /I lost my job/);
  const f1 = { ...full, work: false, gc: false };
  assert.match(tools(f1), /Can I travel\?/);
  assert.doesNotMatch(tools(f1), /I lost my job/);
  assert.doesNotMatch(tools(f1), /Green card planner/);
  assert.doesNotMatch(tools({ ...full, work: false, gc: true }), /I lost my job/, 'H-4: planner yes, lost my job no');
});

test('guide: status card words — Review only when the chip is there; no documents yet says to add one', () => {
  const status = (g: GuideInput) => guideStops(g).find((s) => s.id === 'status')!;
  assert.match(status(full).text, /Tap Review/);
  assert.doesNotMatch(status({ ...full, review: false }).text, /Review/);
  assert.match(status({ ...full, hasDocs: false }).text, /Add a document/);
  assert.equal(status(full).title, 'Your status card');
  assert.equal(status({ ...full, person: { id: 'p2', name: 'Sam Example', self: false } }).title, 'Sam’s status card');
});

test('guide: real navigation — person stops open the main person from the Family tab; tabs; Settings from Home', () => {
  const s = guideStops(full);
  const by = (id: string) => s.find((x) => x.id === id)!;
  assert.deepEqual(by('home').route, { tab: 'index' });
  for (const id of ['status', 'documents', 'wallet']) assert.deepEqual(by(id).route, { push: '/person/p1', via: 'family' });
  assert.deepEqual(by('cases').route, { tab: 'cases' });
  assert.deepEqual(by('community').route, { tab: 'forum' });
  assert.deepEqual(by('tools').route, { tab: 'tools' });
  for (const id of ['widget', 'share']) assert.deepEqual(by(id).route, { push: '/settings', via: 'index' });
  assert.equal(by('widget').art, 'widget');
  assert.equal(by('widget').target, undefined, 'the widget how-to is a centred card');
});

test('guide: every target is a <TourTarget> on its screen', () => {
  const files: Record<string, string> = {
    home: src('src/screens/home.tsx'), person: src('src/screens/person.tsx') + src('src/screens/wallet.tsx'), cases: src('src/screens/cases.tsx'),
    communityFeed: src('src/screens/community.tsx'), tools: src('src/screens/tools.tsx'), settings: src('src/screens/settings.tsx'),
  };
  const tourIds: Record<string, RegExp> = { home: /useTour\('home'[,)]/, person: /useTour\('person'\)/, cases: /useTour\('cases'\)/, communityFeed: /useTour\('communityFeed'\)/, tools: /useTour\('tools'\)/, settings: /useTour\('settings'\)/ };
  const all = [...guideStops(full), ...guideStops({ ...full, cases: 0 })];
  for (const s of all) {
    if (!s.target) continue;
    const [screen, id] = s.target.split(':');
    assert.ok(files[screen], `${s.id}: screen ${screen}`);
    assert.match(files[screen], tourIds[screen], `${screen} has its tour`);
    assert.ok(files[screen].includes(`<TourTarget id="${id}"`) || (screen === 'tools' && /TourTarget key=\{g\} id=\{g === 'My plans' \? 'plan'/.test(files.tools) && id === 'plan'), `${s.target} exists`);
  }
});

test('guide: words — step label, short texts, widget how-to', () => {
  assert.equal(guideStep(1, 9), 'Step 2 of 9');
  const s = guideStops(full);
  assert.equal(guideLabel(s[0], 0, s.length), `Step 1 of ${s.length}. What needs attention. ${s[0].text}`);
  for (const x of s) assert.ok(x.text.length <= 200, `${x.id} is short (${x.text.length})`);
  const how = WIDGET_STEPS.map((w) => w.text).join(' ');
  for (const w of ['Edit', 'Add Widget', 'Immigration Wallet', 'size', 'Edit Widget']) assert.ok(how.includes(w), w);
});

test('guide: Home card shows once for people who finished setup before the tour', () => {
  assert.equal(showGuideCard({ setupDone: true }, 2), true, 'existing user');
  assert.equal(showGuideCard({ setupDone: true, guideSeen: true }, 2), false, 'taken, closed, or offered at setup Done');
  assert.equal(showGuideCard({ setupDone: true }, 0), false, 'no one added');
  assert.equal(showGuideCard({ setup: { step: 'docs' } }, 1), false, 'setup open');
  assert.equal(showGuideCard({ setup: { step: 'docs', later: true } }, 1), false, 'Continue setup card first');
});

test('guide: input — main person (or the first), documents, review, work and green card from the status', () => {
  const people = [{ id: 'a', name: 'Kid Sample', relation: 'child' }, { id: 'b', name: 'Alex Sample', relation: 'self', status: 'H-1B' }];
  const g = guideInput({ people, records: { b: { docTypes: ['passport'], visa: 'H-1B' } }, results: { b: { worst: 'review' } }, cases: 1 }, { wallet: true, widgets: false });
  assert.equal(g.person?.id, 'b');
  assert.equal(g.person?.self, true);
  assert.deepEqual([g.hasDocs, g.review, g.work, g.gc, g.cases, g.wallet, g.widgets], [true, true, true, true, 1, true, false]);
  const main = guideInput({ people: [{ ...people[0], isMain: true }, people[1]], records: {}, results: {}, cases: 0 }, { wallet: false, widgets: false });
  assert.equal(main.person?.id, 'a', 'isMain wins');
  assert.equal(main.hasDocs, false);
  const f1 = guideInput({ people: [{ id: 'c', name: 'Pat', relation: 'self', status: 'F-1' }], records: { c: { docTypes: ['i20'], visa: 'F-1' } }, results: {}, cases: 0 }, { wallet: false, widgets: false });
  assert.deepEqual([f1.work, f1.gc], [false, false]);
  assert.deepEqual(guideStops({ ...guideInput({ people: [], records: {}, results: {}, cases: 0 }, { wallet: true, widgets: true }) }), []);
});

test('guide: setup Done offers the tour instead of a list of tools; Settings and Help start it; tips stay quiet', () => {
  const setup = src('src/screens/setup.tsx');
  assert.doesNotMatch(setup, /function Toolkit|What you can do now/);
  assert.match(setup, /Show me around \(about 1 minute\)/);
  assert.match(setup, /title="Go to Home"/);
  assert.match(setup, /guideSeen: true/, 'new users do not get the Home card too');
  const settings = src('src/screens/settings.tsx');
  assert.match(settings, /title="Take the tour"/);
  assert.match(settings, /onPress=\{guide\.start\}/);
  assert.match(src('src/screens/help.tsx'), /go\('\/guide'\)/);
  assert.match(src('src/screens/tours.tsx'), /!guide\.active/, 'no per-screen tips during the guided tour');
  assert.match(src('src/screens/notify.tsx'), /guide\.active/, 'no alert prompt during the guided tour');
  // owner, Nov 2026: no tips on Home — no tour card, no ? button, no auto tip (the tour is in Settings → Help & tips)
  assert.doesNotMatch(src('src/screens/home.tsx'), /<GuideCard \/>|<TourButton \/>/);
  assert.match(src('src/screens/home.tsx'), /useTour\('home', undefined, \{ auto: false \}\)/);
  // OTA: no new native module
  const guide = src('src/screens/guide.tsx');
  assert.doesNotMatch(guide, /requireNativeModule|NativeModules/);
});
