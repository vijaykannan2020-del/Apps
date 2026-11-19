// v2.3 first-visit tips: shown once per screen, replay, reset; every screen has 2–4 short tips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isSeen, markSeen, normalizeSteps, placeTip, shouldAutoShow, stepLabel, MAX_STEPS } from '../src/core/tours';
import { TOURS, TOUR_SCREENS } from '../src/content/tours';
import { helpTopic } from '../src/content/help';

const base = { ready: true, seen: [] as string[], off: false, active: null, steps: 3 };

test('tours: auto-show once — not before data is ready, never twice, not when switched off', () => {
  assert.equal(shouldAutoShow('cases', base), true);
  assert.equal(shouldAutoShow('cases', { ...base, ready: false }), false);
  assert.equal(shouldAutoShow('cases', { ...base, off: true }), false);
  assert.equal(shouldAutoShow('cases', { ...base, disabled: true }), false, 'QA switch');
  assert.equal(shouldAutoShow('cases', { ...base, active: 'home' }), false, 'one tour at a time');
  assert.equal(shouldAutoShow('cases', { ...base, steps: 0 }), false);
  const seen = markSeen(base.seen, 'cases');
  assert.equal(shouldAutoShow('cases', { ...base, seen }), false, 'seen → not again');
  assert.equal(shouldAutoShow('home', { ...base, seen }), true, 'other screens still show');
});

test('tours: markSeen adds once and keeps the rest; reset = empty list shows everything again', () => {
  let s = markSeen(undefined, 'home');
  s = markSeen(s, 'home');
  s = markSeen(s, 'family');
  assert.deepEqual(s, ['home', 'family']);
  assert.equal(isSeen(s, 'family'), true);
  assert.equal(isSeen([], 'family'), false);
  assert.equal(shouldAutoShow('family', { ...base, seen: [] }), true);
});

test('tours: steps are capped at 4 and blank ones dropped', () => {
  const st = normalizeSteps([{ text: 'a' }, { text: ' ' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }]);
  assert.equal(st.length, MAX_STEPS);
  assert.deepEqual(st.map((x) => x.text), ['a', 'b', 'c', 'd']);
});

test('tours: the tip goes below the target when there is room, above near the bottom, centred without a target', () => {
  const win = { width: 393, height: 852 };
  const top = placeTip({ x: 300, y: 100, width: 44, height: 44 }, win, 160);
  assert.equal(top.arrow, 'up');
  assert.ok(top.top >= 144 + 12);
  assert.ok(top.left >= 16 && top.left + top.width <= 393 - 16);
  assert.ok(top.arrowX > top.width / 2, 'arrow points right, at the + button');
  const low = placeTip({ x: 16, y: 760, width: 361, height: 50 }, win, 160);
  assert.equal(low.arrow, 'down');
  assert.ok(low.top + 160 <= 760);
  const none = placeTip(null, win, 160);
  assert.equal(none.arrow, null);
  const off = placeTip({ x: 0, y: 2000, width: 100, height: 40 }, win, 160);
  assert.equal(off.arrow, null, 'off-screen target → centred card');
  const wide = placeTip({ x: 900, y: 80, width: 44, height: 44 }, { width: 1100, height: 800 }, 160);
  assert.equal(wide.width, 360, 'never wider than 360 on unfolded screens');
});

test('tours: VoiceOver label says which tip and reads the text', () => {
  assert.equal(stepLabel({ title: 'Add a case', text: 'Tap +.' }, 0, 3), 'Tip 1 of 3. Add a case. Tap +.');
});

test('tours: every listed screen has 2–4 short tips and a real help topic', () => {
  const need = ['home', 'family', 'person', 'flow-step', 'document', 'review', 'summary', 'cases', 'case', 'add-case', 'tools',
    'tool-travel', 'tool-pd', 'tool-vb', 'tool-proc', 'tool-fees', 'tool-civics', 'tool-i9', 'layoff', 'tool-wage', 'tool-h1b',
    'news-list', 'news-item', 'settings', 'backup', 'restore', 'icloud'];
  for (const id of need) assert.ok(TOURS[id], `missing tour: ${id}`);
  for (const id of TOUR_SCREENS) {
    const t = TOURS[id];
    assert.ok(t.steps.length >= (id === 'communityFeed' ? 1 : 2) && t.steps.length <= 4, `${id}: ${t.steps.length} steps`); // the feed has ONE tip on purpose (v2.7)
    for (const s of t.steps) assert.ok(s.text.length <= 150, `${id}: tip too long: ${s.text}`);
    if (t.help) assert.ok(helpTopic(t.help), `${id}: unknown help topic ${t.help}`);
  }
});

test('tours: every useTour / useSheetTour id in the screens has words, and every target a step names exists', () => {
  const dir = new URL('../src/screens/', import.meta.url);
  const src = readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n') + readFileSync(new URL('../src/screens/common.tsx', import.meta.url), 'utf8');
  const ids = [...src.matchAll(/use(?:Sheet)?Tour\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, `found ${ids.length}`);
  for (const m of src.matchAll(/'(tool-[a-z0-9]+)'/g)) assert.ok(TOURS[m[1]], `tool tour ${m[1]} has no words`);
  for (const id of ids) assert.ok(TOURS[id], `useTour('${id}') has no entry in content/tours.ts`);
  const targets = new Set([...src.matchAll(/TourTarget[^>]*?id=(?:"([^"]+)"|\{[^}]*?'([^']+)')/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
  targets.add('help'); targets.add('plan'); targets.add('lookup'); targets.add('notify');
  for (const id of TOUR_SCREENS) for (const s of TOURS[id].steps) if (s.target) assert.ok(targets.has(s.target), `${id}: no <TourTarget id="${s.target}">`);
});
