import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Screen, Section, Card, T, Segmented, Field, Note, Pill, IconBubble } from '../../src/components/ui';
import { HBars } from '../../src/components/charts';
import { useTheme } from '../../src/theme';
import { TOP_INITIAL_FY25, TOP_CONTINUING_FY25, H1B_SOURCE } from '../../src/data/h1b';
import { isLive, searchEmployers, EmployerResult } from '../../src/lib/api';

// Built-in fallback: FY2025 figures we have for the largest sponsors
const BUILT_IN: EmployerResult[] = TOP_CONTINUING_FY25.map((c) => {
  const i = TOP_INITIAL_FY25.find((x) => x.label === c.label);
  return { name: c.label, h1b: [{ fy: '2025', initialApproval: i?.value ?? NaN, initialDenial: NaN, continuingApproval: c.value, continuingDenial: NaN }], perm: [], lca: [] };
});

const n = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-US') : '—');

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T v="label">{label}</T>
      <T v="h2" style={{ marginTop: 4, fontVariant: ['tabular-nums'], color: tone }}>{value}</T>
    </View>
  );
}

function EmployerCard({ e }: { e: EmployerResult }) {
  const t = useTheme();
  const latest = [...e.h1b].sort((a, b) => b.fy.localeCompare(a.fy))[0];
  const appr = latest ? (latest.initialApproval || 0) + (latest.continuingApproval || 0) : 0;
  const den = latest ? (latest.initialDenial || 0) + (latest.continuingDenial || 0) : 0;
  const rate = latest && Number.isFinite(latest.initialDenial) && appr + den ? Math.round((appr / (appr + den)) * 100) : null;
  const perm = [...e.perm].sort((a, b) => b.fy.localeCompare(a.fy))[0];
  const lca = [...e.lca].sort((a, b) => b.fy.localeCompare(a.fy))[0];
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble name="business-outline" size={40} />
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 16 }}>{e.name}</T>
          {e.state ? <T v="small" style={{ marginTop: 2 }}>{e.state}</T> : null}
        </View>
      </View>
      {latest ? (
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <T v="h3" style={{ flex: 1, fontSize: 14 }}>H-1B approvals · FY {latest.fy}</T>
            {rate !== null ? <Pill label={`${rate}% approved`} tone={rate >= 95 ? 'green' : 'amber'} small /> : null}
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="New hires" value={n(latest.initialApproval)} />
            <Stat label="Extensions & transfers" value={n(latest.continuingApproval)} />
          </View>
        </View>
      ) : null}
      {e.h1b.length > 1 ? (
        <View style={{ marginTop: 14 }}>
          <T v="label" style={{ marginBottom: 8 }}>Total H-1B approvals by year</T>
          <HBars data={[...e.h1b].sort((a, b) => b.fy.localeCompare(a.fy)).slice(0, 5).map((y) => ({ label: `FY ${y.fy}`, value: (y.initialApproval || 0) + (y.continuingApproval || 0) }))} />
        </View>
      ) : null}
      <View style={{ height: 0.5, backgroundColor: t.border, marginVertical: 14 }} />
      <View style={{ flexDirection: 'row' }}>
        <Stat label={`PERM certified${perm ? ` · FY ${perm.fy}` : ''}`} value={perm ? n(perm.certified) : '—'} />
        <Stat label={`LCAs certified${lca ? ` · FY ${lca.fy}` : ''}`} value={lca ? n(lca.certified) : '—'} />
      </View>
      {!perm && !lca ? <T v="small" style={{ marginTop: 8 }}>PERM and LCA counts load from DOL disclosure files on the server.</T> : null}
    </Card>
  );
}

export default function Data() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<EmployerResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'initial' | 'continuing'>('initial');

  const search = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) return setResults(null);
    if (!isLive()) { setResults(BUILT_IN.filter((e) => e.name.toLowerCase().includes(v.trim().toLowerCase()))); return; }
    setBusy(true);
    try { setResults((await searchEmployers(v.trim())).items); } catch { setResults([]); }
    setBusy(false);
  };

  return (
    <Screen title="Employers" subtitle="H-1B · PERM · LCA by company">
      <Section>
        <Field placeholder="Search an employer, e.g. HCL America" value={q} onChangeText={search} autoCorrect={false} autoCapitalize="words" />
        {busy ? <ActivityIndicator color={t.sub} /> : null}
        {results === null ? (
          <T v="sub">See how many H-1B petitions an employer got approved (USCIS Data Hub), plus PERM green card certifications and LCAs (DOL).</T>
        ) : results.length ? results.map((e, i) => <EmployerCard key={e.name + i} e={e} />) : (
          <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
            <T v="h3">No employer found for “{q}”</T>
            <T v="sub" style={{ textAlign: 'center', marginTop: 6, maxWidth: 280 }}>
              {isLive() ? 'Try the legal name (e.g. “HCL America Inc”) or a shorter word.' : 'The built-in copy only has the largest sponsors. Full search of every employer turns on when the server is connected.'}
            </T>
          </Card>
        )}
        {!isLive() && results !== null ? <View style={{ marginTop: 6 }}><Note>Built-in data: FY 2025 for the largest sponsors only.</Note></View> : null}
      </Section>

      <Section title="Largest sponsors · FY 2025">
        <Card>
          <Segmented options={[{ label: 'New hires', value: 'initial' }, { label: 'Extensions', value: 'continuing' }]} value={view} onChange={setView} />
          <View style={{ marginTop: 16 }}>
            <HBars data={view === 'initial' ? TOP_INITIAL_FY25 : TOP_CONTINUING_FY25} color={view === 'initial' ? t.accent : t.green} />
          </View>
        </Card>
        <T v="small" style={{ marginTop: 8, paddingHorizontal: 4 }}>{H1B_SOURCE}. Counts are petitions, not people.</T>
      </Section>

      <Section>
        <Card href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" style={{ alignItems: 'center', paddingVertical: 12 }}>
          <T v="h3" style={{ color: t.accent, fontSize: 14 }}>Open the USCIS H-1B Employer Data Hub ↗</T>
        </Card>
      </Section>
    </Screen>
  );
}
