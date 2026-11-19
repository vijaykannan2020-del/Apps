// Community Q&A feed: For my visa / All / Unanswered, tag chips from the family's visa types and
// case forms, search, and "Ask a question". Reading works signed out; asking opens the join sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { COMMUNITY_DISCLAIMER, FEED_TABS, TAGS, familyCommunityTags, feedQuery, timeAgo, type FeedTab } from '../core/community';
import { getFeed, useCommunityUser, type PostSummary } from '../data/communityApi';
import { useFamily } from '../data/FamilyProvider';
import { Button, ChipToggle, Chips, EmptyState, Field, Group, Hint, Icon, IconButton, Note, Row, Screen, Segmented, Spinner, T, Tag, font, useTheme, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { useCommunityGate } from './communityAccount';

/** Family visa types (from documents, else the status picked at setup) + forms on their cases. */
export function useFamilyCommunityTags(): string[] {
  const f = useFamily();
  return useMemo(() => familyCommunityTags(f.people.map((p) => f.records[p.id]?.visa), f.caseList.map((c) => c.form)), [f.people, f.records, f.caseList]);
}

export function PostRow({ p }: { p: PostSummary }) {
  const t = useTheme();
  return (
    <Row onPress={() => go(`/community/post/${p.id}`)} title={p.title} titleStyle={font.callout} alignTop
      label={`${p.title}. ${p.answers} answers, ${p.score} upvotes, by ${p.author.name}`}
      subtitle={
        <View style={{ marginTop: 4, gap: 6 }}>
          <T tone="text2" style={font.foot} numberOfLines={2}>{p.excerpt}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {p.tags.slice(0, 3).map((g) => <Tag key={g} text={g} />)}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name={p.accepted ? 'checkc' : 'chat'} size={13} color={p.accepted ? t.green : t.text2} />
              <T tone={p.accepted ? 'green' : 'text2'} style={font.caption}>{`${p.answers}`}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="up" size={13} color={p.voted ? t.accent : t.text2} />
              <T tone={p.voted ? 'accent' : 'text2'} style={font.caption}>{`${p.score}`}</T>
            </View>
            <T tone="text2" style={font.caption}>{`${p.author.name} · ${timeAgo(p.createdAt)}`}</T>
          </View>
          {p.hidden ? <T tone="amber" style={font.caption}>Hidden while a moderator reviews it</T> : null}
        </View>
      } />
  );
}

export function CommunityFeedScreen({ backTitle = 'Back' }: { backTitle?: string }) {
  const fam = useFamilyCommunityTags();
  const { user } = useCommunityUser();
  const gate = useCommunityGate();
  const [tab, setTab] = useState<FeedTab>(fam.length ? 'For my visa' : 'All');
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  const tour = useTour('communityFeed');

  const chips = tab === 'For my visa' && fam.length ? fam : [...TAGS.visa.slice(0, 6), 'I-485', 'I-140', 'Stamping', 'RFE', 'Layoff'];
  const qs = feedQuery({ tab, famTags: fam, tag, q: query });
  const load = useCallback(async () => {
    const my = ++seq.current;
    setError('');
    try {
      const r = await getFeed(qs);
      if (my !== seq.current) return;
      setPosts(r.posts); setNext(r.next);
    } catch (e: any) { if (my === seq.current) { setError(e.message); setPosts((p) => p ?? []); } }
  }, [qs, user?.id]);
  useEffect(() => { setPosts(null); load(); }, [load]);
  useEffect(() => { const h = setTimeout(() => setQuery(q), 400); return () => clearTimeout(h); }, [q]);

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try { const r = await getFeed(feedQuery({ tab, famTags: fam, tag, q: query, cursor: next })); setPosts((p) => [...(p ?? []), ...r.posts]); setNext(r.next); } catch (e: any) { setError(e.message); } finally { setMore(false); }
  };

  return (
    <Screen tour={tour} nav={{ title: 'Community', back: backTitle, onBack: back, right: <TourTarget id="account"><IconButton icon="user" label={user ? `Account: ${user.name}` : 'Account and sign in'} onPress={() => go('/community/account')} /></TourTarget> }}
      footer={<TourTarget id="compose" style={{ flex: 1 }}><Button icon="edit" title="Ask a question" onPress={() => gate(() => go('/community/compose'))} /></TourTarget>}>
      <Hint style={{ marginTop: 0 }}>{COMMUNITY_DISCLAIMER}</Hint>
      <TourTarget id="tabs"><Segmented options={FEED_TABS} value={tab} onChange={(v) => { setTab(v as FeedTab); setTag(null); }} /></TourTarget>
      <Field label="Search questions" value={q} onChangeText={setQ} placeholder="e.g. stamping Chennai, RFE EAC" autoCapitalize="none" maxLength={100} />
      <TourTarget id="chips"><Chips>{chips.map((g) => <ChipToggle key={g} role="checkbox" text={g} on={tag === g} onPress={() => setTag(tag === g ? null : g)} />)}</Chips></TourTarget>
      {tab === 'For my visa' && !fam.length ? <Hint>Add your family’s visa types in Family to see questions for them here.</Hint> : null}
      {tab === 'For my visa' && fam.length && !tag ? <Hint>{`Questions tagged ${fam.slice(0, 4).join(', ')}${fam.length > 4 ? '…' : ''}`}</Hint> : null}
      {error ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Try again" onPress={load} />}>{error}</Note> : null}
      <View style={{ marginTop: 14 }}>
        {posts === null ? <Spinner /> : posts.length ? (
          <Group>{posts.map((p) => <PostRow key={p.id} p={p} />)}</Group>
        ) : !error ? (
          <EmptyState small icon="chat" title={tab === 'Unanswered' ? 'Every question has an answer' : 'No questions here yet'} body="Be the first — ask what you’d like to know. Others with the same visa can answer." action={{ title: 'Ask a question', onPress: () => gate(() => go('/community/compose')) }} />
        ) : null}
        {next ? <Button block kind="ghost" title="Show more" busy={more} onPress={loadMore} /> : null}
      </View>
      <Hint center style={{ marginTop: 16 }}>Never post receipt numbers or other personal details. Report anything that breaks the rules from its ••• menu.</Hint>
    </Screen>
  );
}
