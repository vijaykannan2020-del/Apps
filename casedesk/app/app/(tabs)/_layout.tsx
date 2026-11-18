// System tab bar (native tabs: Liquid Glass on iOS 26, Material on Android) — same component as the installed build.
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/ui';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs labelVisibilityMode="labeled" minimizeBehavior="onScrollDown" tintColor={t.accent} iconColor={t.grey} labelStyle={{ fontSize: 11, fontWeight: '600' }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Family</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cases">
        <NativeTabs.Trigger.Icon sf={{ default: 'tray.full', selected: 'tray.full.fill' }} md="inbox" />
        <NativeTabs.Trigger.Label>Cases</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tools">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="apps" />
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
