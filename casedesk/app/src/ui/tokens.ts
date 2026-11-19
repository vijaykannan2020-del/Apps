// Pastel look (v2.7, approved mock team/design/pastel): true black page, dark grey rounded cards, colour
// from soft pastel blocks with dark "ink" text. Light mode: soft grey page, white cards, same pastels.
// Colour has ONE meaning everywhere: sage = good / valid, butter = attention / soon, blush = urgent /
// expired, sky = information / identity. Pure — contrast is unit-tested in tests/pastel.test.ts.
// Token NAMES from earlier versions are kept (accent, green, amber, red, ink*…); new ones are added.

/** The brand pastels (same in light and dark) and the ink used for text on them. */
export const PASTEL = { sage: '#A9CDB9', sageD: '#5FB497', blush: '#F8D2D3', butter: '#FDD78C', sky: '#BFD9F8', mint: '#CFF3E2' };
export const INK = '#1D2A24';
/** Secondary text on a pastel block (ink at 78%: still >= 4.5:1 on sage, blush, butter, sky, mint). */
export const INK2 = 'rgba(29,42,36,0.78)';

/**
 * Colour themes (Settings → Appearance → Colour). Pastel is the default four-pastel look. The six
 * others keep the SAME structure and only swap the brand / identity / information blocks for soft
 * tints of one colour family. Since v2.9 the good and attention BLOCKS (big cards) follow the theme too;
 * urgent blocks and every status pill, dot and text colour stay fixed.
 */
export type ColourTheme = 'pastel' | 'indigo' | 'emerald' | 'ocean' | 'sunset' | 'rose' | 'graphite';
/** The blocks a screen can use: five identity slots (sky is the main brand / information block) and
 *  three fixed status blocks. */
export const BLOCKS = { ...PASTEL, good: PASTEL.sage, warn: PASTEL.butter, urgent: PASTEL.blush };

export const DARK = {
  dark: true,
  bg: '#000000', card: '#1C1D1F', card2: '#26272A', fill: 'rgba(255,255,255,0.10)', segOn: '#FFFFFF',
  text: '#FFFFFF', text2: '#9A9CA1', text3: '#8E9095', sep: 'rgba(255,255,255,0.10)',
  // accent = sky (information / identity); green / amber / red are the FILL colours of each meaning
  accent: PASTEL.sky, green: PASTEL.sageD, amber: PASTEL.butter, red: PASTEL.blush, grey: '#8E9095',
  // ink* = TEXT colours of each meaning on the page and on cards
  inkAccent: PASTEL.sky, inkGreen: '#7FE0A8', inkAmber: PASTEL.butter, inkRed: '#FFA9AC', pillAlpha: 0.16,
  bar: 'rgba(0,0,0,0.86)', shade: 'rgba(0,0,0,0.6)', avatar: '#26272A', field: '#1C1D1F', fieldBorder: 'rgba(255,255,255,0.14)',
  // new in v2.7
  pastel: BLOCKS, ink: INK, ink2: INK2,
  primary: '#FFFFFF', onPrimary: '#000000', // primary button: white on black
  pos: '#7FE0A8', outline: '#3A3B3F', track: 'rgba(0,0,0,0.14)', onPastel: false,
  // brand slots (change with the colour theme): selected chip, tab tint, Android nav pill
  colour: 'pastel' as ColourTheme, chipOn: '#FFFFFF', onChipOn: '#000000', tab: PASTEL.sage, navPill: '#33493F', onNavPill: PASTEL.mint,
};
export const LIGHT: typeof DARK = {
  dark: false,
  bg: '#F1F1F4', card: '#FFFFFF', card2: '#F3F4F6', fill: 'rgba(20,24,22,0.07)', segOn: '#111312',
  text: '#111312', text2: '#55585C', text3: '#6A6D72', sep: 'rgba(20,24,22,0.12)',
  // fills are a step deeper than the pastels so dots, meters and ring segments show on white (>= 3:1)
  accent: '#4F86C6', green: '#3F9A7B', amber: '#B67C0C', red: '#D0626A', grey: '#85888D',
  inkAccent: '#1F5288', inkGreen: '#1E6B50', inkAmber: '#7D5200', inkRed: '#A52A36', pillAlpha: 0.14,
  bar: 'rgba(241,241,244,0.92)', shade: 'rgba(0,0,0,0.32)', avatar: '#E4E5E9', field: '#FFFFFF', fieldBorder: 'rgba(20,24,22,0.30)',
  pastel: BLOCKS, ink: INK, ink2: INK2,
  primary: '#111312', onPrimary: '#FFFFFF', // primary button: black on light
  pos: '#1E6B50', outline: 'rgba(20,24,22,0.18)', track: 'rgba(0,0,0,0.14)', onPastel: false,
  colour: 'pastel', chipOn: '#111312', onChipOn: '#FFFFFF', tab: '#2A7359', navPill: PASTEL.sage, onNavPill: INK,
};

