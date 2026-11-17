// Visa appointment wait times by US embassy/consulate + interview (dropbox) rules.
import React, { useEffect, useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Segmented, Button, Note, Pill } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { fetchOr } from '../../src/lib/api';
import { WAITS_BUILT_IN, Waits, WAITS_URL, INTERVIEW_RULES } from '../../src/data/waits';

type Col = 'petition' | 'visitor' | 'student';
const months = (s?: string) => { const m = s?.match(/([\d.]+)\s*(day|month)/i); return m ? (m[2].toLowerCase().startsWith('day') ? Number(m[1]) / 30 : Number(m[1])) : null; };
const INDIA = /chennai|hyderabad|kolkata|mumbai|new delhi/i;

export default function VisaWaits() {
  const t = useTheme();
  const [w, setW] = useState<Waits>(WAITS_BUILT_IN);
  const [live, setLive] = useState(false);
  const [col, setCol] = useState<Col>('petition');
  const [q, setQ] = useState('');
  useEffect(() => { fetchOr<Waits>('/api/visa-waits', WAITS_BUILT_IN).then((r) => { setW(r.data); setLive(r.live && !r.data.builtIn); }); }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = w.posts.filter((p) => (s ? p.post.toLowerCase().includes(s) : true));
    const pinned = s ? list : [...list.filter((p) => INDIA.test(p.post)), ...list.filter((p) => !INDIA.test(p.post))];
    return pinned.slice(0, s ? 60 : 25);
  }, [w, q]);
  const color = (v?: string) => { const m = months(v); return m === null ? t.faint : m >= 6 ? t.red : m >= 2.5 ? t.amber : t.green; };

  return (
    <DetailScreen title="Visa wait times">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Visa appointment waits</T>
        <T v="sub" style={{ marginTop: 4 }}>Next available interview at US embassies & consulates</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pill label={live ? 'Live' : 'Built-in · India posts'} tone={live ? 'green' : 'neutral'} small />
          {w.updated ? <Pill label={`State Dept · ${w.updated}`} small /> : null}
        </View>
        <View style={{ marginTop: 14 }}>
          <Segmented<Col> options={[{ label: 'H / L / O work', value: 'petition' }, { label: 'Visitor B1/B2', value: 'visitor' }, { label: 'Student F/M/J', value: 'student' }]} value={col} onChange={setCol} />
        </View>
        {live ? (
          <TextInput value={q} onChangeText={setQ} placeholder="Search a city (e.g. Toronto, Frankfurt)" placeholderTextColor={t.faint}
            style={{ marginTop: 12, backgroundColor: t.surface2, color: t.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }} />
        ) : null}
      </View>
      <Section>
        <Card style={{ paddingVertical: 4 }}>
          {rows.map((r, i) => (
            <View key={r.post} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <T v="h3" style={{ flex: 1 }}>{r.post}</T>
              <T v="h3" style={{ color: color(r[col]), fontVariant: ['tabular-nums'] }}>{r[col] || '—'}</T>
            </View>
          ))}
          {!rows.length ? <T v="sub" style={{ paddingVertical: 12 }}>No matching post.</T> : null}
        </Card>
        {!live ? <View style={{ marginTop: 10 }}><Note>Showing the built-in copy for India. Open the official tool for other posts and the latest numbers.</Note></View> : null}
        <View style={{ marginTop: 10 }}><Button label="Official wait-times page" kind="secondary" icon="open-outline" href={w.source || WAITS_URL} /></View>
      </Section>
      <Section title="Interviews & dropbox">
        <Card>
          {INTERVIEW_RULES.map(([a, b], i) => (
            <View key={a} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <T v="h3" style={{ fontSize: 15 }}>{a}</T>
              <T v="sub" style={{ marginTop: 2 }}>{b}</T>
            </View>
          ))}
        </Card>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}><T v="small" style={{ textAlign: 'center' }}>Information only — not legal advice.</T></View>
    </DetailScreen>
  );
}
