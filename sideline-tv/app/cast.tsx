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
            {err ? err + '\n\n' : ''}Tap the video, then the AirPlay icon (▭ with a triangle) and pick your TV.{'\n'}Fire TV: install the free "AirScreen" app on it first.
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
