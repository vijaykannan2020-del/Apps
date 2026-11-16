import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import { subscribe, getVersion, S } from './matrix';

export type Theme = ReturnType<typeof makeTheme>;
function makeTheme(dark: boolean) {
  return {
    dark,
    bg: dark ? '#000000' : '#FFFFFF',
    surface: dark ? '#1C1C1E' : '#F2F2F7',
    fill: dark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)',
    ink: dark ? '#FFFFFF' : '#000000',
    soft: dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)',
    line: dark ? 'rgba(84,84,88,0.6)' : 'rgba(60,60,67,0.18)',
    primary: dark ? '#FFFFFF' : '#000000',
    primaryText: dark ? '#000000' : '#FFFFFF',
    bubbleIn: dark ? '#262629' : '#E9E9EB',
    bubbleOut: dark ? '#FFFFFF' : '#000000',
    bubbleOutText: dark ? '#000000' : '#FFFFFF',
    blue: '#0A84FF',
    red: '#FF453A',
    unread: dark ? '#FFFFFF' : '#000000',
  };
}
const LIGHT = makeTheme(false), DARK = makeTheme(true);
export function useTheme(): Theme {
  const sys = useColorScheme();
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const mode = S.prefs.theme === 'auto' ? sys : S.prefs.theme;
  return mode === 'dark' ? DARK : LIGHT;
}

// Re-render a screen whenever chats change
export function useStore() { return useSyncExternalStore(subscribe, getVersion, getVersion); }
