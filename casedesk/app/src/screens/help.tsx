// Help: first-time card on each tab, "?" buttons on complex screens, Settings → Help topics.
import React from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { HELP, HELP_MAIN, TAB_HELP, helpTopic } from '../content/help';
import { useFamily } from '../data/FamilyProvider';
import { Card, Group, Hint, Icon, LinkButton, Row, Screen, SectionHeader, T, Why, font, useTheme, tint, MIN_TOUCH } from '../ui';
import { back, go } from './common';

/** Dismissible 2-line explainer shown the first time a tab is opened.
 *  v2.3: the tabs now use first-visit coach marks (ui/tour.tsx) instead; kept for other screens. */
export function HelpCard({ tab }: { tab: keyof typeof TAB_HELP }) {
  const f = useFamily();
  const t = useTheme();
  const h = TAB_HELP[tab];
  if (!f.ready || !h || (f.settings.helpSeen ?? []).includes(tab)) return null;
  const dismiss = () => f.actions.updateSettings({ helpSeen: [...new Set([...(f.settings.helpSeen ?? []), tab])] });
  return (
    <Card style={{ marginTop: 14, backgroundColor: t.card2, paddingRight: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 2 }}><Icon name="bulb" size={20} color={t.inkAccent} /></View>
        <T style={[font.sub, { flex: 1 }]}>{h.text}</T>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss this tip" hitSlop={6} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: -10 }}>
          <Icon name="x" size={16} color={t.text2} />
        </Pressable>
      </View>
      <View style={{ marginLeft: 26, marginTop: -6 }}><LinkButton align="left" title="Learn more" onPress={() => go(`/help/${h.topic}`)} /></View>
    </Card>
  );
}

/** Small "?" button for complex screens; opens the matching help topic. */
import { HIDE_TIP_BUTTONS } from '../ui/tour';
export function HelpButton({ topic, label }: { topic: string; label?: string }) {
  const t = useTheme();
  if (HIDE_TIP_BUTTONS) return null; // owner, Nov 2026: no "?" on individual screens
  return (
    <Pressable onPress={() => go(`/help/${topic}`)} accessibilityRole="button" accessibilityLabel={label ?? `Help: ${helpTopic(topic)?.title ?? 'help'}`} hitSlop={6}
      style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="help" size={22} color={t.text2} />
    </Pressable>
  );
}

/** The tool guides, folded away under one row. */
function MoreGuides() {
  const [open, setOpen] = React.useState(false);
  const t = useTheme();
  const rest = HELP.filter((h) => !HELP_MAIN.includes(h.id));
  if (!rest.length) return null;
  return (
    <Group style={{ marginTop: 12 }}>
      <Row icon="book" title="More guides" subtitle={open ? undefined : `${rest.length} guides for the tools`} chevron={false} onPress={() => setOpen(!open)} label={open ? 'Hide more guides' : 'Show more guides'}
        trailing={<View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevD" size={16} color={t.text2} /></View>} />
      {open ? rest.map((h) => <Row key={h.id} icon="help" title={h.title} subtitle={h.sub} onPress={() => go(`/help/${h.id}`)} />) : null}
    </Group>
  );
}

export function HelpListScreen() {
  return (
    <Screen nav={{ back: 'Settings', onBack: back, title: 'Help' }}>
      <T a11y="header" style={font.title}>Help</T>
      <Why>How Immigration Wallet works, step by step.</Why>
      <Group style={{ marginTop: 18 }}>{HELP.filter((h) => HELP_MAIN.includes(h.id)).map((h) => <Row key={h.id} icon="help" title={h.title} subtitle={h.sub} onPress={() => go(`/help/${h.id}`)} />)}</Group>
      <MoreGuides />
      <SectionHeader>More</SectionHeader>
      <Group>
        <Row icon="play" title="Take the tour" subtitle="A 1-minute walk through the app" onPress={() => go('/guide')} />
        <Row icon="list" title="How Immigration Wallet works" subtitle="A 4-screen summary" onPress={() => go('/tour')} />
      </Group>
      <Hint center style={{ marginTop: 18 }}>General information, not legal advice.</Hint>
    </Screen>
  );
}

export function HelpTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const h = helpTopic(id);
  const t = useTheme();
  if (!h) return <Screen nav={{ back: 'Back', onBack: back, title: 'Help' }}><Why>This help topic isn’t available.</Why><LinkButton align="left" title="All help topics" onPress={() => go('/help')} /></Screen>;
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Help' }}>
      <T a11y="header" style={font.title}>{h.title}</T>
      <View style={{ gap: 12, marginTop: 12 }}>{h.body.map((p, i) => <T key={i} style={[font.body, { lineHeight: 24 }]}>{p}</T>)}</View>
      {h.steps?.length ? (
        <Card style={{ marginTop: 18 }}>
          {h.steps.map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.pastel.sky, alignItems: 'center', justifyContent: 'center' }}><T style={[{ color: t.ink }, font.foot, { fontWeight: '600' }]}>{String(i + 1)}</T></View>
              <T style={[font.callout, { flex: 1 }]}>{x}</T>
            </View>
          ))}
        </Card>
      ) : null}
      <SectionHeader>Other topics</SectionHeader>
      <Group>{HELP.filter((x) => x.id !== h.id).slice(0, 4).map((x) => <Row key={x.id} icon="help" title={x.title} onPress={() => go(`/help/${x.id}`)} />)}</Group>
      <LinkButton title="All help topics" onPress={() => go('/help')} />
      <Hint center style={{ marginTop: 12 }}>General information, not legal advice.</Hint>
    </Screen>
  );
}
