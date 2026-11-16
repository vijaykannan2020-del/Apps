import { ReactNode } from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '@/lib/theme';

let LG = false;
try { LG = Platform.OS === 'ios' && isLiquidGlassAvailable(); } catch { LG = false; }
export const hasLiquidGlass = LG;

/** Real iOS 26+ Liquid Glass when the phone supports it; frosted blur otherwise. */
export function Glass({ children, style, interactive, tint }: { children?: ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean; tint?: string }) {
  const t = useTheme();
  if (LG) return <GlassView glassEffectStyle="regular" isInteractive={interactive} tintColor={tint} colorScheme={t.dark ? 'dark' : 'light'} style={style}>{children}</GlassView>;
  return <BlurView intensity={t.dark ? 45 : 65} tint={t.dark ? 'dark' : 'light'} style={[{ overflow: 'hidden' }, style]}>{children}</BlurView>;
}
