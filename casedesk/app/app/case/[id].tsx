import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Linking, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Pill, Section, Note, Row, Button, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useCases, upsertCase, removeCase } from '../../src/lib/store';
import { stageOf, STAGES, CENTERS } from '../../src/lib/caseStatus';
import { openUscis, readCopiedResult, parseCaseText, toCaseResult } from '../../src/lib/uscisSafari';
import { AppState } from 'react-native';
import { TextInput } from 'react-native';
import { ShareCardButton } from '../../src/components/ShareCard';
import { CaseCommunity } from '../../src/components/CaseCommunity';
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

  // Waiting for the person to come back from Safari with the result copied.
  const [waiting, setWaiting] = useState(false);
  const refresh = async () => {
    if (!id) return;
    setErr(''); setOk('');
    setWaiting(true);
    try { await openUscis(id); } catch (e: any) { setWaiting(false); setErr(e.message || 'Could not open Safari.'); }
  };
  // Coming straight from "Add & check on USCIS": open Safari once the screen has settled.
  useEffect(() => { if (check === '1' && c && !c.status) { const tm = setTimeout(refresh, 500); return () => clearTimeout(tm); } }, [c?.receipt]);
  useEffect(() => {
    if (!waiting) return;
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active') return;
      const p = await readCopiedResult(id!);
      setWaiting(false);
      if (!(await apply(p))) {
        setShowPaste(true);
        setErr('Didn’t find a status on the clipboard. On the USCIS result, press and hold the text → Select All → Copy, then tap “Paste result”.');
      }
    });
    return () => sub.remove();
  }, [waiting, id]);

  const pasteFromClipboard = async () => {
    let text = paste;
    if (!text && Platform.OS !== 'web') { try { text = await require('expo-clipboard').getStringAsync(); } catch {} }
    if (!(await apply(parseCaseText(text, id)))) setErr('That doesn’t look like a USCIS status. Copy the heading and the sentence under it, then try again.');
  };


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
            Opens USCIS in Safari with {c.receipt} copied. Paste it, tap Check Status, copy the result and come back — CaseDesk fills it in.
          </T>
          <View style={{ marginTop: 12 }}>
            <Button label={c.status ? 'Check again on USCIS' : 'Check status on USCIS'} icon="open-outline" onPress={refresh} />
            {waiting ? <T v="small" style={{ marginTop: 8, textAlign: 'center' }}>In Safari: paste the number, tap Check Status, copy the result, then come back here.</T> : null}
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

      {c.status ? (() => {
        const first = c.history?.[c.history.length - 1]?.date, last = c.history?.[0]?.date;
        const took = first && last && first !== last ? Math.round((new Date(last).getTime() - new Date(first).getTime()) / 864e5) : null;
        const win = /approved|card|delivered|oath/i.test(c.status);
        return (
          <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
            <ShareCardButton label={win ? 'Share the good news' : 'Share my progress'} kind={win ? 'primary' : 'secondary'} card={{
              kind: 'case', title: c.status, subtitle: `${c.form ? 'Form ' + c.form + ' · ' : ''}${CENTERS[c.receipt.slice(0, 3)] ?? 'USCIS'}`,
              stat: win ? (took ? `${took} days` : 'Approved! 🎉') : st.short, statLabel: win && took ? 'from receipt to approval' : undefined,
            }} />
          </View>
        );
      })() : null}

      <CaseCommunity receipt={c.receipt} form={c.form} history={c.history} status={c.status} />

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
