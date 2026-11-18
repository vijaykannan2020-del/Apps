// Design tokens from the approved prototype (iOS system palette). Dark is the default look; light
// mode supported; the user can follow the system or pick one (Profile → Appearance).
import React, { createContext, useContext } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import type { Severity } from '../core/rules/types';

const dark = {
  dark: true,
  bg: '#000000', card: '#1C1C1E', card2: '#2C2C2E', fill: 'rgba(118,118,128,0.24)', segOn: '#636366',
  text: '#FFFFFF', text2: 'rgba(235,235,245,0.6)', text3: 'rgba(235,235,245,0.3)', sep: 'rgba(84,84,88,0.55)',
  accent: '#0A84FF', green: '#30D158', amber: '#FF9F0A', red: '#FF453A', grey: '#8E8E93',
  bar: 'rgba(18,18,20,0.82)', shade: 'rgba(0,0,0,0.55)', avatar: '#2C2C2E', field: '#2C2C2E', fieldBorder: 'transparent',
};
const light: typeof dark = {
  dark: false,
  bg: '#F2F2F7', card: '#FFFFFF', card2: '#F2F2F7', fill: 'rgba(118,118,128,0.12)', segOn: '#FFFFFF',
  text: '#000000', text2: 'rgba(60,60,67,0.6)', text3: 'rgba(60,60,67,0.3)', sep: 'rgba(60,60,67,0.18)',
  accent: '#007AFF', green: '#34C759', amber: '#FF9500', red: '#FF3B30', grey: '#8E8E93',
  bar: 'rgba(249,249,251,0.86)', shade: 'rgba(0,0,0,0.28)', avatar: '#E5E5EA', field: '#FFFFFF', fieldBorder: 'rgba(60,60,67,0.29)',
};
export type Theme = typeof dark;
export type ThemeChoice = 'system' | 'dark' | 'light';

/** Semi-transparent tint of a colour (the prototype's color-mix). */
export const tint = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { card: 18, button: 14, field: 12, chip: 999 };
export const font = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 33 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
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

const Ctx = createContext<{ t: Theme; choice: ThemeChoice }>({ t: dark, choice: 'system' });
export function ThemeProvider({ choice = 'system', children }: { choice?: ThemeChoice; children: React.ReactNode }) {
  const sys = useColorScheme();
  const t = choice === 'light' || (choice === 'system' && sys === 'light') ? light : dark;
  return <Ctx.Provider value={{ t, choice }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx).t;

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';
export const toneColor = (t: Theme, tone: Tone) => (tone === 'red' ? t.red : tone === 'amber' ? t.amber : tone === 'green' ? t.green : tone === 'blue' ? t.accent : t.grey);
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
  const { width, height } = dims;
  const fontScale = dims.fontScale * WEB_TEXT_SCALE;
  const wide = width >= 600;
  const maxWidth = width >= 900 ? 720 : 640;
  const side = width < 360 ? 12 : wide ? 24 : 16;
  return { width, height, wide, landscape: width > height, maxWidth, side, fontScale, compact: width < 380 || fontScale > 1.35 };
}
