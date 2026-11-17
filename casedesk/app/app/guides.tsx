import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Section, Card, T, IconBubble } from '../src/components/ui';
import { DetailScreen } from '../src/components/TopBar';
import { useTheme } from '../src/theme';
import { useGuides } from '../src/lib/content';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Work visas', ids: ['h1b', 'l1', 'lblanket', 'tn'] },
  { title: 'Students', ids: ['opt', 'stem'] },
  { title: 'Spouses', ids: ['h4ead', 'l2s'] },
  { title: 'Permanent', ids: ['gc', 'n400'] },
];

export default function Guides() {
  const t = useTheme();
  const router = useRouter();
  const { items: VISAS, reviewed: GUIDES_REVIEWED } = useGuides();
  return (
    <DetailScreen title="Guides">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Visa guides</T>
        <T v="sub" style={{ marginTop: 4 }}>Plain-English summaries · reviewed {GUIDES_REVIEWED}</T>
      </View>
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.ids.map((id) => {
            const v = VISAS.find((x) => x.id === id)!;
            return (
              <Card key={id} onPress={() => router.push(`/guide/${id}`)} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <IconBubble name={(v.icon + '-outline') as any} size={44} tone={v.alert ? 'amber' : 'accent'} />
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 17 }}>{v.code}</T>
                  <T v="sub" style={{ marginTop: 2 }} numberOfLines={2}>{v.tagline}</T>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.faint} />
              </Card>
            );
          })}
        </Section>
      ))}
    </DetailScreen>
  );
}
