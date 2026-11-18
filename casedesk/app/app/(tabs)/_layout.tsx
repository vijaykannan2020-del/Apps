// iPhone, iPad and Android: the system's own tab bar.
// iOS 26+: Liquid Glass tab bar that shrinks on scroll; on iPad / large screens it can become a sidebar.
// Android: Material 3 bottom navigation. (The web preview uses _layout.web.tsx.)
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs sidebarAdaptable minimizeBehavior="onScrollDown" tintColor={t.accent} iconColor={t.sub} labelStyle={{ fontSize: 11, fontWeight: '600' }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cases">
        <NativeTabs.Trigger.Icon sf={{ default: 'tray.full', selected: 'tray.full.fill' }} md="inbox" />
        <NativeTabs.Trigger.Label>Case Status</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="status">
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="description" />
        <NativeTabs.Trigger.Label>Documents</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tools">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="apps" />
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
