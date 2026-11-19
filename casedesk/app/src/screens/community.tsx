// Community feed (v2.7, Reddit-style): post cards with avatar, flair, votes, comments, Share and Save;
// sort by Hot / New / Top (today, week, all) / Unanswered; a For my visa filter; tag chips; search;
// pull to refresh and endless scroll. Reading works signed out; anything else opens the join sheet.
// v2.9 (owner: people come to read, not to work the filters): search is a header button, the sort is a
// compact menu button on the same single scrolling row as the visa chips, the pinned Welcome post sits
// on top, and a short feed ends with Start a conversation prompts instead of an empty gap.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { DISCLAIMER_CAPTION, STARTERS, SORTS, TAGS, TOP_RANGES, familyCommunityTags, feedQuery, mergePage, showStarters, sortLabel, type FeedTab, type SortId, type Starter, type TopRange } from '../core/community';
import { getFeed, usePostBus, useCommunityUser, type PostSummary } from '../data/communityApi';
import { useFamily } from '../data/FamilyProvider';
import { Button, ChipRow, ChipToggle, EmptyState, Group, Hint, Icon, IconButton, LargeTitle, MIN_TOUCH, MenuButton, NavButton, Note, Row, Screen, SectionHeader, Spinner, font, useSheet, useTheme, TourButton, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { useCommunityGate } from './communityAccount';
import { PostCard } from './communityCards';
import { CAvatar } from './communityUi';

/** Family visa types (from documents, else the status picked at setup) + forms on their cases. */
// web preview only: no browser focus ring inside the rounded field (the field itself shows focus)
const NO_WEB_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;
type SortOption = { id: SortId; r?: TopRange; title: string };
const SORT_ICON: Record<SortId, string> = { hot: 'chart', new: 'clock', top: 'up', unanswered: 'comment' };

export function useFamilyCommunityTags(): string[] {
  const f = useFamily();
  return useMemo(() => familyCommunityTags(f.people.map((p) => f.records[p.id]?.visa), f.caseList.map((c) => c.form)), [f.people, f.records, f.caseList]);
}


/** `tabRoot`: shown as the Community tab — large title, no back button, New post sits above the system tab bar. */
export function CommunityFeedScreen({ backTitle = 'Back', tabRoot }: { backTitle?: string; tabRoot?: boolean }) {
  const t = useTheme();
  const fam = useFamilyCommunityTags();
  const { user } = useCommunityUser();
  const gate = useCommunityGate();
  const [scope, setScope] = useState<FeedTab>('All');
  const [sort, setSort] = useState<SortId>('hot');
  const [range, setRange] = useState<TopRange>('week');
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const sheet = useSheet();
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

  const closeSearch = () => { setQ(''); setQuery(''); setSearching(false); };
  const pickSort = (id: SortId, r?: TopRange) => { sheet.close(); setSort(id); if (r) setRange(r); };
  const openSort = () => sheet.open('Sort posts', (
    <Group style={{ marginTop: 12 }}>
      {SORTS.flatMap((s): SortOption[] => (s.id === 'top' ? TOP_RANGES.map((r) => ({ id: s.id, r: r.id, title: `Top · ${r.label}` })) : [{ id: s.id, title: s.label }])).map((o) => {
        const on = sort === o.id && (!o.r || range === o.r);
        return <Row key={o.title} icon={SORT_ICON[o.id]} title={o.title} chevron={false} label={`${o.title}${on ? ', selected' : ''}`} onPress={() => pickSort(o.id, o.r)} trailing={on ? <Icon name="check" size={18} color={t.text} weight="semibold" /> : null} />;
      })}
    </Group>
  ));
  const searchBar = searching ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 12, backgroundColor: t.fill, paddingHorizontal: 10 }}>
        <Icon name="search" size={16} color={t.text2} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search posts" placeholderTextColor={t.text2} accessibilityLabel="Search posts" autoCapitalize="none" autoCorrect={false} maxLength={100} returnKeyType="search" clearButtonMode="while-editing"
          style={[font.callout, { flex: 1, height: 38, color: t.text, paddingVertical: 0 }, NO_WEB_OUTLINE]} />
      </View>
      <NavButton title="Cancel" label="Cancel search" onPress={closeSearch} />
    </View>
  ) : null;
  const header = (
    <View style={{ paddingBottom: 8 }}>
      {searchBar}
      <ChipRow style={{ marginTop: searching ? 4 : 2 }} lead={<TourTarget id="sort"><MenuButton title={sortLabel(sort, range)} label={`Sort: ${sortLabel(sort, range)}`} onPress={openSort} /></TourTarget>}>
        {fam.length ? <ChipToggle size="sm" role="checkbox" text="For my visa" on={scope === 'For my visa'} onPress={() => { setScope(scope === 'For my visa' ? 'All' : 'For my visa'); setTag(null); }} /> : null}
        {chips.map((g) => <ChipToggle size="sm" key={g} role="checkbox" text={g} on={tag === g} onPress={() => setTag(tag === g ? null : g)} />)}
      </ChipRow>
      {error ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Try again" onPress={load} />}>{error}</Note> : null}
    </View>
  );
  const empty = posts === null ? <View style={{ paddingVertical: 40 }}><Spinner /></View> : !error ? (
    <EmptyState small icon={query ? 'search' : 'chat'} title={query ? 'No posts match' : sort === 'unanswered' ? 'Every post has a reply' : sort === 'top' && range !== 'all' ? 'Nothing in this period yet' : 'No posts here yet'}
      body={query ? 'Try fewer or different words.' : undefined} />
  ) : null;
  const startPost = (s: Starter) => gate(() => go('/community/compose', { type: s.type, tag: s.tag }));
  const starters = showStarters({ posts, query, error }) ? (
    <View>
      <SectionHeader>Start a conversation</SectionHeader>
      <Group>{STARTERS.map((s) => <Row key={s.id} icon={s.icon} title={s.title} onPress={() => startPost(s)} label={`${s.title}. Opens a new post`} />)}</Group>
    </View>
  ) : null;
  const hasPin = !!posts?.some((p) => p.pinned);

  const actions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <IconButton plain icon="search" label="Search posts" onPress={() => (searching ? closeSearch() : setSearching(true))} />
      {tabRoot ? <IconButton plain icon="edit" label="New post" onPress={compose} /> : null}
      {user ? (
        <View>
          <IconButton plain icon="bell" label={user.unread ? `Notifications, ${user.unread} new` : 'Notifications'} onPress={() => go('/community/notifications')} />
          {user.unread ? <View pointerEvents="none" style={{ position: 'absolute', top: 7, right: 8, width: 11, height: 11, borderRadius: 6, backgroundColor: t.red, borderWidth: 2, borderColor: t.bg }} /> : null}
        </View>
      ) : null}
      {user ? <Pressable onPress={() => go('/community/account')} accessibilityRole="button" accessibilityLabel={`Account: ${user.name}`} style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><CAvatar a={user} size={34} /></Pressable>
        : <IconButton plain icon="user" label="Account and sign in" onPress={() => go('/community/account')} />}
    </View>
  );
  const list = (
    <FlatList
      data={posts ?? []} keyExtractor={(p) => p.id} style={{ flex: 1, marginHorizontal: -4 }} contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 24 }}
      renderItem={({ item, index }) => (index === 0 && !hasPin && !item.pinned
        ? <View><PostCard p={item} onChange={change} onRemoved={removed} /><Hint style={{ marginLeft: 4 }}>{DISCLAIMER_CAPTION}</Hint></View>
        : <PostCard p={item} onChange={change} onRemoved={removed} />)}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={tabRoot ? <><LargeTitle title="Community" right={<View style={{ flexDirection: 'row', alignItems: 'center' }}><TourButton />{actions}</View>} />{header}</> : header}
      ListEmptyComponent={empty ?? undefined}
      ListFooterComponent={more ? <View style={{ paddingVertical: 16 }}><Spinner /></View> : starters ?? (posts?.length && !next ? <Hint center style={{ marginTop: 16 }}>You’re all caught up.</Hint> : undefined)}
      onEndReached={loadMore} onEndReachedThreshold={0.6} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.text2} colors={[t.text]} />}
    />
  );
  const newPost = <Button icon="edit" title="New post" onPress={compose} />;
  // Tab root (v2.9): New post is the compose icon in the header (iOS style), so nothing sits under the
  // floating tab bar; the list itself scrolls clear of the bar.
  if (tabRoot) return <Screen tour={tour} scroll={false} tabRoot>{list}</Screen>;
  return <Screen tour={tour} scroll={false} nav={{ title: 'Community', back: backTitle, onBack: back, right: actions }} footer={newPost}>{list}</Screen>;
}
