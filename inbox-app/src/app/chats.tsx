import { useMemo, useState, memo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActionSheetIOS, Platform, Alert, ActivityIndicator } from 'react-native';
import { router, Redirect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { S, Room, Net, NETS, visibleRooms, roomName, preview, fmtTime, isUnread, isGroup, isPinned, isArchived, netOf,
  lastMine, setTag, setMarkedUnread, markRead } from '@/lib/matrix';
import { useTheme, useStore, Theme } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';

type Tab = 'all' | Net;
type Kind = 'all' | 'unread' | 'groups';
const TABS: [Tab | 'accounts', string, keyof typeof Ionicons.glyphMap][] = [['all', 'All', 'chatbubble-ellipses'], ['whatsapp', 'WhatsApp', 'logo-whatsapp'], ['instagram', 'Instagram', 'logo-instagram'], ['messenger', 'Messenger', 'logo-facebook'], ['accounts', 'Accounts', 'person-circle']];

function actions(r: Room) {
  const unread = isUnread(r);
  const opts: [string, () => void][] = [
    [isPinned(r) ? 'Unpin' : 'Pin', () => setTag(r, 'm.favourite', !isPinned(r))],
    [unread ? 'Mark as read' : 'Mark as unread', () => (unread ? markRead(r) : setMarkedUnread(r, true))],
    [isArchived(r) ? 'Unarchive' : 'Archive', () => setTag(r, 'm.lowpriority', !isArchived(r))],
  ];
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title: roomName(r), options: [...opts.map(o => o[0]), 'Cancel'], cancelButtonIndex: opts.length },
      i => { if (i < opts.length) opts[i][1](); });
  } else {
    Alert.alert(roomName(r), undefined, [...opts.map(([text, onPress]) => ({ text, onPress })), { text: 'Cancel', style: 'cancel' as const }]);
  }
}

const Row = memo(function Row({ r, t, v }: { r: Room; t: Theme; v: number }) {
  const unread = isUnread(r);
  const tick = lastMine(r);
  return (
    <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: r.id } })} onLongPress={() => actions(r)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
      <Avatar room={r} />
      <View style={[styles.meta, { borderBottomColor: t.line }]}>
        <View style={styles.l1}>
          <Text numberOfLines={1} style={[styles.name, { color: t.ink, fontWeight: unread ? '700' : '600' }]}>{roomName(r)}</Text>
          <Text style={[styles.time, { color: unread ? t.ink : t.soft, fontWeight: unread ? '600' : '400' }]}>{fmtTime(r.lastTs)}</Text>
        </View>
        <View style={styles.l2}>
          {isPinned(r) && <Ionicons name="pin" size={13} color={t.soft} />}
          {tick && <Text style={[styles.tick, { color: tick === 'read' ? t.blue : t.soft }]}>{tick === 'pending' ? '◷' : tick === 'read' ? '✓✓' : '✓'}</Text>}
          <Text numberOfLines={2} style={[styles.prev, { color: unread ? t.ink : t.soft }]}>
            {r.typing.length ? 'typing…' : preview(r)}
          </Text>
          {unread && <View style={[styles.badge, { backgroundColor: t.unread }]}><Text style={[styles.badgeTxt, { color: t.bg }]}>{r.unread || ''}</Text></View>}
        </View>
      </View>
    </Pressable>
  );
});

