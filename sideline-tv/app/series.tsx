import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadSettings } from '../src/store';
import { portalFor, type Season } from '../src/portal';
import { C } from '../src/theme';
import { setQueue } from '../src/queue';

export default function Series() {
  const insets = useSafeAreaInsets();
  const { id, name, category, logo } = useLocalSearchParams<{ id: string; name: string; category: string; logo?: string }>();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [pick, setPick] = useState(0);
  const [err, setErr] = useState('');

  async function load() {
    setErr(''); setSeasons(null);
    try { setSeasons(await portalFor(await loadSettings()).seasons(String(id), String(category || ''))); }
    catch (e: any) { setErr(e.message || String(e)); }
  }
  useEffect(() => { load(); }, []);
  const season = seasons?.[pick];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={{ color: C.dim, fontSize: 16 }}>‹ Back</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, alignItems: 'center' }}>
        {logo ? <Image source={String(logo)} style={{ width: 70, height: 104, borderRadius: 10, marginRight: 14, backgroundColor: C.card }} contentFit="cover" /> : null}
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', flex: 1 }}>{name}</Text>
      </View>
      {err ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: C.dim, textAlign: 'center' }}>{err}</Text>
          <Pressable onPress={load} style={{ marginTop: 14, backgroundColor: C.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text></Pressable>
        </View>
      ) : !seasons ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : !seasons.length ? (
        <Text style={{ color: C.dim, textAlign: 'center', marginTop: 30 }}>No episodes found for this show.</Text>
      ) : (
        <>
          <View style={{ height: 44 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {seasons.map((s, i) => (
                <Pressable key={s.id} onPress={() => setPick(i)} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, marginRight: 8, backgroundColor: pick === i ? C.accent : 'transparent', borderWidth: 1, borderColor: pick === i ? C.accent : C.line }}>
                  <Text style={{ color: pick === i ? '#fff' : C.dim, fontWeight: '600' }}>{s.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={season?.episodes || []} keyExtractor={(e, i) => season!.id + ':' + e.n + ':' + i}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => {
                const all = seasons!.flatMap(se => se.episodes.map(e => ({ cmd: e.cmd, name: `${name} · ${se.name} · ${e.name}`, opts: { episode: e.series, movieId: String(id), category: String(category || ''), seasonId: e.seasonId, episodeId: e.episodeId || undefined } })));
                const at = seasons!.slice(0, pick).reduce((n, se) => n + se.episodes.length, 0) + season!.episodes.indexOf(item);
                setQueue(all, at);
                router.push({ pathname: '/player', params: { kind: 'movie', q: '1' } });
              }}
                style={({ pressed }) => ({ padding: 14, marginBottom: 8, borderRadius: 14, backgroundColor: pressed ? C.cardHi : C.card })}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>▶  {item.name}</Text>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}
