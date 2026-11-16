import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Room, NETS, roomName, roomAvatar, mediaSource, netOf, botNetOf, hueFor } from '@/lib/matrix';
import { useTheme } from '@/lib/theme';

export function Avatar({ room, size = 52 }: { room: Room; size?: number }) {
  const t = useTheme();
  const name = roomName(room);
  const src = mediaSource(roomAvatar(room), 96);
  const n = netOf(room) || botNetOf(room);
  const initial = (name.replace(/[^\p{L}\p{N}]/gu, '')[0] || '#').toUpperCase();
  const b = Math.round(size * 0.36);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: hueFor(room.id) }]}>
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
        {src && <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={room.id} />}
      </View>
      {n && (
        <View style={[styles.badge, { width: b, height: b, borderRadius: b / 2, backgroundColor: NETS[n].color, borderColor: t.bg }]}>
          <Text style={[styles.badgeTxt, { fontSize: b * 0.5 }]}>{n === 'whatsapp' ? 'W' : n === 'instagram' ? 'I' : 'M'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: '#fff', fontWeight: '600' },
  badge: { position: 'absolute', right: -2, bottom: -2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontWeight: '800' },
});
