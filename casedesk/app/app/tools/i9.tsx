import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Segmented, Section, Note, Chips, Pill, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { VISAS } from '../../src/data/visas';
import { useI9 } from '../../src/lib/store';

const daysUntil = (iso: string) => Math.ceil((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 864e5);

function Documents() {
  const t = useTheme();
  const withI9 = VISAS.filter((v) => v.i9);
  const [id, setId] = useState(withI9[0].id);
  const v = withI9.find((x) => x.id === id)!;
  return (
    <>
      <View style={{ marginTop: 16 }}>
        <Chips options={withI9.map((x) => ({ label: x.code, value: x.id }))} value={id} onChange={setId} />
      </View>
      <Section title={`${v.code} — what to show`}>
        {v.i9!.map((d, i) => (
          <Card key={i} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pill label={`List ${d.list}`} tone={d.list === 'A' ? 'accent' : 'amber'} small />
            </View>
            <T v="h3" style={{ marginTop: 10, lineHeight: 21 }}>{d.docs}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <Ionicons name="refresh-circle-outline" size={16} color={t.sub} />
              <T v="sub" style={{ flex: 1 }}>Reverify: {d.reverify}</T>
            </View>
          </Card>
        ))}
        {v.id === 'h4ead' || v.id === 'gc' ? <Note tone="amber">EAD renewals filed on or after Oct 30, 2025 get no automatic extension — a receipt notice is not enough to keep working.</Note> : null}
      </Section>
      <Section title="Rules that always apply">
        <Card>
          {[
            ['Employee chooses', 'Never ask for specific documents. Accept any valid List A, or List B + List C.'],
            ['Section 1', 'On or before the first day of work.'],
            ['Section 2', 'Within 3 business days of starting.'],
            ['Reverify', 'Only work authorization that expires — not ID documents, not US passports or green cards.'],
            ['Keep records', '3 years after hire or 1 year after leaving — whichever is later.'],
          ].map(([a, b], i) => (
            <View key={a} style={{ paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <T v="h3" style={{ fontSize: 14 }}>{a}</T>
              <T v="sub" style={{ marginTop: 2 }}>{b}</T>
            </View>
          ))}
        </Card>
      </Section>
    </>
  );
}

function Records() {
  const t = useTheme();
  const router = useRouter();
  const [records] = useI9();
  const sorted = [...records].sort((a, b) => a.expires.localeCompare(b.expires));
  return (
    <Section>
      <Button label="Add a record" icon="add" onPress={() => router.push('/tools/i9-record')} />
      <View style={{ marginTop: 16 }}>
        {sorted.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Ionicons name="calendar-outline" size={36} color={t.faint} />
            <T v="h3" style={{ marginTop: 10 }}>No records yet</T>
            <T v="sub" style={{ textAlign: 'center', marginTop: 4, maxWidth: 260 }}>Save the work-authorization document for yourself or your team and see when reverification is due.</T>
          </Card>
        ) : sorted.map((r) => {
          const d = daysUntil(r.expires);
          const tone = d < 0 ? 'red' : d <= 90 ? 'amber' : 'green';
          return (
            <Card key={r.id} onPress={() => router.push(`/tools/i9-record?id=${r.id}`)} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <T v="h3">{r.name}</T>
                  <T v="sub" style={{ marginTop: 2 }}>{r.visa} · {r.doc}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="num" style={{ fontSize: 22, color: tone === 'red' ? t.red : tone === 'amber' ? t.amber : t.text }}>{Math.abs(d)}</T>
                  <T v="small">{d < 0 ? 'days overdue' : 'days left'}</T>
                </View>
              </View>
              <View style={{ marginTop: 10 }}><Pill label={`Reverify by ${r.expires}`} tone={tone} small /></View>
            </Card>
          );
        })}
      </View>
      <View style={{ marginTop: 6 }}><Note>Records stay on this phone. Add the expiry of the document that proves work authorization (I-94, EAD), not the passport.</Note></View>
    </Section>
  );
}

export default function I9() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'docs' | 'records'>(params.tab === 'records' ? 'records' : 'docs');
  return (
    <DetailScreen title="Form I-9">
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <T v="h1">Form I-9</T>
        <T v="sub" style={{ marginTop: 4, marginBottom: 14 }}>Employment eligibility — documents by visa type, and your reverification dates.</T>
        <Segmented options={[{ label: 'Documents', value: 'docs' }, { label: 'My records', value: 'records' }]} value={tab} onChange={setTab} />
      </View>
      {tab === 'docs' ? <Documents /> : <Records />}
    </DetailScreen>
  );
}
