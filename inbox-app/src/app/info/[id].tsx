import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, NETS, roomName, netOf, isGroup, memberCount, isPinned, isArchived, setTag, setMuted, mediaSource, roomMembers, listScheduled,
  cancelScheduled, setReminder, hueFor } from '@/lib/matrix';
import { useTheme, useStore } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Sheet, SheetGroup, SheetItem } from '@/components/Sheet';
import { quickTimes, fmtWhen } from '@/lib/time';

export default function Info() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const r = S.rooms.get(id!);
  const [members, setMembers] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [sched, setSched] = useState<{ id: string; at: number; text: string }[]>([]);
  const [remind, setRemind] = useState(false);
  useEffect(() => {
    if (!r) return;
    if (isGroup(r)) roomMembers(r).then(setMembers).catch(() => {});
    listScheduled(r.id).then(setSched);
  }, [id]);
  if (!r) return null;
  const n = netOf(r); const muted = S.muted.has(r.id);
  const photos = r.events.filter(e => !e.redacted && (e.content?.msgtype === 'm.image') && e.content?.url).slice(-24).reverse();
  const cell = Math.floor((Math.min(width, 600) - 32 - 8) / 3);
  const Btn = ({ icon, label, on, onPress }: { icon: any; label: string; on?: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, { backgroundColor: pressed ? t.fill : t.surface }]}>
      <Ionicons name={icon} size={22} color={on ? t.blue : t.ink} /><Text style={{ color: on ? t.blue : t.ink, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 40, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 600 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 12, alignSelf: 'flex-start' }}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>
        <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Avatar room={r} size={96} />
          <Text style={[styles.name, { color: t.ink }]}>{roomName(r)}</Text>
          <Text style={{ color: t.soft, fontSize: 15 }}>{isGroup(r) ? `${memberCount(r)} members` : 'Chat'}{n ? ' · ' + NETS[n].label : ''}</Text>
        </View>
        <View style={styles.btns}>
          <Btn icon={muted ? 'notifications-off' : 'notifications'} label={muted ? 'Unmute' : 'Mute'} on={muted} onPress={() => setMuted(r, !muted).catch(() => Alert.alert('Could not change mute'))} />
          <Btn icon="pin" label={isPinned(r) ? 'Unpin' : 'Pin'} on={isPinned(r)} onPress={() => setTag(r, 'm.favourite', !isPinned(r))} />
          <Btn icon="alarm" label="Remind" on={!!S.reminders[r.id]} onPress={() => setRemind(true)} />
          <Btn icon="archive" label={isArchived(r) ? 'Unarchive' : 'Archive'} on={isArchived(r)} onPress={() => setTag(r, 'm.lowpriority', !isArchived(r))} />
        </View>
        {S.reminders[r.id] ? <Text style={[styles.note, { color: t.soft }]}>⏰ Reminder {fmtWhen(S.reminders[r.id])}</Text> : null}
        <Pressable onPress={() => router.push({ pathname: '/media/[id]', params: { id: r.id } })}
          style={({ pressed }) => [styles.card, { backgroundColor: pressed ? t.fill : t.surface, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 18 }]}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#0A84FF', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="images" size={18} color="#fff" /></View>
          <Text style={{ flex: 1, color: t.ink, fontSize: 17 }}>Media, links and docs</Text>
          <Ionicons name="chevron-forward" size={18} color={t.soft} />
        </Pressable>
        {sched.length > 0 && <>
          <Text style={[styles.h, { color: t.soft }]}>SCHEDULED MESSAGES</Text>
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            {sched.map(x => (
              <View key={x.id} style={[styles.schedRow, { borderBottomColor: t.line }]}>
                <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>⏱ {fmtWhen(x.at)}</Text><Text numberOfLines={1} style={{ color: t.soft }}>{x.text}</Text></View>
                <Pressable onPress={async () => { await cancelScheduled(x.id).catch(() => {}); setSched(await listScheduled(r.id)); }}><Text style={{ color: t.red, fontWeight: '600' }}>Cancel</Text></Pressable>
              </View>
            ))}
          </View>
        </>}
        {photos.length > 0 && <>
          <Text style={[styles.h, { color: t.soft }]}>PHOTOS</Text>
          <View style={styles.grid}>
            {photos.map(e => <Image key={e.event_id} source={mediaSource(e.content.url, 320)} style={{ width: cell, height: cell, borderRadius: 8, backgroundColor: t.fill }} contentFit="cover" />)}
          </View>
        </>}
        {members.length > 0 && <>
          <Text style={[styles.h, { color: t.soft }]}>{members.length} MEMBERS</Text>
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            {members.map(m => (
              <View key={m.id} style={[styles.mem, { borderBottomColor: t.line }]}>
                <View style={[styles.mav, { backgroundColor: hueFor(m.id) }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{(m.name.replace(/[^\p{L}\p{N}]/gu, '')[0] || '#').toUpperCase()}</Text>
                  {mediaSource(m.avatar, 96) && <Image source={mediaSource(m.avatar, 96)} style={StyleSheet.absoluteFill} />}
                </View>
                <Text style={{ color: t.ink, fontSize: 16 }}>{m.name}</Text>
              </View>
            ))}
          </View>
        </>}
      </View>
      <Sheet visible={remind} onClose={() => setRemind(false)} title={'Remind me about ' + roomName(r)}>
        <SheetGroup>
          {quickTimes().map(([label, ts]) => <SheetItem key={label} label={label} onPress={() => { setReminder(r, ts); setRemind(false); }} />)}
          {S.reminders[r.id] ? <SheetItem label="Remove reminder" danger last onPress={() => { setReminder(r, null); setRemind(false); }} /> : null}
        </SheetGroup>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '700', textAlign: 'center', paddingHorizontal: 20 },
  btns: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 18 },
  btn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 14 },
  note: { textAlign: 'center', marginTop: 10 },
  h: { fontSize: 13, fontWeight: '600', marginTop: 24, marginBottom: 6, marginHorizontal: 32 },
  card: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 16 },
  mem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  mav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
