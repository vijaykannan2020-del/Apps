import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { useLayout } from '../../src/lib/layout';

const icons: Record<string, [any, any]> = {
  index: ['today', 'today-outline'],
  cases: ['file-tray-full', 'file-tray-full-outline'],
  tools: ['calculator', 'calculator-outline'],
  status: ['shield-checkmark', 'shield-checkmark-outline'],
  data: ['business', 'business-outline'],
};

export default function TabsLayout() {
  const t = useTheme();
  const L = useLayout();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.faint,
        tabBarLabelStyle: { fontSize: L.wide ? 11 : 10.5, fontWeight: '600' },
        tabBarItemStyle: L.wide ? { paddingHorizontal: 0 } : undefined,
        tabBarPosition: L.wide ? 'left' : 'bottom',
        tabBarVariant: L.wide ? 'material' : 'uikit',
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: L.wide ? {
          backgroundColor: t.surface,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: t.border,
          width: 112,
          paddingTop: 24,
        } : {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: t.border,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : t.surface,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' && !L.wide ? (
            <BlurView tint={t.dark ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarIcon: ({ focused, color }) => <Ionicons name={icons[route.name]?.[focused ? 0 : 1] ?? 'ellipse'} size={22} color={color as string} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="cases" options={{ title: 'Cases' }} />
      <Tabs.Screen name="status" options={{ title: 'My Status' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
      <Tabs.Screen name="data" options={{ title: 'Employers' }} />
    </Tabs>
  );
}
