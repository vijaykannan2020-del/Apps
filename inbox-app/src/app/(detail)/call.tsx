import { FONT_TITLE } from '@/lib/theme';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useCall, hangup, answer, toggleMute, toggleSpeaker, toggleCamera, flipCamera } from '@/lib/calls';
import { S } from '@/lib/matrix';
import { Avatar } from '@/components/Avatar';
import { Glass } from '@/components/Glass';

const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function CallScreen() {
  const call = useCall();
  const ins = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => { setNow(Date.now()); }, 1000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    if (!call) { const t = setTimeout(() => router.canGoBack() ? router.back() : router.replace('/'), 200); return () => clearTimeout(t); }
  }, [call]);
  if (!call) return <View style={styles.bg} />;
  const room = S.rooms.get(call.roomId);
  const showRemote = call.video && call.remote && call.remote.getVideoTracks().length > 0;
  const status = call.state === 'ended' ? call.endedReason || 'Call ended'
    : call.state === 'calling' ? 'Calling…' : call.state === 'ringing' ? (call.video ? 'Incoming video call' : 'Incoming call')
    : call.state === 'connecting' ? 'Connecting…' : call.startedAt ? fmt(now - call.startedAt) : '';
  const tap = (f: () => void) => () => { Haptics.selectionAsync().catch(() => {}); f(); };

  return (
    <View style={styles.bg}>
      {showRemote && <RTCView streamURL={(call.remote as any).toURL()} style={StyleSheet.absoluteFill as any} objectFit="cover" zOrder={0} />}
      {!showRemote && (
        <View style={[styles.center, { paddingTop: ins.top + 60 }]}>
          {room && <Avatar room={room} size={120} />}
        </View>
      )}
      {/* name + status: top-left, clear of the clock on the right */}
      <View style={[styles.top, { paddingTop: ins.top + 10 }]} pointerEvents="none">
        <Text style={styles.name} numberOfLines={1}>{call.name}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      {call.video && call.local && !call.camOff && (
        <View style={[styles.pip, { top: ins.top + 90 }]}>
          <RTCView streamURL={(call.local as any).toURL()} style={{ flex: 1 }} objectFit="cover" mirror={call.frontCam} zOrder={1} />
        </View>
      )}

      <View style={[styles.bottom, { paddingBottom: ins.bottom + 24 }]}>
        {call.state === 'ringing' ? (
          <View style={styles.row}>
            <Btn icon="close" label="Decline" color="#FF3B30" onPress={tap(() => hangup('Declined'))} />
            <Btn icon={call.video ? 'videocam' : 'call'} label="Answer" color="#34C759" onPress={tap(answer)} />
          </View>
        ) : call.state !== 'ended' ? (
          <Glass style={styles.controls}>
            <Ctl icon={call.muted ? 'mic-off' : 'mic'} on={call.muted} label="Mute" onPress={tap(toggleMute)} />
            <Ctl icon="volume-high" on={call.speaker} label="Speaker" onPress={tap(toggleSpeaker)} />
            {call.video && <Ctl icon={call.camOff ? 'videocam-off' : 'videocam'} on={call.camOff} label="Camera" onPress={tap(toggleCamera)} />}
            {call.video && <Ctl icon="camera-reverse" label="Flip" onPress={tap(flipCamera)} />}
            <Pressable onPress={tap(() => hangup())} style={[styles.end]} accessibilityLabel="End call">
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          </Glass>
        ) : null}
        {call.state !== 'ringing' && call.state !== 'ended' && (
          <Pressable onPress={() => router.back()} style={styles.minimize}><Text style={styles.minTxt}>Back to chats — call keeps going</Text></Pressable>
        )}
      </View>
    </View>
  );
}

function Ctl({ icon, label, on, onPress }: { icon: any; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.ctl} accessibilityLabel={label}>
      <View style={[styles.ctlCircle, on && { backgroundColor: '#fff' }]}><Ionicons name={icon} size={24} color={on ? '#000' : '#fff'} /></View>
      <Text style={styles.ctlLbl}>{label}</Text>
    </Pressable>
  );
}
function Btn({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 8 }} accessibilityLabel={label}>
      <View style={[styles.big, { backgroundColor: color }]}><Ionicons name={icon} size={34} color="#fff" /></View>
      <Text style={styles.ctlLbl}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0B0B12' },
  center: { alignItems: 'center' },
  top: { position: 'absolute', left: 20, right: 90 },
  name: { color: '#fff', fontSize: 34, fontFamily: FONT_TITLE, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  status: { color: 'rgba(255,255,255,0.85)', fontSize: 17, marginTop: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  diag: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 6, fontFamily: 'Menlo', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  pip: { position: 'absolute', left: 16, width: 110, height: 160, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: '#222' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14 },
  row: { flexDirection: 'row', gap: 80 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 40, overflow: 'hidden' },
  ctl: { alignItems: 'center', width: 64, gap: 4 },
  ctlCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  ctlLbl: { color: '#fff', fontSize: 12, fontWeight: '600' },
  end: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  big: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  minimize: { paddingVertical: 6, paddingHorizontal: 14 },
  minTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});
