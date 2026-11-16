import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Linking, Modal,
  ActionSheetIOS, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, Room, MEvent, NETS, roomName, netOf, botNetOf, isGroup, memberName, memberCount, mediaSource, markRead, sendText, sendImage,
  loadOlder, react, mdPlain, captionOf, stripReply, bodyPreview, hueFor } from '@/lib/matrix';
import { useTheme, useStore, Theme } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';

type Item = { key: string; kind: 'day'; label: string } | { key: string; kind: 'msg'; ev: MEvent; first: boolean; last: boolean };
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const URL_RE = /(https?:\/\/[^\s<>()\]]+)/g;

function dayLabel(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function Linked({ text, style, linkColor }: { text: string; style: any; linkColor: string }) {
  const parts = text.split(URL_RE);
  return (
    <Text style={style} selectable>
      {parts.map((p, i) => URL_RE.test(p) || /^https?:\/\//.test(p)
        ? <Text key={i} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(p.replace(/[.,;:!?'")]+$/, ''))}>{p}</Text>
        : <Text key={i}>{p}</Text>)}
    </Text>
  );
}

const Bubble = memo(function Bubble({ r, ev, first, last, t, onLong, onPhoto, width, v }:
  { r: Room; ev: MEvent; first: boolean; last: boolean; t: Theme; onLong: (ev: MEvent) => void; onPhoto: (mxc: string) => void; width: number; v: number }) {
  const mine = ev.sender === S.userId;
  const c = ev.content || {};
  const bg = mine ? t.bubbleOut : t.bubbleIn, fg = mine ? t.bubbleOutText : t.ink;
  const group = isGroup(r);
  const reacts = r.reacts.get(ev.event_id);
  const reactList = reacts ? [...reacts.entries()].filter(([, s]) => s.size) : [];
  const time = new Date(ev.origin_server_ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const maxW = Math.min(width * 0.78, 420);
  let body: React.ReactNode;
  const kind = ev.type === 'm.sticker' ? 'm.image' : c.msgtype;
  if (ev.redacted) body = <Text style={[styles.txt, { color: t.soft, fontStyle: 'italic' }]}>Message deleted</Text>;
  else if (kind === 'm.image' && c.url) {
    const info = c.info || {}; const ratio = info.w && info.h ? info.w / info.h : 4 / 3;
    const w = Math.min(maxW, 280); const cap = mdPlain(captionOf(c));
    body = (
      <View>
        <Pressable onPress={() => onPhoto(c.url)} onLongPress={() => onLong(ev)}>
          <Image source={mediaSource(c.url, 640)} style={{ width: w, height: Math.min(w / ratio, 380), borderRadius: 16, backgroundColor: t.fill }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        </Pressable>
        {!!cap && <Linked text={cap} style={[styles.txt, { color: fg, paddingHorizontal: 12, paddingTop: 6 }]} linkColor={mine ? fg : t.blue} />}
      </View>
    );
  } else if (kind === 'm.video' || kind === 'm.audio' || kind === 'm.file') {
    body = <Text style={[styles.txt, { color: fg }]}>{bodyPreview(ev)}{'\n'}<Text style={{ color: t.soft, fontSize: 13 }}>Open it in the web Inbox for now</Text></Text>;
  } else {
    const text = kind === 'm.emote' ? '* ' + c.body : mdPlain(stripReply(c.body || ''));
    body = <Linked text={text} style={[styles.txt, { color: fg }]} linkColor={mine ? fg : t.blue} />;
  }
  const isMedia = kind === 'm.image' && !ev.redacted;
  return (
    <View style={[styles.msgRow, { justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: first ? 8 : 2 }]}>
      <View style={{ maxWidth: maxW, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {group && !mine && first && <Text style={[styles.who, { color: hueFor(ev.sender) }]}>{memberName(r, ev.sender)}</Text>}
        <Pressable onLongPress={() => onLong(ev)} delayLongPress={300}
          style={[isMedia ? styles.media : styles.bubble, !isMedia && { backgroundColor: bg },
            !isMedia && mine && last && { borderBottomRightRadius: 6 }, !isMedia && !mine && last && { borderBottomLeftRadius: 6 },
            ev.pending && { opacity: 0.6 }, ev.failed && { borderWidth: 1, borderColor: t.red }]}>
          {body}
          {!isMedia && <Text style={[styles.time, { color: mine ? (t.dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)') : t.soft }]}>{ev.edited ? 'edited · ' : ''}{time}{ev.failed ? ' · not sent' : ''}</Text>}
        </Pressable>
        {reactList.length > 0 && (
          <View style={[styles.reacts, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
            {reactList.map(([k, s]) => (
              <Pressable key={k} onPress={() => react(r, ev, k)} style={[styles.react, { backgroundColor: t.surface, borderColor: s.has(S.userId!) ? t.blue : t.line }]}>
                <Text style={{ fontSize: 14, color: t.ink }}>{k}{s.size > 1 ? ' ' + s.size : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const r = S.rooms.get(id!);
  const [text, setText] = useState(''); const [replyTo, setReplyTo] = useState<MEvent | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => { S.current = id!; if (r) markRead(r); return () => { if (S.current === id) S.current = null; }; }, [id]);
  useEffect(() => { if (r && r.unread) markRead(r); }, [v]);

  const items = useMemo<Item[]>(() => {
    if (!r) return [];
    const evs = r.events; const out: Item[] = [];
    let lastDay = '';
    evs.forEach((ev, i) => {
      const day = new Date(ev.origin_server_ts).toDateString();
      if (day !== lastDay) { out.push({ key: 'd' + day, kind: 'day', label: dayLabel(ev.origin_server_ts) }); lastDay = day; }
      const prev = evs[i - 1], next = evs[i + 1];
      const near = (a?: MEvent, b?: MEvent) => !!a && !!b && a.sender === b.sender && Math.abs(a.origin_server_ts - b.origin_server_ts) < 5 * 60e3
        && new Date(a.origin_server_ts).toDateString() === new Date(b.origin_server_ts).toDateString();
      out.push({ key: ev.txn || ev.event_id, kind: 'msg', ev, first: !near(prev, ev), last: !near(ev, next) });
    });
    return out.reverse();
  }, [v, id]);

  if (!r) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  const n = netOf(r) || botNetOf(r);
  const sub = r.typing.length ? 'typing…' : isGroup(r) ? `${memberCount(r)} members${n ? ' · ' + NETS[n].label : ''}` : n ? NETS[n].label : '';

  function onLong(ev: MEvent) {
    if (ev.redacted || ev.pending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const txt = mdPlain(stripReply(ev.content?.body || ''));
    const opts: [string, () => void][] = [
      ...QUICK.map(e => [e, () => react(r!, ev, e)] as [string, () => void]),
      ['Reply', () => { setReplyTo(ev); inputRef.current?.focus(); }],
      ['Copy', () => { Clipboard.setStringAsync(txt).catch(() => {}); }],
    ];
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...opts.map(o => o[0]), 'Cancel'], cancelButtonIndex: opts.length }, i => { if (i < opts.length) opts[i][1](); });
    else Alert.alert('Message', undefined, [...opts.slice(QUICK.length).map(([text, onPress]) => ({ text, onPress })), { text: '👍', onPress: () => react(r!, ev, '👍') }, { text: 'Cancel', style: 'cancel' as const }]);
  }
  async function send() {
    const s = text.trim(); if (!s) return;
    setText(''); const rt = replyTo; setReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await sendText(r!, s, rt);
  }
  async function attach() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: false });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setSending(true);
    try { await sendImage(r!, a.uri, a.mimeType || 'image/jpeg', a.width, a.height, a.fileName || 'photo.jpg'); }
    catch (e: any) { Alert.alert('Could not send photo', e.message || ''); }
    setSending(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={items}
          inverted
          keyExtractor={it => it.key}
          extraData={v}
          renderItem={({ item }) => item.kind === 'day'
            ? <View style={styles.dayWrap}><Text style={[styles.day, { color: t.soft, backgroundColor: t.fill }]}>{item.label}</Text></View>
            : <Bubble r={r} ev={item.ev} first={item.first} last={item.last} t={t} onLong={onLong} onPhoto={setPhoto} width={width} v={v} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: ins.top + 70, paddingHorizontal: 10 }}
          onEndReached={() => loadOlder(r)}
          onEndReachedThreshold={0.4}
          ListFooterComponent={r.loadingOlder ? <ActivityIndicator style={{ margin: 12 }} /> : undefined}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
        {/* composer */}
        <View style={[styles.composerWrap, { paddingBottom: Math.max(ins.bottom, 8) }]}>
          {replyTo && (
            <View style={[styles.replyBar, { backgroundColor: t.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.blue, fontWeight: '600', fontSize: 13 }}>Replying to {replyTo.sender === S.userId ? 'yourself' : memberName(r, replyTo.sender)}</Text>
                <Text numberOfLines={1} style={{ color: t.soft, fontSize: 14 }}>{bodyPreview(replyTo)}</Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={10}><Ionicons name="close-circle" size={22} color={t.soft} /></Pressable>
            </View>
          )}
          <View style={styles.composer}>
            <Pressable onPress={attach} hitSlop={8} style={[styles.round, { backgroundColor: t.fill }]}>
              {sending ? <ActivityIndicator /> : <Ionicons name="add" size={24} color={t.ink} />}
            </Pressable>
            <TextInput ref={inputRef} value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={t.soft}
              multiline style={[styles.input, { backgroundColor: t.fill, color: t.ink }]} />
            {!!text.trim() && (
              <Pressable onPress={send} style={({ pressed }) => [styles.round, { backgroundColor: t.primary, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                <Ionicons name="arrow-up" size={22} color={t.primaryText} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* glass header */}
      <BlurView intensity={t.dark ? 40 : 60} tint={t.dark ? 'dark' : 'light'} style={[styles.header, { paddingTop: ins.top, borderBottomColor: t.line }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={30} color={t.ink} />
        </Pressable>
        <Avatar room={r} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={[styles.hName, { color: t.ink }]}>{roomName(r)}</Text>
          {!!sub && <Text numberOfLines={1} style={[styles.hSub, { color: r.typing.length ? t.blue : t.soft }]}>{sub}</Text>}
        </View>
      </BlurView>

      {/* full-screen photo */}
      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <Pressable style={styles.viewer} onPress={() => setPhoto(null)}>
          {photo && <Image source={mediaSource(photo)} style={{ width, height: height * 0.85 }} contentFit="contain" transition={150} />}
          <Text style={[styles.viewerClose, { top: ins.top + 12 }]}>✕</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  backTxt: { fontSize: 38, lineHeight: 40, fontWeight: '300' },
  hName: { fontSize: 17, fontWeight: '600' },
  hSub: { fontSize: 13 },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  day: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  msgRow: { flexDirection: 'row' },
  who: { fontSize: 12, fontWeight: '600', marginLeft: 12, marginBottom: 2 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  media: { borderRadius: 16, overflow: 'hidden' },
  txt: { fontSize: 17, lineHeight: 22 },
  time: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  reacts: { flexDirection: 'row', gap: 4, marginTop: -4, paddingHorizontal: 6 },
  react: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  composerWrap: { paddingHorizontal: 10, paddingTop: 6, gap: 6 },
  replyBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 38, maxHeight: 140, borderRadius: 19, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 17 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', right: 20, color: '#fff', fontSize: 24 },
});
