// Cast to the TV with AirPlay: iPhone's own player hands the video to an Apple TV, an AirPlay TV,
// or a Fire TV running an AirPlay receiver app (e.g. AirScreen). Only the TV then pulls the stream,
// so it counts as one device on your subscription.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../src/theme';

export default function Cast() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { uri, name, live } = useLocalSearchParams<{ uri: string; name: string; live?: string }>();
  const [tryLive, setTryLive] = useState(false);
  const canPlay = !live || tryLive;
  const player = useVideoPlayer(canPlay ? { uri: String(uri), headers: { 'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3' } } : null, p => {
    p.allowsExternalPlayback = true;
    p.play();
  });
  const [err, setErr] = useState('');
  // Why might a TV refuse this video? Ask the video server the way a TV would (no set-top-box name),
  // and read the video/audio formats from the playlist.
  const [diag, setDiag] = useState('Checking this video for AirPlay…');
  useEffect(() => {
    (async () => {
      const u = String(uri);
      const get = async (url: string, headers: Record<string, string>, range = false) => {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
        try {
          const r = await fetch(url, { headers: range ? { ...headers, Range: 'bytes=0-2047' } : headers, signal: c.signal });
          const ct = r.headers.get('content-type') || '';
          const body = /mpegurl|text|json|html/i.test(ct) || /\.m3u8/i.test(url) ? await r.text() : '';
          return { status: r.status, ct, body };
        } catch (e: any) { return { status: 0, ct: '', body: e?.name === 'AbortError' ? 'timeout' : 'unreachable' }; }
        finally { clearTimeout(t); }
      };
      const tvUA = { 'User-Agent': 'AppleCoreMedia/1.0.0 (Apple TV; U; CPU OS 18_0 like Mac OS X)' };
      const lines: string[] = [];
      const a = await get(u, tvUA);
      lines.push('As a TV: ' + a.status + ' ' + a.ct);
      if (!/\.m3u8/i.test(u) && !/mpegurl/i.test(a.ct)) lines.push('Stream type: ' + (a.ct || 'raw stream') + ' (not an AirPlay playlist)');
      let pl = a.body;
      if (a.status >= 400 || !pl.includes('#EXT')) {
        const b = await get(u, { 'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Safari/533.3' });
        lines.push('As a set-top box: ' + b.status);
        pl = b.body;
      }
      const codecs = [...new Set((pl.match(/CODECS="([^"]+)"/g) || []).map(x => x.slice(8, -1)))];
      const res = [...new Set((pl.match(/RESOLUTION=(\d+x\d+)/g) || []).map(x => x.slice(11)))];
      if (codecs.length) lines.push('Formats: ' + codecs.join(' | '));
      if (res.length) lines.push('Sizes: ' + res.join(', '));
      // First sub-playlist / segment, fetched the TV way.
      const next = pl.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
      if (next) {
        const nu = new URL(next, u).toString();
        const c = await get(nu, tvUA, true);
        lines.push('Next part (' + (nu.split('?')[0].split('.').pop() || '?') + ') as a TV: ' + c.status + ' ' + c.ct);
        if (c.body.includes('#EXT')) {
          const seg = c.body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
          const map = (c.body.match(/#EXT-X-MAP:URI="([^"]+)"/) || [])[1];
          if (/#EXT-X-KEY/.test(c.body)) lines.push('Encrypted: ' + ((c.body.match(/METHOD=([A-Z0-9-]+)/) || [])[1] || 'yes'));
          if (seg) { const su = new URL(seg, nu).toString(); const d = await get(su, tvUA, true); lines.push('Video piece (' + (su.split('?')[0].split('.').pop() || '?') + ') as a TV: ' + d.status + ' ' + d.ct + (map ? ' · fMP4' : '')); }
        }
      }
      setDiag(lines.join('\n'));
    })();
  }, [uri]);
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', ({ status, error }) => { if (status === 'error') setErr(error?.message || 'This video cannot be cast this way.'); });
    return () => sub.remove();
  }, [player]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>✕  Close</Text>
        </Pressable>
        <Text numberOfLines={1} style={{ color: '#fff', marginLeft: 12, flex: 1, fontWeight: '600' }}>{name}</Text>
      </View>
      {canPlay ? (
        <>
          <VideoView player={player} style={{ flex: 1 }} nativeControls allowsPictureInPicture contentFit="contain" />
          <Text style={{ color: '#bbb', textAlign: 'center', padding: 16, paddingBottom: insets.bottom + 16 }}>
            {err ? err + '\n\n' : ''}{diag}{'\n\n'}Tap the video, then the AirPlay icon (▭ with a triangle) and pick your TV.{'\n'}Fire TV: install the free "AirScreen" app on it first.
          </Text>
        </>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12 }}>Casting live TV</Text>
          <Text style={{ color: '#bbb', lineHeight: 21 }}>
            Live channels use a stream format iPhone's AirPlay player can't send. Use Screen Mirroring instead:{'\n\n'}
            1. Go back and play the channel.{'\n'}2. Open Control Center (swipe down from the top-right).{'\n'}3. Tap Screen Mirroring and pick your TV.{'\n\n'}
            Fire TV: install the free "AirScreen" app on it first.
          </Text>
          <Pressable onPress={() => setTryLive(true)} style={{ marginTop: 20, borderColor: '#fff6', borderWidth: 1, padding: 12, borderRadius: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try AirPlay anyway</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
