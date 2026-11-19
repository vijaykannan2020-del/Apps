// v2.7 pastel look: WCAG AA for every text colour in light and dark, including ink on the pastel
// blocks, the primary button, pills, chart fills (3:1 non-text) and the Material 3 roles on Android.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DARK, LIGHT, PASTEL, INK, INK2, contrast, m3Roles, onPastel, tintOf, TONE_PASTEL } from '../src/ui/tokens';

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
  assert.deepEqual(TONE_PASTEL, { red: 'blush', amber: 'butter', green: 'sage', blue: 'sky', grey: 'sky' });
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

test('navigation (v2.7): five tabs — Home, Family, Cases, Community, Tools; Settings is a pushed native-style page', () => {
  const tabs = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.deepEqual([...tabs.matchAll(/Trigger name="([a-z]+)"/g)].map((m) => m[1]), ['index', 'family', 'cases', 'forum', 'tools']);
  assert.match(tabs, /bubble\.left\.and\.bubble\.right/);
  assert.match(tabs, /md="forum"/);
  assert.throws(() => readFileSync(new URL('../app/(tabs)/settings.tsx', import.meta.url)), 'Settings is no longer a tab');
  // deep link casedesk://settings → app/settings.tsx
  assert.match(readFileSync(new URL('../app/settings.tsx', import.meta.url), 'utf8'), /SettingsScreen as default/);
  // the Community tab hosts the existing feed; Tools no longer lists it
  assert.match(readFileSync(new URL('../app/(tabs)/forum.tsx', import.meta.url), 'utf8'), /<TabHost><CommunityFeedScreen/);
  assert.doesNotMatch(readFileSync(new URL('../src/screens/tools.tsx', import.meta.url), 'utf8'), /id: 'community'/);
  const home = readFileSync(new URL('../src/screens/home.tsx', import.meta.url), 'utf8');
  assert.match(home, /go\('\/settings'\)/, 'the avatar opens Settings');
  assert.match(home, /\(tabs\)\/forum/, 'Ask the community opens the tab');
  const st = readFileSync(new URL('../src/screens/settings.tsx', import.meta.url), 'utf8');
  for (const sec of ['Appearance', 'Privacy &amp; Face ID', 'Notifications', 'Backup &amp; iCloud', 'Widgets &amp; Wallet', 'Help', 'About', 'Delete all data']) assert.ok(st.includes(`<SectionHeader>${sec}</SectionHeader>`), sec);
  assert.match(st, /<SettingsList os=\{os\}>/);
  assert.match(st, /Linking\.openSettings\(\)/, 'Open system settings row');
  assert.match(st, /go\('\/profile'\)/, 'Profile at the top');
  assert.match(st, /appBar: 'android'/, 'Material top app bar on Android');
  assert.doesNotMatch(readFileSync(new URL('../src/screens/profile.tsx', import.meta.url), 'utf8') + home, /\(tabs\)\/settings/);
});
