// Media, links and docs shared in a chat — like WhatsApp's "Media, links and docs".
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Linking, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { S, roomName, mediaSource, loadShared, classifyShared, SharedItem, memberName } from '@/lib/matrix';
import { DuoBar } from '@/components/DuoBar';
import { useTheme } from '@/lib/theme';
import { PhotoViewer } from '@/components/PhotoViewer';
import { VideoPlayer } from '@/components/Media';

type Tab = 'media' | 'link' | 'doc';
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export default function SharedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = S.rooms.get(id!);
  const t = useTheme(); const ins = useSafeAreaInsets(); const { width: winW } = useWindowDimensions();
  const [width, setW] = useState(0); // the column's real width (not the whole screen) — the grid fits the page it's in
  const [tab, setTab] = useState<Tab>('media');
  const [items, setItems] = useState<SharedItem[]>(() => (r ? classifyShared([...r.events].reverse()) : []));
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<any>(null);
  useEffect(() => { if (r) loadShared(r).then(setItems).finally(() => setLoading(false)); }, [id]);
  const list = useMemo(() => items.filter(x => x.kind === tab), [items, tab]);
  const counts = useMemo(() => ({ media: items.filter(x => x.kind === 'media').length, link: items.filter(x => x.kind === 'link').length, doc: items.filter(x => x.kind === 'doc').length }), [items]);
  if (!r) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const w = width || winW;
  const cols = w > 900 ? 6 : w > 600 ? 5 : w > 420 ? 4 : 3; const cell = Math.floor((w - 4 * (cols - 1)) / cols);

  async function openDoc(c: any) {
    const src = mediaSource(c.url); if (!src) return;
    try {
      const f = new File(Paths.cache, (c.body || 'file').replace(/[\\/:*?"<>|]/g, '_'));
      if (f.exists) f.delete();
      const out = await File.downloadFileAsync(src.uri, f, { headers: src.headers });
      await Sharing.shareAsync(out.uri);
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 4 }} onLayout={e => setW(Math.round(e.nativeEvent.layout.width))}>
      <DuoBar />
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>{roomName(r)}</Text>
          <Text style={{ color: t.soft, fontSize: 13 }}>{loading ? 'Looking through older messages…' : 'Media, links and docs'}</Text>
        </View>
        {loading && <ActivityIndicator />}
      </View>
      <View style={[styles.seg, { backgroundColor: t.fill }]}>
        {(['media', 'link', 'doc'] as Tab[]).map(k => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && { backgroundColor: t.dark ? '#636366' : '#fff' }]}>
            <Text style={{ color: t.ink, fontWeight: tab === k ? '700' : '500' }}>{k === 'media' ? 'Media' : k === 'link' ? 'Links' : 'Docs'}{counts[k] ? ` ${counts[k]}` : ''}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'media' ? (
        <FlatList key={'g' + cols} data={list} numColumns={cols} keyExtractor={x => x.ev.event_id} columnWrapperStyle={{ gap: 4 }}
          contentContainerStyle={{ gap: 4, paddingBottom: ins.bottom + 20 }}
          ListEmptyComponent={!loading ? <Text style={[styles.empty, { color: t.soft }]}>No photos or videos yet</Text> : undefined}
          renderItem={({ item }) => {
            const c = item.ev.content || {}; const vid = c.msgtype === 'm.video';
            const thumb = mediaSource(vid ? c.info?.thumbnail_url || c.url : c.url, 320);
            return (
              <Pressable onPress={() => vid ? setVideo(c) : setPhoto(c.url)} style={{ width: cell, height: cell, backgroundColor: t.fill }}>
                {thumb && <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.ev.event_id} />}
                {vid && <View style={styles.vidTag}><Ionicons name="videocam" size={12} color="#fff" /></View>}
              </Pressable>
            );
          }} />
      ) : (
        <FlatList data={list} keyExtractor={(x, i) => x.ev.event_id + i}
          contentContainerStyle={{ paddingBottom: ins.bottom + 20 }}
          ListEmptyComponent={!loading ? <Text style={[styles.empty, { color: t.soft }]}>{tab === 'link' ? 'No links yet' : 'No documents yet'}</Text> : undefined}
          renderItem={({ item }) => {
            const c = item.ev.content || {};
            const who = item.ev.sender === S.userId ? 'You' : memberName(r, item.ev.sender);
            const host = item.url ? item.url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') : '';
            return (
              <Pressable onPress={() => item.url ? Linking.openURL(item.url) : openDoc(c)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent', borderBottomColor: t.line }]}>
                <View style={[styles.rowIcon, { backgroundColor: t.fill }]}><Ionicons name={item.kind === 'link' ? 'link' : 'document-text'} size={20} color={t.ink} /></View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>{item.kind === 'link' ? host : c.body || 'File'}</Text>
                  <Text numberOfLines={1} style={{ color: item.kind === 'link' ? t.blue : t.soft, fontSize: 13, marginTop: 1 }}>{item.kind === 'link' ? item.url : `${c.info?.size ? Math.max(1, Math.round(c.info.size / 1024)) + ' KB · ' : ''}${(c.info?.mimetype || '').split('/')[1] || 'file'}`}</Text>
                  <Text style={{ color: t.soft, fontSize: 12, marginTop: 2 }}>{who} · {fmtDate(item.ev.origin_server_ts)}</Text>
                </View>
              </Pressable>
            );
          }} />
      )}
      <PhotoViewer mxc={photo} onClose={() => setPhoto(null)} />
      <Modal visible={!!video} animationType="fade" onRequestClose={() => setVideo(null)} presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          {video && (() => { const src = mediaSource(video.url); return src ? <VideoPlayer uri={src.uri} headers={src.headers} w={w} h={w * 16 / 9 > 800 ? 700 : w * 16 / 9} /> : null; })()}
          <Pressable onPress={() => setVideo(null)} style={[styles.close, { top: ins.top + 10 }]} hitSlop={10}><Ionicons name="close" size={26} color="#fff" /></Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingRight: 90, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  seg: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 10, borderRadius: 10, padding: 2 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  vidTag: { position: 'absolute', left: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', padding: 40, fontSize: 15 },
  close: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
