import React from 'react';
import { View, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Note, Pill, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useGuides } from '../../src/lib/content';

export default function Guide() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, reviewed } = useGuides();
  const v = items.find((x) => x.id === id);
  if (!v) return <DetailScreen title="Guide"><T v="sub" style={{ padding: 20 }}>Not found.</T></DetailScreen>;

  return (
    <DetailScreen title={v.code}>
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <T v="label">{v.name}</T>
        <T v="h1" style={{ marginTop: 6, fontSize: 34 }}>{v.code}</T>
        <T v="sub" style={{ marginTop: 6, fontSize: 15, lineHeight: 21 }}>{v.tagline}</T>
        <T v="small" style={{ marginTop: 8 }}>Reviewed {reviewed}</T>
      </View>

      {v.alert ? <View style={{ paddingHorizontal: 20, marginTop: 16 }}><Note tone="amber">{v.alert}</Note></View> : null}

      <Section>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {v.facts.map((f) => (
            <Card key={f.label} style={{ width: '48.4%', paddingVertical: 14 }}>
              <T v="label">{f.label}</T>
              <T v="h3" style={{ marginTop: 6, lineHeight: 20 }}>{f.value}</T>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="How it works">
        <Card>
          {v.steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T v="small" style={{ color: t.accent, fontWeight: '700' }}>{i + 1}</T>
              </View>
              <T v="body" style={{ flex: 1, marginTop: 2 }}>{s}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Key points">
        <Card>
          {v.keyPoints.map((k, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 7 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.text, marginTop: 8 }} />
              <T v="body" style={{ flex: 1 }}>{k}</T>
            </View>
          ))}
        </Card>
      </Section>

      {v.i9 ? (
        <Section title="Form I-9" action="All documents" onAction={() => router.push('/tools/i9')}>
          <Card>
            {v.i9.map((d, i) => (
              <View key={i} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <Pill label={`List ${d.list}`} tone={d.list === 'A' ? 'accent' : 'amber'} small />
                <T v="body" style={{ marginTop: 6 }}>{d.docs}</T>
                <T v="small" style={{ marginTop: 3 }}>Reverify: {d.reverify}</T>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 10 }}>
        <Button label="Estimate the fees" icon="cash-outline" kind="secondary" onPress={() => router.push('/tools/fees')} />
        <Button label="Read on uscis.gov" icon="open-outline" kind="secondary" href={v.source} />
      </View>
    </DetailScreen>
  );
}
