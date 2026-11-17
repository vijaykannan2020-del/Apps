// H-1B cap season hub: next registration, how weighted selection works, odds, history, cap-gap, fees.
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Button, Note, Pill, Row } from '../../src/components/ui';
import { Columns as Bars } from '../../src/components/charts';
import { useTheme } from '../../src/theme';
import { REGISTRATIONS } from '../../src/data/h1b';
import { NEXT_SEASON, WEIGHTS, WEIGHT_NOTE, STEPS, LAST_SEASON, CAP_GAP, FEE_STATUS, LOTTERY_AS_OF } from '../../src/data/lottery';
import { daysTo, fmt } from '../../src/lib/compliance';

const List = ({ rows }: { rows: [string, string][] }) => {
  const t = useTheme();
  return (
    <Card>
      {rows.map(([a, b], i) => (
        <View key={a} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
          <T v="h3" style={{ fontSize: 15 }}>{a}</T>
          <T v="sub" style={{ marginTop: 2 }}>{b}</T>
        </View>
      ))}
    </Card>
  );
};

export default function Lottery() {
  const t = useTheme();
  const router = useRouter();
  const d = daysTo(NEXT_SEASON.opens ?? undefined);
  return (
    <DetailScreen title="H-1B lottery">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">H-1B cap season</T>
        <T v="sub" style={{ marginTop: 4 }}>Registration, selection and what comes next · reviewed {LOTTERY_AS_OF}</T>
      </View>

      <Section>
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <T v="label">Next registration · {NEXT_SEASON.fy}</T>
          {d !== null && d >= 0 ? (
            <>
              <T style={{ fontSize: 56, fontWeight: '800', color: t.text, marginTop: 6, fontVariant: ['tabular-nums'] }}>{d}</T>
              <T v="sub">days · opens {fmt(NEXT_SEASON.opens!)}{NEXT_SEASON.closes ? ` – closes ${fmt(NEXT_SEASON.closes)}` : ''}</T>
            </>
          ) : (
            <>
              <T v="h2" style={{ marginTop: 8 }}>{NEXT_SEASON.expected}</T>
              <T v="sub" style={{ marginTop: 6, textAlign: 'center' }}>USCIS announces the dates at least 30 days before. Turn on news alerts to hear first.</T>
              <View style={{ marginTop: 12, alignSelf: 'stretch' }}><Button label="News alerts" kind="secondary" icon="notifications-outline" onPress={() => router.push('/alerts')} /></View>
            </>
          )}
        </Card>
      </Section>

      <Section title="How selection works now">
        <List rows={STEPS} />
      </Section>

      <Section title="Your odds by wage level">
        <Card>
          {WEIGHTS.map((w, i) => (
            <View key={w.level} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <T v="h3" style={{ flex: 1 }}>{w.level}</T>
              <View style={{ flexDirection: 'row', gap: 3, marginRight: 14 }}>
                {[1, 2, 3, 4].map((k) => <View key={k} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: k <= w.entries ? t.accent : t.surface2 }} />)}
              </View>
              <T v="h3" style={{ width: 60, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{w.odds}</T>
            </View>
          ))}
          <T v="small" style={{ marginTop: 8 }}>{WEIGHT_NOTE}</T>
          <View style={{ marginTop: 12 }}><Button label="Find the wage level for a job" icon="trending-up" kind="secondary" onPress={() => router.push('/tools/wage')} /></View>
        </Card>
      </Section>

      <Section title="Eligible registrations">
        <Card>
          <Bars data={REGISTRATIONS} />
          <T v="small" style={{ marginTop: 10 }}>USCIS H-1B registration reports. Fewer registrations means better odds per person.</T>
        </Card>
      </Section>

      <Section title="Last season · FY 2027"><List rows={LAST_SEASON} /></Section>

      <Section title="Cap-gap for F-1 OPT students">
        <Card>
          {CAP_GAP.map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: i ? 8 : 0 }}>
              <T v="body" style={{ color: t.accent }}>•</T><T v="body" style={{ flex: 1 }}>{x}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Fees in the news">
        <List rows={FEE_STATUS} />
        <View style={{ marginTop: 10 }}><Note tone="amber">These are moving through the courts — check the News tab before filing.</Note></View>
      </Section>

      <Section title="Official pages">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="globe-outline" tone="neutral" title="H-1B cap season" subtitle="uscis.gov" href="https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations-and-fashion-models/h-1b-cap-season" />
          <Row icon="bar-chart-outline" tone="neutral" title="H-1B Employer Data Hub" subtitle="Approvals by employer" onPress={() => router.push('/data')} last />
        </Card>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}><T v="small" style={{ textAlign: 'center' }}>Information only — not legal advice.</T></View>
    </DetailScreen>
  );
}
