import React, { useState } from 'react';
import { View } from 'react-native';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Field, Button, Note, Pill } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

const TYPES = [
  { prefix: 'I-200', name: 'LCA (H-1B, H-1B1, E-3)', example: 'I-200-26310-123456' },
  { prefix: 'G-100', name: 'PERM labor certification', example: 'G-100-26310-123456' },
  { prefix: 'P-100', name: 'Prevailing wage determination', example: 'P-100-26310-123456' },
];

export default function DolStatus() {
  const t = useTheme();
  const [num, setNum] = useState('');
  const n = num.toUpperCase().replace(/\s/g, '');
  const kind = TYPES.find((x) => n.startsWith(x.prefix));
  const valid = /^[A-Z]-\d{3}-\d{5}-\d{6}$/.test(n);
  return (
    <DetailScreen title="DOL case status">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">LCA, PERM & PWD status</T>
        <T v="sub" style={{ marginTop: 4 }}>Department of Labor cases are checked on FLAG. DOL has no public API, so CaseDesk opens the official search for you.</T>
      </View>
      <Section>
        <Card>
          <Field label="DOL case number" placeholder="I-200-26310-123456" autoCapitalize="characters" autoCorrect={false} value={num} onChangeText={setNum} />
          {n.length > 4 ? <T v="small" style={{ marginTop: -6, marginBottom: 12, color: kind ? t.green : t.sub }}>{kind ? `✓ ${kind.name}` : 'Starts with I-200 (LCA), G-100 (PERM) or P-100 (PWD)'}</T> : null}
          <Button label="Open FLAG case status search" icon="open-outline" href="https://flag.dol.gov/case-status-search" />
          <T v="small" style={{ marginTop: 10 }}>Paste the number into the search box on FLAG. It accepts several case numbers at once.</T>
        </Card>
      </Section>
      <Section title="Where to find the number">
        <Card>
          {TYPES.map((x, i) => (
            <View key={x.prefix} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pill label={x.prefix} tone="accent" small />
                <T v="h3" style={{ fontSize: 14 }}>{x.name}</T>
              </View>
              <T v="small" style={{ marginTop: 4 }}>e.g. {x.example} — on the certified form your employer or attorney received.</T>
            </View>
          ))}
        </Card>
      </Section>
      <Section>
        <Note>The public search shows decided cases (Certified, Denied, Withdrawn). Cases still in review only show in your employer’s FLAG account.</Note>
      </Section>
    </DetailScreen>
  );
}
