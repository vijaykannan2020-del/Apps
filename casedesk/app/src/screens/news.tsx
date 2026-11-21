// Updates: official rule changes (USCIS, DHS, DOL, State) and news & analysis — on Home (latest four),
// a full list with filters, and one item per page. Same feed as the first CaseDesk app.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { kindOf, newsById, useNews, type NewsItem } from '../data/news';
import { openUrl } from '../native/device';
import { Button, Card, ChipRow, ChipToggle, Group, Hint, Icon, LinkButton, Pill, Row, Screen, SectionHeader, Segmented, T, Tag, Why, font, useTheme, TourTarget, useTour } from '../ui';
import { asOfText, back, go } from './common';
import { DISCLAIMER, DISCLAIMER_SHORT } from '../content/legal';
import { useFamily } from '../data/FamilyProvider';
import { familyTags, forFamily, orderTags, topicOrder } from '../core/updates';
import { useCommunityGate } from './communityAccount';

const KINDS = ['Official', 'News & analysis'];
const kindKey = (k: string) => (k === 'Official' ? 'official' : 'news');
const sev = (n: NewsItem): 'review' | 'info' => (n.impact === 'high' ? 'review' : 'info');
const when = (d: string) => { try { return fmt(d); } catch { return d; } };

export function NewsRow({ n }: { n: NewsItem }) {
  const f = useFamily();
  const tags = orderTags(n.tags, familyTags(f.people, f.records));
  return (
    <Row onPress={() => go(`/news/${encodeURIComponent(n.id)}`)} title={n.title} titleStyle={font.callout}
      subtitle={<View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        {n.impact === 'high' ? <Pill severity="review" text="Important" /> : null}
        {tags.slice(0, 2).map((g) => <Tag key={g} text={g} />)}
        <T tone="text2" style={font.caption}>{`${n.agency} · ${when(n.date)}`}</T>
      </View>} />
  );
}

/** Home section: the family's updates first, then "More updates" (everything else) with topic
 *  chips inline — nothing needs leaving Home to see the other updates. */
export function HomeUpdates() {
  const { items, live, updated } = useNews();
  const f = useFamily();
  const tags = familyTags(f.people, f.records);
  const [kind, setKind] = useState(KINDS[0]);
  const [topic, setTopic] = useState('All');
  const [more, setMore] = useState(5);
  const ofKind = items.filter((n) => kindOf(n) === kindKey(kind));
  const mine = tags.length ? forFamily(ofKind, tags).slice(0, 4) : [];
  const mineIds = new Set(mine.map((n) => n.id));
  const rest = ofKind.filter((n) => !mineIds.has(n.id));
  const topics = ['All', ...topicOrder(rest.flatMap((n) => n.tags))];
  const shown = rest.filter((n) => topic === 'All' || n.tags.includes(topic as never) || (topic === 'OPT' && n.tags.includes('STEM OPT' as never)));
  return (
    <>
      <SectionHeader right={<LinkButton title="See all" onPress={() => go('/news', { kind: kindKey(kind) })} />}>Updates</SectionHeader>
      <Segmented compact options={KINDS} value={kind} onChange={(k) => { setKind(k); setTopic('All'); setMore(5); }} />
      {mine.length ? (
        <>
          <T tone="text2" style={[font.foot, { marginTop: 14, marginLeft: 4, fontWeight: '600' }]}>{`For your family · ${tags.slice(0, 3).join(', ')}`}</T>
          <Group style={{ marginTop: 6 }}>{mine.map((n) => <NewsRow key={n.id} n={n} />)}</Group>
        </>
      ) : null}
      <T tone="text2" style={[font.foot, { marginTop: 16, marginLeft: 4, fontWeight: '600' }]}>{mine.length ? 'More updates' : 'All updates'}</T>
      <ChipRow style={{ marginTop: 2 }}>{topics.map((g) => <ChipToggle size="sm" key={g} text={g} on={topic === g} onPress={() => { setTopic(g); setMore(5); }} />)}</ChipRow>
      <Group style={{ marginTop: 6 }}>{shown.length ? shown.slice(0, more).map((n) => <NewsRow key={n.id} n={n} />) : <Row title="Nothing here yet" titleTone="text2" />}</Group>
      {shown.length > more ? <LinkButton title={`Show ${Math.min(5, shown.length - more)} more`} onPress={() => setMore(more + 5)} /> : null}
      <NewsAsOf live={live} updated={updated} items={items} />
    </>
  );
}

/** "Live · updated …" or "Built-in copy · newest item …", with the disclaimer. */
export function NewsAsOf({ live, updated, items }: { live: boolean; updated?: string; items: NewsItem[] }) {
  const newest = items.map((n) => n.date).sort().pop();
  return (
    <Hint style={{ marginTop: 8 }}>{`${asOfText({ live, fetchedAt: live ? updated : undefined, asOf: live ? undefined : newest ? `${when(newest)} (newest item)` : undefined })}. Sources: USCIS, DHS, DOL, State Department and news outlets. ${DISCLAIMER_SHORT}.`}</Hint>
  );
}

