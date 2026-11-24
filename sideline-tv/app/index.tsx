import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isReady, useSettings } from '../src/store';
import { portalFor, type Category, type Channel, type Movie } from '../src/portal';
import { C } from '../src/theme';

// Kept while the app is open, so coming back from the player doesn't reload anything.
const mem: { key?: string; live?: { categories: string[]; channels: Channel[] }; vodCats?: Category[]; vod: Record<string, { items: Movie[]; page: number; hasMore: boolean }> } = { vod: {} };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, marginRight: 8, backgroundColor: on ? C.accent : 'transparent', borderWidth: 1, borderColor: on ? C.accent : C.line }}>
      <Text numberOfLines={1} style={{ color: on ? '#fff' : C.dim, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function Message({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ padding: 28, alignItems: 'center' }}>
      <Text style={{ color: C.dim, textAlign: 'center', fontSize: 15, lineHeight: 21 }}>{text}</Text>
      {action ? (
        <Pressable onPress={onAction} style={{ marginTop: 16, backgroundColor: C.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = useSettings();
  const ready = isReady(settings);
  const [tab, setTab] = useState<'live' | 'movies'>('live');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, bump] = useState(0);
  const [liveCat, setLiveCat] = useState('All');
  const [search, setSearch] = useState('');
  const [vodCat, setVodCat] = useState<string | null>(null);

  const key = settings ? JSON.stringify(settings) : '';
  if (mem.key !== key) { mem.key = key; mem.live = undefined; mem.vodCats = undefined; mem.vod = {}; }
  const portal = ready ? portalFor(settings!) : null;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); bump(n => n + 1); }
  }, []);

  const loadLive = useCallback(() => portal && run(async () => { mem.live = await portal.channels(); }), [portal, run]);
  const loadVodCats = useCallback(() => portal && run(async () => {
    mem.vodCats = await portal.vodCategories();
    if (mem.vodCats[0]) setVodCat(c => c || mem.vodCats![0].id);
  }), [portal, run]);
  const loadMovies = useCallback((cat: string, more = false) => portal && run(async () => {
    const cur = mem.vod[cat];
    const page = more && cur ? cur.page + 1 : 1;
    const r = await portal.movies(cat, page);
    mem.vod[cat] = { items: more && cur ? [...cur.items, ...r.items] : r.items, page, hasMore: r.hasMore };
  }), [portal, run]);

  useEffect(() => { if (ready && tab === 'live' && !mem.live && !busy) loadLive(); }, [ready, tab, key]);
  useEffect(() => { if (ready && tab === 'movies' && !mem.vodCats && !busy) loadVodCats(); }, [ready, tab, key]);
  useEffect(() => { if (ready && tab === 'movies' && vodCat && !mem.vod[vodCat] && !busy) loadMovies(vodCat); }, [ready, tab, vodCat, key]);

  const shown = useMemo(() => {
    const list = mem.live?.channels || [];
    const q = search.trim().toLowerCase();
    return list.filter(c => (liveCat === 'All' || c.category === liveCat) && (!q || c.name.toLowerCase().includes(q)));
  }, [mem.live, liveCat, search]);

  const play = (cmd: string, name: string, kind: 'live' | 'movie') => router.push({ pathname: '/player', params: { cmd, name, kind } });
  const cols = width > 700 ? 5 : 3;
  const tile = (width - 32 - (cols - 1) * 10) / cols;
  const movies = vodCat ? mem.vod[vodCat] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 }}>
        <View style={{ width: 22, height: 8, backgroundColor: C.accent, borderRadius: 2, transform: [{ skewX: '-20deg' }], marginRight: 10 }} />
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: 0.5, flex: 1 }}>SIDELINE<Text style={{ color: C.accent }}>.</Text></Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} style={{ padding: 6 }}>
          <Text style={{ color: C.dim, fontSize: 22 }}>⚙︎</Text>
        </Pressable>
      </View>

      {!ready ? (
        <Message text={'Open Sideline in Safari and tap "Open in Sideline TV" under Your IPTV — your saved portal details come across in one tap.\n\nOr enter them here.'} action="Enter details" onAction={() => router.push('/settings')} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 999, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
            {(['live', 'movies'] as const).map(t => (
              <Pressable key={t} onPress={() => setTab(t)} style={{ paddingHorizontal: 22, paddingVertical: 9, borderRadius: 999, backgroundColor: tab === t ? C.accent : 'transparent' }}>
                <Text style={{ color: tab === t ? '#fff' : C.dim, fontWeight: '700', fontSize: 15 }}>{t === 'live' ? 'Live TV' : 'Movies'}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'live' ? (
            <>
              <TextInput value={search} onChangeText={setSearch} placeholder="Search channels" placeholderTextColor="#5f5a7d" autoCorrect={false}
                style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }} />
              {mem.live ? (
                <View style={{ height: 44 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                    {['All', ...mem.live.categories].map(c => <Chip key={c} label={c} on={liveCat === c} onPress={() => setLiveCat(c)} />)}
                  </ScrollView>
                </View>
              ) : null}
              <FlatList
                data={shown} keyExtractor={c => c.id} initialNumToRender={20} windowSize={9}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
                ListEmptyComponent={busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : err ? <Message text={err} action="Try again" onAction={loadLive} /> : mem.live ? <Message text="No channels here." /> : undefined}
                renderItem={({ item }) => (
                  <Pressable onPress={() => play(item.cmd, item.name, 'live')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 8, borderRadius: 14, backgroundColor: pressed ? C.cardHi : C.card })}>
                    <View style={{ width: 52, height: 38, borderRadius: 8, backgroundColor: '#100e1d', marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {item.logo ? <Image source={item.logo} style={{ width: 52, height: 38 }} contentFit="contain" /> : <Text style={{ color: C.dim, fontSize: 11 }}>{item.number}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{item.name}</Text>
                      <Text numberOfLines={1} style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{item.category}</Text>
                    </View>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <>
              {mem.vodCats ? (
                <View style={{ height: 44 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                    {mem.vodCats.map(c => <Chip key={c.id} label={c.title} on={vodCat === c.id} onPress={() => setVodCat(c.id)} />)}
                  </ScrollView>
                </View>
              ) : null}
              <FlatList
                key={'grid' + cols} data={movies?.items || []} numColumns={cols} keyExtractor={m => m.id}
                columnWrapperStyle={{ gap: 10 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
                onEndReachedThreshold={0.6}
                onEndReached={() => { if (vodCat && movies?.hasMore && !busy) loadMovies(vodCat, true); }}
                ListEmptyComponent={busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : err ? <Message text={err} action="Try again" onAction={() => (mem.vodCats ? vodCat && loadMovies(vodCat) : loadVodCats())} /> : undefined}
                ListFooterComponent={busy && movies?.items.length ? <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} /> : undefined}
                renderItem={({ item }) => (
                  <Pressable onPress={() => item.series ? router.push({ pathname: '/series', params: { id: item.id, name: item.name, category: item.category, logo: item.logo } }) : play(item.cmd, item.name, 'movie')} style={{ width: tile, marginBottom: 14 }}>
                    <View style={{ width: tile, height: tile * 1.5, borderRadius: 12, backgroundColor: C.card, overflow: 'hidden' }}>
                      {item.logo ? <Image source={item.logo} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} /> : null}
                    </View>
                    <Text numberOfLines={2} style={{ color: C.text, fontSize: 12, marginTop: 6 }}>{item.name}{item.year ? ` (${item.year})` : ''}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
