// Home tab (v2.7 pastel): greeting, the hero = the family's single most urgent item, two tiles = the
// next two most useful facts (core/priority.ts), family rows, what else needs attention, cases, updates.
import { reasonLine } from '../core/review';
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { fmt, today } from '../core/dates';
import { isPendingCase } from '../core/cases';
import { needsAttention } from '../core/rules/engine';
import { useFamily } from '../data/FamilyProvider';
import { TourButton, TourTarget, useTour, useLayout, Appear, Avatar, Button, EmptyState, Group, HeroCard, Icon, LargeTitle, LinkButton, Pastel, Row, Screen, SectionHeader, StatTile, T, font, useSheet, useTheme, useToast } from '../ui';
import { AttentionRow, go, LegalFooter, needsLocation, statusLabel, untilText } from './common';
import { heroLine } from '../core/priority';
import { ORDER } from '../core/rules/types';
import { StatusView, meaningBlock, usePriority, useOpenTarget } from './priority';
import { CaseRow } from './cases';
import { Confirm, SourceSheet } from './sheets';
import { endFlow, unsavedCount, useFlow } from '../data/flow';
import { RULES_CHECKED } from '../core/rules/catalog';
import { HomeUpdates } from './news';
import { ICloudAfterRestore } from './icloud';
import { listNames, type AttentionItem } from '../core/rules/engine';
import { familyTags, orderTags, updateAlerts } from '../core/updates';
import { useNews, type NewsItem } from '../data/news';

export const UPDATES = [
  { tag: 'EAD', t: 'EAD renewals filed on or after Oct 30, 2025 don’t get an automatic extension', src: 'uscis.gov', url: 'https://www.uscis.gov/i-765', body: 'If a work permit renewal is pending when the card ends, work has to stop until the new card arrives. Plan renewals up to 180 days early.' },
  { tag: 'Visa', t: 'Visa interviews must be in your country of nationality or residence', src: 'travel.state.gov', url: 'https://travel.state.gov/content/travel/en/News/visas-news.html', body: 'Most applicants also need an in-person interview — the interview waiver (“dropbox”) ended for most categories. Book early.' },
  { tag: 'F-1', t: 'F-1 students admitted from Sep 15, 2026 get a fixed I-94 end date', src: 'ice.gov/sevp', url: 'https://studyinthestates.dhs.gov/students', body: '“D/S” is being replaced by a fixed date. If your program runs longer, file I-539 before the I-94 ends.' },
  { tag: 'Citizenship', t: '2025 civics test: 20 questions asked, 12 right to pass', src: 'uscis.gov', url: 'https://www.uscis.gov/citizenship', body: 'Applies to N-400s filed on or after Oct 20, 2025. Practise in Tools → Citizenship test.' },
];

const TONE_ICON = { act: 'alert', review: 'alert', deadline: 'clock', setup: 'doc', allgood: 'checkc' } as const;