export function NewsListScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const { items, live, updated } = useNews();
  const [kind, setKind] = useState(params.kind === 'news' ? KINDS[1] : KINDS[0]);
  const f = useFamily();
  const fam = familyTags(f.people, f.records);
  const FAMILY = 'For my family';
  // null = the default: For my family once the family has loaded (a cold start renders before it has)
  const [picked, setTag] = useState<string | null>(null);
  const tag = picked ?? (fam.length ? FAMILY : 'All');
  const ofKind = items.filter((n) => kindOf(n) === kindKey(kind));
  const tags = useMemo(() => [...(fam.length ? [FAMILY] : []), 'All', ...topicOrder(ofKind.flatMap((n) => n.tags))], [ofKind, fam.length]);
  const shown = tag === FAMILY ? forFamily(ofKind, fam) : ofKind.filter((n) => tag === 'All' || n.tags.includes(tag as never) || (tag === 'OPT' && n.tags.includes('STEM OPT' as never)));
  const tour = useTour('news-list');
  return (
    <Screen tour={tour} nav={{ title: 'Updates', back: 'Home', onBack: back }}>
      {/* v2.9: no intro line — a compact segmented control and ONE scrolling chip row, so the list starts high */}
      <TourTarget id="kind"><Segmented compact options={KINDS} value={kind} onChange={(k) => { setKind(k); setTag(null); }} /></TourTarget>
      <TourTarget id="chips"><ChipRow style={{ marginTop: 6 }}>{tags.map((g) => <ChipToggle size="sm" key={g} text={g} on={tag === g} onPress={() => setTag(g)} />)}</ChipRow></TourTarget>
      {tag === FAMILY ? <Hint style={{ marginTop: 2, marginLeft: 4 }}>{`Your family’s visa types: ${fam.join(', ')}`}</Hint> : null}
      <Group style={{ marginTop: 10 }}>{shown.length ? shown.map((n) => <NewsRow key={n.id} n={n} />) : <Row title="Nothing here yet" />}</Group>
      <NewsAsOf live={live} updated={updated} items={items} />
    </Screen>
  );
}

export function NewsItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useNews();
  const n = newsById(id ? decodeURIComponent(id) : undefined);
  const t = useTheme();
  const f = useFamily();
  const tour = useTour('news-item');
  const gate = useCommunityGate();
  React.useEffect(() => { if (n && f.ready && !(f.settings.updatesDismissed ?? []).includes(n.id) && n.impact === 'high') f.actions.updateSettings({ updatesDismissed: [...(f.settings.updatesDismissed ?? []), n.id] }); }, [n?.id, f.ready]);
  if (!n) return <Screen nav={{ title: 'Update', back: 'Back', onBack: back }}><Why>This update is no longer in the feed.</Why></Screen>;
  return (
    <Screen tour={tour} nav={{ title: kindOf(n) === 'news' ? 'News' : 'Official update', back: 'Back', onBack: back }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill severity={sev(n)} text={n.impact === 'high' ? 'Important' : 'Info'} />
        {orderTags(n.tags, familyTags(f.people, f.records)).map((g) => <Tag key={g} text={g} />)}
      </View>
      <T a11y="header" style={[font.title2, { marginTop: 12 }]}>{n.title}</T>
      <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{`${n.agency} · ${when(n.date)}`}</T>
      <TourTarget id="body"><Card style={{ marginTop: 16 }}>
        <T style={font.body}>{n.summary}</T>
        {n.points?.length ? <View style={{ marginTop: 12, gap: 8 }}>{n.points.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, marginTop: 8 }} /><T style={[font.sub, { flex: 1 }]}>{p}</T></View>
        ))}</View> : null}
      </Card></TourTarget>
      {n.sources?.length ? (<><SectionHeader>Also reported by</SectionHeader><Group>{n.sources.map((s) => <Row key={s.url} icon="globe" title={s.name} onPress={() => openUrl(s.url)} />)}</Group></>) : null}
      <TourTarget id="source"><Button block icon="compass" title="Open the source" onPress={() => openUrl(n.url)} /></TourTarget>
      {/* v3.0: start a Community discussion about this update (title, summary, points and source pre-filled) */}
      <View style={{ marginTop: 10 }}><Button block kind="tint" icon="chat" title="Discuss in Community" label="Start a Community discussion about this update" onPress={() => gate(() => go('/community/compose', { news: n.id }))} /></View>
      <Hint center style={{ marginTop: 12 }}>{`${n.agency} · ${when(n.date)}. Check the source before you act. ${DISCLAIMER}`}</Hint>
    </Screen>
  );
}
void Icon;
