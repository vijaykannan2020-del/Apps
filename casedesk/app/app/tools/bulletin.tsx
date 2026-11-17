import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Segmented, Chips, Pill, Note, Button, DateField } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { BULLETIN, Bulletin, COUNTRIES, Country, fmtCell, isCurrent } from '../../src/data/bulletin';
import { fetchOr } from '../../src/lib/api';

export default function VisaBulletin() {
  const t = useTheme();
  const [b, setB] = useState<Bulletin>(BULLETIN);
  const [live, setLive] = useState(false);
  const [country, setCountry] = useState<Country>('india');
  const [chart, setChart] = useState<'final' | 'filing'>(BULLETIN.uscisChart);
  const [pd, setPd] = useState('');
  useEffect(() => { fetchOr('/api/visa-bulletin', BULLETIN).then((r) => { setB(r.data); setLive(r.live); setChart(r.data.uscisChart); }); }, []);
  const pdOk = /^\d{4}-\d{2}-\d{2}$/.test(pd);

  return (
    <DetailScreen title="Visa Bulletin">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Visa Bulletin</T>
        <T v="sub" style={{ marginTop: 4 }}>Employment-based green card dates · {b.month}</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pill label={live ? 'Live' : 'Built-in'} tone={live ? 'green' : 'neutral'} small />
          <Pill label={`USCIS uses: ${b.uscisChart === 'filing' ? 'Dates for Filing' : 'Final Action'}`} tone="accent" small />
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <Chips options={COUNTRIES} value={country} onChange={setCountry} />
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <Segmented options={[{ label: 'Final Action', value: 'final' }, { label: 'Dates for Filing', value: 'filing' }]} value={chart} onChange={setChart} />
      </View>

      <Section>
        <Card style={{ paddingVertical: 6 }}>
          {b.rows.map((r, i) => {
            const cell = r[chart][country];
            const mine = pdOk ? isCurrent(pd, cell) : null;
            return (
              <View key={r.cat} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <View style={{ flex: 1 }}>
                  <T v="h3">{r.cat}</T>
                  <T v="small" style={{ marginTop: 2 }}>{r.label}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="h3" style={{ color: cell === 'C' ? t.green : cell === 'U' ? t.red : t.text, fontVariant: ['tabular-nums'] }}>{fmtCell(cell)}</T>
                  {mine !== null && cell ? <T v="small" style={{ marginTop: 2, color: mine ? t.green : t.sub }}>{mine ? 'Your date is current' : 'Not yet'}</T> : null}
                </View>
              </View>
            );
          })}
        </Card>
        {chart === 'filing' && (country === 'mexico' || country === 'philippines') ? <View style={{ marginTop: 10 }}><Note>Dates for Filing for this country — see the full bulletin.</Note></View> : null}
      </Section>

      <Section title="Check my priority date">
        <Card>
          <DateField label="My priority date" value={pd} onChange={setPd} hint="On your I-140 approval notice (the PERM filing date)." />
          <T v="sub">Your date is “current” when it is earlier than the date shown. When USCIS uses Dates for Filing, you can file the I-485 once that chart is current.</T>
        </Card>
      </Section>

      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <Button label="Full bulletin on travel.state.gov" icon="open-outline" kind="secondary" href={b.source} />
      </View>
    </DetailScreen>
  );
}