export type PastelTone = 'sage' | 'blush' | 'butter' | 'sky' | 'mint' | 'good' | 'warn' | 'urgent';
/** The theme INSIDE a pastel block: every text colour becomes ink, so anything placed there stays readable. */
export function onPastel(t: typeof DARK, bg: string): typeof DARK {
  return {
    ...t, onPastel: true, card: bg, card2: 'rgba(0,0,0,0.08)', fill: 'rgba(0,0,0,0.10)', sep: 'rgba(0,0,0,0.14)',
    text: INK, text2: INK2, text3: INK2, grey: INK2, accent: INK, green: INK, amber: INK, red: INK,
    inkAccent: INK, inkGreen: INK, inkAmber: INK, inkRed: INK, pos: INK, outline: 'rgba(0,0,0,0.22)',
    primary: INK, onPrimary: '#FFFFFF', avatar: 'rgba(0,0,0,0.12)', field: 'rgba(255,255,255,0.55)', fieldBorder: 'rgba(0,0,0,0.22)', pillAlpha: 0,
  };
}

/** Meaning -> pastel block: red = urgent, amber = attention, green = good, blue = information. */
export const TONE_PASTEL = { red: 'urgent', amber: 'warn', green: 'good', blue: 'sky', grey: 'sky' } as const;

/** Material 3 (Android 16, Expressive) colour roles from the same palette (brand slots follow the colour theme). */
export const m3Roles = (t: typeof DARK) => ({
  surface: t.bg, surfaceContainer: t.card, surfaceContainerHigh: t.card2, onSurface: t.text, onSurfaceVariant: t.text2,
  primary: t.tab, onPrimary: t.dark ? INK : '#FFFFFF',
  secondaryContainer: t.navPill, onSecondaryContainer: t.onNavPill, // nav bar pill indicator
  tertiaryContainer: t.pastel.sky, onTertiaryContainer: INK, errorContainer: PASTEL.blush, onErrorContainer: INK, outline: t.outline,
});

// ---- colour themes ----
const hsl = (h: number, s: number, l: number) => {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
};
/** h = the family's hue (from the earlier palette study, team/design/palette), s = how colourful,
 *  h2 = a second hue for two of the five tints (Sunset: coral to violet), swatch = the picker dot. */
type Family = { name: string; h: number; s: number; h2?: number };
export const FAMILIES: Record<Exclude<ColourTheme, 'pastel'>, Family> = {
  indigo: { name: 'Indigo', h: 234, s: 78 },
  emerald: { name: 'Emerald', h: 152, s: 52 },
  ocean: { name: 'Ocean', h: 190, s: 62, h2: 214 },
  sunset: { name: 'Sunset', h: 16, s: 82, h2: 262 },
  rose: { name: 'Rose', h: 338, s: 76 },
  graphite: { name: 'Graphite', h: 240, s: 7 },
};
export const COLOUR_THEMES: { id: ColourTheme; name: string }[] = [{ id: 'pastel', name: 'Pastel' }, ...(Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).map((id) => ({ id: id as ColourTheme, name: FAMILIES[id].name }))];

