import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

const icons: Record<string, [any, any]> = {
  index: ['today', 'today-outline'],
  cases: ['file-tray-full', 'file-tray-full-outline'],
  tools: ['calculator', 'calculator-outline'],
  status: ['shield-checkmark', 'shield-checkmark-outline'],
  data: ['business', 'business-outline'],
};

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.faint,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: t.border,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : t.surface,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
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
