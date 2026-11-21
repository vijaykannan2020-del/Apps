// Home · Family · Community · Tools (Cases is hidden: it opens from Home) (Settings is a pushed page from the avatar on Home).
// The SYSTEM tab bar on both platforms (owner rule: latest platform conventions, no custom bar):
//  · iOS 26 — the native UITabBar: Liquid Glass, SF Symbols (outline → fill when selected), minimises
//    on scroll, Dynamic Type labels. Only the selection tint comes from the brand (sage).
//  · Android 16 — Material 3 Expressive bottom navigation bar: pill indicator behind the selected
//    icon, labels always shown, edge-to-edge. Colours are the pastel palette mapped to M3 roles
//    (ui/tokens.m3Roles): surface container bar, secondary-container pill, on-surface-variant icons.
import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { m3Roles, useTheme } from '../../src/ui';

export default function TabsLayout() {
  const t = useTheme();
  const m = m3Roles(t);
  const android = Platform.OS === 'android'
    ? { backgroundColor: m.surfaceContainer, indicatorColor: m.secondaryContainer, rippleColor: m.secondaryContainer, tintColor: m.onSecondaryContainer }
    : { tintColor: m.primary };
  return (
    <NativeTabs labelVisibilityMode="labeled" minimizeBehavior="onScrollDown" iconColor={m.onSurfaceVariant} labelStyle={{ fontSize: 11, fontWeight: '600', color: Platform.OS === 'android' ? m.onSurface : undefined }} {...android}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Family</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* v3.0 (owner): four tabs. Cases opens from Home as a pushed page (app/cases.tsx). */}
      <NativeTabs.Trigger name="cases" hidden>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray.full', selected: 'tray.full.fill' }} md="inbox" />
        <NativeTabs.Trigger.Label>Cases</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="forum">
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="forum" />
        <NativeTabs.Trigger.Label>Community</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tools">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="apps" />
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
