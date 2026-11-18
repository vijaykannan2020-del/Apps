// Web preview only (screenshots / review): a JS tab bar styled like the iOS one. The phone app uses
// the system tab bar (_layout.tsx, native tabs).
import { Tabs } from 'expo-router';
import { Icon, useTheme } from '../../src/ui';

const ICON: Record<string, string> = { index: 'home', family: 'users', cases: 'clock', tools: 'grid' };
const LABEL: Record<string, string> = { index: 'Home', family: 'Family', cases: 'Cases', tools: 'Tools' };

export default function TabsWeb() {
  const t = useTheme();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: t.accent,
      tabBarInactiveTintColor: t.grey,
      tabBarLabel: LABEL[route.name],
      tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      tabBarStyle: { backgroundColor: t.bar, borderTopColor: t.sep, borderTopWidth: 0.5, position: 'absolute' },
      tabBarIcon: ({ color }) => <Icon name={ICON[route.name] ?? 'grid'} size={24} color={String(color)} />,
      sceneStyle: { backgroundColor: t.bg },
    })}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="family" />
      <Tabs.Screen name="cases" />
      <Tabs.Screen name="tools" />
    </Tabs>
  );
}