export function Home() {
  const f = useFamily();
  const t = useTheme();
  const toast = useToast();
  const sheet = useSheet();
  const me = f.main;
  const draft = useFlow();
  const news = useNews();
  const L = useLayout();
  const tour = useTour('home');
  const { hero, tiles } = usePriority();
  const open = useOpenTarget();
  const unsaved = draft ? unsavedCount() : 0;
  if (!f.people.length || !me) {
    return (
      <Screen tabRoot>
        <LargeTitle title="Home" />
        <EmptyState icon="users" title="No one added yet" body="Tell us about you to see your status." action={{ title: 'Get started', onPress: () => go('/about-you') }} />
      </Screen>
    );
  }
  const att = needsAttention(f.results, 99).filter((x) => `finding:${x.personId}:${x.finding.id}` !== hero.key);
  const alerts = updateAlerts(news.items, familyTags(f.people, f.records), f.settings.updatesDismissed ?? [], today());
  const total = att.length + Math.min(2, alerts.length);
  const onlyMe = f.people.length === 1;
  const locAsk = f.people.filter((p) => needsLocation(f.records[p.id]));
  const worst = f.people.map((p) => f.results[p.id]?.worst).sort((a, b) => (a ? ORDER[a] : 9) - (b ? ORDER[b] : 9))[0];
  const count = `${f.people.length} ${f.people.length === 1 ? 'person' : 'people'}`;
  const subline = worst === 'act' ? `Something needs action · ${count}` : worst === 'review' ? `Something to review · ${count}` : `${onlyMe ? 'You’re' : 'Your family is'} all set · ${count}`;

  const topPart = (
    <>
      <HomeSearchBar />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T a11y="header" numberOfLines={1} style={{ fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4 }}>{`Hi, ${me.name}`}</T>
          <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{subline}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TourButton />
          <Pressable onPress={() => go('/settings')} accessibilityRole="button" accessibilityLabel="Settings and profile" hitSlop={4}><Avatar name={me.name} tone="sky" /></Pressable>
        </View>
      </View>

      <TourTarget id="hero" style={{ marginTop: 16 }}>
        <Appear>
          <HeroCard tone={meaningBlock(hero.tone, true)} icon={TONE_ICON[hero.kind]} label={hero.label} chip={hero.chip} big={hero.big} line={heroLine(hero)} progress={hero.progress}
            onPress={() => open(hero.target)} a11y={`${hero.label}. ${hero.big}. ${heroLine(hero)}`} />
        </Appear>
        <Appear delay={60} style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          {tiles.map((x) => <StatTile key={x.key} tone={meaningBlock(x.tone)} icon={x.icon} label={x.label} big={x.big} sub={x.sub} onPress={() => open(x.target)} />)}
        </Appear>
      </TourTarget>

      {draft && unsaved > 0 ? (
        <Pastel tone="warn" style={{ marginTop: 10 }}>
          <T style={font.headline}>{`${unsaved} document${unsaved === 1 ? '' : 's'} read, not saved yet`}</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button title="Continue" grow onPress={() => go('/flow/review')} />
            <Button kind="ghost" title="Discard" onPress={() => sheet.open('Discard these documents?', <Confirm body="The documents you read but didn’t save are removed from this phone." action="Discard" onConfirm={() => { endFlow(); toast('Discarded'); }} />)} />
          </View>
        </Pastel>
      ) : null}

      <ICloudAfterRestore />
    </>
  );
  const familyPart = (
    <>
      <SectionHeader right={<LinkButton title="See all" onPress={() => router.navigate('/(tabs)/family' as never)} />}>Family</SectionHeader>
      <TourTarget id="family"><Group>
        {f.people.map((p) => (
          <Row key={p.id} avatar={p.name} onPress={() => go(`/person/${p.id}`)} pill={f.results[p.id]?.worst} chevron={false}
            label={`${p.name}, ${statusLabel(p, f.records[p.id], f.results[p.id])}, ${untilText(p, f.records[p.id], f.results[p.id])}`}
            title={p.name}
            subtitle={(() => { const res = f.results[p.id]; const top = `${statusLabel(p, f.records[p.id], res)} · ${untilText(p, f.records[p.id], res).replace('Status valid until', 'until')}`; const why = res ? reasonLine(res.findings, res.facts.statusUntil) : undefined;
              return why ? <><T tone="text2" style={font.foot}>{top}</T><T tone={res!.worst === 'act' ? 'red' : 'amber'} numberOfLines={1} style={[font.foot, { fontWeight: '600', marginTop: 1 }]}>{why}</T></> : top; })()} />
        ))}
        {onlyMe && !f.settings.familyCardDismissed ? (
          <Row icon="plus" iconPastel="mint" title="Add your family" subtitle="Optional · spouse, children or parents" onPress={() => go('/family-setup')} chevron={false}
            trailing={<Pressable onPress={() => f.actions.updateSettings({ familyCardDismissed: true })} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}><Icon name="x" size={15} color={t.text2} /></Pressable>} />
        ) : null}
      </Group></TourTarget>
    </>
  );
  const attentionPart = att.length || locAsk.length || alerts.length ? (
    <TourTarget id="attention">
      <SectionHeader right={total > 3 ? <LinkButton title={`All ${total}`} onPress={() => router.navigate('/(tabs)/family' as never)} /> : undefined}>{hero.kind === 'act' || hero.kind === 'review' ? 'Also needs attention' : 'Needs attention'}</SectionHeader>
      <Group>
        {locAsk.slice(0, 1).map((p) => (
          <Row key={`loc-${p.id}`} icon="pin" iconTone="amber" alignTop onPress={() => go(`/person/${p.id}`)} title={p.relation === 'self' ? 'Are you in the US right now?' : `Is ${p.name} in the US right now?`} subtitle={`${p.name} · people outside the US don’t have an I-94`} />
        ))}
        {att.slice(0, locAsk.length ? 2 : 3).map((x) => <GroupedAttention key={x.personId + x.finding.id} x={x} />)}
        {alerts.slice(0, 2).map((n) => <UpdateAlertRow key={n.id} n={n} />)}
      </Group>
    </TourTarget>
  ) : null;
  const casesPart = <CasesGlance />;
  const famTags = familyTags(f.people, f.records);
  const communityPart = (
    <>
      <SectionHeader>Community</SectionHeader>
      <Group>
        <Row icon="chat" iconPastel="blush" title="Ask the community" subtitle={famTags.length ? `People with ${famTags.slice(0, 3).join(', ')}` : 'People with the same visa'} onPress={() => router.navigate('/(tabs)/forum' as never)} />
      </Group>
    </>
  );
  const foot = <LegalFooter asOf={fmt(RULES_CHECKED)} />;
  // Wide (≥ 700): two independent scroll areas — you, the hero and the family stay put on the left
  // while attention, cases and updates scroll on the right. Phones: one page.
  if (L.twoCol) {
    return <Screen tabRoot wide panes={{ left: <>{topPart}{familyPart}<StatusView title="Family documents" card /></>, right: <>{attentionPart}{casesPart}<TourTarget id="updates"><HomeUpdates /></TourTarget>{communityPart}{foot}</> }} tour={tour} />;
  }
  return (
    <Screen tabRoot tour={tour}>
      {topPart}
      {familyPart}
      {attentionPart}
      {casesPart}
      <TourTarget id="updates"><HomeUpdates /></TourTarget>
      {communityPart}
      {foot}
    </Screen>
  );
}
/** One Needs-attention item; the same finding for several dependents is listed once with their names. */
function GroupedAttention({ x }: { x: AttentionItem }) {
  const f = useFamily();
  const name = (id: string) => f.people.find((p) => p.id === id)?.name ?? '';
  if (x.finding.id === 'principal-first' || x.people.length > 1) {
    const principalId = f.results[x.people[0]]?.principalId;
    const principal = principalId ? name(principalId) : undefined;
    const who = listNames(x.people.map(name));
    const detail = `${who} ${x.people.length === 1 ? 'follows' : 'follow'} it — plan ${principal ? `${principal}’s` : 'the principal’s'} extension first.`;
    return <AttentionRow f={{ ...x.finding, detail }} onPress={() => go(`/person/${principalId ?? x.personId}`)} />;
  }
  return <AttentionRow f={x.finding} name={name(x.personId)} onPress={() => go(`/person/${x.personId}`)} />;
}

