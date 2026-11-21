// Home tab. v3.0 (owner, approved preview): Home answers one question, "Am I OK?" — the hero (the
// family's most urgent item or All good), what else needs you, one row per person, then cases (or a
// Track a USCIS case row). Tiles, the document chart, news and the community row moved off Home.
import { reasonLine } from '../core/review';
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { fmt, today } from '../core/dates';
import { isPendingCase } from '../core/cases';
import { needsAttention } from '../core/rules/engine';
import { useFamily } from '../data/FamilyProvider';
import { TourButton, TourTarget, useTour, useLayout, Appear, Avatar, Button, EmptyState, Group, HeroCard, Icon, LargeTitle, LinkButton, Pastel, Row, Screen, SectionHeader, StatTile, T, font, useSheet, useTheme, useToast } from '../ui';
import { GcHomeCard } from './gc';
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
import { SETUP_ORDER, setupProgress, setupSteps, showContinueCard, type SetupStep } from '../core/onboarding';

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
  // owner, Nov 2026: no tips on Home (no ? button, no auto tip, no tour card) — the tour lives in Settings → Help & tips
  const tour = useTour('home', undefined, { auto: false });
  const { hero } = usePriority();
  const open = useOpenTarget();
  const unsaved = draft ? unsavedCount() : 0;
  if (!f.people.length || !me) {
    return (
      <Screen tabRoot>
        <LargeTitle title="Home" />
        <EmptyState icon="users" title="No one added yet" body="Tell us about you to see your status." action={{ title: 'Get started', onPress: () => go('/welcome') }} />
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T a11y="header" numberOfLines={1} style={{ fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4 }}>{`Hi, ${me.name.trim().split(/\s+/)[0] || me.name}`}</T>
          <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{subline}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TourTarget id="search"><SearchButton /></TourTarget>
          <Pressable onPress={() => go('/settings')} accessibilityRole="button" accessibilityLabel="Settings and profile" hitSlop={4}><Avatar name={me.name} tone="sky" /></Pressable>
        </View>
      </View>

      <TourTarget id="hero" style={{ marginTop: 16 }}>
        <Appear>
          <HeroCard tone={meaningBlock(hero.tone, true)} icon={TONE_ICON[hero.kind]} label={hero.label} chip={hero.chip} big={hero.big} line={heroLine(hero)} progress={hero.progress}
            onPress={() => open(hero.target)} a11y={`${hero.label}. ${hero.big}. ${heroLine(hero)}`} />
        </Appear>
      </TourTarget>

      <ContinueSetupCard />

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
  // Family is not on Home (owner, Nov 2026): it has its own tab and every alert is listed above.
  // Only people on their own see an Add your family row.
  const familyPart = (
    <>
      <TourTarget id="family"><Group>
        {onlyMe ? (!f.settings.familyCardDismissed ? (
          <Row icon="plus" iconPastel="mint" title="Add your family" subtitle="Optional · spouse, children or parents" onPress={() => go('/family-setup')} chevron={false}
            trailing={<Pressable onPress={() => f.actions.updateSettings({ familyCardDismissed: true })} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}><Icon name="x" size={15} color={t.text2} /></Pressable>} />
        ) : null) : null}
      </Group></TourTarget>
    </>
  );
  const attentionPart = att.length || locAsk.length || alerts.length ? (
    <TourTarget id="attention">
      <SectionHeader>{hero.kind === 'act' || hero.kind === 'review' ? 'Also needs you' : 'Needs you'}</SectionHeader>
      <Group>
        {locAsk.slice(0, 1).map((p) => (
          <Row key={`loc-${p.id}`} icon="pin" iconTone="amber" alignTop onPress={() => go(`/person/${p.id}`)} title={p.relation === 'self' ? 'Are you in the US right now?' : `Is ${p.name} in the US right now?`} subtitle={`${p.name} · people outside the US don’t have an I-94`} />
        ))}
        {att.map((x) => <GroupedAttention key={x.personId + x.finding.id} x={x} />)}
        {alerts.map((n) => <UpdateAlertRow key={n.id} n={n} />)}
      </Group>
    </TourTarget>
  ) : null;
  const casesPart = <><GcHomeCard /><CasesGlance /></>;
  const foot = <LegalFooter asOf={fmt(RULES_CHECKED)} />;
  // Wide (≥ 700): two independent scroll areas — you, the hero and the family stay put on the left
  // while attention, cases and updates scroll on the right. Phones: one page.
  if (L.twoCol) {
    return <Screen tabRoot wide panes={{ left: <>{topPart}{attentionPart}</>, right: <>{familyPart}{casesPart}{foot}</> }} tour={tour} />;
  }
  return (
    <Screen tabRoot tour={tour}>
      {topPart}
      {attentionPart}
      {familyPart}
      {casesPart}
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
  if (!list.length) return (
    <TourTarget id="cases"><Group style={{ marginTop: 22 }}>
      <Row icon="clock" iconPastel="sky" title="Track a USCIS case" subtitle="Add a receipt number when you have one" onPress={() => go('/cases?add=1')} />
    </Group></TourTarget>
  );
  return (
    <>
      <SectionHeader right={<LinkButton title="See all" onPress={() => router.navigate('/cases' as never)} />}>Cases</SectionHeader>
      <Group>{list.map((c) => <CaseRow key={c.id} c={c} />)}</Group>
    </>
  );
}

/** v2.9: search field at the top of Home (iOS style). Opens Search with the keyboard up. */
/** Search: a round button next to the profile picture (owner, Nov 2026 — no full-width search field on Home). */
function SearchButton() {
  const t = useTheme();
  return (
    <Pressable onPress={() => go('/search')} accessibilityRole="search" accessibilityLabel="Search people, documents, cases and tools" hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? t.card : t.card2, opacity: pressed ? 0.75 : 1 })}>
      <Icon name="search" size={19} color={t.text} />
    </Pressable>
  );
}

/** v3.0: setup was put off with Finish later — pick up where it stopped, or close the card. */
function ContinueSetupCard() {
  const f = useFamily();
  const t = useTheme();
  if (!showContinueCard(f.settings, f.people.length)) return null;
  const s = f.settings.setup!;
  const steps = setupSteps({ status: f.main?.status, locationFromDocs: !!(f.main && f.records[f.main.id]?.i94), notif: 'undetermined' });
  const cur = (SETUP_ORDER.includes(s.step as SetupStep) ? s.step : 'you') as SetupStep;
  const pr = setupProgress(cur, steps);
  const open = async () => { await f.actions.updateSettings({ setup: { ...s, later: false } }); go('/setup'); };
  const dismiss = () => f.actions.updateSettings({ setup: undefined, setupDone: true });
  return (
    <Pastel tone="sky" style={{ marginTop: 10 }} onPress={open} label={`Continue setup, step ${pr.at} of ${pr.total}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T style={font.headline}>Continue setup</T>
          <T style={[font.foot, { marginTop: 2 }]}>{`Step ${pr.at} of ${pr.total} · a few quick questions left`}</T>
        </View>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close setup card" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 }}><Icon name="x" size={16} color={t.ink} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
        {Array.from({ length: pr.total }).map((_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < pr.at - 1 ? t.ink : 'rgba(0,0,0,0.14)' }} />)}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}><Button size="sm" title="Continue" onPress={open} /></View>
    </Pastel>
  );
}
