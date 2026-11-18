// A person's compliance card: status line, act-now / review / info one-liners and missing documents.
import React from 'react';
import { View } from 'react-native';
import { Card, T, Pill } from './ui';
import { useTheme } from '../theme';
import { Profile, visaLabel } from '../lib/profile';
import { Check, statusLine, worst } from '../lib/compliance';
import { missingDocs } from '../lib/docrules';

export function PersonSummary({ p, checks, principal, have }: { p: { id: string; name: string; relation: string; profile: Profile | null }; checks: Check[]; principal: Profile | null; have: string[] }) {
  const t = useTheme();
  const pr = p.profile;
  const w = worst(checks);
  const pill = w === 'act now' ? <Pill label="Act now" tone="red" /> : w === 'review' ? <Pill label="Review" tone="amber" /> : w === 'info' ? <Pill label="Info" tone="accent" /> : <Pill label="Good" tone="green" />;
  const shown = checks.filter((c) => c.tone !== 'green');
  const good = checks.filter((c) => c.tone === 'green' && c.id !== 'i94-ok' && c.id !== 'i94-filed');
  const missing = missingDocs(pr, p.relation, have);
  const dot = (c: Check) => (c.tone === 'red' ? t.red : c.tone === 'amber' ? t.amber : c.tone === 'green' ? t.green : t.sub);
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="h3" style={{ flex: 1, fontSize: 17 }}>{p.relation === 'You' ? `${p.name} (you)` : p.name}</T>
        {pill}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <T v="sub">{`${p.relation} · ${pr ? visaLabel(pr) : '—'}`}</T>
        <Pill small label={pr?.location === 'Outside' ? `In ${pr.country || 'another country'}` : 'In US'} />
      </View>
      <T v="h2" style={{ marginTop: 10, marginBottom: 6, fontSize: 20 }}>{statusLine(pr, principal)}</T>
      {[...shown, ...(shown.length ? [] : good)].map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot(c), marginTop: 6 }} />
          <T v="body" style={{ flex: 1 }}>{c.title}</T>
        </View>
      ))}
      {missing.length ? <T v="small" style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: t.border, fontSize: 14 }}>{`Missing: ${missing.join(', ')}`}</T> : null}
    </Card>
  );
}
