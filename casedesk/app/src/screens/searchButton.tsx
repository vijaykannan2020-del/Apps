// The round Search button (owner, Nov 2026): next to the title on Home, Family, Cases, Updates and Tools
// (not Community). Opens Search with the keyboard up.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, useTheme } from '../ui';
import { go } from './common';

export function SearchButton() {
  const t = useTheme();
  return (
    <Pressable onPress={() => go('/search')} accessibilityRole="search" accessibilityLabel="Search people, documents, cases and tools" hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? t.card : t.card2, opacity: pressed ? 0.75 : 1 })}>
      <Icon name="search" size={19} color={t.text} />
    </Pressable>
  );
}
/** Title-bar right side: the screen's own buttons, then Search. */
export function WithSearch({ children }: { children?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{children}<SearchButton /></View>;
}
