import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import { subscribe, getVersion, S } from './matrix';

export type Theme = ReturnType<typeof makeTheme>;
// New look (Nov 2026): dark ink, warm off-white text, one lime accent. Fonts: Space Grotesk (titles) + system.
export const FONT_TITLE = 'SpaceGrotesk_700Bold';
function makeTheme(dark: boolean) {
  return {
    dark,
    bg: dark ? '#0D0E11' : '#F7F7F4',
    surface: dark ? '#17191E' : '#FFFFFF',
    fill: dark ? '#1F2228' : '#ECECE7', // solid: rows sit on top of their swipe actions
    ink: dark ? '#F2F1EC' : '#14161A',
    soft: dark ? '#9A9CA3' : '#62656C',
    line: dark ? '#26292F' : 'rgba(20,22,26,0.12)',
    accent: dark ? '#C8F169' : '#4E7A00',
    accentInk: dark ? '#0D0E11' : '#FFFFFF',
    primary: dark ? '#C8F169' : '#14161A',
    primaryText: dark ? '#0D0E11' : '#FFFFFF',
    bubbleIn: dark ? '#17191E' : '#FFFFFF',
    bubbleOut: dark ? 'rgba(200,241,105,0.13)' : '#E4EFCB',
    bubbleOutBorder: dark ? 'rgba(200,241,105,0.28)' : 'rgba(78,122,0,0.25)',
    bubbleOutText: dark ? '#F2F1EC' : '#14161A',
    blue: dark ? '#5AA9FF' : '#0A6CDB',
    red: dark ? '#FF6B5E' : '#D6342A',
    unread: dark ? '#C8F169' : '#14161A',
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
