// Apple's Add to Apple Wallet button (local Expo module, v2.5 builds). Guarded: on older builds the
// native view isn't there and AddPassButton is null — callers show a plain text button instead.
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type AddPassButtonProps = ViewProps & { outline?: boolean; onPress?: () => void };

let view: ComponentType<AddPassButtonProps> | null | undefined;

export function nativeAddPassButton(): ComponentType<AddPassButtonProps> | null {
  if (view !== undefined) return view;
  let found: ComponentType<AddPassButtonProps> | null = null;
  try {
    const core = require('expo-modules-core');
    if (core.requireOptionalNativeModule?.('AddPassButton')) found = core.requireNativeView('AddPassButton');
  } catch { found = null; }
  view = found;
  return found;
}

export function systemCanAddPasses(): boolean | undefined {
  try { return require('expo-modules-core').requireOptionalNativeModule?.('AddPassButton')?.canAddPasses?.(); } catch { return undefined; }
}