export default function Chats() {
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all'); const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState(''); const [archived, setArchived] = useState(false);

  const { list, counts, archCount } = useMemo(() => {
    const all = visibleRooms();
    const inTab = all.filter(r => tab === 'all' || netOf(r) === tab);
    const notArch = inTab.filter(r => !isArchived(r));
    let list = archived ? inTab.filter(isArchived) : notArch;
    if (kind === 'unread') list = list.filter(isUnread);
    if (kind === 'groups') list = list.filter(isGroup);
    const qq = q.trim().toLowerCase();
    if (qq) list = inTab.filter(r => roomName(r).toLowerCase().includes(qq));
    list.sort((a, b) => (Number(isPinned(b)) - Number(isPinned(a))) || b.lastTs - a.lastTs);
    const counts: Record<string, number> = { all: 0 };
    for (const n of Object.keys(NETS)) counts[n] = all.filter(r => netOf(r) === n && isUnread(r) && !isArchived(r)).length;
    counts.all = all.filter(r => isUnread(r) && !isArchived(r)).length;
    return { list, counts, archCount: inTab.filter(isArchived).length };
  }, [v, tab, kind, q, archived]);

  if (!S.token) return <Redirect href="/login" />;
  const title = archived ? 'Archived' : tab === 'all' ? 'Inbox' : NETS[tab].label;

  const header = (
    <View style={{ paddingTop: ins.top + 6 }}>
      <View style={styles.titleRow}>
        {archived && <Pressable onPress={() => setArchived(false)} hitSlop={12}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>}
        <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.soft} clearButtonMode="while-editing"
        style={[styles.search, { backgroundColor: t.fill, color: t.ink }]} autoCorrect={false} />
      {!archived && !q && (
        <View style={styles.kinds}>
          {(['all', 'unread', 'groups'] as Kind[]).map(k => (
            <Pressable key={k} onPress={() => { setKind(k); Haptics.selectionAsync().catch(() => {}); }}
              style={[styles.chip, { backgroundColor: kind === k ? t.primary : t.fill }]}>
              <Text style={{ color: kind === k ? t.primaryText : t.ink, fontWeight: '600', fontSize: 15 }}>{k[0].toUpperCase() + k.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!archived && !q && archCount > 0 && kind === 'all' && (
        <Pressable onPress={() => setArchived(true)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
          <View style={[styles.archIcon, { backgroundColor: t.fill }]}><Ionicons name="archive" size={24} color={t.ink} /></View>
          <View style={[styles.meta, { borderBottomColor: t.line, justifyContent: 'center' }]}>
            <View style={styles.l1}><Text style={[styles.name, { color: t.ink }]}>Archived</Text><Text style={[styles.time, { color: t.soft }]}>{archCount}</Text></View>
          </View>
        </Pressable>
      )}
      {!!S.status && <Text style={[styles.status, { color: t.soft }]}>{S.status}</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={list}
        keyExtractor={r => r.id}
        renderItem={({ item }) => <Row r={item} t={t} v={v} />}
        extraData={v}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            {!S.ready ? <><ActivityIndicator /><Text style={[styles.emptyTxt, { color: t.soft }]}>Syncing your chats…</Text></>
              : <Text style={[styles.emptyTxt, { color: t.soft }]}>{q ? 'No chats found' : kind === 'unread' ? 'All caught up ✓' : 'No chats yet'}</Text>}
          </View>
        }
        contentContainerStyle={{ paddingBottom: ins.bottom + 96 }}
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={11}
      />
      {/* floating glass dock */}
      <View pointerEvents="box-none" style={[styles.dockWrap, { bottom: ins.bottom + 8 }]}>
        <BlurView intensity={t.dark ? 40 : 60} tint={t.dark ? 'dark' : 'light'} style={[styles.dock, { borderColor: t.line }]}>
          {TABS.map(([k, label, icon]) => {
            const on = k === tab && !archived;
            const c = k === 'accounts' ? 0 : counts[k] || 0;
            return (
              <Pressable key={k} style={styles.dockBtn} onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (k === 'accounts') router.push('/accounts'); else { setTab(k); setArchived(false); }
              }}>
                <View style={[styles.dockPill, on && { backgroundColor: t.fill }]}>
                  <Ionicons name={icon} size={22} color={on ? t.ink : t.soft} />
                  {c > 0 && <View style={[styles.dockBadge, { backgroundColor: t.red }]}><Text style={styles.dockBadgeTxt}>{c > 99 ? '99+' : c}</Text></View>}
                </View>
                <Text style={[styles.dockLabel, { color: on ? t.ink : t.soft }]}>{label}</Text>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 },
  back: { fontSize: 40, lineHeight: 44, fontWeight: '300' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  search: { marginHorizontal: 16, marginTop: 10, height: 40, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  kinds: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { paddingHorizontal: 16, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  meta: { flex: 1, paddingVertical: 12, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 76 },
  l1: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: 17 },
  time: { fontSize: 14 },
  l2: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  prev: { flex: 1, fontSize: 15, lineHeight: 20 },
  ic: { fontSize: 12 },
  tick: { fontSize: 13, fontWeight: '600' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 13, fontWeight: '700' },
  archIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  status: { textAlign: 'center', fontSize: 13, paddingBottom: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTxt: { fontSize: 16 },
  dockWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  dock: { flexDirection: 'row', borderRadius: 32, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 520 },
  dockBtn: { flex: 1, alignItems: 'center', gap: 2 },
  dockPill: { width: 56, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dockBadge: { position: 'absolute', top: -2, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  dockBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dockLabel: { fontSize: 11, fontWeight: '600' },
});
