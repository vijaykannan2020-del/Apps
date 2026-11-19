// Public profile (avatar, flair, join date, karma, their posts and comments, Report / Block), the
// Saved posts list and the Notifications list (replies to you, upvote milestones).
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { mergePage, timeAgo } from '../core/community';
import { getNotifications, getProfile, getSaved, readNotifications, refreshMe, unblockUser, usePostBus, useCommunityUser, type Notice, type PostSummary, type Profile } from '../data/communityApi';
import { Button, EmptyState, Icon, IconButton, Note, Screen, Segmented, radius, Spinner, T, font, useSheet, useTheme, useToast, TourTarget, useTour } from '../ui';
import { back, go } from './common';
import { BlockSheet, ProfileHeader, ReportSheet, StatRow, useCommunityGate } from './communityAccount';
import { PostCard } from './communityCards';
import { MenuSheet, useVoteColors } from './communityUi';

const TABS = ['Posts', 'Comments'];

export function CommunityProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useCommunityUser();
  const t = useTheme();
  const gate = useCommunityGate();
  const sheet = useSheet();
  const toast = useToast();
  const vc = useVoteColors();
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Posts');
  const tour = useTour('communityProfile', undefined, { auto: false });
  const load = useCallback(async () => { setError(''); try { setData(await getProfile(String(id))); } catch (e: any) { setError(e.message); } }, [id, me?.id]);
  useEffect(() => { load(); }, [load]);
  const setPosts = useCallback((fn: (l: PostSummary[] | null) => PostSummary[] | null) => setData((d) => (d ? { ...d, posts: fn(d.posts) ?? [] } : d)), []);
  usePostBus(setPosts);

  const nav = { title: 'Profile', back: 'Back', onBack: back };
  if (error && !data) return <Screen nav={nav}><EmptyState icon="user" title="Can’t show this profile" body={error} action={{ title: 'Try again', onPress: load }} /></Screen>;
  if (!data) return <Screen nav={nav}><Spinner /></Screen>;
  const u = data.user;
  const menu = () => sheet.open(undefined, <MenuSheet items={[
    { icon: 'flag', title: 'Report profile', red: true, run: () => gate(() => sheet.open('Report', <ReportSheet kind="user" id={u.id} onClose={sheet.close} onDone={() => {}} />)) },
    data.blocked
      ? { icon: 'block', title: `Unblock ${u.name}`, run: async () => { sheet.close(); try { await unblockUser(u.id); toast(`${u.name} unblocked`); load(); } catch (e: any) { toast(e.message); } } }
      : { icon: 'block', title: `Block ${u.name}`, red: true, run: () => gate(() => sheet.open('Block this person?', <BlockSheet author={u} onClose={sheet.close} onDone={load} />)) },
  ]} />);
  return (
    <Screen tour={tour} nav={{ ...nav, right: u.mine ? <IconButton icon="edit" label="Edit your profile" onPress={() => go('/community/account')} /> : <TourTarget id="more"><IconButton icon="more" label="More: report or block" onPress={menu} /></TourTarget> }}>
      <TourTarget id="who"><ProfileHeader a={u} createdAt={u.createdAt} /></TourTarget>
      <StatRow karma={u.karma} posts={u.posts} comments={u.comments} />
      {data.blocked ? <Note tone="grey" actions={<Button size="sm" kind="tint" title="Unblock" onPress={async () => { try { await unblockUser(u.id); load(); } catch (e: any) { toast(e.message); } }} />}>You blocked this person, so their posts and comments are hidden.</Note> : (
        <>
          <View style={{ marginTop: 8 }}><Segmented options={TABS} value={tab} onChange={setTab} /></View>
          <View style={{ gap: 10, marginTop: 12 }}>
            {tab === 'Posts' ? (
              data.posts.length ? data.posts.map((p) => <PostCard key={p.id} p={p} onChange={(x) => setData((d) => (d ? { ...d, posts: d.posts.map((y) => (y.id === x.id ? x : y)) } : d))} onRemoved={(pid) => setData((d) => (d ? { ...d, posts: d.posts.filter((y) => y.id !== pid) } : d))} />)
                : <EmptyState small icon="doc" title="No posts yet" />
            ) : data.comments.length ? data.comments.map((c) => (
              <Pressable key={c.id} onPress={() => go(`/community/post/${c.postId}`)} accessibilityRole="button" accessibilityLabel={`Comment on ${c.postTitle}: ${c.body}`}
                style={({ pressed }) => ({ backgroundColor: t.card, borderRadius: radius.card - 2, padding: 16, opacity: pressed ? 0.85 : 1 })}>
                <T tone="text2" numberOfLines={1} style={font.caption}>{`On “${c.postTitle}”`}</T>
                <T numberOfLines={4} style={[font.sub, { marginTop: 6 }]}>{c.body}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <Icon name="up" size={13} color={c.score > 0 ? vc.up : t.text2} weight="bold" />
                  <T tone="text2" style={[font.caption, { fontWeight: '600' }]}>{`${c.score} · ${timeAgo(c.createdAt)}${c.accepted ? ' · accepted answer' : ''}`}</T>
                </View>
              </Pressable>
            )) : <EmptyState small icon="chat" title="No comments yet" />}
          </View>
        </>
      )}
    </Screen>
  );
}

