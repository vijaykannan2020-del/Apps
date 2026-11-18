// My Status — one person at a time (me or a family member): what needs attention, the next deadline,
// their key dates, documents and cases. Adding documents is the main action: they fill everything else.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Screen, Section, Card, T, Pill, IconBubble, Row, Button, Columns, tap } from '../../src/components/ui';
import { useFamily } from '../../src/lib/family';
import { useTheme } from '../../src/theme';
import { useProfile, usesEAD, isBlanket, hasApprovalNotice, Profile } from '../../src/lib/profile';
import { runChecks, fmt, daysTo } from '../../src/lib/compliance';
import { useVault, VaultDoc } from '../../src/lib/vault';
import { useCases } from '../../src/lib/store';
import { stageOf } from '../../src/lib/caseStatus';
import { people, initials } from '../../src/lib/people';
import { DOC_ICON } from '../../src/components/DocIcon';
import { mergeDuplicateSpouse, backfillNames } from '../../src/lib/tidy';

const SHORT: Partial<Record<keyof Profile, string>> = { i94Expiry: 'Until your I-94 ends', petitionEnd: 'Until your approval ends', eadExpiry: 'Until your EAD ends', passportExpiry: 'Until your passport expires' };

type DateRow = { key: keyof Profile; label: string; doc: string[]; value?: string };

function datesFor(p: Profile): DateRow[] {
  const rows: DateRow[] = [{ key: 'i94Expiry', label: 'I-94 admit until', doc: ['I-94'], value: p.i94Expiry }];
  if (hasApprovalNotice(p.visa)) rows.push(isBlanket(p) ? { key: 'petitionEnd', label: 'I-129S period ends', doc: ['I-129S (blanket L)'], value: p.petitionEnd } : { key: 'petitionEnd', label: 'Approval (I-797) valid to', doc: ['Approval (I-797A/B)'], value: p.petitionEnd });
  if (usesEAD(p.visa)) rows.push({ key: 'eadExpiry', label: 'EAD card valid to', doc: ['EAD card'], value: p.eadExpiry });
  rows.push({ key: 'passportExpiry', label: 'Passport expires', doc: ['Passport'], value: p.passportExpiry });
  rows.push({ key: 'visaStampExpiry', label: 'Visa stamp expires', doc: ['Visa stamp'], value: p.visaStampExpiry });
  if (p.extFiled) rows.push({ key: 'extFiled', label: 'Extension filed', doc: ['Receipt (I-797C)'], value: p.extFiled });
  return rows;
}

// Countdown ring for the next deadline (fills as the date gets closer within a 1-year window).
function Ring({ days, color }: { days: number; color: string }) {
  const t = useTheme();
  const size = 112, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = Math.max(0.04, Math.min(1, days / 365));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface2} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
      </Svg>
      <Text allowFontScaling={false} style={{ fontSize: 30, lineHeight: 36, fontWeight: '800', color: t.text, fontVariant: ['tabular-nums'], letterSpacing: -0.5, includeFontPadding: false, textAlign: 'center' }}>{Math.abs(days)}</Text>
      <Text allowFontScaling={false} style={{ fontSize: 12, lineHeight: 15, color: t.sub, textAlign: 'center' }}>{days < 0 ? 'days ago' : 'days'}</Text>
    </View>
  );
}

