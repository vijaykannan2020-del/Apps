// Updates: official rule changes (USCIS, DHS, DOL, State) and news & analysis — on Home (latest four),
// a full list with filters, and one item per page. Same feed as the first CaseDesk app.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { kindOf, newsById, useNews, type NewsItem } from '../data/news';
import { openUrl } from '../native/device';
import { Button, Card, ChipToggle, Chips, Group, Hint, Icon, LinkButton, Pill, Row, Screen, SectionHeader, Segmented, T, Tag, Why, font, useTheme } from '../ui';
import { back, go } from './common';
import { useFamily } from '../data/FamilyProvider';
import { familyTags, forFamily, orderTags } from '../core/updates';

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

/** Home section: latest four, Official / News & analysis. */
export function HomeUpdates() {
  const { items, live } = useNews();
  const f = useFamily();
  const tags = familyTags(f.people, f.records);
  const [kind, setKind] = useState(KINDS[0]);
  const ofKind = items.filter((n) => kindOf(n) === kindKey(kind));
  const mine = forFamily(ofKind, tags);
  const shown = (mine.length ? mine : ofKind).slice(0, 4);
  return (
    <>
      <SectionHeader right={<LinkButton title="See all" onPress={() => go('/news', { kind: kindKey(kind) })} />}>{tags.length && mine.length ? `Updates for ${tags.slice(0, 3).join(', ')}` : 'Updates'}</SectionHeader>
      <Segmented options={KINDS} value={kind} onChange={setKind} />
      <Group style={{ marginTop: 10 }}>{shown.map((n) => <NewsRow key={n.id} n={n} />)}</Group>
      <Hint style={{ marginTop: 8 }}>{live ? 'Live from USCIS, DHS, DOL and State, plus news coverage.' : 'Saved copy — the live feed loads when you’re online.'}</Hint>
    </>
  );
}

export function NewsListScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const { items, live } = useNews();
  const [kind, setKind] = useState(params.kind === 'news' ? KINDS[1] : KINDS[0]);
  const f = useFamily();
  const fam = familyTags(f.people, f.records);
  const FAMILY = 'For my family';
  const [tag, setTag] = useState(fam.length ? FAMILY : 'All');
  const ofKind = items.filter((n) => kindOf(n) === kindKey(kind));
  const tags = useMemo(() => [...(fam.length ? [FAMILY] : []), 'All', ...[...new Set(ofKind.flatMap((n) => n.tags))].sort()], [ofKind, fam.length]);
  const shown = tag === FAMILY ? forFamily(ofKind, fam) : ofKind.filter((n) => tag === 'All' || n.tags.includes(tag as never) || (tag === 'OPT' && n.tags.includes('STEM OPT' as never)));
  return (
    <Screen nav={{ title: 'Updates', back: 'Home', onBack: back }}>
      <Why>Rule changes from USCIS, DHS, DOL and State — and news coverage. Tap one for what it means.</Why>
      <Segmented options={KINDS} value={kind} onChange={(k) => { setKind(k); setTag(fam.length ? FAMILY : 'All'); }} />
      <Chips>{tags.map((g) => <ChipToggle key={g} text={g} on={tag === g} onPress={() => setTag(g)} />)}</Chips>
      {tag === FAMILY ? <Hint>{`Updates tagged ${fam.join(', ')} — the visa types in your family.`}</Hint> : null}
      <Group style={{ marginTop: 14 }}>{shown.length ? shown.map((n) => <NewsRow key={n.id} n={n} />) : <Row title="Nothing here yet" />}</Group>
      <Hint center style={{ marginTop: 14 }}>{live ? 'Live feed.' : 'Saved copy — the live feed loads when you’re online.'} General information, not legal advice.</Hint>
    </Screen>
  );
}

export function NewsItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useNews();
  const n = newsById(id ? decodeURIComponent(id) : undefined);
  const t = useTheme();
  const f = useFamily();
  React.useEffect(() => { if (n && f.ready && !(f.settings.updatesDismissed ?? []).includes(n.id) && n.impact === 'high') f.actions.updateSettings({ updatesDismissed: [...(f.settings.updatesDismissed ?? []), n.id] }); }, [n?.id, f.ready]);
  if (!n) return <Screen nav={{ title: 'Update', back: 'Back', onBack: back }}><Why>This update is no longer in the feed.</Why></Screen>;
  return (
    <Screen nav={{ title: kindOf(n) === 'news' ? 'News' : 'Official update', back: 'Back', onBack: back }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill severity={sev(n)} text={n.impact === 'high' ? 'Important' : 'Info'} />
        {orderTags(n.tags, familyTags(f.people, f.records)).map((g) => <Tag key={g} text={g} />)}
      </View>
      <T a11y="header" style={[font.title2, { marginTop: 12 }]}>{n.title}</T>
      <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{`${n.agency} · ${when(n.date)}`}</T>
      <Card style={{ marginTop: 16 }}>
        <T style={font.body}>{n.summary}</T>
        {n.points?.length ? <View style={{ marginTop: 12, gap: 8 }}>{n.points.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, marginTop: 8 }} /><T style={[font.sub, { flex: 1 }]}>{p}</T></View>
        ))}</View> : null}
      </Card>
      {n.sources?.length ? (<><SectionHeader>Also reported by</SectionHeader><Group>{n.sources.map((s) => <Row key={s.url} icon="globe" title={s.name} onPress={() => openUrl(s.url)} />)}</Group></>) : null}
      <Button block icon="compass" title="Open the source" onPress={() => openUrl(n.url)} />
      <Hint center style={{ marginTop: 12 }}>General information, not legal advice. Check the source before you act.</Hint>
    </Screen>
  );
}
void Icon;
