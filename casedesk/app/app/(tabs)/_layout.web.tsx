// Web preview only (screenshots / review): a JS tab bar styled like the iOS one. The phone app uses
// the system tab bar (_layout.tsx, native tabs).
import { Tabs } from 'expo-router';
import { Icon, m3Roles, useTheme } from '../../src/ui';

const ICON: Record<string, string> = { index: 'home', family: 'users', cases: 'clock', tools: 'grid', settings: 'gear' };
const LABEL: Record<string, string> = { index: 'Home', family: 'Family', cases: 'Cases', tools: 'Tools', settings: 'Settings' };

export default function TabsWeb() {
  const t = useTheme();
  const m = m3Roles(t);
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: m.primary,
      tabBarInactiveTintColor: t.text2,
      tabBarLabel: LABEL[route.name],
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      tabBarStyle: { backgroundColor: t.bar, borderTopColor: t.sep, borderTopWidth: 0.5, position: 'absolute', height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarIcon: ({ color }) => <Icon name={ICON[route.name] ?? 'grid'} size={24} color={String(color)} />,
      sceneStyle: { backgroundColor: t.bg },
    })}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="family" />
      <Tabs.Screen name="cases" />
      <Tabs.Screen name="tools" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
