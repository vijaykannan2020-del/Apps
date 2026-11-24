import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadSettings } from '../src/store';
import { portalFor } from '../src/portal';
import { VLCView } from '../src/VLC';
import { C } from '../src/theme';

export default function Player() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { cmd, name, kind, episode, id } = useLocalSearchParams<{ cmd: string; name: string; kind: 'live' | 'movie'; episode?: string; id?: string }>();
  const [uri, setUri] = useState('');
  const [opts, setOpts] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [chrome, setChrome] = useState(true);
  const tries = useRef(0);

  async function open() {
    setState('loading'); setMsg(''); setUri('');
    try {
      const p = portalFor(await loadSettings());
      const link = await p.link(String(cmd), kind === 'movie' ? 'movie' : 'live', Number(episode || 0), String(id || ''));
      setOpts(p.playerOptions());
      setUri(link);
    } catch (e: any) { setState('error'); setMsg(e.message || String(e)); }
  }

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    open();
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  useEffect(() => {
    if (state !== 'playing' || !chrome) return;
    const t = setTimeout(() => setChrome(false), 3500);
    return () => clearTimeout(t);
  }, [state, chrome]);

  // Live links are single-use on many portals: on a stream error, ask for a fresh link once.
  function onError() {
    if (tries.current < 1) { tries.current++; open(); return; }
    setState('error');
    setMsg('This stream would not play. It may be offline, or your subscription may be in use on another device.');
  }

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setChrome(c => !c)}>
      {uri ? (
        <VLCView key={uri} uri={uri} options={opts} style={{ flex: 1 }}
          onPlaying={() => { tries.current = 0; setState('playing'); }}
          onError={onError}
          onEnded={() => kind === 'live' && open()} />
      ) : null}

      {state !== 'playing' ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 30 } as any}>
          {state === 'loading' ? <ActivityIndicator size="large" color={C.accent} /> : (
            <>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 15, lineHeight: 21 }}>{msg}</Text>
              <Pressable onPress={() => { tries.current = 0; open(); }} style={{ marginTop: 18, backgroundColor: C.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {chrome || state !== 'playing' ? (
        <View style={{ position: 'absolute', top: insets.top + 6, left: insets.left + 12, right: insets.right + 12, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} hitSlop={14} style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>✕  Close</Text>
          </Pressable>
          <Text numberOfLines={1} style={{ color: '#fff', marginLeft: 12, flex: 1, fontSize: 15, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 }}>{name}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
