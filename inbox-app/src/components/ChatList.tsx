import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useWide, useSelected, setSelected as setSel, getSelected } from '@/lib/layout';
import { router, Redirect, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { S, Room, MEvent, Net, NETS, visibleRooms, roomName, preview, fmtTime, isUnread, isGroup, isPinned, isArchived, netOf,
  lastMine, setTag, setMarkedUnread, markRead, setMuted, setReminder, dueReminders, searchMessages, bodyPreview, memberName,
  startWhatsAppChat, others } from '@/lib/matrix';
import { useTheme, useStore, Theme } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Glass } from '@/components/Glass';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatView } from '@/components/ChatView';
import { Sheet, SheetGroup, SheetItem } from '@/components/Sheet';
import { quickTimes, fmtWhen } from '@/lib/time';

type Tab = 'all' | Net;
type Kind = 'all' | 'unread' | 'groups' | 'starred';
const KINDS: [Kind, string][] = [['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['starred', '★ Starred']];

const Row = memo(function Row({ r, t, open, onMore, selected, fs, compact }: { r: Room; t: Theme; open: (id: string) => void; onMore: (r: Room) => void; selected: boolean; fs: number; v: number; compact?: boolean }) {
  const sw = useRef<SwipeableMethods>(null);
  const unread = isUnread(r);
  const tick = lastMine(r);
  const draft = S.drafts[r.id];
  const act = (fn: () => void) => () => { Haptics.selectionAsync().catch(() => {}); fn(); sw.current?.close(); };
  return (
    <ReanimatedSwipeable ref={sw} friction={1.6} overshootLeft={false} overshootRight={false}
      renderLeftActions={() => (
        <View style={styles.actions}>
          <Pressable onPress={act(() => (unread ? markRead(r) : setMarkedUnread(r, true)))} style={[styles.act, { backgroundColor: '#0A84FF' }]}>
            <Ionicons name={unread ? 'mail-open' : 'mail-unread'} size={22} color="#fff" /><Text style={styles.actTxt}>{unread ? 'Read' : 'Unread'}</Text></Pressable>
          <Pressable onPress={act(() => setTag(r, 'm.favourite', !isPinned(r)))} style={[styles.act, { backgroundColor: '#FF9F0A' }]}>
            <Ionicons name="pin" size={22} color="#fff" /><Text style={styles.actTxt}>{isPinned(r) ? 'Unpin' : 'Pin'}</Text></Pressable>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Pressable onPress={act(() => onMore(r))} style={[styles.act, { backgroundColor: '#8E8E93' }]}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" /><Text style={styles.actTxt}>More</Text></Pressable>
          <Pressable onPress={act(() => setTag(r, 'm.lowpriority', !isArchived(r)))} style={[styles.act, { backgroundColor: '#5E5CE6' }]}>
            <Ionicons name="archive" size={22} color="#fff" /><Text style={styles.actTxt}>{isArchived(r) ? 'Unarchive' : 'Archive'}</Text></Pressable>
        </View>
      )}>
      <Pressable onPress={() => open(r.id)} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onMore(r); }}
        style={({ pressed }) => [styles.row, { backgroundColor: selected || pressed ? (t.dark ? '#2C2C2E' : '#E5E5EA') : t.bg }]}>
        <Avatar room={r} size={compact ? 42 : undefined} />
        <View style={[styles.meta, { borderBottomColor: t.line }, compact && { minHeight: 64, paddingRight: 10 }]}>
          <View style={styles.l1}>
            <Text numberOfLines={1} style={[styles.name, { color: t.ink, fontWeight: unread ? '700' : '600', fontSize: 17 * fs }]}>{roomName(r)}</Text>
            <Text style={[styles.time, { color: unread ? t.ink : t.soft, fontWeight: unread ? '600' : '400' }, compact && { fontSize: 12 }]}>{fmtTime(r.lastTs)}</Text>
          </View>
          <View style={styles.l2}>
            {tick && !draft && <Text style={[styles.tick, { color: tick === 'read' ? t.blue : t.soft }]}>{tick === 'pending' ? '◷' : tick === 'read' ? '✓✓' : '✓'}</Text>}
            <Text numberOfLines={compact ? 1 : 2} style={[styles.prev, { color: unread ? t.ink : t.soft, fontSize: 15 * fs, lineHeight: 20 * fs }]}>
              {r.typing.length ? <Text style={{ color: t.blue }}>typing…</Text> : draft ? <><Text style={{ color: t.red }}>Draft: </Text>{draft}</> : preview(r)}
            </Text>
            {S.reminders[r.id] ? <Ionicons name="alarm" size={14} color={t.soft} /> : null}
            {S.muted.has(r.id) ? <Ionicons name="notifications-off" size={14} color={t.soft} /> : null}
            {isPinned(r) ? <Ionicons name="pin" size={14} color={t.soft} /> : null}
            {unread && <View style={[styles.badge, { backgroundColor: S.muted.has(r.id) ? t.soft : t.unread }]}><Text style={[styles.badgeTxt, { color: t.bg }]}>{r.unread || ''}</Text></View>}
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
});

export function ChatList({ tab }: { tab: Tab }) {
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const wide = useWide(); const focused = useIsFocused();
  const selected = useSelected(); const setSelected = setSel;
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState(''); const [archived, setArchived] = useState(false);
  const [more, setMore] = useState<Room | null>(null); const [remind, setRemind] = useState<Room | null>(null);
  const [newChat, setNewChat] = useState(false); const [num, setNum] = useState('');
  const [hits, setHits] = useState<{ room: Room; ev: MEvent }[]>([]); const [searching, setSearching] = useState(false);
  const fs = S.prefs.fontScale;

  useEffect(() => {
    const tick = () => { const due = dueReminders(); if (due.length) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); Alert.alert('⏰ Reminder', due.map(id => S.rooms.get(id) ? roomName(S.rooms.get(id)!) : 'Chat').join(', ')); } };
    tick(); const iv = setInterval(tick, 30e3); return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const term = q.trim(); if (term.length < 3) { setHits([]); return; }
    setSearching(true);
    const h = setTimeout(() => { searchMessages(term).then(setHits).catch(() => setHits([])).finally(() => setSearching(false)); }, 450);
    return () => clearTimeout(h);
  }, [q]);

  const { list, counts, archCount } = useMemo(() => {
    const all = visibleRooms();
    const inTab = all.filter(r => tab === 'all' || netOf(r) === tab);
    let list = archived ? inTab.filter(isArchived) : inTab.filter(r => !isArchived(r));
    if (kind === 'unread') list = list.filter(isUnread);
    if (kind === 'groups') list = list.filter(isGroup);
    const qq = q.trim().toLowerCase();
    if (qq) list = inTab.filter(r => roomName(r).toLowerCase().includes(qq) || others(r).some(id => memberName(r, id).toLowerCase().includes(qq)));
    list.sort((a, b) => (Number(isPinned(b)) - Number(isPinned(a))) || b.lastTs - a.lastTs);
    const counts: Record<string, number> = {};
    for (const n of Object.keys(NETS)) counts[n] = all.filter(r => netOf(r) === n && isUnread(r) && !isArchived(r)).length;
    counts.all = all.filter(r => isUnread(r) && !isArchived(r)).length;
    return { list, counts, archCount: inTab.filter(isArchived).length };
  }, [v, tab, kind, q, archived]);

  useEffect(() => {
    if (!wide && focused) { const id = getSelected(); if (id) { setSelected(null); router.push({ pathname: '/chat/[id]', params: { id } }); } }
  }, [wide, focused]);

  if (!S.token) return <Redirect href="/login" />;
  const open = (id: string) => { if (wide) setSelected(id); else router.push({ pathname: '/chat/[id]', params: { id } }); };
  const title = archived ? 'Archived' : tab === 'all' ? 'Inbox' : NETS[tab].label;
  const starredView = kind === 'starred' && !archived && !q;
  const paneW = wide ? Math.round(Math.min(420, Math.max(190, width * (width < 700 ? 0.44 : 0.38)))) : width;
  const compact = wide && paneW < 300;

  const header = (
    <View style={{ paddingTop: ins.top + 6 }}>
      <View style={styles.titleRow}>
        {archived && <Pressable onPress={() => setArchived(false)} hitSlop={12}><Ionicons name="chevron-back" size={30} color={t.ink} /></Pressable>}
        <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
      </View>
      {wide && (
        <Glass style={styles.switcher}>
          {([['all', '/inbox'], ['whatsapp', '/whatsapp'], ['instagram', '/instagram'], ['messenger', '/messenger'], ['accounts', '/accounts']] as const).map(([k, href]) => {
            const on = k === tab; const c = k === 'accounts' ? 0 : counts[k] || 0;
            const col = on ? t.ink : t.soft;
            return (
              <Pressable key={k} hitSlop={4} onPress={() => { Haptics.selectionAsync().catch(() => {}); if (!on) router.navigate(href); }} style={[styles.swBtn, on && { backgroundColor: t.fill }]}>
                {k === 'all' ? <Ionicons name="file-tray" size={21} color={col} /> : k === 'whatsapp' ? <Ionicons name="logo-whatsapp" size={21} color={col} />
                  : k === 'instagram' ? <Ionicons name="logo-instagram" size={21} color={col} /> : k === 'messenger' ? <MaterialCommunityIcons name="facebook-messenger" size={21} color={col} />
                  : <Ionicons name="person-circle-outline" size={23} color={col} />}
                {c > 0 && <View style={[styles.swBadge, { backgroundColor: t.red }]}><Text style={styles.swBadgeTxt}>{c > 99 ? '99+' : c}</Text></View>}
              </Pressable>
            );
          })}
        </Glass>
      )}
      <View style={[styles.search, { backgroundColor: t.fill }]}>
        <Ionicons name="search" size={17} color={t.soft} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search chats and messages" placeholderTextColor={t.soft} style={{ flex: 1, color: t.ink, fontSize: 17 }} autoCorrect={false} returnKeyType="search" />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={t.soft} /></Pressable>}
      </View>
      {!archived && !q && (
        <FlatList horizontal data={[...KINDS, ['new', '＋ New'] as [string, string]]} keyExtractor={k => k[0]} showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kinds}
          renderItem={({ item: [k, label] }) => (
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); if (k === 'new') setNewChat(true); else setKind(k as Kind); }}
              style={[styles.chip, { backgroundColor: kind === k ? t.primary : t.fill }]}>
              <Text style={{ color: kind === k ? t.primaryText : t.ink, fontWeight: '600', fontSize: 15 }}>{label}{k === 'unread' && counts.all ? ' ' + counts.all : ''}</Text>
            </Pressable>
          )} />
      )}
      {!archived && !q && archCount > 0 && kind === 'all' && (
        <Pressable onPress={() => setArchived(true)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
          <View style={[styles.archIcon, { backgroundColor: t.fill }]}><Ionicons name="archive" size={24} color={t.ink} /></View>
          <View style={[styles.meta, { borderBottomColor: t.line, justifyContent: 'center' }]}>
            <View style={styles.l1}><Text style={[styles.name, { color: t.ink }]}>Archived</Text><Text style={[styles.time, { color: t.soft }]}>{archCount}</Text></View>
          </View>
        </Pressable>
      )}
      {!!q && list.length > 0 && <Text style={[styles.section, { color: t.soft }]}>CHATS</Text>}
      {!!S.status && <Text style={[styles.status, { color: t.soft }]}>{S.status}</Text>}
    </View>
  );
  const searchFooter = q.trim().length >= 3 ? (
    <View>
      <Text style={[styles.section, { color: t.soft }]}>MESSAGES{searching ? '  …' : ''}</Text>
      {!searching && !hits.length && <Text style={[styles.emptyTxt, { color: t.soft, paddingHorizontal: 20 }]}>No messages found</Text>}
      {hits.map(({ room: r, ev }) => (
        <Pressable key={ev.event_id} onPress={() => open(r.id)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
          <Avatar room={r} size={44} />
          <View style={[styles.meta, { borderBottomColor: t.line, minHeight: 64 }]}>
            <View style={styles.l1}><Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>{roomName(r)}</Text><Text style={[styles.time, { color: t.soft }]}>{fmtTime(ev.origin_server_ts)}</Text></View>
            <Text numberOfLines={2} style={[styles.prev, { color: t.soft }]}>{ev.sender === S.userId ? 'You: ' : isGroup(r) ? memberName(r, ev.sender).split(' ')[0] + ': ' : ''}{bodyPreview(ev)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : undefined;

  const listPane = (
    <View style={{ width: paneW, flex: wide ? undefined : 1, borderRightWidth: wide ? StyleSheet.hairlineWidth : 0, borderRightColor: t.line }}>
      {starredView ? (
        <FlatList data={S.starred} keyExtractor={x => x.event} ListHeaderComponent={header} extraData={v}
          contentContainerStyle={{ paddingBottom: ins.bottom + 16 }}
          ListEmptyComponent={<Text style={[styles.emptyTxt, { color: t.soft, textAlign: 'center', paddingTop: 40, paddingHorizontal: 30 }]}>No starred messages yet. Long-press a message → Star.</Text>}
          renderItem={({ item: x }) => {
            const r = S.rooms.get(x.room); if (!r) return null;
            return (
              <Pressable onPress={() => open(r.id)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
                <Avatar room={r} size={44} />
                <View style={[styles.meta, { borderBottomColor: t.line, minHeight: 64 }]}>
                  <View style={styles.l1}><Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>{roomName(r)}</Text><Text style={[styles.time, { color: t.soft }]}>{fmtTime(x.ts)}</Text></View>
                  <Text numberOfLines={2} style={[styles.prev, { color: t.soft }]}>⭐ {x.sender === S.userId ? 'You: ' : ''}{x.body}</Text>
                </View>
              </Pressable>
            );
          }} />
      ) : (
        <FlatList
          data={list} keyExtractor={r => r.id} extraData={[v, selected]}
          renderItem={({ item }) => <Row r={item} t={t} open={open} onMore={setMore} selected={wide && item.id === selected} fs={fs} v={v} compact={compact} />}
          ListHeaderComponent={header} ListFooterComponent={searchFooter}
          ListEmptyComponent={q ? undefined : (
            <View style={styles.empty}>
              {!S.ready ? <><ActivityIndicator /><Text style={[styles.emptyTxt, { color: t.soft }]}>Syncing your chats…</Text></>
                : <Text style={[styles.emptyTxt, { color: t.soft }]}>{kind === 'unread' ? 'All caught up ✓' : 'No chats yet'}</Text>}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: ins.bottom + 16 }}
          keyboardDismissMode="on-drag" initialNumToRender={14} windowSize={11}
        />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, flexDirection: 'row' }}>
      {listPane}
      {wide && (
        <View style={{ flex: 1 }}>
          {selected && S.rooms.get(selected) ? <ChatView key={selected} id={selected} embedded /> : (
            <View style={[styles.empty, { flex: 1, justifyContent: 'center' }]}>
              <Ionicons name="chatbubbles-outline" size={56} color={t.soft} />
              <Text style={[styles.emptyTxt, { color: t.soft }]}>Pick a chat</Text>
            </View>
          )}
        </View>
      )}

      {/* chat actions */}
      <Sheet visible={!!more} onClose={() => setMore(null)} title={more ? roomName(more) : ''}>
        {more && <SheetGroup>
          <SheetItem label={isPinned(more) ? 'Unpin' : 'Pin'} icon={<Ionicons name="pin" size={20} color={t.ink} />} onPress={() => { setTag(more, 'm.favourite', !isPinned(more)); setMore(null); }} />
          <SheetItem label={isUnread(more) ? 'Mark as read' : 'Mark as unread'} icon={<Ionicons name="mail-unread" size={20} color={t.ink} />} onPress={() => { isUnread(more) ? markRead(more) : setMarkedUnread(more, true); setMore(null); }} />
          <SheetItem label={S.muted.has(more.id) ? 'Unmute' : 'Mute notifications'} icon={<Ionicons name={S.muted.has(more.id) ? 'notifications' : 'notifications-off'} size={20} color={t.ink} />} onPress={() => { setMuted(more, !S.muted.has(more.id)).catch(() => Alert.alert('Could not change mute')); setMore(null); }} />
          <SheetItem label={S.reminders[more.id] ? 'Reminder: ' + fmtWhen(S.reminders[more.id]) : 'Remind me'} icon={<Ionicons name="alarm" size={20} color={t.ink} />} onPress={() => { const m = more; setMore(null); setTimeout(() => setRemind(m), 250); }} />
          <SheetItem label={isArchived(more) ? 'Unarchive' : 'Archive'} last icon={<Ionicons name="archive" size={20} color={t.ink} />} onPress={() => { setTag(more, 'm.lowpriority', !isArchived(more)); setMore(null); }} />
        </SheetGroup>}
      </Sheet>
      <Sheet visible={!!remind} onClose={() => setRemind(null)} title={remind ? 'Remind me about ' + roomName(remind) : ''}>
        {remind && <SheetGroup>
          {quickTimes().map(([label, ts]) => <SheetItem key={label} label={label} onPress={() => { setReminder(remind, ts); setRemind(null); }} />)}
          {S.reminders[remind.id] ? <SheetItem label="Remove reminder" danger last onPress={() => { setReminder(remind, null); setRemind(null); }} /> : null}
        </SheetGroup>}
      </Sheet>
      <Sheet visible={newChat} onClose={() => setNewChat(false)} title="New WhatsApp chat">
        <TextInput value={num} onChangeText={setNum} placeholder="Phone number with country code, e.g. +91 98765 43210" placeholderTextColor={t.soft} keyboardType="phone-pad"
          style={[styles.numInput, { backgroundColor: t.dark ? '#2C2C2E' : '#fff', color: t.ink }]} autoFocus />
        <Pressable onPress={async () => {
          try {
            const digits = await startWhatsAppChat(num); setNewChat(false); setNum('');
            const known = new Set(S.rooms.keys()); const t0 = Date.now();
            const iv = setInterval(() => {
              const hit = [...S.rooms.values()].find(x => (!known.has(x.id) || x.events.length) && others(x).some(id => id.includes(digits)));
              if (hit) { clearInterval(iv); open(hit.id); } else if (Date.now() - t0 > 20e3) { clearInterval(iv); Alert.alert('Started', 'Check the WhatsApp setup chat (Accounts) for the reply.'); }
            }, 1500);
          } catch (e: any) { Alert.alert('Could not start chat', e.message || ''); }
        }} style={[styles.bigBtn, { backgroundColor: t.primary }]}><Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 17 }}>Start chat</Text></Pressable>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 6 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  search: { marginHorizontal: 16, marginTop: 10, height: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  kinds: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { paddingHorizontal: 16, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12 },
  meta: { flex: 1, paddingVertical: 12, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 76 },
  l1: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: 17 },
  time: { fontSize: 14 },
  l2: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  prev: { flex: 1, fontSize: 15, lineHeight: 20 },
  tick: { fontSize: 13, fontWeight: '600' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 13, fontWeight: '700' },
  archIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  status: { textAlign: 'center', fontSize: 13, paddingBottom: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTxt: { fontSize: 16 },
  actions: { flexDirection: 'row' },
  act: { width: 78, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  switcher: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, borderRadius: 24, padding: 4, overflow: 'hidden', justifyContent: 'space-between' },
  swBtn: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swBadge: { position: 'absolute', top: 1, right: 8, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  swBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  numInput: { height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, marginBottom: 10 },
  bigBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
});
