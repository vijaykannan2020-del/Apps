import React from 'react';
import { View, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Pill, Button } from '../../src/components/ui';
import { fmtDate } from '../../src/components/NewsCard';
import { useTheme } from '../../src/theme';
import { getNews } from '../../src/lib/newsCache';

export default function NewsDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const n = getNews(id ?? '');
  if (!n) return <DetailScreen title="Update"><T v="sub" style={{ padding: 20 }}>Not found.</T></DetailScreen>;
  const impact = n.impact === 'high' ? { label: 'High impact', tone: 'amber' as const } : n.impact === 'medium' ? { label: 'Worth knowing', tone: 'accent' as const } : { label: 'FYI', tone: 'neutral' as const };

  return (
    <DetailScreen title={n.agency}>
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pill label={impact.label} tone={impact.tone} />
          <Pill label={fmtDate(n.date)} />
        </View>
        <T v="h1" style={{ marginTop: 14, lineHeight: 34 }}>{n.title}</T>
      </View>
      <Section>
        <Card style={{ backgroundColor: t.accentSoft, borderColor: 'transparent' }}>
          <T v="label" style={{ color: t.accent }}>In one line</T>
          <T v="body" style={{ marginTop: 6, fontSize: 16, lineHeight: 23 }}>{n.summary}</T>
        </Card>
      </Section>
      <Section title="What it means">
        <Card>
          {n.points.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 7 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.text, marginTop: 8 }} />
              <T v="body" style={{ flex: 1 }}>{p}</T>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Applies to">
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{n.tags.map((tg) => <Pill key={tg} label={tg} />)}</View>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Button label="Read the official source" icon="open-outline" href={n.url} />
      </View>
    </DetailScreen>
  );
}
