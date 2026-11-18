// One person (you or a family member): their details and one list of their documents. Each row is a
// document they should have — tap it to open the saved file, or "Add" to scan it.
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Pill, Button, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useProfile, visaLabel, Profile } from '../../src/lib/profile';
import { useFamily } from '../../src/lib/family';
import { useVault, VaultDoc } from '../../src/lib/vault';
import { useCases } from '../../src/lib/store';
import { stageOf } from '../../src/lib/caseStatus';
import { people, initials } from '../../src/lib/people';
import { runChecks, fmt, daysTo } from '../../src/lib/compliance';
import { DOC_ICON } from '../../src/components/DocIcon';
import { slotsFor } from '../../src/lib/slots';

export default function PersonPage() {
  const t = useTheme();
  const router = useRouter();
  const { id = 'me' } = useLocalSearchParams<{ id?: string }>();
  const [me] = useProfile();
  const [family] = useFamily();
  const [docs] = useVault();
  const [cases] = useCases();
  const [open, setOpen] = useState('');
  const person = people(me, family).find((x) => x.id === id);
  if (!person) return <DetailScreen title="Documents"><View style={{ padding: 20 }}><T v="sub">This person was removed.</T></View></DetailScreen>;
  const p = person.profile;
  const isMe = id === 'me';
  const editPath = isMe ? '/status/edit' : `/status/edit?member=${id}`;
  const mine = docs.filter((d) => (d.owner || 'me') === id);
  const myCases = cases.filter((c) => (c.owner || 'me') === id);
  const slots = slotsFor(p);
  const extra = mine.filter((d) => !slots.some((s) => s.type === d.type));
  const issues = p ? runChecks(p).filter((c) => (c.tone === 'red' || c.tone === 'amber') && c.id !== 'i94-missing') : [];
  const name = isMe ? (person.named ? person.name : 'You') : person.named ? person.name : person.relation;

  const color = (d: number | null) => (d === null ? t.sub : d < 0 ? t.red : d <= 90 ? t.amber : t.green);
  const DocRow = ({ icon, label, date, doc, onPress, first }: { icon: any; label: string; date?: string; doc?: VaultDoc; onPress?: () => void; first?: boolean }) => {
    const d = daysTo(date);
    return (
      <Pressable disabled={!onPress} onPress={() => { tap(); onPress?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 0.5, borderTopColor: t.border }}>
        <Ionicons name={icon} size={20} color={t.text} />
        <View style={{ flex: 1 }}>
          <T v="body" style={{ fontSize: 16 }}>{label}</T>
          <T v="small" style={{ marginTop: 1 }}>{doc ? 'Tap to view' : date ? 'Date entered — no file' : 'Not uploaded'}</T>
        </View>
        {date ? <T v="h3" style={{ fontSize: 14, color: color(d) }}>{fmt(date)}</T> : doc ? <T v="small">Saved</T> : <T v="small" style={{ color: t.faint }}>—</T>}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={t.faint} /> : null}
      </Pressable>
    );
  };

  return (
    <DetailScreen title={name}>
      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T v="h3" style={{ color: t.accent }}>{person.named ? initials(person.name) : isMe ? 'Me' : person.relation[0]}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3">{person.named ? person.name : isMe ? 'Add your name' : `Add ${person.relation.toLowerCase()}’s name`}</T>
            <T v="sub" style={{ marginTop: 2 }}>{isMe ? 'You' : person.relation}{p ? ` · ${visaLabel(p)}` : ''}</T>
          </View>
          <Pressable onPress={() => router.push(editPath as any)} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: t.surface2 }}>
            <T v="small" style={{ color: t.text, fontWeight: '700' }}>Edit</T>
          </Pressable>
        </Card>

        {issues.length ? (
          <Card style={{ marginTop: 10, paddingVertical: 2 }}>
            {issues.slice(0, 3).map((c, i) => (
              <Pressable key={c.id} onPress={() => { tap(); setOpen(open === c.id ? '' : c.id); }} style={{ paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tone === 'red' ? t.red : t.amber }} />
                  <T v="body" style={{ flex: 1, fontSize: 15 }}>{c.title}</T>
                  <Ionicons name={open === c.id ? 'chevron-up' : 'chevron-down'} size={14} color={t.sub} />
                </View>
                {open === c.id ? <T v="sub" style={{ marginTop: 6, marginLeft: 18 }}>{c.detail}</T> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Documents</T>
        <Card style={{ paddingVertical: 2 }}>
          {slots.map((s, i) => {
            const doc = mine.find((d) => d.type === s.type);
            const date = doc?.expires || (p ? (p[s.key] as string | undefined) : undefined);
            return <DocRow key={s.type} first={i === 0} icon={DOC_ICON[s.type] ?? 'document-outline'} label={s.label} date={date} doc={doc} onPress={doc ? () => router.push(`/status/doc?id=${doc.id}` as any) : undefined} />;
          })}
          {extra.map((d) => <DocRow key={d.id} icon={DOC_ICON[d.type] ?? 'document-outline'} label={d.type === 'Other' ? d.title : d.type.replace(/ \(.*\)/, '')} date={d.expires} doc={d} onPress={() => router.push(`/status/doc?id=${d.id}` as any)} />)}
        </Card>
        <T v="small" style={{ marginTop: 8, textAlign: 'center' }}>To add or renew a document, use Upload documents on the Documents tab.</T>

        {myCases.length ? (
          <>
            <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>Cases</T>
            <Card style={{ paddingVertical: 2 }}>
              {myCases.map((c, i) => {
                const st = stageOf(c.status);
                return (
                  <Pressable key={c.receipt} onPress={() => router.push(`/case/${c.receipt}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}>
                      <T v="body" style={{ fontSize: 15 }}>{c.form ?? 'Case'} · {c.receipt}</T>
                      <T v="small" numberOfLines={1}>{c.status ?? 'Tap to check status'}</T>
                    </View>
                    <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} small />
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}
        <T v="small" style={{ textAlign: 'center', marginTop: 18 }}>Stored only on this phone · not legal advice</T>
      </View>
    </DetailScreen>
  );
}
