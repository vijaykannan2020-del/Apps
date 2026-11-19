// First run (owner change, Nov 18): two screens to Home — Welcome, then "About you". No login, ever.
// The 4-screen tour is optional (Profile → How CaseDesk works).
import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import type { StatusCategory } from '../core/model';
import { STATUS_GROUPS } from '../core/model';
import { useFamily } from '../data/FamilyProvider';
import { Button, Card, ChipToggle, Chips, Field, H1, Hint, Icon, RowIcon, Screen, T, Why, font, useTheme, useToast, Footer, useLayout, MIN_TOUCH } from '../ui';
import { DISCLAIMER_LINE } from '../content/legal';
import { chipLabel } from './sheets';
import { home, replace } from './common';

export function Welcome() {
  const t = useTheme();
  const points: [string, string, string][] = [
    ['users', 'Your family’s US status in one place', 'How long everyone can stay, and what to do next.'],
    ['doc', 'Add documents when you’re ready', 'Passport, I-94, approvals — read on your phone. Skip any of them.'],
    ['lock', 'Nothing is uploaded', 'No account, no tracking. Saved only on this phone.'],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={42} color="#fff" />
          </View>
          <T a11y="header" style={[font.largeTitle, { marginTop: 22, textAlign: 'center' }]}>Immigration Wallet</T>
          <T tone="text2" style={[font.body, { marginTop: 6, textAlign: 'center' }]}>US immigration status for you and your family.</T>
        </View>
        <View style={{ marginTop: 36, gap: 22 }}>
          {points.map(([icon, title, sub]) => (
            <View key={title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={22} color={t.accent} /></View>
              <View style={{ flex: 1 }}>
                <T style={font.headline}>{title}</T>
                <T tone="text2" style={[font.sub, { marginTop: 2 }]}>{sub}</T>
              </View>
            </View>
          ))}
        </View>
      </Screen>
      <Footer column>
        <Button title="Get started" onPress={() => router.push('/about-you' as never)} block={false} />
        <Button kind="ghost" icon="restore" title="Restore from a backup" onPress={() => router.push('/restore' as never)} />
        {Platform.OS === 'ios' ? <Button kind="ghost" icon="backup" title="Restore from iCloud" onPress={() => router.push('/restore-icloud' as never)} /> : null}
        <Pressable onPress={() => router.push('/about' as never)} accessibilityRole="link" accessibilityLabel={`${DISCLAIMER_LINE} Read more`} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <T tone="text2" style={[font.caption, { textAlign: 'center' }]}>{DISCLAIMER_LINE} <T tone="accent" style={[font.caption, { fontWeight: '600' }]}>Read more</T></T>
        </Pressable>
      </Footer>
    </View>
  );
}

export function AboutYou() {
  const f = useFamily();
  const toast = useToast();
  const [name, setName] = useState('');
  const [st, setSt] = useState<StatusCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!name.trim()) { toast('Type your name first'); return; }
    if (!st) { toast('Pick the situation that fits'); return; }
    setBusy(true);
    await f.actions.createSelf(name, st);
    home();
    setTimeout(() => toast('Saved on this phone'), 400);
  };
  return (
    <Screen keyboard nav={{ title: 'About you', back: 'Welcome', onBack: () => router.back() }}
      footer={<Button title="Continue" disabled={!name.trim() || !st} busy={busy} onPress={go} />}>
      <H1>About you</H1>
      <Why>Your name is just a label — your legal name comes from your passport. Your situation decides which documents and checks you’ll see.</Why>
      <Field label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" autoCapitalize="words" />
      <T tone="text2" style={[font.caption, { marginTop: 22, marginLeft: 2, textTransform: 'uppercase', letterSpacing: 0.4 }]}>What’s your situation?</T>
      <View style={{ marginTop: 8, gap: 8 }}>
        {STATUS_GROUPS.map((g) => (
          <Card key={g.title}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><RowIcon name={g.icon} /><T style={font.headline}>{g.title}</T></View>
            <Chips>{g.items.map((k) => <ChipToggle key={k} text={chipLabel(k)} on={st === k} onPress={() => setSt(k)} />)}</Chips>
          </Card>
        ))}
      </View>
      <Hint style={{ marginHorizontal: 4, marginTop: 14 }}>You can change this later on your page. Add family and documents from Home whenever you like.</Hint>
    </Screen>
  );
}

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
  const L = useLayout();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const done = () => (router.canGoBack() ? router.back() : replace('/(tabs)'));
  const next = () => { if (i >= SLIDES.length - 1) done(); else { ref.current?.scrollTo({ x: (i + 1) * (box?.w ?? width), animated: true }); setI(i + 1); } };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box ? (
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: box.w, height: box.h }}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w))} onScroll={Platform.OS === 'web' ? (e) => setI(Math.round(e.nativeEvent.contentOffset.x / box.w)) : undefined} scrollEventThrottle={64}>
          {SLIDES.map((item, index) => (
            <View key={item[1]} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`} style={{ width: box.w, maxWidth: box.w, flexShrink: 0, height: box.h, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, overflow: 'hidden' }}>
              <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}><Icon name={item[0]} size={64} color={t.accent} /></View>
              <T a11y="header" style={[font.title, { textAlign: 'center', width: box.w - 64 }]}>{item[1]}</T>
              <T tone="text2" style={[font.body, { textAlign: 'center', marginTop: 12, width: box.w - 64, lineHeight: 26 }]}>{item[2]}</T>
            </View>
          ))}
        </ScrollView>
      ) : null}
      </View>
      <Footer column>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessibilityElementsHidden>
          {SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? t.accent : t.text3 }} />)}
        </View>
        <Button title={i === SLIDES.length - 1 ? 'Done' : 'Continue'} onPress={next} />
        <Button kind="ghost" title="Close" onPress={done} />
      </Footer>
    </View>
  );
}
