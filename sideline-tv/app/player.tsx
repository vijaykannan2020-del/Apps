import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadSettings } from '../src/store';
import { portalFor, type LinkOpts } from '../src/portal';
import { VLCView, type Track } from '../src/VLC';
import * as Q from '../src/queue';
import { lookup } from '../src/tmdb';
import { findSubtitles, type WebSub } from '../src/subs';
import { cueAt, loadSubs, type Cue } from '../src/srt';
import { C } from '../src/theme';

const fmt = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
};
const ASPECTS: { label: string; value?: string }[] = [{ label: 'Fit' }, { label: '16:9', value: '16:9' }, { label: 'Fill', value: '19.5:9' }];

function Btn({ label, onPress, big }: { label: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: big ? 22 : 14, paddingVertical: big ? 14 : 8, marginHorizontal: 8 }}>
      <Text style={{ color: '#fff', fontSize: big ? 22 : 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export default function Player() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ cmd?: string; name?: string; kind?: 'live' | 'movie'; episode?: string; id?: string; category?: string; seasonId?: string; episodeId?: string; q?: string }>();
  const kind: 'live' | 'movie' = params.kind === 'movie' ? 'movie' : 'live';
  const [item, setItem] = useState(() => {
    const fromQueue = params.q === '1' ? Q.current() : null;
    if (fromQueue) return fromQueue;
    const opts: LinkOpts = { episode: Number(params.episode || 0), movieId: String(params.id || ''), category: String(params.category || ''), seasonId: params.seasonId ? String(params.seasonId) : undefined, episodeId: params.episodeId ? String(params.episodeId) : undefined };
    return { cmd: String(params.cmd || ''), name: String(params.name || ''), opts };
  });

  const [uri, setUri] = useState('');
  const [opts, setOpts] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [step, setStep] = useState('Asking the portal for the link…');
  const [route, setRoute] = useState('');
  const [slow, setSlow] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const [audio, setAudio] = useState<Track[]>([]);
  const [texts, setTexts] = useState<Track[]>([]);
  const [audioSel, setAudioSel] = useState<number | undefined>(undefined);
  const [textSel, setTextSel] = useState<number | undefined>(undefined);
  const [subs, setSubs] = useState<{ name: string; url: string }[]>([]);
  const [subUri, setSubUri] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState<'' | 'audio' | 'subs'>('');
  const [aspect, setAspect] = useState(0);
  const [web, setWeb] = useState<WebSub[] | null>(null);
  const [webBusy, setWebBusy] = useState(false);
  const [webMsg, setWebMsg] = useState('');
  const [cues, setCues] = useState<Cue[] | null>(null);   // subtitles the app draws itself
  const [cueUrl, setCueUrl] = useState('');
  const [subDelay, setSubDelay] = useState(0);              // ms, + shows later
  async function applyOwnSubs(url: string) {
    setSheet(''); setTextSel(-1); setSubUri(undefined); setCueUrl(url); setCues(null);
    try { setCues(await loadSubs(url)); } catch (e: any) { setCueUrl(''); setMsgToast(e.message || String(e)); }
  }
  const [toast, setMsgToast] = useState('');
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setMsgToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  const [barW, setBarW] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const tries = useRef(0);

  async function open(it = item) {
    setState('loading'); setMsg(''); setUri(''); setStep('Asking the portal for the link…');
    setTime(0); setDur(0); setPos(0); setSeek(undefined); setAudio([]); setTexts([]); setAudioSel(undefined); setTextSel(undefined); setSubUri(undefined); setPaused(false); setCues(null); setCueUrl(''); setWeb(null); setWebMsg('');
    try {
      const p = portalFor(await loadSettings());
      const link = await p.link(it.cmd, kind, it.opts);
      setOpts(p.playerOptions());
      setSubs(p.lastSubtitles);
      { const u = new URL(link); setRoute(p.lastRoute + ' → ' + u.host + u.pathname.slice(-40)); }
      setStep('Connecting to the stream…');
      setUri(link);
    } catch (e: any) { setState('error'); setMsg(e.message || String(e)); }
  }

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    open();
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  useEffect(() => {
    setSlow(false);
    if (state !== 'loading' || !uri) return;
    const t1 = setTimeout(() => setSlow(true), 10000);
    const t2 = setTimeout(() => { setState('error'); setMsg('The stream did not start within 40 seconds.'); }, 40000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [state, uri]);

  useEffect(() => {
    if (state !== 'playing' || !chrome || paused || sheet) return;
    const t = setTimeout(() => setChrome(false), 4000);
    return () => clearTimeout(t);
  }, [state, chrome, paused, sheet]);

  // Subtitles from the web: find the title on TMDB, then search subtitles for it.
  async function searchWebSubs() {
    setWebBusy(true); setWebMsg(''); setWeb(null);
    try {
      const parts = item.name.split(' · ');
      const show = parts[0];
      const season = Number((item.name.match(/season\s*(\d+)/i) || [])[1] || 0);
      const ep = Number((parts.slice(2).join(' ').match(/episode\s*(\d+)/i) || [])[1] || 0);
      const isEp = Q.current() !== null && season > 0 && ep > 0;
      const hit = await lookup(show, isEp ? 'tv' : 'movie');
      if (!hit) throw new Error('Could not find this title on TMDB. Add your TMDB key in Settings if you haven\'t.');
      const list = await findSubtitles(hit.id, ['en', 'ta', 'hi'], isEp ? season : undefined, isEp ? ep : undefined);
      setWeb(list);
      if (!list.length) setWebMsg('No subtitles found online for ' + hit.title + '.');
    } catch (e: any) { setWebMsg(e.message || String(e)); }
    finally { setWebBusy(false); }
  }

  const openInVLC = () => uri && Linking.openURL('vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(uri)).catch(() => {});

  function onError() {
    if (tries.current < 1) { tries.current++; open(); return; }
    setState('error');
    setMsg('This stream would not play. It may be offline, or your subscription may be in use on another device.');
    // Check what the video server actually sends back, and show it under the message.
    (async () => {
      try { const p = portalFor(await loadSettings()); const r = await p.probe(uri); setRoute(x => x + ' · ' + r); } catch {}
    })();
  }

  const seekable = kind === 'movie' && dur > 0;
  const jumpTo = (frac: number) => { const f = Math.min(0.999, Math.max(0, frac)); setSeek(f + Math.random() * 1e-6); setPos(f); setChrome(true); };
  const skip = (sec: number) => { if (seekable) jumpTo((time + sec * 1000) / dur); };
  const playNext = () => { const n = Q.next(); if (n) { setItem(n); tries.current = 0; open(n); } };

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: e => setDrag(e.nativeEvent.locationX / barW),
    onPanResponderMove: e => setDrag(Math.min(1, Math.max(0, e.nativeEvent.locationX / barW))),
    onPanResponderRelease: () => { if (drag !== null) jumpTo(drag); setDrag(null); },
    onPanResponderTerminate: () => setDrag(null),
  });
  const shownPos = drag ?? pos;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {uri ? (
        <VLCView key={uri} uri={uri} options={opts} style={{ flex: 1 }}
          paused={paused} seek={seek} audioTrack={audioSel} textTrack={textSel} subtitleUri={subUri} aspect={ASPECTS[aspect].value}
          onPlaying={() => { tries.current = 0; setState('playing'); }}
          onProgress={p => { setState(st => (st === 'loading' ? 'playing' : st)); setTime(p.currentTime); if (p.duration > 0) setDur(p.duration); setPos(p.position); }}
          onLoad={i => { if (i.audioTracks) setAudio(i.audioTracks); if (i.textTracks) setTexts(i.textTracks); if (i.duration) setDur(Number(i.duration)); }}
          onBuffering={() => setStep(s => (s.startsWith('Buffering') ? s : 'Buffering the video…'))}
          onError={onError}
          onEnded={() => (kind === 'live' ? open() : Q.hasNext() ? playNext() : setChrome(true))} />
      ) : null}

      {/* tap anywhere to show / hide the controls */}
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setChrome(c => !c)} />

      {cues && state === 'playing' ? (() => { const line = cueAt(cues, time - subDelay); return line ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + (chrome ? 120 : 28), alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', textShadowColor: '#000', textShadowRadius: 4 }}>{line}</Text>
        </View>) : null; })() : null}
      {toast ? <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 60, left: 20, right: 20, alignItems: 'center' }}><Text style={{ color: '#fff', backgroundColor: '#000a', padding: 10, borderRadius: 10, overflow: 'hidden' }}>{toast}</Text></View> : null}

      {state !== 'playing' ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          {state === 'loading' ? (
            <>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ color: '#bbb', marginTop: 14, textAlign: 'center' }}>{step}</Text>
              {slow && route ? <Text style={{ color: '#777', marginTop: 8, fontSize: 12, textAlign: 'center' }}>{route}</Text> : null}
              {slow ? <Pressable onPress={openInVLC} style={{ marginTop: 18, borderColor: '#fff6', borderWidth: 1, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '600' }}>Open in VLC app</Text></Pressable> : null}
            </>
          ) : (
            <>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 15, lineHeight: 21 }}>{msg}</Text>
              {route ? <Text style={{ color: '#777', marginTop: 8, fontSize: 12, textAlign: 'center' }}>{route}</Text> : null}
              <Pressable onPress={() => { tries.current = 0; open(); }} style={{ marginTop: 18, backgroundColor: C.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text></Pressable>
              {uri ? <Pressable onPress={openInVLC} style={{ marginTop: 12, borderColor: '#fff6', borderWidth: 1, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '600' }}>Open in VLC app</Text></Pressable> : null}
            </>
          )}
        </View>
      ) : null}

      {chrome || state !== 'playing' ? (
        <>
          {/* top bar */}
          <View style={{ position: 'absolute', top: insets.top + 6, left: insets.left + 12, right: insets.right + 12, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>✕  Close</Text>
            </Pressable>
            <Text numberOfLines={1} style={{ color: '#fff', marginLeft: 12, flex: 1, fontSize: 15, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 }}>{item.name}</Text>
          </View>

          {state === 'playing' ? (
            <>
              {/* centre controls */}
              <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
                {seekable ? <Btn label="↺ 10" onPress={() => skip(-10)} /> : null}
                <Btn big label={paused ? '▶' : '❚❚'} onPress={() => { setPaused(p => !p); setChrome(true); }} />
                {seekable ? <Btn label="10 ↻" onPress={() => skip(10)} /> : null}
              </View>

              {/* bottom: progress + options */}
              <View style={{ position: 'absolute', left: insets.left + 16, right: insets.right + 16, bottom: insets.bottom + 14 }}>
                {seekable ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 12, width: 56 }}>{fmt(drag !== null ? drag * dur : time)}</Text>
                    <View style={{ flex: 1, height: 30, justifyContent: 'center' }} onLayout={e => setBarW(e.nativeEvent.layout.width || 1)} {...pan.panHandlers}>
                      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: '#ffffff40' }}>
                        <View style={{ width: `${shownPos * 100}%`, height: 4, borderRadius: 2, backgroundColor: C.accent }} />
                      </View>
                      <View pointerEvents="none" style={{ position: 'absolute', left: shownPos * barW - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' }} />
                    </View>
                    <Text style={{ color: '#fff', fontSize: 12, width: 56, textAlign: 'right' }}>{fmt(dur)}</Text>
                  </View>
                ) : kind === 'live' ? (
                  <Text style={{ color: C.danger, fontWeight: '800', marginBottom: 12 }}>● LIVE</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                  <Btn label={'Audio' + (audio.length > 1 ? ` (${audio.length})` : '')} onPress={() => setSheet('audio')} />
                  <Btn label={cues ? 'Subtitles ✓' : cueUrl ? 'Subtitles…' : 'Subtitles'} onPress={() => setSheet('subs')} />
                  {cues ? <Btn label="Subs −0.5s" onPress={() => { setSubDelay(d => d - 500); setMsgToast('Subtitle timing ' + ((subDelay - 500) / 1000).toFixed(1) + 's'); }} /> : null}
                  {cues ? <Btn label="Subs +0.5s" onPress={() => { setSubDelay(d => d + 500); setMsgToast('Subtitle timing ' + ((subDelay + 500) / 1000).toFixed(1) + 's'); }} /> : null}
                  <Btn label={'Screen: ' + ASPECTS[aspect].label} onPress={() => setAspect(a => (a + 1) % ASPECTS.length)} />
                  {Q.hasNext() ? <Btn label="Next episode ▸▸" onPress={playNext} /> : null}
                  <Btn label="📺 Cast" onPress={() => router.replace({ pathname: '/cast', params: { uri, name: item.name, live: kind === 'live' ? '1' : '', cmd: item.cmd, opts: JSON.stringify(item.opts || {}), at: String(Math.floor(time / 1000)) } })} />
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet('')} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008' }} onPress={() => setSheet('')} />
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: insets.bottom + 18, maxHeight: '60%' }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>{sheet === 'audio' ? 'Audio language' : 'Subtitles'}</Text>
          <ScrollView>
            {sheet === 'audio' ? (
              audio.length ? audio.map(t => (
                <Pressable key={t.id} onPress={() => { setAudioSel(t.id); setSheet(''); }} style={{ paddingVertical: 12 }}>
                  <Text style={{ color: audioSel === t.id ? C.accent : C.text, fontSize: 16 }}>{t.name}</Text>
                </Pressable>
              )) : <Text style={{ color: C.dim }}>This video has one audio track.</Text>
            ) : (
              <>
                <Pressable onPress={() => { setTextSel(-1); setSubUri(undefined); setCues(null); setCueUrl(''); setSheet(''); }} style={{ paddingVertical: 12 }}>
                  <Text style={{ color: textSel === -1 ? C.accent : C.text, fontSize: 16 }}>Off</Text>
                </Pressable>
                {texts.filter(t => t.id !== -1).map(t => (
                  <Pressable key={'t' + t.id} onPress={() => { setCues(null); setCueUrl(''); setTextSel(t.id); setSheet(''); }} style={{ paddingVertical: 12 }}>
                    <Text style={{ color: textSel === t.id ? C.accent : C.text, fontSize: 16 }}>{t.name}</Text>
                  </Pressable>
                ))}
                {subs.map(s => (
                  <Pressable key={s.url} onPress={() => applyOwnSubs(s.url)} style={{ paddingVertical: 12 }}>
                    <Text style={{ color: cueUrl === s.url ? C.accent : C.text, fontSize: 16 }}>{s.name} (from portal)</Text>
                  </Pressable>
                ))}
                {!texts.filter(t => t.id !== -1).length && !subs.length ? <Text style={{ color: C.dim, paddingVertical: 8 }}>No subtitles came with this video.</Text> : null}
                <Pressable onPress={searchWebSubs} style={{ marginTop: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.cardHi }}>
                  <Text style={{ color: C.text, fontWeight: '700' }}>{webBusy ? 'Searching online…' : '🔎  Find subtitles online (English, Tamil, Hindi)'}</Text>
                </Pressable>
                {webMsg ? <Text style={{ color: C.dim, paddingVertical: 8 }}>{webMsg}</Text> : null}
                {(web || []).map((w, wi) => (
                  <Pressable key={w.url} onPress={() => applyOwnSubs(w.url)} style={{ paddingVertical: 12 }}>
                    <Text style={{ color: cueUrl === w.url ? C.accent : C.text, fontSize: 15 }}>{w.name} #{wi + 1}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
