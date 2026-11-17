import React, { ReactNode } from 'react';
import { Platform, StyleProp, ViewStyle, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme';

// Real iOS 26+ Liquid Glass when the phone supports it; frosted blur on older iOS; plain tonal surface on Android/web.
let GlassView: any = null;
let LG = false;
if (Platform.OS === 'ios') {
  try {
    const g = require('expo-glass-effect');
    LG = g.isLiquidGlassAvailable();
    GlassView = g.GlassView;
  } catch { LG = false; }
}
export const hasLiquidGlass = LG;

export function Glass({ children, style, interactive }: { children?: ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const t = useTheme();
  if (LG && GlassView) return <GlassView glassEffectStyle="regular" isInteractive={interactive} colorScheme={t.dark ? 'dark' : 'light'} style={style}>{children}</GlassView>;
  if (Platform.OS === 'ios') return <BlurView intensity={t.dark ? 45 : 65} tint={t.dark ? 'dark' : 'light'} style={[{ overflow: 'hidden' }, style]}>{children}</BlurView>;
  return <View style={[{ backgroundColor: t.surface2 }, style]}>{children}</View>;
}