export function CommunitySavedScreen() {
  const { user, ready } = useCommunityUser();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  usePostBus(setPosts);
  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try { const r = await getSaved(); setPosts(r.posts); setNext(r.next); } catch (e: any) { setError(e.message); setPosts((p) => p ?? []); }
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);
  const nav = { title: 'Saved posts', back: 'Back', onBack: back };
  if (ready && !user) return <Screen nav={nav}><EmptyState icon="bookmark" title="Sign in to save posts" body="Saved posts are kept with your community account." action={{ title: 'Account', onPress: () => go('/community/account') }} /></Screen>;
  return (
    <Screen nav={nav}>
      {error ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Try again" onPress={load} />}>{error}</Note> : null}
      {posts === null ? <Spinner /> : posts.length ? (
        <View style={{ gap: 10 }}>
          {posts.map((p) => <PostCard key={p.id} p={p} onChange={(x) => setPosts((l) => (l ? (x.saved ? l.map((y) => (y.id === x.id ? x : y)) : l.filter((y) => y.id !== x.id)) : l))} onRemoved={(pid) => setPosts((l) => (l ? l.filter((y) => y.id !== pid) : l))} />)}
          {next ? <Button block kind="ghost" title="Show more" busy={more} onPress={async () => { setMore(true); try { const r = await getSaved(next); setPosts((l) => mergePage(l ?? [], r.posts)); setNext(r.next); } catch (e: any) { setError(e.message); } finally { setMore(false); } }} /> : null}
        </View>
      ) : !error ? <EmptyState icon="bookmark" title="Nothing saved yet" body="Tap the bookmark on a post to keep it here. Only you can see this list." /> : null}
    </Screen>
  );
}

export function CommunityNotificationsScreen() {
  const { user, ready } = useCommunityUser();
  const t = useTheme();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const r = await getNotifications(); setItems(r.items);
      if (r.unread) { await readNotifications(); refreshMe().catch(() => {}); }
    } catch (e: any) { setError(e.message); setItems((x) => x ?? []); }
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);
  const nav = { title: 'Notifications', back: 'Back', onBack: back };
  if (ready && !user) return <Screen nav={nav}><EmptyState icon="bell" title="Sign in to see notifications" action={{ title: 'Account', onPress: () => go('/community/account') }} /></Screen>;
  return (
    <Screen nav={nav}>
      {error ? <Note tone="amber" actions={<Button size="sm" kind="tint" title="Try again" onPress={load} />}>{error}</Note> : null}
      {items === null ? <Spinner /> : items.length ? (
        <View style={{ gap: 10 }}>
          {items.map((n) => (
            <Pressable key={n.id} onPress={() => go(`/community/post/${n.postId}`)} accessibilityRole="button" accessibilityLabel={`${n.read ? '' : 'New. '}${n.title}. ${n.text}`}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 18, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: n.kind === 'milestone' ? t.pastel.butter : t.pastel.sky, alignItems: 'center', justifyContent: 'center' }}><Icon name={n.kind === 'milestone' ? 'up' : 'reply'} size={20} color={t.ink} weight="bold" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={[font.callout, { fontWeight: '600' }]}>{n.title}</T>
                <T tone="text2" numberOfLines={2} style={[font.foot, { marginTop: 2 }]}>{n.text}</T>
                <T tone="text2" style={[font.caption, { marginTop: 4 }]}>{timeAgo(n.at)}</T>
              </View>
              {n.read ? null : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.red }} />}
            </Pressable>
          ))}
        </View>
      ) : !error ? <EmptyState icon="bell" title="No notifications yet" body="You’ll see replies to your posts and comments here, and upvote milestones." /> : null}
    </Screen>
  );
}
