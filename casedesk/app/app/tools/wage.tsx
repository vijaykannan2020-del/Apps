import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Note, Field, money, Button, Pill, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { isLive, searchSoc, fetchWage, wageStates, wageCounties, WageLevels } from '../../src/lib/api';

const LEVELS = ['Level I', 'Level II', 'Level III', 'Level IV'];
const LEVEL_DESC = ['Entry', 'Qualified', 'Experienced', 'Fully competent'];

type Step = 'state' | 'county' | 'job' | 'result';

function Picker<T>({ items, label, render, onPick, placeholder }: { items: T[]; label: (x: T) => string; render?: (x: T) => React.ReactNode; onPick: (x: T) => void; placeholder: string }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const shown = useMemo(() => items.filter((x) => label(x).toLowerCase().includes(q.toLowerCase())).slice(0, 60), [items, q]);
  return (
    <>
      <Field placeholder={placeholder} value={q} onChangeText={setQ} autoCorrect={false} />
      <Card style={{ paddingVertical: 2 }}>
        {shown.map((x, i) => (
          <Pressable key={label(x) + i} onPress={() => { tap(); onPick(x); }} style={{ paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>{render ? render(x) : <T v="body">{label(x)}</T>}</View>
            <Ionicons name="chevron-forward" size={16} color={t.faint} />
          </Pressable>
        ))}
        {shown.length === 0 ? <T v="sub" style={{ padding: 12 }}>No match.</T> : null}
      </Card>
    </>
  );
}

function Crumb({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap(); onEdit(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
      <T v="label" style={{ width: 92 }}>{label}</T>
      <T v="h3" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{value}</T>
      <T v="small" style={{ color: t.accent, fontWeight: '700' }}>Change</T>
    </Pressable>
  );
}

export default function Wage() {
  const t = useTheme();
  const live = isLive();
  const [step, setStep] = useState<Step>('state');
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [state, setState] = useState<{ code: string; name: string } | null>(null);
  const [counties, setCounties] = useState<{ county: string; area: string; areaName: string }[]>([]);
  const [county, setCounty] = useState<{ county: string; area: string; areaName: string } | null>(null);
  const [socQ, setSocQ] = useState('');
  const [socs, setSocs] = useState<{ code: string; title: string }[]>([]);
  const [wage, setWage] = useState<WageLevels | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [offer, setOffer] = useState('');

  useEffect(() => { if (live) wageStates().then((r) => setStates(r.items)).catch((e) => setErr(e.message)); }, [live]);

  const pickState = async (s: { code: string; name: string }) => {
    setState(s); setCounty(null); setWage(null); setStep('county'); setBusy(true);
    try { setCounties((await wageCounties(s.code)).items); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const runSoc = async (q: string) => { setSocQ(q); if (q.length < 2) return setSocs([]); try { setSocs((await searchSoc(q)).items.slice(0, 12)); } catch {} };
  const pickSoc = async (s: { code: string; title: string }) => {
    if (!county) return;
    setBusy(true); setErr('');
    try { setWage(await fetchWage(s.code, county.area)); setStep('result'); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const annual = wage ? wage.hourly.map((h) => Math.round(h * 2080)) : [];
  const offerN = parseFloat(offer.replace(/[^0-9.]/g, '')) || 0;
  const met = annual.filter((a) => offerN >= a).length;

  return (
    <DetailScreen title="Prevailing wage">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Prevailing wage</T>
        <T v="sub" style={{ marginTop: 4 }}>Same lookup as DOL’s FLAG wage search: worksite state → county (mapped to its metro area) → occupation.</T>
      </View>

      {!live ? (
        <Section>
          <Note tone="amber">The wage lookup reads the official OFLC wage files (Wage Year 2026–27), which the CaseDesk server downloads from DOL. It switches on as soon as your server is connected. Until then, use FLAG directly.</Note>
          <View style={{ marginTop: 12 }}><Button label="Open FLAG wage search" icon="open-outline" kind="secondary" href="https://flag.dol.gov/wage-data/wage-search" /></View>
        </Section>
      ) : (
        <Section>
          {state ? <Crumb label="State" value={state.name} onEdit={() => { setStep('state'); setWage(null); }} /> : null}
          {county ? <Crumb label="County" value={`${county.county}`} onEdit={() => { setStep('county'); setWage(null); }} /> : null}
          {county ? <View style={{ paddingVertical: 8 }}><T v="small">Metro / wage area: {county.areaName} ({county.area})</T></View> : null}
          {wage ? <Crumb label="Occupation" value={`${wage.soc} · ${wage.title}`} onEdit={() => { setStep('job'); setWage(null); }} /> : null}
          <View style={{ height: 14 }} />
          {err ? <View style={{ marginBottom: 10 }}><Note tone="red">{err}</Note></View> : null}
          {busy ? <ActivityIndicator color={t.text} style={{ padding: 16 }} /> : null}
          {!busy && step === 'state' ? <Picker items={states} label={(s) => s.name} onPick={pickState} placeholder="Search state" /> : null}
          {!busy && step === 'county' ? <Picker items={counties} label={(c) => `${c.county} ${c.areaName}`} render={(c) => (<><T v="body">{c.county}</T><T v="small" style={{ marginTop: 2 }}>{c.areaName}</T></>)} onPick={(c) => { setCounty(c); setStep('job'); }} placeholder="Search county or town" /> : null}
          {!busy && step === 'job' ? (
            <>
              <Field placeholder="Job title or SOC code, e.g. Software developers / 15-1252" value={socQ} onChangeText={runSoc} autoCorrect={false} />
              <Card style={{ paddingVertical: 2 }}>
                {socs.map((s, i) => (
                  <Pressable key={s.code} onPress={() => pickSoc(s)} style={{ paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <T v="body"><T v="body" style={{ color: t.sub }}>{s.code}  </T>{s.title}</T>
                  </Pressable>
                ))}
                {socs.length === 0 ? <T v="sub" style={{ padding: 12 }}>Type at least 2 letters.</T> : null}
              </Card>
            </>
          ) : null}
        </Section>
      )}

      {wage ? (
        <>
          <Section title="DOL wage levels">
            <Card>
              <Pill label={`OFLC wage year ${wage.wageYear}`} tone="accent" small />
              {LEVELS.map((l, i) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border, marginTop: i ? 0 : 8 }}>
                  <View style={{ flex: 1 }}>
                    <T v="h3" style={{ fontSize: 15 }}>{l}</T>
                    <T v="small">{LEVEL_DESC[i]} · ${wage.hourly[i].toFixed(2)}/hr</T>
                  </View>
                  <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>{money(annual[i])}</T>
                </View>
              ))}
            </Card>
          </Section>
          <Section title="Check an offer">
            <Card>
              <Field label="Offered annual salary" placeholder="$120,000" keyboardType="numeric" value={offer} onChangeText={setOffer} />
              {offerN > 0 ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {LEVELS.map((l, i) => <View key={l} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < met ? t.green : t.surface2 }} />)}
                  </View>
                  <T v="h2" style={{ marginTop: 14 }}>{met === 0 ? 'Below Level I' : `Meets ${LEVELS[met - 1]}`}</T>
                  <T v="sub" style={{ marginTop: 4 }}>{met === 0 ? `${money(annual[0] - offerN)} short of Level I.` : met < 4 ? `${money(annual[met] - offerN)} more reaches ${LEVELS[met]}.` : 'At or above the top level.'}</T>
                </>
              ) : <T v="small">Enter a salary to compare.</T>}
            </Card>
          </Section>
        </>
      ) : null}

      <Section title="About wage levels">
        <Card>
          <T v="body">DOL sets four levels for every occupation and area. Your employer chooses the level from the job’s requirements — experience, education, special skills and supervision — and must pay at least that wage (or the actual wage paid to similar staff, if higher).</T>
          <T v="sub" style={{ marginTop: 10 }}>For the H-1B lottery, higher levels get more chances under weighted selection. New wage data starts every July 1.</T>
        </Card>
      </Section>
    </DetailScreen>
  );
}