export default function Status() {
  const t = useTheme();
  const router = useRouter();
  const [me, ready] = useProfile();
  const [family] = useFamily();
  const [docs] = useVault();
  const [cases] = useCases();
  const [who, setWho] = useState('me');
  const [allChecks, setAllChecks] = useState(false);
  // Tidy up quietly: merge a leftover unnamed spouse, read names from passports saved before names were read.
  useEffect(() => { mergeDuplicateSpouse().catch(() => {}).finally(() => { backfillNames().catch(() => {}); }); }, [docs.length, family.length]);
  const list = useMemo(() => people(me, family), [me, family]);
  const person = list.find((x) => x.id === who) ?? list[0];
  const p = person.profile;
  const editPath = who === 'me' ? '/status/edit' : `/status/edit?member=${who}`;
  const addPath = who === 'me' ? '/status/add' : `/status/add?member=${who}`;
  const mine = (o?: string) => (o || 'me') === who;
  const myDocs = docs.filter((d) => mine(d.owner));
  const myCases = cases.filter((c) => mine(c.owner));
  const checks = p ? runChecks(p) : [];
  const urgent = checks.filter((c) => c.tone === 'red' || c.tone === 'amber');
  const rest = checks.filter((c) => !(c.tone === 'red' || c.tone === 'amber'));
  const rows = p ? datesFor(p) : [];
  const next = rows.filter((r) => r.value && r.key !== 'extFiled' && r.key !== 'visaStampExpiry').map((r) => ({ ...r, d: daysTo(r.value)! })).sort((a, b) => a.d - b.d)[0];
  const tone = checks.some((c) => c.tone === 'red') ? t.red : urgent.length ? t.amber : t.green;
  const docFor = (r: DateRow): VaultDoc | undefined => myDocs.find((d) => r.doc.includes(d.type));

  return (
    <Screen title="Documents" subtitle={p ? `${person.name} · ${p.visa}${p.employer && person.id === 'me' ? ' · ' + p.employer : ''}` : 'Status, dates and documents for you and your family'}>
      {/* People */}
      {ready ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingVertical: 4 }}>
          {list.map((x) => {
            const on = x.id === who;
            const bad = x.profile ? runChecks(x.profile).some((c) => c.tone === 'red') : false;
            return (
              <Pressable key={x.id} onPress={() => { tap(); setWho(x.id); setAllChecks(false); }} style={{ alignItems: 'center', width: 64 }} accessibilityLabel={x.name}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? t.accent : t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 0.5, borderColor: t.border }}>
                  <T v="h3" style={{ color: on ? '#fff' : t.text }}>{x.named ? initials(x.name) : x.id === 'me' ? 'Me' : x.relation[0]}</T>
                  {bad ? <View style={{ position: 'absolute', top: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: t.red, borderWidth: 2, borderColor: t.bg }} /> : null}
                </View>
                <T v="small" numberOfLines={1} style={{ marginTop: 5, color: on ? t.text : t.sub }}>{x.short}</T>
              </Pressable>
            );
          })}
          <Pressable onPress={() => router.push('/status/edit?member=new' as any)} style={{ alignItems: 'center', width: 60 }} accessibilityLabel="Add family member">
            <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.faint, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color={t.sub} />
            </View>
            <T v="small" style={{ marginTop: 5 }}>Family</T>
          </Pressable>
        </ScrollView>
      ) : null}

      {ready && !person.named && (person.id !== 'me' || p) ? (
        <Pressable onPress={() => router.push(editPath as any)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.accentSoft, padding: 12, borderRadius: 14 }}>
          <Ionicons name="person-add-outline" size={18} color={t.accent} />
          <T v="body" style={{ flex: 1, color: t.accent, fontSize: 14 }}>{person.id === 'me' ? 'Add your name' : `Add ${person.relation.toLowerCase()}’s name`} — so documents and reminders show who they’re for.</T>
          <Ionicons name="chevron-forward" size={16} color={t.accent} />
        </Pressable>
      ) : null}
      <Columns left={<>
        {ready && !p ? (
          <Section>
            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
              <IconBubble name="documents-outline" size={56} />
              <T v="h2" style={{ marginTop: 14, textAlign: 'center' }}>{who === 'me' ? 'Start with your documents' : `Add ${person.short}’s documents`}</T>
              <T v="sub" style={{ textAlign: 'center', marginTop: 6, maxWidth: 290 }}>Scan the I-94, I-797 / I-129S, passport, visa and EAD. CaseDesk reads the dates and watches them for you.</T>
              <View style={{ marginTop: 18, alignSelf: 'stretch' }}><Button label="Add documents" icon="scan" onPress={() => router.push(addPath as any)} /></View>
              <View style={{ marginTop: 10, alignSelf: 'stretch' }}><Button label="Enter dates instead" kind="secondary" onPress={() => router.push(editPath as any)} /></View>
              <T v="small" style={{ marginTop: 12 }}>Saved only on this phone.</T>
            </Card>
          </Section>
        ) : null}

        {p ? (
          <>
            {/* Summary */}
            <Section>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 20 }}>
                {next ? <Ring days={next.d} color={next.d < 0 ? t.red : next.d <= 90 ? t.amber : tone} /> : <IconBubble name="calendar-outline" size={64} />}
                <View style={{ flex: 1 }}>
                  <Pill label={checks.some((c) => c.tone === 'red') ? 'Act now' : urgent.length ? `${urgent.length} to review` : 'All good'} tone={checks.some((c) => c.tone === 'red') ? 'red' : urgent.length ? 'amber' : 'green'} small />
                  <T v="h3" style={{ marginTop: 8 }}>{next ? `${SHORT[next.key] ?? next.label}${next.d < 0 ? ' — passed' : ''}` : 'Add a date to start'}</T>
                  {next ? <T v="sub" style={{ marginTop: 2 }}>{fmt(next.value)}</T> : null}
                </View>
              </Card>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}><Button label="Add documents" icon="scan" onPress={() => router.push(addPath as any)} /></View>
                <View style={{ flex: 1 }}><Button label="Edit dates" kind="secondary" icon="calendar-outline" onPress={() => router.push(editPath as any)} /></View>
              </View>
            </Section>

            {/* What to do */}
            {urgent.length || rest.length ? (
              <Section title={urgent.length ? 'Needs attention' : 'Checks'}>
                {(urgent.length ? urgent : rest).concat(allChecks && urgent.length ? rest : []).map((c) => (
                  <Card key={c.id} style={{ marginBottom: 10, flexDirection: 'row', gap: 12 }}>
                    <IconBubble name={c.icon as any} tone={c.tone === 'neutral' ? 'neutral' : c.tone} size={34} />
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ lineHeight: 21 }}>{c.title}</T>
                      <T v="sub" style={{ marginTop: 4 }}>{c.detail}</T>
                    </View>
                  </Card>
                ))}
                {urgent.length && rest.length ? (
                  <Pressable onPress={() => setAllChecks(!allChecks)} style={{ alignSelf: 'center', padding: 6 }}>
                    <T v="small" style={{ color: t.accent, fontWeight: '700' }}>{allChecks ? 'Show less' : `Show ${rest.length} more check${rest.length > 1 ? 's' : ''}`}</T>
                  </Pressable>
                ) : null}
              </Section>
            ) : null}
          </>
        ) : null}
      </>} right={<>
        {p ? (
          <Section title="Key dates" action="Edit" onAction={() => router.push(editPath as any)}>
            <Card style={{ paddingVertical: 4 }}>
              {rows.map((r, i) => {
                const d = daysTo(r.value);
                const doc = docFor(r);
                const c = d === null ? t.faint : d < 0 ? t.red : d <= 90 ? t.amber : t.green;
                return (
                  <Pressable key={r.key} onPress={() => router.push((doc ? `/status/doc?id=${doc.id}` : r.value ? editPath : addPath) as any)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border, gap: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
                    <View style={{ flex: 1 }}>
                      <T v="body" style={{ fontSize: 15 }}>{r.label}</T>
                      <T v="small" style={{ marginTop: 1 }}>{r.value ? fmt(r.value) : 'Not added — tap to scan'}{doc ? ' · document saved' : ''}</T>
                    </View>
                    {d !== null && r.key !== 'extFiled' ? <T v="h3" style={{ fontSize: 14, color: c, fontVariant: ['tabular-nums'] }}>{d < 0 ? `${-d}d ago` : `${d}d`}</T> : null}
                    {doc ? <Ionicons name="attach" size={16} color={t.sub} /> : !r.value ? <Ionicons name="scan-outline" size={16} color={t.accent} /> : null}
                  </Pressable>
                );
              })}
            </Card>
          </Section>
        ) : null}

        {/* Documents for this person */}
        <Section title={`${person.id === 'me' && !person.named ? 'My' : person.short + '’s'} documents`} note="Tap a document to view it and check the details read from it." action={myDocs.length ? 'See all' : undefined} onAction={() => router.push(`/status/vault?owner=${who}` as any)}>
          {(() => {
            // One slot per document this person should have; anything else follows.
            const slots: string[] = ['I-94'];
            if (p && hasApprovalNotice(p.visa)) slots.push(isBlanket(p) ? 'I-129S (blanket L)' : 'Approval (I-797A/B)');
            slots.push('Passport', 'Visa stamp');
            if (p && usesEAD(p.visa)) slots.push('EAD card');
            const extra = myDocs.filter((d) => !slots.includes(d.type));
            const tile = (key: string, icon: any, label: string, sub: string, color: string, onPress: () => void, dashed?: boolean) => (
              <Pressable key={key} onPress={onPress} style={{ width: '48.5%', borderRadius: 16, backgroundColor: dashed ? 'transparent' : t.surface, borderWidth: dashed ? 1.2 : 0.5, borderStyle: dashed ? 'dashed' : 'solid', borderColor: dashed ? t.faint : t.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={icon} size={20} color={dashed ? t.accent : t.text} />
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 13 }} numberOfLines={1}>{label}</T>
                  <T v="small" style={{ color }} numberOfLines={1}>{sub}</T>
                </View>
              </Pressable>
            );
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                {slots.map((ty) => {
                  const d = myDocs.find((x) => x.type === ty);
                  const label = ty === 'Approval (I-797A/B)' ? 'I-797 approval' : ty === 'I-129S (blanket L)' ? 'I-129S' : ty;
                  if (!d) return tile(ty, 'add-circle-outline', label, 'Add', t.accent, () => router.push(addPath as any), true);
                  const dd = daysTo(d.expires);
                  return tile(d.id, DOC_ICON[ty] ?? 'document-outline', label, d.expires ? fmt(d.expires) : 'Saved', dd !== null && dd < 0 ? t.red : dd !== null && dd <= 90 ? t.amber : t.green, () => router.push(`/status/doc?id=${d.id}` as any));
                })}
                {extra.map((d) => tile(d.id, DOC_ICON[d.type] ?? 'document-outline', d.type === 'Other' ? d.title : d.type.replace(/ \(.*\)/, ''), d.expires ? fmt(d.expires) : 'Saved', t.sub, () => router.push(`/status/doc?id=${d.id}` as any)))}
                {tile('add-more', 'documents-outline', 'Other document', 'Receipts, LCA, W-2…', t.accent, () => router.push(addPath as any), true)}
              </View>
            );
          })()}
        </Section>

        {/* Cases for this person */}
        {myCases.length ? (
          <Section title="Cases" action="All cases" onAction={() => router.push('/cases')}>
            <Card style={{ paddingVertical: 4 }}>
              {myCases.map((c, i) => {
                const st = stageOf(c.status);
                return (
                  <Pressable key={c.receipt} onPress={() => router.push(`/case/${c.receipt}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ fontSize: 15 }}>{c.form ?? 'Case'} · {c.receipt}</T>
                      <T v="small" numberOfLines={1}>{c.status ?? 'Tap to check status'}</T>
                    </View>
                    <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} small />
                  </Pressable>
                );
              })}
            </Card>
          </Section>
        ) : null}

        <Section title="More">
          <Card style={{ paddingVertical: 4 }}>
            <Row icon="notifications-outline" title="Reminders" subtitle="When to alert me before dates" onPress={() => router.push('/alerts')} />
            <Row icon="document-text-outline" title="Download latest I-94" subtitle="CBP website" href="https://i94.cbp.dhs.gov/search/recent-search" />
            <Row icon="person-circle-outline" title="myUSCIS account" subtitle="Notices filed online" href="https://my.uscis.gov/" last />
          </Card>
        </Section>
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <T v="small" style={{ textAlign: 'center' }}>Reminders based on your dates — not legal advice.</T>
        </View>
      </>} />
    </Screen>
  );
}
