import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Linking, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Pill, Section, Note, Row, Button, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useCases, upsertCase, removeCase } from '../../src/lib/store';
import { stageOf, STAGES, CENTERS } from '../../src/lib/caseStatus';
import { checkInSafari, parseCaseText, toCaseResult } from '../../src/lib/uscisSafari';
import { TextInput } from 'react-native';
import { timesForForm, fmtMonths, PT_AS_OF } from '../../src/data/processing';

export default function CaseDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id, check } = useLocalSearchParams<{ id: string; check?: string }>();
  const [cases] = useCases();
  const c = cases.find((x) => x.receipt === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [ok, setOk] = useState('');

  const apply = async (p: ReturnType<typeof parseCaseText>) => {
    if (!id || !p) return false;
    const r = await toCaseResult(id, p);
    await upsertCase({ receipt: id, form: r.form || c?.form, status: r.status, detail: r.detail, updated: r.updated, history: r.history, demo: false });
    tap(); setOk(`Updated · ${r.status}`); setShowPaste(false); setPaste(''); setErr('');
    return true;
  };

  const refresh = async () => {
    if (!id) return;
    setBusy(true); setErr(''); setOk('');
    try {
      const p = await checkInSafari(id);
      if (!(await apply(p))) {
        setShowPaste(true);
        setErr('Copy the status on the USCIS page (press and hold the text → Select All → Copy), then tap “Paste result”.');
      }
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const pasteFromClipboard = async () => {
    let text = paste;
    if (!text && Platform.OS !== 'web') { try { text = await require('expo-clipboard').getStringAsync(); } catch {} }
    if (!(await apply(parseCaseText(text, id)))) setErr('That doesn’t look like a USCIS status. Copy the heading and the sentence under it, then try again.');
  };

  useEffect(() => { if (check === '1' && c && !c.status) refresh(); }, [c?.receipt]);

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
        <T v="h1" style={{ marginTop: 8 }}>{c.status ?? 'Not checked yet'}</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} />
          {c.updated ? <Pill label={`Updated ${c.updated}`} /> : null}
        </View>
      </View>

      <Section>
        <Card>
          <T v="h3">Check on USCIS</T>
          <T v="sub" style={{ marginTop: 4 }}>
            Opens USCIS Case Status in Safari with {c.receipt} copied — paste it, tap Check Status, then copy the result and come back.
          </T>
          <View style={{ marginTop: 12 }}>
            {busy ? <ActivityIndicator color={t.sub} style={{ paddingVertical: 14 }} /> : <Button label={c.status ? 'Check again' : 'Check status on USCIS'} icon="open-outline" onPress={refresh} />}
          </View>
          {ok ? <View style={{ marginTop: 10 }}><Note tone="accent">{ok}</Note></View> : null}
          {err ? <View style={{ marginTop: 10 }}><Note tone="amber">{err}</Note></View> : null}
          {showPaste ? (
            <View style={{ marginTop: 12 }}>
              <TextInput
                value={paste}
                onChangeText={setPaste}
                multiline
                placeholder="Or paste the USCIS result here"
                placeholderTextColor={t.faint}
                style={{ minHeight: 84, backgroundColor: t.surface2, color: t.text, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: 'top' }}
              />
              <View style={{ marginTop: 10 }}><Button label="Paste result" kind="secondary" icon="clipboard-outline" onPress={pasteFromClipboard} /></View>
            </View>
          ) : (
            <Pressable onPress={() => setShowPaste(true)} hitSlop={8} style={{ marginTop: 10, alignSelf: 'center' }}>
              <T v="small" style={{ color: t.accent }}>Already copied it? Paste result</T>
            </Pressable>
          )}
        </Card>
      </Section>

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
