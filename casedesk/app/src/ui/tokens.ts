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
  pastel: PASTEL, ink: INK, ink2: INK2,
  primary: '#FFFFFF', onPrimary: '#000000', // primary button: white on black
  pos: '#7FE0A8', outline: '#3A3B3F', track: 'rgba(0,0,0,0.14)', onPastel: false,
};
export const LIGHT: typeof DARK = {
  dark: false,
  bg: '#F1F1F4', card: '#FFFFFF', card2: '#F3F4F6', fill: 'rgba(20,24,22,0.07)', segOn: '#111312',
  text: '#111312', text2: '#55585C', text3: '#6A6D72', sep: 'rgba(20,24,22,0.12)',
  // fills are a step deeper than the pastels so dots, meters and ring segments show on white (>= 3:1)
  accent: '#4F86C6', green: '#3F9A7B', amber: '#B67C0C', red: '#D0626A', grey: '#85888D',
  inkAccent: '#1F5288', inkGreen: '#1E6B50', inkAmber: '#7D5200', inkRed: '#A52A36', pillAlpha: 0.14,
  bar: 'rgba(241,241,244,0.92)', shade: 'rgba(0,0,0,0.32)', avatar: '#E4E5E9', field: '#FFFFFF', fieldBorder: 'rgba(20,24,22,0.30)',
  pastel: PASTEL, ink: INK, ink2: INK2,
  primary: '#111312', onPrimary: '#FFFFFF', // primary button: black on light
  pos: '#1E6B50', outline: 'rgba(20,24,22,0.18)', track: 'rgba(0,0,0,0.14)', onPastel: false,
};

export type PastelTone = 'sage' | 'blush' | 'butter' | 'sky' | 'mint';
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
export const TONE_PASTEL = { red: 'blush', amber: 'butter', green: 'sage', blue: 'sky', grey: 'sky' } as const;

/** Material 3 (Android 16, Expressive) colour roles from the same palette. */
export const m3Roles = (t: typeof DARK) => ({
  surface: t.bg, surfaceContainer: t.card, surfaceContainerHigh: t.card2, onSurface: t.text, onSurfaceVariant: t.text2,
  primary: t.dark ? PASTEL.sage : '#2A7359', onPrimary: t.dark ? INK : '#FFFFFF',
  secondaryContainer: t.dark ? '#33493F' : PASTEL.sage, onSecondaryContainer: t.dark ? PASTEL.mint : INK, // nav bar pill indicator
  tertiaryContainer: PASTEL.sky, onTertiaryContainer: INK, errorContainer: PASTEL.blush, onErrorContainer: INK, outline: t.outline,
});

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
