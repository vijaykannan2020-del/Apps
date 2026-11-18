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
import { familyChecks, worst, statusLine } from '../../src/lib/compliance';
import { useVault } from '../../src/lib/vault';
import { people, initials } from '../../src/lib/people';
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

  const all = useMemo(() => familyChecks({ id: 'me', profile: me, relation: 'You', name: me?.name }, family.map((m) => ({ id: m.id, profile: m.profile, relation: m.relation }))), [me, family]);
  const summary = (id: string) => {
    const x = list.find((y) => y.id === id)!;
    const p = x.profile;
    const mine = docs.filter((d) => (d.owner || 'me') === id);
    const w = worst(all[id] || []);
    const pill = !mine.length && !p?.i94Expiry && !p?.passportExpiry ? null
      : w === 'act now' ? { label: 'Act now', bg: t.redSoft, fg: t.red }
      : w === 'review' ? { label: 'Review', bg: t.amberSoft, fg: t.amber }
      : w === 'info' ? { label: 'Info', bg: t.accentSoft, fg: t.accent }
      : { label: 'Good', bg: t.greenSoft, fg: t.green };
    const sub = [x.id === 'me' ? 'You' : x.relation, p ? visaLabel(p) : null].filter(Boolean).join(' · ');
    const loc = p?.location === 'Outside' ? `In ${p.country || 'another country'}` : 'In US';
    const until = mine.length || p?.i94Expiry ? statusLine(p, me) : 'No documents yet';
    return { x, sub, pill, loc, until };
  };

  return (
    <Screen title="Documents" subtitle="Your family’s documents and dates">
      <View style={{ marginTop: 4 }}>
        <Button label="Upload documents" icon="cloud-upload-outline" onPress={() => router.push('/status/flow' as any)} />
        <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>The one place to add or renew any document, for anyone in your family. CaseDesk reads it and files it under the right person.</T>
      </View>

      <View style={{ marginTop: 20, gap: 10 }}>
        {ready ? list.map((x0) => {
          const { x, sub, pill, loc, until } = summary(x0.id);
          return (
            <Pressable key={x.id} onPress={() => { tap(); router.push(`/status/person?id=${x.id}` as any); }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="h3" style={{ color: t.accent, fontSize: 15 }}>{x.named ? initials(x.name) : x.id === 'me' ? 'Me' : x.relation[0]}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3" numberOfLines={1}>{x.named ? x.short : x.id === 'me' ? 'You' : `${x.relation} (add name)`}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <T v="small" numberOfLines={1}>{sub}</T>
                    <View style={{ backgroundColor: t.surface2, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}><T v="small" style={{ color: t.text, fontSize: 11, fontWeight: '600' }}>{loc}</T></View>
                  </View>
                  <T v="body" numberOfLines={2} style={{ marginTop: 6, fontSize: 14 }}>{until}</T>
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
