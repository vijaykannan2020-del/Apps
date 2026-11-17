import { useColorScheme } from 'react-native';

const dark = {
  dark: true,
  bg: '#0A0B0D',
  surface: '#141619',
  surface2: '#1C1F23',
  border: 'rgba(255,255,255,0.07)',
  text: '#F2F3F5',
  sub: '#8B9099',
  faint: '#5A5F67',
  accent: '#6E9BFF',
  accentSoft: 'rgba(110,155,255,0.14)',
  green: '#3DD68C',
  greenSoft: 'rgba(61,214,140,0.14)',
  amber: '#F5B547',
  amberSoft: 'rgba(245,181,71,0.14)',
  red: '#FF6B6B',
  redSoft: 'rgba(255,107,107,0.14)',
};

const light: typeof dark = {
  dark: false,
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  surface2: '#EDEFF2',
  border: 'rgba(0,0,0,0.06)',
  text: '#0E1116',
  sub: '#6B717B',
  faint: '#A2A7AF',
  accent: '#2F6BFF',
  accentSoft: 'rgba(47,107,255,0.10)',
  green: '#16A765',
  greenSoft: 'rgba(22,167,101,0.10)',
  amber: '#C98A12',
  amberSoft: 'rgba(201,138,18,0.12)',
  red: '#E5484D',
  redSoft: 'rgba(229,72,77,0.10)',
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const radius = { sm: 10, md: 16, lg: 22 };
export const space = (n: number) => n * 4;
