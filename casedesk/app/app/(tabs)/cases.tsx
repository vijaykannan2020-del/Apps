import React, { useState } from 'react';
import { View, Pressable, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Section, Card, T, Pill, IconBubble, Note, Row, Columns, tap } from '../../src/components/ui';
import { useLayout } from '../../src/lib/layout';
import { useTheme } from '../../src/theme';
import { useCases, upsertCase } from '../../src/lib/store';
import { stageOf, STAGES } from '../../src/lib/caseStatus';
import { fetchCase, isLive } from '../../src/lib/api';

export default function Cases() {
  const t = useTheme();
  const router = useRouter();
  const [cases, , ready] = useCases();
  const [refreshing, setRefreshing] = useState(false);
  const L = useLayout();

  const refreshAll = async () => {
    setRefreshing(true);
    for (const c of cases) {
      try {
        const r = await fetchCase(c.receipt);
        await upsertCase({ ...c, form: r.form, status: r.status, detail: r.detail, updated: r.updated, history: r.history, demo: r.demo });
      } catch {}
    }
    setRefreshing(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={t.sub} />} showsVerticalScrollIndicator={false}>
      <Screen
        title="Cases"
        subtitle={cases.length ? `${cases.length} tracked` : 'Case status'}
        scroll={false}
        right={
          <Pressable onPress={() => { tap(); router.push('/case/add'); }} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.text, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <Ionicons name="add" size={22} color={t.bg} />
          </Pressable>
        }
      >
        <Columns left={<>
        {!isLive() ? (
          <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
            <Note tone="amber">Demo mode — statuses are samples until the CaseDesk server is connected.</Note>
          </View>
        ) : null}

        {ready && cases.length === 0 ? (
          <Section>
            <Card style={{ alignItems: 'center', paddingVertical: 34 }}>
              <IconBubble name="file-tray-outline" size={54} tone="neutral" />
              <T v="h2" style={{ marginTop: 16 }}>No cases yet</T>
              <T v="sub" style={{ textAlign: 'center', marginTop: 6, maxWidth: 260 }}>Add a receipt number from your USCIS notice (Form I-797C) to follow every update.</T>
              <Pressable onPress={() => router.push('/case/add')} style={{ marginTop: 18, backgroundColor: t.text, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 99 }}>
                <T v="h3" style={{ color: t.bg }}>Add a case</T>
              </Pressable>
            </Card>
          </Section>
        ) : (
          <Section>
            <View>{cases.map((c) => {
              const st = stageOf(c.status);
              const color = st.tone === 'red' ? t.red : st.tone === 'amber' ? t.amber : st.tone === 'green' ? t.green : t.accent;
              return (
                <Card key={c.receipt} onPress={() => router.push(`/case/${c.receipt}`)} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <T v="label">{c.form ? `Form ${c.form}` : 'USCIS case'}{c.demo ? ' · Sample' : ''}</T>
                      <T v="h3" style={{ marginTop: 6, fontSize: 17 }}>{c.nickname || c.receipt}</T>
                      {c.nickname ? <T v="small" style={{ marginTop: 2, letterSpacing: 0.5 }}>{c.receipt}</T> : null}
                    </View>
                    <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} />
                  </View>
                  <T v="sub" style={{ marginTop: 10 }} numberOfLines={2}>{c.status ?? 'Pull down to check status'}</T>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 14 }}>
                    {STAGES.map((s, i) => <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c.status && i <= st.step ? color : t.surface2 }} />)}
                  </View>
                  <View style={{ flexDirection: 'row', marginTop: 6 }}>
                    <T v="small" style={{ flex: 1 }}>{STAGES[st.step]}</T>
                    {c.updated ? <T v="small">Updated {c.updated}</T> : null}
                  </View>
                </Card>
              );
            })}</View>
          </Section>
        )}
        </>} right={<>
        <Section title="Other case types">
          <Card style={{ paddingVertical: 4 }}>
            <Row icon="briefcase-outline" tone="amber" title="LCA, PERM & PWD (DOL)" subtitle="Check Department of Labor case status" onPress={() => router.push('/tools/dol-status')} />
            <Row icon="time-outline" tone="neutral" title="Processing times" subtitle="How long USCIS is taking now" onPress={() => router.push('/tools/times')} />
            <Row icon="calendar-number-outline" tone="neutral" title="Visa Bulletin" subtitle="Is my green card date current?" onPress={() => router.push('/tools/bulletin')} last />
          </Card>
        </Section>

        <Section title="Good to know">
          <Card>
            {[
              ['Receipt numbers', '3 letters + 10 digits, on your I-797C notice.'],
              ['How often it updates', 'USCIS updates status as your case moves; we check when you open or pull down.'],
              ['Status vs. timeline', 'Compare with official processing times before contacting USCIS.'],
            ].map(([a, b], i) => (
              <View key={a} style={{ paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <T v="h3" style={{ fontSize: 14 }}>{a}</T>
                <T v="sub" style={{ marginTop: 2 }}>{b}</T>
              </View>
            ))}
          </Card>
        </Section>
        </>} />
        <View style={{ height: L.wide ? 30 : 110 }} />
      </Screen>
    </ScrollView>
  );
}
