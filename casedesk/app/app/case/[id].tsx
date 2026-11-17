import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Linking, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Pill, Section, Note, Row, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useCases, upsertCase, removeCase } from '../../src/lib/store';
import { stageOf, STAGES, CENTERS } from '../../src/lib/caseStatus';
import { fetchCase } from '../../src/lib/api';
import { timesForForm, fmtMonths, PT_AS_OF } from '../../src/data/processing';

export default function CaseDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cases] = useCases();
  const c = cases.find((x) => x.receipt === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = async () => {
    if (!id) return;
    setBusy(true); setErr('');
    try {
      const r = await fetchCase(id);
      await upsertCase({ receipt: id, form: r.form, status: r.status, detail: r.detail, updated: r.updated, history: r.history, demo: r.demo });
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { if (c && !c.status) refresh(); }, [c?.receipt]);

  if (!c) return <DetailScreen title="Case"><T v="sub" style={{ padding: 20 }}>Case not found.</T></DetailScreen>;
  const st = stageOf(c.status);
  const color = st.tone === 'red' ? t.red : st.tone === 'amber' ? t.amber : st.tone === 'green' ? t.green : t.accent;

  const del = () => {
    const go = async () => { await removeCase(c.receipt); router.back(); };
    if (Platform.OS === 'web') { go(); return; }
    Alert.alert('Remove case?', c.receipt, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  return (
    <DetailScreen
      title={c.form ? `Form ${c.form}` : 'Case'}
      right={<Pressable onPress={refresh} hitSlop={10}>{busy ? <ActivityIndicator color={t.sub} /> : <Ionicons name="refresh" size={20} color={t.text} />}</Pressable>}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        <T v="label">{c.receipt}{c.demo ? ' · Sample data' : ''}</T>
        <T v="h1" style={{ marginTop: 8 }}>{c.status ?? 'Checking…'}</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} />
          {c.updated ? <Pill label={`Updated ${c.updated}`} /> : null}
        </View>
      </View>

      {/* Progress */}
      <Section>
        <Card>
          {STAGES.map((s, i) => {
            const done = !!c.status && i <= st.step;
            const current = !!c.status && i === st.step;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 22 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? color : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <Ionicons name={current && st.tone === 'red' ? 'close' : current && st.tone === 'amber' ? 'alert' : 'checkmark'} size={13} color={t.bg} /> : null}
                  </View>
                  {i < STAGES.length - 1 ? <View style={{ width: 2, height: 22, backgroundColor: done && i < st.step ? color : t.surface2 }} /> : null}
                </View>
                <T v="h3" style={{ color: done ? t.text : t.faint, fontWeight: current ? '700' : '500', marginTop: 1 }}>{s}</T>
              </View>
            );
          })}
        </Card>
      </Section>

      {err ? <View style={{ paddingHorizontal: 20, marginTop: 14 }}><Note tone="red">{err}</Note></View> : null}

      {c.detail ? (
        <Section title="What USCIS says">
          <Card><T v="body" style={{ color: t.sub }}>{c.detail}</T></Card>
        </Section>
      ) : null}

      {c.history?.length ? (
        <Section title="History">
          <Card>
            {c.history.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <T v="small" style={{ width: 92, fontVariant: ['tabular-nums'] }}>{h.date}</T>
                <T v="body" style={{ flex: 1, fontSize: 14 }}>{h.status}</T>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {timesForForm(c.form).length ? (
        <Section title={`Typical time for Form ${c.form}`}>
          <Card>
            {timesForForm(c.form).slice(0, 5).map((p, i) => (
              <View key={p.category} style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <T v="body" style={{ flex: 1, fontSize: 14, paddingRight: 8 }}>{p.category}</T>
                <T v="h3" style={{ fontSize: 14 }}>{fmtMonths(p.months)}</T>
              </View>
            ))}
            <T v="small" style={{ marginTop: 6 }}>USCIS published times · {PT_AS_OF}. 8 in 10 cases finish within these.</T>
          </Card>
        </Section>
      ) : null}

      <Section title="Details">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="business-outline" tone="neutral" title="Office" subtitle={CENTERS[c.receipt.slice(0, 3)] ?? 'USCIS'} />
          <Row icon="time-outline" tone="neutral" title="Processing times" subtitle="Compare with the official estimate" href={'https://egov.uscis.gov/processing-times/'} />
          <Row icon="open-outline" tone="neutral" title="Open on uscis.gov" subtitle="Official case status page" href={'https://egov.uscis.gov/'} last />
        </Card>
      </Section>

      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Button label="Remove case" kind="secondary" icon="trash-outline" onPress={del} />
      </View>
    </DetailScreen>
  );
}
