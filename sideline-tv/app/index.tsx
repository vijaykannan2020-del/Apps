import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCache, isReady, setCache, useSettings } from '../src/store';
import { portalFor, type Category, type Channel, type Movie } from '../src/portal';
import { C } from '../src/theme';
import { lookup, type Hit } from '../src/tmdb';
import { CategoryButton, CategoryPicker } from '../src/CategoryPicker';
import release from '../src/release.json';

// Kept while the app is open, so coming back from the player doesn't reload anything.
const mem: { key?: string; live?: { categories: string[]; channels: Channel[] }; vodCats?: Category[]; vod: Record<string, { items: Movie[]; page: number; hasMore: boolean }> } = { vod: {} };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, marginRight: 8, backgroundColor: on ? C.accent : 'transparent', borderWidth: 1, borderColor: on ? C.accent : C.line }}>
      <Text numberOfLines={1} style={{ color: on ? '#fff' : C.dim, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const LANGS = ['All', 'Tamil', 'English', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'];
const LANG_KEYS: Record<string, RegExp> = {
  Tamil: /tamil|\bta\b|\btam\b/i, English: /english|\ben\b|\beng\b|\buk\b|\busa?\b/i, Hindi: /hindi|\bhin\b|bollywood/i,
  Telugu: /telugu|\btel\b|tollywood/i, Malayalam: /malayalam|\bmal\b/i, Kannada: /kannada|\bkan\b/i,
};
const matchLang = (lang: string, ...texts: string[]) => lang === 'All' || texts.some(t => LANG_KEYS[lang]?.test(t));
const SERIES_WORDS = /show|series|web|drama|season|serial/i;

// One movie / show per row: TMDB poster when a key is set (portal pictures often don't load), title, year.
function MovieRow({ item, onPress }: { item: Movie; onPress: () => void }) {
  const [hit, setHit] = useState<Hit | null>(null);
  useEffect(() => { let alive = true; lookup(item.name, item.series ? 'tv' : 'movie').then(h => alive && setHit(h)); return () => { alive = false; }; }, [item.id]);
  const poster = hit?.poster || item.logo;
  const year = item.year && item.year !== '0' ? item.year : hit?.year || '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 8, marginBottom: 8, borderRadius: 14, backgroundColor: pressed ? C.cardHi : C.card })}>
      <View style={{ width: 54, height: 80, borderRadius: 8, backgroundColor: '#100e1d', overflow: 'hidden', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
        {poster ? <Image source={poster} style={{ width: 54, height: 80 }} contentFit="cover" transition={150} /> : <Text style={{ color: C.dim, fontSize: 20 }}>{item.series ? '▤' : '▶'}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{item.name}</Text>
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{[year, item.series ? 'Series · episodes ›' : 'Movie'].filter(Boolean).join(' · ')}</Text>
      </View>
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
  const [liveBusy, setLiveBusy] = useState(false);
  const [vodBusy, setVodBusy] = useState(false);
  const [liveErr, setLiveErr] = useState('');
  const [vodErr, setVodErr] = useState('');
  const [status, setStatus] = useState('');
  const [, bump] = useState(0);
  const [liveCat, setLiveCat] = useState('All');
  const [search, setSearch] = useState('');
  const [vodCat, setVodCat] = useState<string | null>(null);
  const [lang, setLangState] = useState('All');
  const [picker, setPicker] = useState<'' | 'live' | 'vod'>('');
  const [mq, setMq] = useState('');                 // movie search text
  const [res, setRes] = useState<{ q: string; items: Movie[]; page: number; hasMore: boolean; total: number } | null>(null);
  const [resBusy, setResBusy] = useState(false);
  const [resErr, setResErr] = useState('');
  useEffect(() => { AsyncStorage.getItem('sideline-tv.lang').then(v => v && LANGS.includes(v) && setLangState(v)).catch(() => {}); }, []);
  const setLang = (l: string) => { setLangState(l); setLiveCat('All'); AsyncStorage.setItem('sideline-tv.lang', l).catch(() => {}); };

  const key = settings ? JSON.stringify({ p: settings.portal, m: settings.mac }) : '';
  if (mem.key !== key) { mem.key = key; mem.live = undefined; mem.vodCats = undefined; mem.vod = {}; }
  const portal = ready ? portalFor(settings!) : null;
  if (portal) {
    portal.onStatus = setStatus;
    portal.onEndpoint = ep => setCache('endpoint', key, ep);
  }

  // Remembered login address + saved lists: show instantly, refresh in the background when old.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!ready || !portal) return;
    let alive = true;
    (async () => {
      const ep = await getCache<string>('endpoint', key);
      if (ep && !portal.knownEndpoint) portal.knownEndpoint = ep.data;
      const live = await getCache<{ categories: string[]; channels: Channel[] }>('live', key);
      if (live && !mem.live) mem.live = live.data;
      const cats = await getCache<Category[]>('vodcats', key);
      if (cats && !mem.vodCats) { mem.vodCats = cats.data; if (cats.data[0]) setVodCat(c => c || cats.data[0].id); }
      if (alive) { setWarm(true); bump(n => n + 1); }
      // Channel lists change rarely: refresh quietly if the saved one is older than 12 hours.
      if (live && Date.now() - live.at > 12 * 3600e3) loadLive(true);
    })();
    return () => { alive = false; };
  }, [ready, key]);

  const loadLive = useCallback(async (quiet = false) => {
    if (!portal) return;
    if (!quiet) { setLiveBusy(true); setLiveErr(''); }
    try { mem.live = await portal.channels(); setCache('live', key, mem.live); }
    catch (e: any) { if (!quiet || !mem.live) setLiveErr(e.message || String(e)); }
    finally { setLiveBusy(false); setStatus(''); bump(n => n + 1); }
  }, [portal, key]);
  const loadVodCats = useCallback(async () => {
    if (!portal) return;
    setVodBusy(true); setVodErr('');
    try {
      mem.vodCats = await portal.vodCategories(); setCache('vodcats', key, mem.vodCats);
      if (mem.vodCats[0]) setVodCat(c => c || mem.vodCats![0].id);
    } catch (e: any) { setVodErr(e.message || String(e)); }
    finally { setVodBusy(false); bump(n => n + 1); }
  }, [portal, key]);
  const loadMovies = useCallback(async (cat: string, more = false) => {
    if (!portal) return;
    setVodBusy(true); setVodErr('');
    try {
      const cur = mem.vod[cat];
      const page = more && cur ? cur.page + 1 : 1;
      const title = mem.vodCats?.find(c => c.id === cat)?.title || '';
      const r = await portal.movies(cat, page, SERIES_WORDS.test(title));
      mem.vod[cat] = { items: more && cur ? [...cur.items, ...r.items] : r.items, page, hasMore: r.hasMore };
    } catch (e: any) { setVodErr(e.message || String(e)); }
    finally { setVodBusy(false); bump(n => n + 1); }
  }, [portal]);

  const isSeriesCat = (id: string) => SERIES_WORDS.test(mem.vodCats?.find(c => c.id === id)?.title || '');
  const searchMovies = useCallback(async (q: string, more = false) => {
    if (!portal) return;
    setResBusy(true); setResErr('');
    try {
      const page = more && res && res.q === q ? res.page + 1 : 1;
      const r = await portal.searchMovies(q, page, isSeriesCat);
      setRes(prev => ({ q, page, hasMore: r.hasMore, total: r.total, items: more && prev && prev.q === q ? [...prev.items, ...r.items] : r.items }));
    } catch (e: any) { setResErr(e.message || String(e)); }
    finally { setResBusy(false); }
  }, [portal, res]);
  // Search as you type (waits until you pause typing).
  useEffect(() => {
    const q = mq.trim();
    if (q.length < 2) { setRes(null); setResErr(''); return; }
    const t = setTimeout(() => searchMovies(q), 600);
    return () => clearTimeout(t);
  }, [mq]);

  useEffect(() => { if (warm && tab === 'live' && !mem.live && !liveBusy) loadLive(); }, [warm, tab, key]);
  useEffect(() => { if (warm && tab === 'movies' && !mem.vodCats && !vodBusy) loadVodCats(); }, [warm, tab, key]);
  useEffect(() => { if (warm && tab === 'movies' && vodCat && !mem.vod[vodCat] && !vodBusy && !vodErr) loadMovies(vodCat); }, [warm, tab, vodCat, key, vodBusy, vodErr]);

  const shown = useMemo(() => {
    const list = mem.live?.channels || [];
    const q = search.trim().toLowerCase();
    return list.filter(c => matchLang(lang, c.category, c.name) && (liveCat === 'All' || c.category === liveCat) && (!q || c.name.toLowerCase().includes(q)));
  }, [mem.live, liveCat, search, lang]);
  const liveCats = useMemo(() => (mem.live?.categories || []).filter(c => lang === 'All' || matchLang(lang, c)), [mem.live, lang]);
  const liveCounts = useMemo(() => { const m: Record<string, number> = {}; for (const c of mem.live?.channels || []) m[c.category] = (m[c.category] || 0) + 1; return m; }, [mem.live]);
  const vodCats = useMemo(() => (mem.vodCats || []).filter(c => matchLang(lang, c.title)), [mem.vodCats, lang]);
  useEffect(() => { if (vodCats.length && !vodCats.some(c => c.id === vodCat)) { setVodErr(''); setVodCat(vodCats[0].id); } }, [vodCats]);

  const play = (cmd: string, name: string, kind: 'live' | 'movie', id = '', category = '') => router.push({ pathname: '/player', params: { cmd, name, kind, id, category } });
  const cols = width > 700 ? 5 : 3;
  const tile = (width - 32 - (cols - 1) * 10) / cols;
  const movies = vodCat && vodCats.some(c => c.id === vodCat) ? mem.vod[vodCat] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 }}>
        <View style={{ width: 22, height: 8, backgroundColor: C.accent, borderRadius: 2, transform: [{ skewX: '-20deg' }], marginRight: 10 }} />
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: 0.5, flex: 1 }}>SIDELINE<Text style={{ color: C.accent }}>.</Text></Text>
        <Text style={{ color: C.dim, fontSize: 12, marginRight: 10 }}>v1.{release.n}</Text>
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

          <View style={{ height: 40, marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}>
              {LANGS.map(l => (
                <Pressable key={l} onPress={() => setLang(l)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, marginRight: 8, backgroundColor: lang === l ? '#ffffff' : C.card }}>
                  <Text style={{ color: lang === l ? C.bg : C.dim, fontWeight: '700', fontSize: 13 }}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {tab === 'live' ? (
            <>
              <TextInput value={search} onChangeText={setSearch} placeholder="Search channels" placeholderTextColor="#5f5a7d" autoCorrect={false}
                style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }} />
              {mem.live ? <CategoryButton label={liveCat === 'All' ? 'All channels' : liveCat} onPress={() => setPicker('live')} /> : null}
              <CategoryPicker visible={picker === 'live'} title="TV categories" selected={liveCat} onClose={() => setPicker('')} onPick={setLiveCat}
                items={[{ id: 'All', title: 'All channels', count: (mem.live?.channels || []).filter(c => matchLang(lang, c.category, c.name)).length },
                  ...liveCats.map(c => ({ id: c, title: c, count: liveCounts[c] || 0 }))]} />
              <FlatList
                data={shown} keyExtractor={c => c.id} initialNumToRender={20} windowSize={9}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
                ListEmptyComponent={liveBusy || !warm ? <View style={{ alignItems: 'center', marginTop: 40 }}><ActivityIndicator color={C.accent} /><Text style={{ color: C.dim, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 }}>{status}</Text></View> : liveErr ? <Message text={liveErr} action="Try again" onAction={() => loadLive()} /> : mem.live ? <Message text="No channels here." /> : undefined}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10 }}>
                <TextInput value={mq} onChangeText={setMq} placeholder="Search movies & series" placeholderTextColor="#5f5a7d" autoCorrect={false} returnKeyType="search"
                  onSubmitEditing={() => mq.trim().length >= 2 && searchMovies(mq.trim())}
                  style={{ flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }} />
                {mq ? <Pressable onPress={() => setMq('')} hitSlop={10} style={{ marginLeft: 10 }}><Text style={{ color: C.dim, fontSize: 15 }}>Clear</Text></Pressable> : null}
              </View>
              {mq.trim().length >= 2 ? (
                <FlatList
                  data={res?.q === mq.trim() || res ? res?.items || [] : []} keyExtractor={(m, i) => m.id + ':' + i} initialNumToRender={14} windowSize={9} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 24 }}
                  onEndReachedThreshold={0.6}
                  onEndReached={() => { if (res?.hasMore && !resBusy) searchMovies(res.q, true); }}
                  ListHeaderComponent={res && !resBusy ? <Text style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{res.total || res.items.length} result{(res.total || res.items.length) === 1 ? '' : 's'} for "{res.q}"</Text> : undefined}
                  ListEmptyComponent={resBusy ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : resErr ? <Message text={resErr} action="Try again" onAction={() => searchMovies(mq.trim())} /> : res ? <Message text={'Nothing found for "' + res.q + '". Try fewer words or a different spelling.'} /> : undefined}
                  ListFooterComponent={resBusy && res?.items.length ? <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} /> : undefined}
                  renderItem={({ item }) => (
                    <MovieRow item={item} onPress={() => item.series ? router.push({ pathname: '/series', params: { id: item.id, name: item.name, category: item.category, logo: item.logo } }) : play(item.cmd, item.name, 'movie', item.id, item.category)} />
                  )}
                />
              ) : (
              <>
              {mem.vodCats && vodCats.length ? <CategoryButton label={vodCats.find(c => c.id === vodCat)?.title || 'Pick a category'} onPress={() => setPicker('vod')} /> : null}
              <CategoryPicker visible={picker === 'vod'} title="Movie & series categories" selected={vodCat} onClose={() => setPicker('')}
                onPick={id => { setVodErr(''); setVodCat(id); }} items={vodCats.map(c => ({ id: c.id, title: c.title }))} />
              <FlatList
                data={movies?.items || []} keyExtractor={m => m.id} initialNumToRender={14} windowSize={9}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
                onEndReachedThreshold={0.6}
                onEndReached={() => { if (vodCat && movies?.hasMore && !vodBusy) loadMovies(vodCat, true); }}
                ListEmptyComponent={mem.vodCats && !vodCats.length ? <Message text={'No ' + lang + ' categories on your portal. Pick another language.'} /> : vodBusy || !warm ? <View style={{ alignItems: 'center', marginTop: 40 }}><ActivityIndicator color={C.accent} /><Text style={{ color: C.dim, marginTop: 12 }}>{status}</Text></View> : vodErr ? <Message text={vodErr} action="Try again" onAction={() => (mem.vodCats ? vodCat && loadMovies(vodCat) : loadVodCats())} /> : undefined}
                ListFooterComponent={vodBusy && movies?.items.length ? <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} /> : undefined}
                renderItem={({ item }) => (
                  <MovieRow item={item} onPress={() => item.series ? router.push({ pathname: '/series', params: { id: item.id, name: item.name, category: item.category, logo: item.logo } }) : play(item.cmd, item.name, 'movie', item.id, item.category)} />
                )}
              />
              </>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
