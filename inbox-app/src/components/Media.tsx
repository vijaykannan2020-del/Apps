// Video, voice note and reel bubbles. Your server needs your login to send media, so headers go with every request.
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { mediaSource, igMediaId } from '@/lib/matrix';
import { Theme } from '@/lib/theme';

export function VideoPlayer({ uri, headers, w, h }: { uri: string; headers: Record<string, string>; w: number; h: number }) {
  const player = useVideoPlayer({ uri, headers }, p => { p.play(); });
  return <VideoView player={player} style={{ width: w, height: h, borderRadius: 16, backgroundColor: '#000' }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture />;
}

export function VideoBubble({ c, maxW, t }: { c: any; maxW: number; t: Theme }) {
  const [playing, setPlaying] = useState(false);
  const info = c.info || {}; const ratio = info.w && info.h ? info.w / info.h : 9 / 16;
  const w = Math.min(maxW, 260); const h = Math.min(w / ratio, 420);
  const src = mediaSource(c.url);
  const thumb = mediaSource(info.thumbnail_url, 640);
  if (playing && src) return <VideoPlayer uri={src.uri} headers={src.headers} w={w} h={h} />;
  return (
    <Pressable onPress={() => setPlaying(true)} style={{ width: w, height: h, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? '#1c1c1e' : '#d8d8dc' }}>
      {thumb && <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
      <View style={styles.playWrap}><View style={styles.play}><Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} /></View></View>
      {!!info.duration && <Text style={styles.dur}>{fmtDur(info.duration)}</Text>}
    </Pressable>
  );
}

export function ReelBubble({ c, link, maxW, t }: { c: any; link: string; maxW: number; t: Theme }) {
  const [playing, setPlaying] = useState(false);
  const info = c.info || {}; const ratio = info.w && info.h ? info.w / info.h : 9 / 16;
  const w = Math.min(maxW, 240); const h = Math.min(w / ratio, 420);
  const isVideo = c.msgtype === 'm.video' && !!c.url;
  const src = isVideo ? mediaSource(c.url) : null;
  const cover = c.msgtype === 'm.image' ? mediaSource(c.url, 640) : mediaSource(info.thumbnail_url, 640);
  const openIg = () => {
    const id = igMediaId(link);
    Linking.openURL(id ? `instagram://media?id=${id}` : link).catch(() => Linking.openURL(link));
  };
  const igButton = (
    <Pressable onPress={openIg} hitSlop={8} style={styles.reelTag} accessibilityLabel="Open in Instagram">
      <Ionicons name="logo-instagram" size={13} color="#fff" /><Text style={styles.reelTxt}>{isVideo ? 'Instagram' : 'Open in Instagram'}</Text>
    </Pressable>
  );
  // The bridge delivered the reel itself → play it right here. Only a cover picture → Instagram has the video.
  if (playing && src) return (
    <View style={{ width: w, height: h }}>
      <VideoPlayer uri={src.uri} headers={src.headers} w={w} h={h} />
      {igButton}
    </View>
  );
  return (
    <Pressable onPress={isVideo ? () => setPlaying(true) : openIg} style={{ width: w, height: h, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? '#1c1c1e' : '#d8d8dc' }}>
      {cover && <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
      <View style={styles.playWrap}><View style={styles.play}><Ionicons name={isVideo ? 'play' : 'logo-instagram'} size={30} color="#fff" style={{ marginLeft: isVideo ? 4 : 0 }} /></View></View>
      {igButton}
      {isVideo && !!info.duration && <Text style={styles.dur}>{fmtDur(info.duration)}</Text>}
    </Pressable>
  );
}

const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function VoicePlayer({ uri, headers, mine, t, durMs }: { uri: string; headers: Record<string, string>; mine: boolean; t: Theme; durMs: number }) {
  const player = useAudioPlayer({ uri, headers });
  const st = useAudioPlayerStatus(player);
  const fg = mine ? t.bubbleOutText : t.ink;
  const total = st.duration ? st.duration * 1000 : durMs;
  const pos = (st.currentTime || 0) * 1000;
  const pct = total ? Math.min(1, pos / total) : 0;
  return (
    <View style={styles.voice}>
      <Pressable hitSlop={8} onPress={() => { if (st.playing) player.pause(); else { if (st.didJustFinish || (total && pos >= total - 200)) player.seekTo(0); player.play(); } }}
        style={[styles.vbtn, { backgroundColor: mine ? (t.dark ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.2)') : t.fill }]}>
        <Ionicons name={st.playing ? 'pause' : 'play'} size={20} color={fg} style={{ marginLeft: st.playing ? 0 : 2 }} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={[styles.track, { backgroundColor: mine ? (t.dark ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.3)') : t.line }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fg }]} />
        </View>
        <Text style={{ color: fg, opacity: 0.7, fontSize: 12, marginTop: 4 }}>{fmtDur(st.playing || pos ? pos : total)}</Text>
      </View>
    </View>
  );
}
export function VoiceBubble({ c, mine, t }: { c: any; mine: boolean; t: Theme }) {
  // WhatsApp copies are Ogg (iPhone can't play it) — use the original iPhone recording when we have it
  const src = mediaSource(c['com.myinbox.playable'] || c.url);
  const dur = c.info?.duration || c['org.matrix.msc1767.audio']?.duration || 0;
  if (!src) return <Text style={{ color: t.soft }}>🎤 Voice message</Text>;
  return <VoicePlayer uri={src.uri} headers={src.headers} mine={mine} t={t} durMs={dur} />;
}

const styles = StyleSheet.create({
  playWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  play: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 8, bottom: 8, color: '#fff', fontSize: 12, fontWeight: '600', backgroundColor: 'rgba(0,0,0,.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  reelTag: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,.45)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  reelTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 220, paddingVertical: 2 },
  vbtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
