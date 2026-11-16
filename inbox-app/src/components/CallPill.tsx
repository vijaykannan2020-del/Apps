import { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCall } from '@/lib/calls';

/** Green "return to call" pill while a call runs and you're looking at chats (top-left, clear of the clock). */
export function CallPill() {
  const call = useCall(); const path = usePathname(); const ins = useSafeAreaInsets();
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(iv); }, []);
  if (!call || call.state === 'ended' || call.state === 'ringing' || path === '/call') return null;
  const s = call.startedAt ? Math.floor((Date.now() - call.startedAt) / 1000) : 0;
  return (
    <Pressable onPress={() => router.push('/call')} style={[styles.pill, { top: ins.top + 4 }]}>
      <Ionicons name={call.video ? 'videocam' : 'call'} size={15} color="#fff" />
      <Text style={styles.txt} numberOfLines={1}>{call.name} · {call.startedAt ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Connecting…'}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 12, maxWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#34C759', paddingHorizontal: 12, height: 30, borderRadius: 15, zIndex: 50 },
  txt: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
});
