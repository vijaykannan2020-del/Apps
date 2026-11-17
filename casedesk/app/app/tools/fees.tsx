import React, { useMemo, useState } from 'react';
import { View, Switch, Linking } from 'react-native';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Segmented, Chips, Section, Note, money, Divider } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { FEE_CASES, FEES_AS_OF, EmployerSize } from '../../src/data/fees';

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <T v="h3" style={{ fontSize: 15 }}>{label}</T>
        {sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
    </View>
  );
}

export default function Fees() {
  const t = useTheme();
  const [id, setId] = useState('h1b-ext');
  const [size, setSize] = useState<EmployerSize>('large');
  const [acwiaSmall, setAcwiaSmall] = useState(false);
  const [covered, setCovered] = useState(false);
  const [online, setOnline] = useState(true);
  const [premium, setPremium] = useState(false);
  const fc = FEE_CASES.find((f) => f.id === id)!;
  const lines = useMemo(() => fc.build({ size, acwiaSmall, covered, online, premium }), [fc, size, acwiaSmall, covered, online, premium]);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const hasACWIA = lines.some((l) => l.label.startsWith('ACWIA')) || id.startsWith('h1b');
  const hasPL = ['h1b-new', 'h1b-ext', 'h1b-transfer', 'l1-new', 'l1-ext'].includes(id);
  const hasPremium = !['h4', 'h4ead', 'i485', 'n400'].includes(id);
  const hasOnline = ['opt', 'h4', 'h4ead', 'n400', 'i485'].includes(id);

  return (
    <DetailScreen title="Fee calculator">
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <T v="h1">What will it cost?</T>
        <T v="sub" style={{ marginTop: 4 }}>Government fees only · USCIS G-1055 · {FEES_AS_OF}</T>
      </View>
      <View style={{ marginTop: 16 }}>
        <Chips options={FEE_CASES.map((f) => ({ label: f.label, value: f.id }))} value={id} onChange={setId} />
      </View>

      <Section>
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <T v="label">Estimated total</T>
          <T v="num" style={{ fontSize: 44, marginTop: 6 }}>{money(total)}</T>
          <T v="small" style={{ marginTop: 4 }}>{fc.label}{premium && hasPremium ? ' · with premium' : ''}</T>
        </Card>
      </Section>

      {fc.employer || hasOnline || hasPremium ? (
        <Section title="Options">
          <Card>
            {fc.employer ? (
              <>
                <T v="label" style={{ marginBottom: 8 }}>Employer</T>
                <Segmented options={[{ label: 'Standard', value: 'large' }, { label: '≤25 staff', value: 'small' }, { label: 'Nonprofit', value: 'nonprofit' }]} value={size} onChange={setSize} />
                <Divider />
              </>
            ) : null}
            {hasACWIA && size !== 'nonprofit' && fc.employer ? <Toggle label="1–25 full-time staff" sub="Lower ACWIA fee ($750)" value={acwiaSmall} onChange={setAcwiaSmall} /> : null}
            {hasPL ? <Toggle label="PL 114-113 employer" sub="50+ US staff and more than half on H-1B/L-1" value={covered} onChange={setCovered} /> : null}
            {hasOnline ? <Toggle label="File online" sub="Usually $50 cheaper" value={online} onChange={setOnline} /> : null}
            {hasPremium ? <Toggle label="Premium processing" sub="Decision in 15 business days for most" value={premium} onChange={setPremium} /> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Breakdown">
        <Card>
          {lines.map((l, i) => (
            <View key={l.label} style={{ flexDirection: 'row', paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <View style={{ flex: 1 }}>
                <T v="body">{l.label}</T>
                {l.note ? <T v="small" style={{ marginTop: 2 }}>{l.note}</T> : null}
              </View>
              <T v="h3" style={{ fontVariant: ['tabular-nums'], color: l.amount === 0 ? t.faint : t.text }}>{l.amount === 0 ? 'Exempt' : money(l.amount)}</T>
            </View>
          ))}
        </Card>
      </Section>

      {fc.alert ? <View style={{ paddingHorizontal: 20, marginTop: 14 }}><Note tone="amber">{fc.alert}</Note></View> : null}
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <Note>Always confirm on the official fee schedule before paying. Attorney fees and consular visa fees are not included.</Note>
        <Card href={'https://www.uscis.gov/g-1055'} style={{ marginTop: 8, alignItems: 'center', paddingVertical: 12 }}>
          <T v="h3" style={{ color: t.accent, fontSize: 14 }}>Open USCIS fee schedule ↗</T>
        </Card>
      </View>
    </DetailScreen>
  );
}
