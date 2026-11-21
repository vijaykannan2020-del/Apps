// v2.7 pastel look: WCAG AA for every text colour in light and dark, including ink on the pastel
// blocks, the primary button, pills, chart fills (3:1 non-text) and the Material 3 roles on Android.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DARK, LIGHT, PASTEL, INK, INK2, COLOUR_THEMES, contrast, m3Roles, onPastel, swatchOf, themeFor, tintOf, TONE_PASTEL } from '../src/ui/tokens';

const AA = 4.5;
const themes = [['dark', DARK], ['light', LIGHT]] as const;

test('pastel: the approved palette — true black, dark grey cards, the four pastels and ink', () => {
  assert.equal(DARK.bg, '#000000');
  assert.equal(DARK.card, '#1C1D1F');
  assert.equal(DARK.card2, '#26272A');
  assert.deepEqual([PASTEL.sage, PASTEL.sageD, PASTEL.blush, PASTEL.butter, PASTEL.sky], ['#A9CDB9', '#5FB497', '#F8D2D3', '#FDD78C', '#BFD9F8']);
  assert.equal(INK, '#1D2A24');
  assert.equal(DARK.pos, '#7FE0A8');
  assert.equal(LIGHT.card, '#FFFFFF');
  assert.equal(LIGHT.pastel, DARK.pastel, 'the same pastels in light and dark');
});

test('pastel: ink text on every pastel block is AA (primary ≥ 7:1, secondary ≥ 4.5:1)', () => {
  for (const k of ['sage', 'blush', 'butter', 'sky', 'mint'] as const) {
    assert.ok(contrast(INK, PASTEL[k]) >= 7, `ink on ${k}: ${contrast(INK, PASTEL[k]).toFixed(2)}`);
    assert.ok(contrast(INK2, PASTEL[k]) >= AA, `secondary ink on ${k}: ${contrast(INK2, PASTEL[k]).toFixed(2)}`);
    // hero chip and progress track: ink on a 14% black wash of the pastel
    assert.ok(contrast(INK, 'rgba(0,0,0,0.14)', PASTEL[k]) >= AA, `chip on ${k}`);
    // a button inside a pastel block: white on ink
    assert.ok(contrast('#FFFFFF', INK) >= 7);
  }
  // deep sage is a FILL (switch, checks, ring); ink glyphs on it still pass
  assert.ok(contrast(INK, PASTEL.sageD) >= AA);
});

test('pastel: inside a pastel block every theme text colour becomes ink (nothing white-on-pastel)', () => {
  for (const [name, t] of themes) for (const k of ['sage', 'blush', 'butter', 'sky', 'mint'] as const) {
    const p = onPastel(t, PASTEL[k]);
    for (const fg of [p.text, p.text2, p.text3, p.inkAccent, p.inkGreen, p.inkAmber, p.inkRed]) assert.ok(contrast(fg, PASTEL[k]) >= AA, `${name} ${k}: ${fg}`);
    assert.ok(contrast(p.onPrimary, p.primary) >= 7, `${name} ${k}: button in a block`);
    assert.ok(contrast(p.text, p.fill, PASTEL[k]) >= AA, `${name} ${k}: text on a quiet fill (ghost button, pill)`);
  }
});

