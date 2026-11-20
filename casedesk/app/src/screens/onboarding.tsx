// First run (v3.0): the multi-step onboarding lives in setup.tsx. No login, ever.
// The 4-screen tour is optional (Settings → How Immigration Wallet works).
import React, { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Button, Icon, T, font, useTheme, Footer } from '../ui';
import { replace } from './common';

// v3.0: first run is the multi-step onboarding (screens/setup.tsx). The old Welcome and About you
// routes open it (About you starts at the name step).
export { Onboarding as Welcome } from './setup';
export function AboutYou() { return <Redirect href={{ pathname: '/welcome', params: { step: 'you' } } as never} />; }

// ---- optional tour (Profile → How CaseDesk works) ----
const SLIDES: [string, string, string][] = [
  ['users', 'Your family’s US status in one place', 'See how long everyone can stay, which document proves it, and what to do next.'],
  ['list', 'How it works', '1 · Tell us your situation and add your family\n2 · Add each person’s documents\n3 · See what needs attention'],
  ['lock', 'Read on your phone — nothing is uploaded', 'Documents are read and saved only on this phone. No account. No tracking. Lock it with Face ID.'],
  ['checkc', 'Ready when you are', 'You can skip any document and add it later.'],
];
export function Tour() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const done = () => (router.canGoBack() ? router.back() : replace('/(tabs)'));
  const next = () => { if (i >= SLIDES.length - 1) done(); else { ref.current?.scrollTo({ x: (i + 1) * (box?.w ?? width), animated: true }); setI(i + 1); } };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box ? (
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: box.w, height: box.h }}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w))} onScroll={Platform.OS === 'web' ? (e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w)) : undefined} scrollEventThrottle={64}>
          {SLIDES.map((item, index) => (
            <View key={item[1]} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`} style={{ width: box.w, maxWidth: box.w, flexShrink: 0, height: box.h, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, overflow: 'hidden' }}>
              <View style={{ width: 150, height: 150, borderRadius: 54, backgroundColor: t.pastel[(['sage', 'sky', 'butter', 'blush'] as const)[index % 4]], alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}><Icon name={item[0]} size={64} color={t.ink} /></View>
              <T a11y="header" style={[font.title, { textAlign: 'center', width: box.w - 64 }]}>{item[1]}</T>
              <T tone="text2" style={[font.body, { textAlign: 'center', marginTop: 12, width: box.w - 64, lineHeight: 26 }]}>{item[2]}</T>
            </View>
          ))}
        </ScrollView>
      ) : null}
      </View>
      </View>
      <Footer column>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessibilityElementsHidden>
          {SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? t.text : t.outline }} />)}
        </View>
        <Button title={i === SLIDES.length - 1 ? 'Done' : 'Continue'} onPress={next} />
        <Button kind="ghost" title="Close" onPress={done} />
      </Footer>
    </View>
  );
}
