// Design tokens for the pastel look (v2.7): true black + dark grey cards + pastel blocks; light mode
// is the soft-grey equivalent. One brand palette; the user picks System / Light / Dark only.
import React, { createContext, useContext } from 'react';
import { AccessibilityInfo, Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Severity } from '../core/rules/types';
import { DARK, LIGHT, TONE_PASTEL, onPastel, onOutline, themeFor, type ColourTheme, type PastelTone } from './tokens';
export { DARK, LIGHT, PASTEL, INK, INK2, COLOUR_THEMES, contrast, m3Roles, onPastel, swatchOf, themeFor, TONE_PASTEL } from './tokens';
export type { ColourTheme, PastelTone } from './tokens';

const dark = DARK;
export type Theme = typeof DARK;
export type ThemeChoice = 'system' | 'dark' | 'light';

/** Semi-transparent tint of a colour (the prototype's color-mix). */
export const tint = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { card: 28, hero: 34, tile: 28, row: 26, button: 26, field: 16, chip: 999, sheet: 34 };
export const font = {
  hero: { fontSize: 44, lineHeight: 52, fontWeight: '700' as const, letterSpacing: -1 },
  largeTitle: { fontSize: 32, lineHeight: 39, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 33 },
  title2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
  big: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 25 },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  sub: { fontSize: 15, lineHeight: 20 },
  foot: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 13, lineHeight: 17 },
  tiny: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.4 },
};
export const MIN_TOUCH = 44;

const Ctx = createContext<{ t: Theme; base: Theme; choice: ThemeChoice }>({ t: dark, base: dark, choice: 'system' });
/** choice = System / Light / Dark; colour = the colour theme (Pastel by default). Both apply at once. */
export function ThemeProvider({ choice = 'system', colour = 'pastel', children }: { choice?: ThemeChoice; colour?: ColourTheme; children: React.ReactNode }) {
  const sys = useColorScheme();
  const isLight = choice === 'light' || (choice === 'system' && sys === 'light');
  const value = React.useMemo(() => { const t = themeFor(!isLight, colour); return { t, base: t, choice }; }, [isLight, colour, choice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx).t;

/** Inside a pastel block: the theme's text colours become ink (see tokens.onPastel). */
export function PastelScope({ tone, children }: { tone: PastelTone; children: React.ReactNode }) {
  const c = useContext(Ctx);
  const value = React.useMemo(() => ({ t: onPastel(c.base, c.base.pastel[tone]), base: c.base, choice: c.choice }), [c.base, tone, c.choice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/** Inside an outlined attention card (see onOutline). */
export function OutlineScope({ children }: { children: React.ReactNode }) {
  const c = useContext(Ctx);
  const value = React.useMemo(() => ({ t: onOutline(c.base), base: c.base, choice: c.choice }), [c.base, c.choice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/** Back to the normal theme (a dark card nested in a pastel block). */
export function PlainScope({ children }: { children: React.ReactNode }) {
  const c = useContext(Ctx);
  if (!c.t.onPastel) return <>{children}</>;
  return <Ctx.Provider value={{ t: c.base, base: c.base, choice: c.choice }}>{children}</Ctx.Provider>;
}
/** A stable pastel for a name / key (avatars, tool tiles): identity colours, never status. */
const IDENTITY: PastelTone[] = ['sage', 'blush', 'sky', 'butter', 'mint'];
export const pastelFor = (key: string, i?: number): PastelTone => {
  if (i !== undefined) return IDENTITY[i % IDENTITY.length];
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IDENTITY[h % IDENTITY.length];
};
/** Meaning → pastel block (red urgent · amber attention · green good · blue information). */
export const tonePastel = (tone: Tone): PastelTone => TONE_PASTEL[tone];

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';
export const toneColor = (t: Theme, tone: Tone) => (tone === 'red' ? t.red : tone === 'amber' ? t.amber : tone === 'green' ? t.green : tone === 'blue' ? t.accent : t.grey);
/** Colour for TEXT in a tone (darker in light mode so it passes WCAG AA on white and tinted pills). */
export const toneInk = (t: Theme, tone: Tone) => (tone === 'red' ? t.inkRed : tone === 'amber' ? t.inkAmber : tone === 'green' ? t.inkGreen : tone === 'blue' ? t.inkAccent : t.text2);
export const severityTone = (s: Severity): Tone => (s === 'act' ? 'red' : s === 'review' ? 'amber' : s === 'good' ? 'green' : 'grey');
export const TONE_WORD: Record<Tone, string> = { red: 'Act now', amber: 'Review', blue: 'Info', grey: 'Info', green: 'Good' };

/**
 * Web preview only: ?textScale=2 simulates Dynamic Type so large-text layouts can be reviewed in a
 * browser. On phones the system text size is used (allowFontScaling) and this stays 1.
 */
export const WEB_TEXT_SCALE: number = (() => {
  try { const q = (globalThis as any).location?.search ?? ''; const m = /textScale=([\d.]+)/.exec(q); return m ? Math.min(3.5, Math.max(1, +m[1])) : 1; } catch { return 1; }
})();

/** Layout for any phone, fold or iPad: content is centred with a readable max width. */
export function useLayout() {
  const dims = useWindowDimensions();
  // v3.0 (owner): the usable width leaves out the left / right safe-area insets (the foldable's status
  // column), so columns, charts and rings are sized for the space content really gets.
  const insets = useContext(SafeAreaInsetsContext);
  const width = dims.width - (insets?.left ?? 0) - (insets?.right ?? 0);
  const { height } = dims;
  const fontScale = dims.fontScale * WEB_TEXT_SCALE;
  const wide = width >= 600;
  const twoCol = width >= 700; // unfolded fold / iPad / landscape: real two-column layouts
  const maxWidth = width >= 900 ? 720 : 640;
  const wideMax = Math.min(1180, width - 2 * (wide ? 24 : 16));
  const side = width < 360 ? 12 : wide ? 24 : 16;
  return { width, height, wide, twoCol, wideMax, landscape: width > height, maxWidth, side, fontScale, compact: width < 380 || fontScale > 1.35 };
}

/** iOS Reduce Motion / Android Remove animations: springs and fades are skipped when on. */
export function useReduceMotion() {
  const [rm, setRm] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setRm(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setRm(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return rm;
}

/**
 * Which platform's list conventions to draw (SettingsList): iOS inset grouped rows or Android
 * Material 3 preference rows. Web preview only: ?os=android / ?os=ios picks one for review.
 */
export type ListOS = 'ios' | 'android';
export const WEB_OS: ListOS | undefined = (() => {
  try { const m = /[?&]os=(ios|android)/.exec((globalThis as any).location?.search ?? ''); return m ? (m[1] as ListOS) : undefined; } catch { return undefined; }
})();
export const listOS = (): ListOS => WEB_OS ?? Platform.select<ListOS>({ android: 'android', default: 'ios' })!;