test('pastel: text on the page and on cards is AA in dark and light', () => {
  for (const [name, t] of themes) {
    for (const bg of [t.bg, t.card, t.card2]) {
      for (const k of ['text', 'text2', 'text3', 'inkAccent', 'inkGreen', 'inkAmber', 'inkRed'] as const) assert.ok(contrast(t[k], bg) >= AA, `${name}: ${k} on ${bg} = ${contrast(t[k], bg).toFixed(2)}`);
      assert.ok(contrast(t.text, t.fill, bg) >= AA, `${name}: text on fill over ${bg}`);
    }
    assert.ok(contrast(t.onPrimary, t.primary) >= 7, `${name}: primary button`);
    assert.ok(contrast(t.onPrimary, t.primary) >= 7 && contrast(t.primary, t.bg) >= 3, `${name}: the primary button stands out on the page`);
    // pills: the tone's ink on a tint of its fill, over a card
    for (const [fill, ink] of [[t.red, t.inkRed], [t.amber, t.inkAmber], [t.green, t.inkGreen], [t.accent, t.inkAccent]] as const) {
      assert.ok(contrast(ink, tintOf(fill, t.pillAlpha), t.card) >= AA, `${name}: pill ${ink}`);
    }
    // sheets
    assert.ok(contrast(t.text2, name === 'dark' ? '#141516' : t.bg) >= AA, `${name}: secondary text on a sheet`);
  }
});

test('pastel: chart and status fills show on their background (3:1 non-text), in both themes', () => {
  for (const [name, t] of themes) {
    for (const k of ['green', 'amber', 'red', 'accent'] as const) {
      for (const bg of [t.bg, t.card]) assert.ok(contrast(t[k], bg) >= 3, `${name}: ${k} fill on ${bg} = ${contrast(t[k], bg).toFixed(2)}`);
    }
  }
});

test('pastel: colour has one meaning — red urgent = blush, amber attention = butter, green good = sage, info = sky', () => {
  assert.deepEqual(TONE_PASTEL, { red: 'urgent', amber: 'warn', green: 'good', blue: 'sky', grey: 'sky' });
  assert.deepEqual([DARK.pastel.urgent, DARK.pastel.warn, DARK.pastel.good], [PASTEL.blush, PASTEL.butter, PASTEL.sage]);
  assert.equal(DARK.red, PASTEL.blush); assert.equal(DARK.amber, PASTEL.butter); assert.equal(DARK.green, PASTEL.sageD); assert.equal(DARK.accent, PASTEL.sky);
});

test('pastel: Material 3 roles (Android bottom navigation) are readable', () => {
  for (const [name, t] of themes) {
    const m = m3Roles(t);
    assert.ok(contrast(m.onSecondaryContainer, m.secondaryContainer) >= AA, `${name}: selected icon on the pill indicator`);
    assert.ok(contrast(m.onSurfaceVariant, m.surfaceContainer) >= AA, `${name}: unselected icon and label on the bar`);
    assert.ok(contrast(m.onSurface, m.surfaceContainer) >= AA, `${name}: labels`);
    assert.ok(contrast(m.primary, m.surface) >= AA, `${name}: iOS selection tint on the page`);
    assert.ok(contrast(m.onPrimary, m.primary) >= AA);
  }
});

