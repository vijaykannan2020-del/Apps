import React, { useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { tap } from './ui';
import { useLayout } from '../lib/layout';
import { Glass } from './Glass';
import { UscisLookupHost } from './UscisLookup';

// Detail pages. On iPhone / Android they use the system navigation bar (iOS 26 Liquid Glass back button,
// swipe-back, Material top app bar on Android). The web preview draws its own bar.
export function DetailScreen({ title, children, right, modal }: { title?: string; children: React.ReactNode; right?: React.ReactNode; modal?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const back = () => { tap(); router.canGoBack() ? router.back() : router.replace('/'); };
  const content = <View style={{ width: '100%', maxWidth: L.maxDetail, alignSelf: 'center', paddingLeft: insets.left, paddingRight: insets.right }}>{children}</View>;

  // Options must stay the same object between renders: changing them on every keystroke makes iOS
  // rebuild the header and drop focus from the text field being typed in.
  const ios = Platform.OS === 'ios';
  const backRef = useRef(back); backRef.current = back;
  const rightRef = useRef(right); rightRef.current = right;
  const hasRight = !!right;
  const options = useMemo(() => ({
    headerShown: true,
    title: title ?? '',
    headerTransparent: ios,
    headerBlurEffect: ios ? (t.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight') : undefined,
    headerShadowVisible: false,
    headerTintColor: t.text,
    headerTitleStyle: { color: t.text },
    headerStyle: ios ? undefined : { backgroundColor: t.bg },
    headerBackButtonDisplayMode: 'minimal',
    headerLeft: modal ? () => (
      <Pressable onPress={() => backRef.current()} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={t.text} /></Pressable>
    ) : undefined,
    headerRight: hasRight ? () => rightRef.current : undefined,
  }) as any, [title, t.dark, t.text, t.bg, modal, hasRight, ios]);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Stack.Screen options={options} />
        <ScrollView
          style={{ flex: 1, backgroundColor: t.bg }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {content}
        </ScrollView>
        <UscisLookupHost />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: modal ? 14 : insets.top + 6, paddingHorizontal: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={back} hitSlop={12}>
          <Glass interactive style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Ionicons name={modal ? 'close' : 'chevron-back'} size={20} color={t.text} />
          </Glass>
        </Pressable>
        {/* Actions stay on the left next to Back — the top-right corner can be covered on foldables */}
        {right ? <View style={{ marginLeft: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>{right}</View> : null}
        <Text style={{ flex: 1, textAlign: 'center', color: t.text, fontSize: 16, fontWeight: '600', marginRight: right ? 90 : 40 }} numberOfLines={1}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
    </View>
  );
}
