import React from 'react';
import { View } from 'react-native';
import { Card, T, Pill } from './ui';
import { useTheme } from '../theme';
import { NewsItem } from '../data/news';

export const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function NewsCard({ n, onPress }: { n: NewsItem; onPress: () => void }) {
  const t = useTheme();
  const dot = n.impact === 'high' ? t.amber : n.impact === 'medium' ? t.accent : t.faint;
  return (
    <Card onPress={onPress} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
        <T v="small" style={{ fontWeight: '700', color: t.text }}>{n.agency}</T>
        <T v="small">· {fmtDate(n.date)}</T>
      </View>
      <T v="h3" style={{ fontSize: 16.5, lineHeight: 22, letterSpacing: -0.2 }}>{n.title}</T>
      <T v="sub" style={{ marginTop: 6 }}>{n.summary}</T>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {n.tags.slice(0, 3).map((tg) => <Pill key={tg} label={tg} small />)}
        {n.sources && n.sources.length > 1 ? <Pill label={`${n.sources.length} sources`} tone="accent" small /> : null}
      </View>
    </Card>
  );
}

