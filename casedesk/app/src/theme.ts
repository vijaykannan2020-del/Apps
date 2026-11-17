import { useColorScheme } from 'react-native';

// Apple system colours (same palette as Inbox) — they also read naturally on Android.
const dark = {
  dark: true,
  bg: '#000000',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  border: 'rgba(84,84,88,0.45)',
  text: '#FFFFFF',
  sub: 'rgba(235,235,245,0.6)',
  faint: 'rgba(235,235,245,0.3)',
  accent: '#0A84FF',
  accentSoft: 'rgba(10,132,255,0.16)',
  green: '#30D158',
  greenSoft: 'rgba(48,209,88,0.15)',
  amber: '#FF9F0A',
  amberSoft: 'rgba(255,159,10,0.15)',
  red: '#FF453A',
  redSoft: 'rgba(255,69,58,0.15)',
};

const light: typeof dark = {
  dark: false,
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surface2: '#E9E9EE',
  border: 'rgba(60,60,67,0.12)',
  text: '#000000',
  sub: 'rgba(60,60,67,0.6)',
  faint: 'rgba(60,60,67,0.3)',
  accent: '#007AFF',
  accentSoft: 'rgba(0,122,255,0.10)',
  green: '#34C759',
  greenSoft: 'rgba(52,199,89,0.12)',
  amber: '#FF9500',
  amberSoft: 'rgba(255,149,0,0.12)',
  red: '#FF3B30',
  redSoft: 'rgba(255,59,48,0.10)',
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const radius = { sm: 10, md: 16, lg: 22 };
export const space = (n: number) => n * 4;
