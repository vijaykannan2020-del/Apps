import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Note, Chips, Pill, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { PROCESSING, PT_AS_OF, PT, fmtMonths } from '../../src/data/processing';
import { fetchOr } from '../../src/lib/api';

const FORMS = ['I-129', 'I-539', 'I-765', 'I-140', 'I-485', 'I-131'];

export default function Times() {
  const t = useTheme();
  const [form, setForm] = useState('I-129');
  const [data, setData] = useState<{ asOf: string; items: PT[] }>({ asOf: PT_AS_OF, items: PROCESSING });
  const [live, setLive] = useState(false);
  useEffect(() => { fetchOr('/api/processing-times', { asOf: PT_AS_OF, items: PROCESSING }).then((r) => { if (r.data.items?.length) { setData(r.data); setLive(r.live); } }); }, []);
  const rows = useMemo(() => data.items.filter((p) => p.form === form), [data, form]);
  const max = Math.max(...rows.map((r) => r.months), 1);

  return (
    <DetailScreen title="Processing times">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Processing times</T>
        <T v="sub" style={{ marginTop: 4 }}>How long 8 out of 10 cases take, as published by USCIS.</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pill label={live ? 'Live' : 'Built-in'} tone={live ? 'green' : 'neutral'} small />
          <Pill label={`USCIS · ${data.asOf}`} small />
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <Chips options={FORMS.map((f) => ({ label: `Form ${f}`, value: f }))} value={form} onChange={setForm} />
      </View>
      <Section>
        <Card>
          {rows.map((r, i) => (
            <View key={r.category} style={{ paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <T v="body" style={{ flex: 1, paddingRight: 10 }}>{r.category}</T>
                <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>{fmtMonths(r.months)}</T>
              </View>
              <View style={{ height: 6, backgroundColor: t.surface2, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                <View style={{ width: `${(r.months / max) * 100}%`, height: '100%', backgroundColor: r.months > 18 ? t.amber : t.accent, borderRadius: 3 }} />
              </View>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Premium processing">
        <Card>
          <T v="body">I-129 and most I-140s: decision within 15 business days ($2,965). OPT / STEM OPT I-765: 30 business days ($1,780). EB-1C and NIW I-140: 45 business days.</T>
        </Card>
      </Section>
      <Section>
        <Note>Your case is “outside normal processing time” once it has been pending longer than the time shown — then you can submit a case inquiry. Times differ by office; check yours on the USCIS tool.</Note>
        <View style={{ marginTop: 12 }}><Button label="Check my office on uscis.gov" icon="open-outline" kind="secondary" href="https://egov.uscis.gov/processing-times/" /></View>
      </Section>
    </DetailScreen>
  );
}