/** Five soft tints of one family, in the pastel style (light tints that carry dark ink text). */
export function familyBlocks(f: Family) {
  // v2.9 (owner: one hue everywhere felt flat): the five tints spread around the family hue so cards
  // next to each other differ, while staying in the same family.
  const h2 = f.h2 ?? f.h + 40;
  return { sky: hsl(f.h, f.s, 85), sage: hsl(h2, f.s * 0.8, 82), blush: hsl(f.h - 36, f.s * 0.9, 88), butter: hsl(f.h + 70, f.s * 0.7, 82), mint: hsl(f.h - 6, f.s * 0.85, 93) };
}
/** Shortest-way blend of two hues (t = 0 gives a, 1 gives b). */
const mixHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };
/** Status blocks in a theme: still green-ish for good and amber-ish for attention, pulled a third of
 *  the way to the family hue so they belong to the theme but never look like each other. */
export function familyStatus(f: Family) {
  const s = Math.max(f.s, 6) / 78;
  const clamp = (h: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, ((h % 360) + 360) % 360));
  // Hues are kept in their meaning's band (good 125–175, attention 34–52) so attention never drifts to red.
  return { good: hsl(clamp(mixHue(150, f.h, 0.35), 125, 175), 30 + 30 * s, 80), warn: hsl(clamp(mixHue(42, f.h, 0.3), 34, 52), 55 + 35 * s, 80) };
}
/** The picker dots: Pastel shows its four pastels; a family shows its main tint and a deeper one. */
export function swatchOf(c: ColourTheme): string[] {
  if (c === 'pastel') return [PASTEL.sage, PASTEL.blush, PASTEL.butter, PASTEL.sky];
  const f = FAMILIES[c]; return [hsl(f.h, f.s, 85), hsl(f.h2 ?? f.h, f.s * 0.8, 70)];
}

/** The lightest shade of a hue that still has `ratio` contrast on the light page (for fills and text in light mode). */
function deep(h: number, s: number, ratio: number): string {
  for (let l = 56; l > 12; l -= 2) { const c = hsl(h, s, l); if (contrast(c, LIGHT.bg) >= ratio) return c; }
  return hsl(h, s, 12);
}

const cache = new Map<string, typeof DARK>();
/** The theme for a mode and a colour. Only brand slots change; status colours are the base ones. */
export function themeFor(dark: boolean, colour: ColourTheme = 'pastel'): typeof DARK {
  const base = dark ? DARK : LIGHT;
  const f = colour === 'pastel' ? undefined : FAMILIES[colour];
  if (!f) return base;
  const key = `${dark}:${colour}`;
  let t = cache.get(key);
  if (!t) {
    const b = familyBlocks(f);
    const s = Math.max(f.s, 6);
    t = {
      ...base, colour,
      // v2.9 (owner): the big Home cards must change with the theme too. Good and attention blocks take the
      // family's tints (meaning stays in the icon, label and status pills); urgent stays the fixed red.
      pastel: { ...base.pastel, ...b, ...familyStatus(f) },
      accent: dark ? b.sky : deep(f.h, Math.min(70, s), 3.3), inkAccent: dark ? b.sky : deep(f.h, Math.min(72, s + 6), 5),
      chipOn: b.sky, onChipOn: INK,
      tab: dark ? b.sky : deep(f.h, Math.min(72, s + 6), 5),
      navPill: dark ? hsl(f.h, Math.min(40, s), 24) : b.sky, onNavPill: dark ? b.mint : INK,
    };
    cache.set(key, t);
  }
  return t;
}

// ---- WCAG contrast ----
const parse = (c: string): [number, number, number, number] => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim()); return [+r, +g, +b, +a]; }
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
};
/** Composite a (possibly translucent) colour over an opaque background. */
export function over(fg: string, bg: string): [number, number, number] {
  const [r, g, b, a] = parse(fg); const [R, G, B] = parse(bg);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hex = ([r, g, b]: [number, number, number]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Contrast ratio of text colour `fg` on background `bg` (bg may itself be a tint over `base`). */
export function contrast(fg: string, bg: string, base = '#FFFFFF'): number {
  const b = over(bg, base);
  const f = over(fg, hex(b));
  const [l1, l2] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Tinted pill / note background: the tone colour at the theme's pill alpha. */
export const tintOf = (hexColor: string, a: number) => { const [r, g, b] = parse(hexColor); return `rgba(${r},${g},${b},${a})`; };