/** A high-impact update for the family's visa types: Info, shown once (dismiss or open it). */
function UpdateAlertRow({ n }: { n: NewsItem }) {
  const f = useFamily();
  const t = useTheme();
  const seen = () => f.actions.updateSettings({ updatesDismissed: [...new Set([...(f.settings.updatesDismissed ?? []), n.id])] });
  return (
    <Row icon="news" alignTop title={n.title} label={`Info: ${n.title}`}
      onPress={() => { seen(); go(`/news/${encodeURIComponent(n.id)}`); }} chevron={false}
      subtitle={<T tone="text2" style={[font.foot, { marginTop: 2 }]}>{`Update for ${orderTags(n.tags, familyTags(f.people, f.records)).slice(0, 2).join(', ')} · ${n.agency}`}</T>}
      trailing={<Pressable onPress={seen} accessibilityRole="button" accessibilityLabel="Dismiss this update" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -8 }}><Icon name="x" size={15} color={t.text2} /></Pressable>} />
  );
}

/** Latest case updates: the two most recently changed cases (the tiles above carry the counts). */
function CasesGlance() {
  const f = useFamily();
  const list = [...f.caseList].sort((a, b) => Number(isPendingCase(b)) - Number(isPendingCase(a)) || (b.updated || '').localeCompare(a.updated || '')).slice(0, 2);
  if (!list.length) return null;
  return (
    <>
      <SectionHeader right={<LinkButton title="See all" onPress={() => router.navigate('/(tabs)/cases' as never)} />}>Cases</SectionHeader>
      <Group>{list.map((c) => <CaseRow key={c.id} c={c} />)}</Group>
    </>
  );
}

/** v2.9: search field at the top of Home (iOS style). Opens Search with the keyboard up. */
function HomeSearchBar() {
  const t = useTheme();
  return (
    <Pressable onPress={() => go('/search')} accessibilityRole="search" accessibilityLabel="Search people, documents, cases and tools"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.dark ? t.card : t.card2, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginBottom: 14, opacity: pressed ? 0.75 : 1 })}>
      <Icon name="search" size={17} color={t.text2} />
      <T tone="text2" style={font.body}>Search</T>
    </Pressable>
  );
}
