// Community feed (v2.7, Reddit-style): post cards with avatar, flair, votes, comments, Share and Save;
// sort by Hot / New / Top (today, week, all) / Unanswered; a For my visa filter; tag chips; search;
// pull to refresh and endless scroll. Reading works signed out; anything else opens the join sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { COMMUNITY_DISCLAIMER, SORTS, TAGS, TOP_RANGES, familyCommunityTags, feedQuery, mergePage, type FeedTab, type SortId, type TopRange } from '../core/community';
import { PASTEL } from '../core/communityColors';
import { getFeed, usePostBus, useCommunityUser, type PostSummary } from '../data/communityApi';
import { useFamily } from '../data/FamilyProvider';
import { Button, ChipToggle, EmptyState, Hint, Icon, IconButton, Note, Screen, Spinner, font, useTheme, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { useCommunityGate } from './communityAccount';
import { PostCard } from './communityCards';
import { CAvatar } from './communityUi';

/** Family visa types (from documents, else the status picked at setup) + forms on their cases. */
export function useFamilyCommunityTags(): string[] {
  const f = useFamily();
  return useMemo(() => familyCommunityTags(f.people.map((p) => f.records[p.id]?.visa), f.caseList.map((c) => c.form)), [f.people, f.records, f.caseList]);
}


export function CommunityFeedScreen({ backTitle = 'Back' }: { backTitle?: string }) {
  const t = useTheme();
  const fam = useFamilyCommunityTags();
  const { user } = useCommunityUser();
  const gate = useCommunityGate();
  const [scope, setScope] = useState<FeedTab>('All');
  const [sort, setSort] = useState<SortId>('hot');
  const [range, setRange] = useState<TopRange>('week');
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const tour = useTour('communityFeed');
  usePostBus(setPosts);

  const chips = scope === 'For my visa' && fam.length ? fam : [...TAGS.visa.slice(0, 6), 'I-485', 'I-140', 'Stamping', 'RFE', 'Layoff'];
  const args = { tab: scope, famTags: fam, tag, q: query, sort, range };
  const qs = feedQuery(args);
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
    if (!next || more) return;
    const my = seq.current;
    setMore(true);
    try { const r = await getFeed(feedQuery({ ...args, cursor: next })); if (my === seq.current) { setPosts((p) => mergePage(p ?? [], r.posts)); setNext(r.next); } } catch (e: any) { setError(e.message); } finally { setMore(false); }
  };
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const compose = () => gate(() => go('/community/compose'));
  const change = (p: PostSummary) => setPosts((list) => (list ? list.map((x) => (x.id === p.id ? p : x)) : list));
  const removed = (id: string) => setPosts((list) => (list ? list.filter((x) => x.id !== id) : list));

  const header = (
    <View style={{ paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 22, backgroundColor: t.field, paddingHorizontal: 14, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }}>
        <Icon name="search" size={17} color={t.text2} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search posts — stamping Chennai, RFE EAC…" placeholderTextColor={t.text3} accessibilityLabel="Search posts" autoCapitalize="none" autoCorrect={false} maxLength={100} returnKeyType="search" clearButtonMode="while-editing"
          style={[font.callout, { flex: 1, minHeight: 44, color: t.text, paddingVertical: 0 }]} />
      </View>
      <TourTarget id="sort">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingTop: 12 }}>
          {SORTS.map((s) => <ChipToggle key={s.id} text={s.label} on={sort === s.id} onPress={() => setSort(s.id)} />)}
        </ScrollView>
      </TourTarget>
      {sort === 'top' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
          {TOP_RANGES.map((r) => <ChipToggle key={r.id} text={r.label} on={range === r.id} onPress={() => setRange(r.id)} />)}
        </ScrollView>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
        {fam.length ? <ChipToggle role="checkbox" text="For my visa" on={scope === 'For my visa'} onPress={() => { setScope(scope === 'For my visa' ? 'All' : 'For my visa'); setTag(null); }} /> : null}
        {chips.map((g) => <ChipToggle key={g} role="checkbox" text={g} on={tag === g} onPress={() => setTag(tag === g ? null : g)} />)}
      </ScrollView>
      <Hint>{COMMUNITY_DISCLAIMER}</Hint>
      {error ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Try again" onPress={load} />}>{error}</Note> : null}
    </View>
  );
  const empty = posts === null ? <View style={{ paddingVertical: 40 }}><Spinner /></View> : !error ? (
    <EmptyState small icon="chat" title={sort === 'unanswered' ? 'Every post has a reply' : sort === 'top' && range !== 'all' ? 'Nothing in this period yet' : 'No posts here yet'}
      body="Be the first — ask a question, start a discussion, share your timeline or run a poll." action={{ title: 'New post', onPress: compose }} />
  ) : null;

  return (
    <Screen tour={tour} scroll={false}
      nav={{ title: 'Community', back: backTitle, onBack: back, right: (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {user ? (
            <View>
              <IconButton icon="bell" label={user.unread ? `Notifications, ${user.unread} new` : 'Notifications'} onPress={() => go('/community/notifications')} />
              {user.unread ? <View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: PASTEL.blush, borderWidth: 1.5, borderColor: t.bg }} /> : null}
            </View>
          ) : null}
          {user ? <Pressable onPress={() => go('/community/account')} accessibilityRole="button" accessibilityLabel={`Account: ${user.name}`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><CAvatar a={user} size={34} /></Pressable>
            : <IconButton icon="user" label="Account and sign in" onPress={() => go('/community/account')} />}
        </View>
      ) }}
      footer={<Button icon="edit" title="New post" onPress={compose} />}>
      <FlatList
        data={posts ?? []} keyExtractor={(p) => p.id} style={{ flex: 1, marginHorizontal: -4 }} contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 24 }}
        renderItem={({ item }) => <PostCard p={item} onChange={change} onRemoved={removed} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={header} ListEmptyComponent={empty ?? undefined}
        ListFooterComponent={more ? <View style={{ paddingVertical: 16 }}><Spinner /></View> : posts?.length && !next ? <Hint center style={{ marginTop: 16 }}>You’re all caught up. Never post receipt numbers or other personal details.</Hint> : undefined}
        onEndReached={loadMore} onEndReachedThreshold={0.6} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.text2} colors={[t.accent]} />}
      />
    </Screen>
  );
}
