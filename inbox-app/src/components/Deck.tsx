// Home, new look (Nov 2026): "the Deck". One person who's waiting on you at a time, as a card with their latest
// messages. Reply on the card, or swipe right / tap Done (marks it read) and left / tap Later (comes back in an hour,
// via the chat reminder). Every other chat is in "Everything else" (the full list with search) or, on the open Duo,
// the "All chats" side of the switch.
import { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, PanResponder, Modal, useWindowDimensions, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { S, Room, MEvent, NETS, Net, visibleRooms, roomName, isUnread, isArchived, netOf, isGroup, memberName, bodyPreview,
  markRead, sendText, setReminder, fmtTime, reelLink, igOpenUrl } from '@/lib/matrix';
import { useTheme, useStore, Theme, FONT_TITLE } from '@/lib/theme';
import { openChat, openDetail, useLayout, setListTab, getRootTop, useStatusGutter } from '@/lib/layout';
import { Avatar } from '@/components/Avatar';
import { ConnBanner } from '@/components/ConnStatus';
import { useConns, connColor } from '@/lib/conn';
import { ChatList } from '@/components/ChatList';

const LATER_MS = 60 * 60 * 1000;
const SHOWN = new Set(['m.room.message', 'm.sticker', 'm.call.invite']);

// A card stays in the Deck until you choose Done or Later — opening the chat (which marks it read) doesn't remove it.
const kept = new Set<string>();
export function keepInDeck(id: string) { kept.add(id); }
function release(id: string) { kept.delete(id); }

/** People waiting on you: unread (or opened from the Deck), not muted, not archived, not put off with Later. Newest first. */
export function waitingRooms(tab: 'all' | Net) {
  const now = Date.now();
  return visibleRooms()
    .filter(r => (isUnread(r) || kept.has(r.id)) && !S.muted.has(r.id) && !isArchived(r) && !(S.reminders[r.id] > now))
    .filter(r => tab === 'all' || netOf(r) === tab)
    .sort((a, b) => b.lastTs - a.lastTs);
}

/** Every new message (at least the last 4, at most 40), oldest first. The card scrolls to show them all. */
function lastLines(r: Room): MEvent[] {
  const n = Math.min(Math.max(r.unread || 0, 4), 40);
  const out: MEvent[] = [];
  for (let i = r.events.length - 1; i >= 0 && out.length < n; i--) {
    const ev = r.events[i]; if (ev.redacted || !SHOWN.has(ev.type)) continue; out.unshift(ev);
  }
  return out;
}

const URL_RE = /(https?:\/\/[^\s<>()\]]+)/g;
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/[^\s<>()\]]+/;
/** One message on the card: links are tappable; Instagram posts/reels get an "Open in Instagram" button. */
function Line({ ev, t, fs, onOpen }: { ev: MEvent; t: Theme; fs: number; onOpen: () => void }) {
  const c = ev.content || {};
  const text = bodyPreview(ev);
  const ig = reelLink(c) || (IG_RE.exec(c.body || '') || [])[0] || null;
  const parts = text.split(URL_RE);
  return (
    <Pressable onPress={onOpen}>
      <Text style={{ color: t.ink, fontSize: 15 * fs, lineHeight: 21 * fs }}>
        {parts.map((p, i) => /^https?:\/\//.test(p)
          ? <Text key={i} style={{ color: t.blue, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(IG_RE.test(p) ? igOpenUrl(c, p) : p.replace(/[.,;:!?'")]+$/, ''))}>{p}</Text>
          : <Text key={i}>{p}</Text>)}
      </Text>
      {ig && <Pressable onPress={() => Linking.openURL(igOpenUrl(c, ig))} accessibilityLabel="Open in Instagram"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: t.fill }}>
        <Ionicons name={/\/(reel|reels)\//.test(ig) ? 'film-outline' : 'logo-instagram'} size={15} color={t.ink} />
        <Text style={{ color: t.ink, fontWeight: '600', fontSize: 14 }}>Open in Instagram</Text>
      </Pressable>}
    </Pressable>
  );
}

function Card({ r, t, fs, onDone, onLater }: { r: Room; t: Theme; fs: number; onDone: () => void; onLater: () => void }) {
  const [text, setText] = useState('');
  const net = netOf(r);
  const lines = lastLines(r);
  const group = isGroup(r);
  const scroller = useRef<any>(null);
  const openFull = () => { keepInDeck(r.id); openChat(r.id); };
  const send = (msg: string) => {
    const m = msg.trim(); if (!m) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    sendText(r, m).catch(() => {}); setText(''); onDone();
  };
  return (
    <View style={[styles.card, { backgroundColor: t.fill }]}>
      <View style={styles.cardHead}>
        <Avatar room={r} size={54} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={[styles.cardName, { color: t.ink, fontFamily: FONT_TITLE }]}>{roomName(r)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {net && <View style={[styles.netDot, { backgroundColor: NETS[net].color }]} />}
            <Text style={{ color: t.soft, fontSize: 12 }}>{net ? NETS[net].label : 'Private'} · {r.unread ? `${r.unread} new · ` : ''}{fmtTime(r.lastTs)}</Text>
          </View>
        </View>
        <Pressable onPress={() => { keepInDeck(r.id); openChat(r.id); }} accessibilityLabel="Open the full chat" style={[styles.iconBtn, { backgroundColor: t.bg }]}>
          <Ionicons name="arrow-up-outline" size={18} color={t.ink} style={{ transform: [{ rotate: '45deg' }] }} />
        </Pressable>
      </View>
      <ScrollView ref={scroller} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', gap: 8 }}
        showsVerticalScrollIndicator={false} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {lines.length > 4 && <Text style={{ color: t.soft, fontSize: 12, textAlign: 'center' }}>{lines.length} new messages · scroll up for all</Text>}
        {lines.map(ev => {
          const mine = ev.sender === S.userId;
          return (
            <View key={ev.event_id} style={[styles.line, mine
              ? { alignSelf: 'flex-end', backgroundColor: t.bubbleOut, borderColor: t.bubbleOutBorder, borderWidth: StyleSheet.hairlineWidth, borderTopRightRadius: 4 }
              : { alignSelf: 'flex-start', backgroundColor: t.surface, borderTopLeftRadius: 4 }]}>
              {group && !mine && <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600', marginBottom: 2 }}>{memberName(r, ev.sender).split(' ')[0]}</Text>}
              <Line ev={ev} t={t} fs={fs} onOpen={openFull} />
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {['👍', 'On it', 'Call you soon'].map(q => (
          <Pressable key={q} onPress={() => send(q)} style={[styles.quick, { backgroundColor: t.bg }]}><Text style={{ color: t.ink, fontSize: 14 }}>{q}</Text></Pressable>
        ))}
      </View>
      <View style={[styles.reply, { backgroundColor: t.bg }]}>
        <TextInput value={text} onChangeText={setText} placeholder={`Reply to ${roomName(r).split(' ')[0]}…`} placeholderTextColor={t.soft}
          style={{ flex: 1, color: t.ink, fontSize: 16 }} returnKeyType="send" onSubmitEditing={() => send(text)} blurOnSubmit={false} />
        {!!text.trim() && <Pressable onPress={() => send(text)} accessibilityLabel="Send" style={[styles.sendBtn, { backgroundColor: t.accent }]}><Ionicons name="arrow-up" size={18} color={t.accentInk} /></Pressable>}
      </View>
    </View>
  );
}

export function Deck({ wide = false }: { wide?: boolean }) {
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const { tab } = useLayout(); const gut = useStatusGutter();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<'deck' | 'all'>('deck');
  const [kb, setKb] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardWillShow', () => setKb(true));
    const b = Keyboard.addListener('keyboardWillHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  const fs = S.prefs.fontScale;
  const topIns = getRootTop() >= 0 ? Math.min(ins.top, getRootTop()) : ins.top;
  const { list } = useConns();
  const connDot = list.find(c => c.state === 'down' || c.state === 'off') ? connColor.down : list.find(c => c.state !== 'ok' && c.state !== 'unknown') ? connColor.syncing : null;

  // re-check every minute so cards put off with Later come back on time
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 60e3); return () => clearInterval(iv); }, []);

  const deck = useMemo(() => waitingRooms(tab), [v, tab]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: waitingRooms('all').length };
    for (const n of Object.keys(NETS)) c[n] = waitingRooms(n as Net).length;
    return c;
  }, [v]);
  const top = deck[0], next = deck[1];

  // swipe
  const dx = useRef(new Animated.Value(0)).current;
  const topRef = useRef<Room | undefined>(top); topRef.current = top;
  const finish = (dir: 1 | -1) => {
    const r = topRef.current; if (!r) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(dx, { toValue: dir * (width + 80), duration: 180, useNativeDriver: true }).start(() => {
      release(r.id);
      if (dir > 0) markRead(r); else setReminder(r, Date.now() + LATER_MS);
      dx.setValue(0);
    });
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: Animated.event([null, { dx }], { useNativeDriver: false }),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > 110 || g.vx > 0.8) finish(1);
      else if (g.dx < -110 || g.vx < -0.8) finish(-1);
      else Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  const rotate = dx.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  const doneOp = dx.interpolate({ inputRange: [20, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const laterOp = dx.interpolate({ inputRange: [-90, -20], outputRange: [1, 0], extrapolate: 'clamp' });

  if (!S.token) return null;
  const tabs: ['all' | Net, string][] = [['all', 'Everyone'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram']];
  if (counts.messenger) tabs.push(['messenger', 'Messenger']);
  const left = deck.length;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg, paddingTop: topIns + 10, paddingHorizontal: 18, paddingBottom: kb ? 10 : Math.max(ins.bottom, 14) }}>
      {!kb && <>
      <View style={[styles.head, { paddingRight: gut }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.title, { color: t.ink, fontFamily: FONT_TITLE }]}>Inbox</Text>
          <Text style={{ color: t.soft, fontSize: 13 }}>{mode === 'all' ? 'All chats' : left ? `${left} ${left === 1 ? 'person needs' : 'people need'} you · swipe or tap` : 'Nobody is waiting on you'}</Text>
        </View>
        <Pressable onPress={() => openDetail('/accounts')} accessibilityLabel="Connections and settings" style={[styles.iconBtn, { backgroundColor: t.fill }]}>
          <Text style={{ color: t.accent, fontFamily: FONT_TITLE, fontSize: 17 }}>{(S.userId || 'V').replace(/^@/, '').slice(0, 1).toUpperCase()}</Text>
          {connDot && <View style={[styles.connDot, { backgroundColor: connDot, borderColor: t.fill }]} />}
        </Pressable>
      </View>

      <ConnBanner />

      {mode === 'deck' && (
        <Pressable onPress={() => { setSearchOpen(true); setSheet(true); }} accessibilityLabel="Search all chats and messages" style={[styles.search, { backgroundColor: t.surface }]}>
          <Ionicons name="search" size={17} color={t.soft} />
          <Text style={{ color: t.soft, fontSize: 15 }}>Search chats and messages</Text>
        </Pressable>
      )}
      </>}

      {wide && (
        <View style={[styles.seg, { backgroundColor: t.surface }]}>
          {([['deck', `Needs you · ${counts.all}`], ['all', 'All chats']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[styles.segBtn, mode === k && { backgroundColor: t.ink }]}>
              <Text style={{ color: mode === k ? t.bg : t.soft, fontWeight: '600', fontSize: 14 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {mode === 'all' ? (
        <View style={{ flex: 1, marginHorizontal: -18, marginTop: 6, overflow: 'hidden' }}><ChatList tab={tab} onTab={k => setListTab(k as any)} embedded /></View>
      ) : (
        <>
          {!kb && <View style={styles.tabs}>
            {tabs.map(([k, label]) => {
              const on = tab === k;
              return (
                <Pressable key={k} onPress={() => setListTab(k as any)} style={styles.tab} accessibilityState={{ selected: on }}>
                  <Text style={{ color: on ? t.ink : t.soft, fontWeight: '600', fontSize: 14 }}>{label}</Text>
                  <View style={[styles.count, { backgroundColor: on ? t.accent : t.fill }]}><Text style={{ color: on ? t.accentInk : t.soft, fontSize: 12, fontWeight: '700' }}>{counts[k] || 0}</Text></View>
                </Pressable>
              );
            })}
          </View>}

          <View style={{ flex: 1, marginTop: kb ? 0 : 6 }}>
            {top ? (
              <>
                {next && !kb && <View style={[styles.peek, { backgroundColor: t.dark ? '#15171B' : '#E9E9E4' }]}><Text style={{ color: t.soft, fontSize: 13 }}>Next: {roomName(next)}</Text></View>}
                <Animated.View key={top.id} {...pan.panHandlers} style={[StyleSheet.absoluteFill, { top: kb ? 0 : 14, bottom: kb ? 0 : 66, transform: [{ translateX: dx }, { rotate }] }]}>
                  <Card r={top} t={t} fs={fs} onDone={() => { release(top.id); markRead(top); }} onLater={() => { release(top.id); setReminder(top, Date.now() + LATER_MS); }} />
                  <Animated.View pointerEvents="none" style={[styles.stamp, { left: 18, borderColor: t.accent, opacity: doneOp }]}><Text style={[styles.stampTxt, { color: t.accent }]}>DONE</Text></Animated.View>
                  <Animated.View pointerEvents="none" style={[styles.stamp, { right: 18, borderColor: t.ink, opacity: laterOp }]}><Text style={[styles.stampTxt, { color: t.ink }]}>LATER</Text></Animated.View>
                </Animated.View>
                {!kb && <View style={styles.actions}>
                  <Pressable onPress={() => finish(-1)} style={[styles.bigBtn, { backgroundColor: t.surface }]}>
                    <Ionicons name="time-outline" size={18} color={t.ink} /><Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>Later</Text>
                  </Pressable>
                  <Pressable onPress={() => finish(1)} style={[styles.bigBtn, { backgroundColor: t.accent }]}>
                    <Ionicons name="checkmark" size={20} color={t.accentInk} /><Text style={{ color: t.accentInk, fontWeight: '700', fontSize: 15 }}>Done</Text>
                  </Pressable>
                </View>}
              </>
            ) : (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: t.accent }]}><Ionicons name="checkmark" size={40} color={t.accentInk} /></View>
                <Text style={{ color: t.ink, fontFamily: FONT_TITLE, fontSize: 26 }}>All caught up</Text>
                <Text style={{ color: t.soft, fontSize: 14, textAlign: 'center' }}>{Object.values(S.reminders).some(ts => ts > Date.now()) ? 'Chats you put off come back on top in an hour' : 'New messages will appear here as cards'}</Text>
              </View>
            )}
          </View>

          {!wide && !kb && (
            <Pressable onPress={() => { setSearchOpen(false); setSheet(true); }} style={[styles.everything, { borderColor: t.line }]}>
              <Ionicons name="chevron-up" size={16} color={t.soft} />
              <Text style={{ color: t.soft, fontSize: 14 }}>Everything else · all other chats</Text>
            </Pressable>
          )}
        </>
      )}

      <Modal visible={sheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(false)}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
          <ChatList tab={tab} onTab={k => setListTab(k as any)} embedded onClose={() => setSheet(false)} focusSearch={searchOpen} />
        </GestureHandlerRootView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontSize: 34, letterSpacing: -0.5 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  connDot: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  seg: { flexDirection: 'row', borderRadius: 16, padding: 4, gap: 4, marginTop: 4 },
  segBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 18, marginTop: 4 },
  search: { height: 46, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginTop: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  count: { minWidth: 20, height: 20, borderRadius: 7, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  peek: { position: 'absolute', left: 11, right: 11, top: 0, bottom: 80, borderRadius: 30, paddingHorizontal: 20, paddingTop: 14 },
  card: { flex: 1, borderRadius: 30, padding: 18, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName: { fontSize: 22 },
  netDot: { width: 7, height: 7, borderRadius: 4 },
  line: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  quick: { height: 40, paddingHorizontal: 13, borderRadius: 12, justifyContent: 'center' },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, borderRadius: 16, paddingLeft: 14, paddingRight: 5 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', top: 20, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  stampTxt: { fontFamily: FONT_TITLE, fontSize: 16, letterSpacing: 1.5 },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10 },
  bigBtn: { flex: 1, height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  emptyIcon: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  everything: { height: 52, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
});