test('pastel: one brand palette — Appearance offers System, Light and Dark only; the system tab bar is kept', () => {
  const settings = readFileSync(new URL('../src/screens/settings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /options=\{\['System', 'Light', 'Dark'\]\}/);
  const tabs = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /NativeTabs/, 'native tab bar (Liquid Glass on iOS 26, Material 3 on Android)');
  assert.match(tabs, /indicatorColor/, 'Material 3 pill indicator colour');
  assert.doesNotMatch(tabs, /from 'expo-router'.*Tabs\b/, 'no custom JS tab bar on phones');
});

test('navigation: five tabs — Home, Family, Community, Updates, Tools (Cases opens from Home as a page, not a tab); Settings is a pushed page', () => {
  const tabs = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.deepEqual([...tabs.matchAll(/Trigger name="([a-z]+)"/g)].map((m) => m[1]), ['index', 'family', 'forum', 'updates', 'tools']);
  assert.match(readFileSync(new URL('../app/(tabs)/updates.tsx', import.meta.url), 'utf8'), /<NewsListScreen tabRoot \/>/);
  assert.doesNotMatch(tabs, /Trigger name="cases"/, 'Cases is not a tab (a hidden tab stole the /cases route)');
  assert.throws(() => readFileSync(new URL('../app/(tabs)/cases.tsx', import.meta.url)), 'only app/cases.tsx owns /cases');
  assert.match(readFileSync(new URL('../app/cases.tsx', import.meta.url), 'utf8'), /<CasesTab pushed \/>/);
  assert.match(tabs, /bubble\.left\.and\.bubble\.right/);
  assert.match(tabs, /md="forum"/);
  assert.throws(() => readFileSync(new URL('../app/(tabs)/settings.tsx', import.meta.url)), 'Settings is no longer a tab');
  // deep link casedesk://settings → app/settings.tsx
  assert.match(readFileSync(new URL('../app/settings.tsx', import.meta.url), 'utf8'), /SettingsScreen as default/);
  // the Community tab hosts the existing feed; Tools no longer lists it
  assert.match(readFileSync(new URL('../app/(tabs)/forum.tsx', import.meta.url), 'utf8'), /<CommunityFeedScreen tabRoot \/>/);
  assert.doesNotMatch(readFileSync(new URL('../src/screens/tools.tsx', import.meta.url), 'utf8'), /id: 'community'/);
  const home = readFileSync(new URL('../src/screens/home.tsx', import.meta.url), 'utf8');
  assert.match(home, /go\('\/settings'\)/, 'the avatar opens Settings');
  const st = readFileSync(new URL('../src/screens/settings.tsx', import.meta.url), 'utf8');
  // owner, Nov 20 2026: "shorten means not remove" — every setting is visible again (no hidden Developer section)
  // owner-approved preview (Nov 2026): one short list of rows, each opening a page that holds the options
  for (const page of ['appearance', 'privacy', 'notifications', 'backup', 'share', 'help', 'about']) { assert.ok(st.includes(`go('/settings-page/${page}')`), page); assert.ok(st.includes(`case '${page}'`), page); }
  assert.match(readFileSync(new URL('../app/settings-page/[id].tsx', import.meta.url), 'utf8'), /SettingsPage as default/);
  for (const row of ['Run setup again', 'Example family', 'Show tips on every screen', 'Show all tips again', 'Show HR tools', 'Diagnostics', 'Default reminders', 'Open system settings', 'Privacy']) assert.ok(st.includes(`title="${row}"`), row);
  assert.match(st, /<SettingsList os=\{os\}>/);
  assert.match(st, /Linking\.openSettings\(\)/, 'Open system settings row');
  assert.match(st, /go\('\/profile'\)/, 'Profile at the top');
  assert.match(st, /appBar: 'android'/, 'Material top app bar on Android');
  assert.doesNotMatch(readFileSync(new URL('../src/screens/profile.tsx', import.meta.url), 'utf8') + home, /\(tabs\)\/settings/);
});

// ---------- colour themes (Settings → Appearance → Colour) ----------
const SLOTS = ['sky', 'sage', 'blush', 'butter', 'mint'] as const;

test('colour themes: Pastel (default) plus six families, each in dark and light, same structure', () => {
  assert.deepEqual(COLOUR_THEMES.map((c) => c.id), ['pastel', 'indigo', 'emerald', 'ocean', 'sunset', 'rose', 'graphite']);
  assert.equal(themeFor(true), DARK); assert.equal(themeFor(false, 'pastel'), LIGHT);
  for (const { id } of COLOUR_THEMES) for (const dark of [true, false]) {
    const t = themeFor(dark, id), base = dark ? DARK : LIGHT;
    assert.equal(t.colour, id);
    // structure: page, cards, text, primary button are the base ones
    for (const k of ['bg', 'card', 'card2', 'text', 'text2', 'text3', 'primary', 'onPrimary', 'ink', 'sep', 'fill'] as const) assert.equal(t[k], base[k], `${id}: ${k}`);
    // urgent blocks and status pills never change with the theme; good / warn blocks follow it (v2.9)
    for (const k of ['green', 'amber', 'red', 'inkGreen', 'inkAmber', 'inkRed', 'pos'] as const) assert.equal(t[k], base[k], `${id}: ${k}`);
    assert.deepEqual([t.pastel.urgent, t.pastel.sageD], [PASTEL.blush, PASTEL.sageD], `${id}: fixed blocks`);
    if (id !== 'pastel') assert.notEqual(t.pastel.warn, PASTEL.butter, `${id}: attention block follows the theme`);
    assert.ok(swatchOf(id).length >= 2);
  }
  // a family changes the brand blocks, and its five tints are different from each other
  for (const { id } of COLOUR_THEMES.filter((c) => c.id !== 'pastel')) {
    const t = themeFor(true, id);
    assert.notEqual(t.pastel.sky, PASTEL.sky, id);
    assert.equal(new Set(SLOTS.map((k) => t.pastel[k])).size, 5, `${id}: five tints`);
    assert.equal(themeFor(true, id), t, 'cached: the same object, so nothing re-renders for no reason');
  }
});

test('colour themes: AA in every theme — ink on every block, accent text, chips, tab tint; 3:1 for chart fills', () => {
  for (const { id } of COLOUR_THEMES) for (const dark of [true, false]) {
    const t = themeFor(dark, id), n = `${id} ${dark ? 'dark' : 'light'}`;
    for (const k of [...SLOTS, 'good', 'warn', 'urgent'] as const) {
      const bg = t.pastel[k];
      assert.ok(contrast(INK, bg) >= 7, `${n}: ink on ${k} ${bg} = ${contrast(INK, bg).toFixed(2)}`);
      assert.ok(contrast(INK2, bg) >= AA, `${n}: secondary ink on ${k} ${bg} = ${contrast(INK2, bg).toFixed(2)}`);
      assert.ok(contrast(INK, 'rgba(0,0,0,0.14)', bg) >= AA, `${n}: chip on ${k}`);
      const p = onPastel(t, bg);
      for (const fg of [p.text, p.text2, p.inkAccent, p.inkRed]) assert.ok(contrast(fg, bg) >= AA, `${n}: ${fg} inside ${k}`);
    }
    for (const bg of [t.bg, t.card, t.card2]) {
      assert.ok(contrast(t.inkAccent, bg) >= AA, `${n}: accent text on ${bg} = ${contrast(t.inkAccent, bg).toFixed(2)}`);
      assert.ok(contrast(t.tab, bg) >= AA, `${n}: tab tint on ${bg} = ${contrast(t.tab, bg).toFixed(2)}`);
    }
    for (const bg of [t.bg, t.card]) for (const k of ['accent', 'green', 'amber', 'red'] as const) assert.ok(contrast(t[k], bg) >= 3, `${n}: chart fill ${k} on ${bg} = ${contrast(t[k], bg).toFixed(2)}`);
    assert.ok(contrast(t.onChipOn, t.chipOn) >= 7, `${n}: selected chip`);
    assert.ok(contrast(t.inkAccent, tintOf(t.accent, t.pillAlpha), t.card) >= AA, `${n}: info pill`);
    const m = m3Roles(t);
    assert.ok(contrast(m.onSecondaryContainer, m.secondaryContainer) >= AA, `${n}: Android nav pill = ${contrast(m.onSecondaryContainer, m.secondaryContainer).toFixed(2)}`);
    assert.ok(contrast(m.onPrimary, m.primary) >= AA, `${n}: on primary`);
  }
});

test('colour themes: the picker is in Settings → Appearance, saves to settings and the root applies it', () => {
  const st = readFileSync(new URL('../src/screens/settings.tsx', import.meta.url), 'utf8');
  assert.match(st, /<ColourRow \/>/);
  assert.match(st, /updateSettings\(\{ colour: c\.id \}\)/);
  assert.match(readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8'), /colour=\{f\.settings\.colour \?\? 'pastel'\}/);
});
