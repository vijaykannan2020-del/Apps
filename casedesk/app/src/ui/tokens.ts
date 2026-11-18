// Colour tokens (pure — unit-tested for contrast in tests/theme.test.ts). Dark is the approved look and
// stays as it is. Light mode (owner feedback, v2.1): darker secondary/tertiary text, visible separators,
// stronger tinted pills with dark "ink" text, grey page with white cards — all text ≥ 4.5:1 (WCAG AA).
export const DARK = {
  dark: true,
  bg: '#000000', card: '#1C1C1E', card2: '#2C2C2E', fill: 'rgba(118,118,128,0.24)', segOn: '#636366',
  text: '#FFFFFF', text2: 'rgba(235,235,245,0.6)', text3: 'rgba(235,235,245,0.3)', sep: 'rgba(84,84,88,0.55)',
  accent: '#0A84FF', green: '#30D158', amber: '#FF9F0A', red: '#FF453A', grey: '#8E8E93',
  inkAccent: '#0A84FF', inkGreen: '#30D158', inkAmber: '#FF9F0A', inkRed: '#FF453A', pillAlpha: 0.16,
  bar: 'rgba(18,18,20,0.82)', shade: 'rgba(0,0,0,0.55)', avatar: '#2C2C2E', field: '#2C2C2E', fieldBorder: 'transparent',
};
export const LIGHT: typeof DARK = {
  dark: false,
  bg: '#EDEDF2', card: '#FFFFFF', card2: '#F2F2F7', fill: 'rgba(118,118,128,0.16)', segOn: '#FFFFFF',
  text: '#000000', text2: '#4A4A50', text3: '#6B6B71', sep: 'rgba(60,60,67,0.32)',
  accent: '#007AFF', green: '#34C759', amber: '#FF9500', red: '#FF3B30', grey: '#8E8E93',
  inkAccent: '#0058C2', inkGreen: '#17702F', inkAmber: '#965400', inkRed: '#B3150F', pillAlpha: 0.2,
  bar: 'rgba(249,249,251,0.92)', shade: 'rgba(0,0,0,0.32)', avatar: '#DCDCE2', field: '#FFFFFF', fieldBorder: 'rgba(60,60,67,0.42)',
};

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
