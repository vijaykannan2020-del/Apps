// Documents — your family at a glance. One "Add document" button for everything; tap a person to see
// their documents and dates.
import React, { useEffect, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, T, Button, tap } from '../../src/components/ui';
import { useFamily } from '../../src/lib/family';
import { useTheme } from '../../src/theme';
import { visaLabel, useProfile } from '../../src/lib/profile';
import { runChecks, fmt, daysTo } from '../../src/lib/compliance';
import { useVault } from '../../src/lib/vault';
import { people, initials } from '../../src/lib/people';
import { slotsFor } from '../../src/lib/slots';
import { mergeDuplicateSpouse, backfillNames, unconfirmDefaultVisas } from '../../src/lib/tidy';

export default function Status() {
  const t = useTheme();
  const router = useRouter();
  const [me, ready] = useProfile();
  const [family] = useFamily();
  const [docs] = useVault();
  // Tidy up quietly: unconfirmed default visas, a leftover unnamed spouse, names from saved passports.
  useEffect(() => { unconfirmDefaultVisas().catch(() => {}); mergeDuplicateSpouse().catch(() => {}).finally(() => { backfillNames().catch(() => {}); }); }, [docs.length, family.length]);
  const list = useMemo(() => people(me, family), [me, family]);

  const summary = (id: string) => {
    const x = list.find((y) => y.id === id)!;
    const p = x.profile;
    const mine = docs.filter((d) => (d.owner || 'me') === id);
    const bad = p ? runChecks(p).filter((c) => c.tone === 'red' || (c.tone === 'amber' && c.id !== 'i94-missing')) : [];
    // Next date: the soonest of their documents' dates (visa stamps excluded — they don't limit the stay).
    const dates = slotsFor(p).filter((s) => s.type !== 'Visa stamp').map((s) => mine.find((d) => d.type === s.type)?.expires || (p?.[s.key] as string | undefined)).filter(Boolean) as string[];
    const next = dates.map((d) => ({ d, n: daysTo(d)! })).sort((a, b) => a.n - b.n)[0];
    let pill: { label: string; bg: string; fg: string } | null = null;
    if (bad.some((c) => c.tone === 'red')) pill = { label: 'Act now', bg: t.redSoft, fg: t.red };
    else if (bad.some((c) => c.id === 'visa-unset')) pill = { label: 'Confirm visa', bg: t.amberSoft, fg: t.amber };
    else if (next) pill = { label: next.n < 0 ? 'Date passed' : `Next: ${fmt(next.d).replace(/ \d+,/, '')}`, bg: t.surface2, fg: next.n <= 90 ? t.amber : t.green };
    const sub = [x.id === 'me' ? 'You' : x.relation, p ? visaLabel(p) : null, mine.length ? `${mine.length} document${mine.length > 1 ? 's' : ''}` : 'No documents yet'].filter(Boolean).join(' · ');
    return { x, sub, pill };
  };

  return (
    <Screen title="Documents" subtitle="Your family’s documents and dates">
      <View style={{ marginTop: 4 }}>
        <Button label="Upload documents" icon="cloud-upload-outline" onPress={() => router.push('/status/flow' as any)} />
        <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>The one place to add or renew any document, for anyone in your family. CaseDesk reads it and files it under the right person.</T>
      </View>

      <View style={{ marginTop: 20, gap: 10 }}>
        {ready ? list.map((x0) => {
          const { x, sub, pill } = summary(x0.id);
          return (
            <Pressable key={x.id} onPress={() => { tap(); router.push(`/status/person?id=${x.id}` as any); }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="h3" style={{ color: t.accent, fontSize: 15 }}>{x.named ? initials(x.name) : x.id === 'me' ? 'Me' : x.relation[0]}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3" numberOfLines={1}>{x.named ? x.short : x.id === 'me' ? 'You' : `${x.relation} (add name)`}</T>
                  <T v="small" numberOfLines={1} style={{ marginTop: 2 }}>{sub}</T>
                </View>
                {pill ? <View style={{ backgroundColor: pill.bg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}><T v="small" style={{ color: pill.fg, fontWeight: '700', fontSize: 12 }}>{pill.label}</T></View> : null}
                <Ionicons name="chevron-forward" size={16} color={t.faint} />
              </Card>
            </Pressable>
          );
        }) : null}
        <Pressable onPress={() => router.push('/status/edit?member=new' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, borderWidth: 1.2, borderStyle: 'dashed', borderColor: t.faint }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-add-outline" size={22} color={t.accent} /></View>
          <T v="h3" style={{ color: t.accent }}>Add family member</T>
        </Pressable>
      </View>
      <T v="small" style={{ textAlign: 'center', marginTop: 18 }}>Stored only on this phone</T>
    </Screen>
  );
}
