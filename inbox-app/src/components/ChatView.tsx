import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Linking, Modal, Alert,
  ActivityIndicator, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Glass } from '@/components/Glass';
import { startCall, callsAvailable } from '@/lib/calls';
import { useStatusGutter } from '@/lib/layout';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S, Room, MEvent, NETS, roomName, netOf, botNetOf, isGroup, memberName, memberCount, mediaSource, markRead, sendText, sendImage,
  loadOlder, react, mdPlain, captionOf, stripReply, bodyPreview, hueFor, redact, editMessage, forward, isStarred, toggleStar,
  visibleRooms, setDraft, sendTyping, scheduleSend, sendVoice, linkPreview, reelLink, isUnread, sendRich, roomMembers, setupChips , isPrivateRoom } from '@/lib/matrix';
import { useTheme, useStore, Theme } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Sheet, SheetGroup, SheetItem } from '@/components/Sheet';
import { VideoBubble, VoiceBubble, ReelBubble } from '@/components/Media';
import { quickTimes, fmtWhen, EMOJI_ALL } from '@/lib/time';
import { PhotoViewer } from '@/components/PhotoViewer';

type Item = { key: string; kind: 'day'; label: string } | { key: string; kind: 'unread' } | { key: string; kind: 'msg'; ev: MEvent; first: boolean; last: boolean; recent: boolean };
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
    <Text style={style}>
      {parts.map((p, i) => /^https?:\/\//.test(p)
        ? <Text key={i} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(p.replace(/[.,;:!?'")]+$/, ''))}>{p}</Text>
        : <Text key={i}>{p}</Text>)}
    </Text>
  );
}

function Preview({ url, t, mine }: { url: string; t: Theme; mine: boolean }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { let on = true; linkPreview(url).then(v => { if (on) setD(v); }); return () => { on = false; }; }, [url]);
  if (!d || !(d['og:title'] || d['og:description'])) return null;
  const img = mediaSource(d['og:image'], 320);
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={[styles.lp, { backgroundColor: mine ? (t.dark ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.14)') : t.fill }]}>
      {img && <Image source={img} style={{ width: '100%', height: 140 }} contentFit="cover" />}
      <View style={{ padding: 8 }}>
        <Text numberOfLines={2} style={{ fontWeight: '700', color: mine ? t.bubbleOutText : t.ink }}>{d['og:title']}</Text>
        <Text numberOfLines={1} style={{ color: mine ? t.bubbleOutText : t.soft, opacity: 0.7, fontSize: 12 }}>{d['og:site_name'] || host}</Text>
      </View>
    </Pressable>
  );
}

const Bubble = memo(function Bubble({ r, ev, first, last, recent, t, onLong, onReply, onPhoto, width, fs }:
  { r: Room; ev: MEvent; first: boolean; last: boolean; recent: boolean; t: Theme; onLong: (ev: MEvent) => void; onReply: (ev: MEvent) => void; onPhoto: (mxc: string) => void; width: number; fs: number; v: number }) {
  const sw = useRef<SwipeableMethods>(null);
  const mine = ev.sender === S.userId;
  const c = ev.content || {};
  const bg = mine ? t.bubbleOut : t.bubbleIn, fg = mine ? t.bubbleOutText : t.ink;
  const group = isGroup(r);
  const reacts = r.reacts.get(ev.event_id);
  const reactList = reacts ? [...reacts.entries()].filter(([, s]) => s.size) : [];
  const time = new Date(ev.origin_server_ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const maxW = Math.min(width * 0.78, 420);
  const kind = ev.type === 'm.sticker' ? 'm.image' : c.msgtype;
  const reel = !ev.redacted && (kind === 'm.video' || kind === 'm.image') ? reelLink(c) : null;
  const txtStyle = [styles.txt, { color: fg, fontSize: 17 * fs, lineHeight: 22 * fs }];
  const call = !mine && /\bcall/i.test(c.body || '') && /(incoming|missed|call (ended|started)|voice call|video call)/i.test(c.body || '') && (kind === 'm.notice');
  let body: React.ReactNode; let bare = false;
  if (ev.redacted) body = <Text style={[styles.txt, { color: t.soft, fontStyle: 'italic', fontSize: 16 * fs }]}>Message deleted</Text>;
  else if (reel) { bare = true; body = <ReelBubble c={c} link={reel} maxW={maxW} t={t} />; }
  else if (kind === 'm.image' && c.url) {
    bare = !captionOf(c);
    const info = c.info || {}; const ratio = info.w && info.h ? info.w / info.h : 4 / 3;
    const w = Math.min(maxW, 280); const cap = mdPlain(captionOf(c));
    body = (
      <View>
        <Pressable onPress={() => onPhoto(c.url)} onLongPress={() => onLong(ev)} delayLongPress={300}>
          <Image source={mediaSource(c.url, 640)} style={{ width: w, height: Math.min(w / ratio, 380), borderRadius: 16, backgroundColor: t.fill }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        </Pressable>
        {!!cap && <Linked text={cap} style={[txtStyle, { paddingHorizontal: 4, paddingTop: 6 }]} linkColor={mine ? fg : t.blue} />}
      </View>
    );
  } else if (kind === 'm.video' && c.url) { bare = true; body = <VideoBubble c={c} maxW={maxW} t={t} />; }
  else if (kind === 'm.audio' && c.url) body = <VoiceBubble c={c} mine={mine} t={t} />;
  else if (kind === 'm.file') body = <Text style={txtStyle}>📎 {c.body || 'File'}</Text>;
  else if (call) {
    body = (
      <View style={{ gap: 8 }}>
        <Text style={txtStyle}>📞 {c.body}</Text>
        <Pressable onPress={() => Linking.openURL(netOf(r) === 'instagram' ? 'instagram://direct-inbox' : netOf(r) === 'messenger' ? 'fb-messenger://' : 'whatsapp://')}
          style={{ alignSelf: 'flex-start', backgroundColor: t.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ color: t.primaryText, fontWeight: '600' }}>Open {NETS[netOf(r) || 'whatsapp'].label}</Text>
        </Pressable>
      </View>
    );
  } else {
    const text = kind === 'm.emote' ? '* ' + c.body : mdPlain(stripReply(c.body || ''));
    const url = recent ? (/\bhttps?:\/\/[^\s<>()\]]+/.exec(text) || [])[0] : null;
    body = <View><Linked text={text} style={txtStyle} linkColor={mine ? fg : t.blue} />{url && !/instagram\.com\/(reel|p)\//.test(url) && <Preview url={url.replace(/[.,;:!?'")]+$/, '')} t={t} mine={mine} />}</View>;
  }
  const replyTo = c['m.relates_to']?.['m.in_reply_to']?.event_id;
  const quoted = replyTo ? r.idx.get(replyTo) : null;
  const tick = mine ? (ev.pending ? '◷' : [...r.readBy.values()].some(id => { const x = r.idx.get(id); return x && x.origin_server_ts >= ev.origin_server_ts; }) ? '✓✓' : '✓') : '';
  const meta = `${isStarred(ev) ? '⭐ ' : ''}${ev.edited ? 'edited · ' : ''}${time}${ev.failed ? ' · not sent' : ''}`;
  return (
    <ReanimatedSwipeable ref={sw} friction={2} leftThreshold={60} overshootLeft={false} enabled={!ev.redacted && !ev.pending}
      hitSlop={{ left: -32 }} dragOffsetFromLeft={16}
      renderLeftActions={() => <View style={styles.swipeReply}><Ionicons name="arrow-undo" size={20} color={t.soft} /></View>}
      onSwipeableOpen={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onReply(ev); sw.current?.close(); }}>
      <View style={[styles.msgRow, { justifyContent: mine ? 'flex-end' : 'flex-start', paddingTop: first ? 8 : 2, backgroundColor: t.bg }]}>
        <View style={{ maxWidth: maxW, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {group && !mine && first && <Text style={[styles.who, { color: hueFor(ev.sender) }]}>{memberName(r, ev.sender)}</Text>}
          <Pressable onLongPress={() => onLong(ev)} delayLongPress={300}
            style={[bare ? styles.media : styles.bubble, !bare && { backgroundColor: bg },
              !bare && mine && last && { borderBottomRightRadius: 6 }, !bare && !mine && last && { borderBottomLeftRadius: 6 },
              ev.pending && { opacity: 0.6 }, ev.failed && { borderWidth: 1, borderColor: t.red }]}>
            {quoted && (
              <View style={[styles.quote, { borderLeftColor: hueFor(quoted.sender), backgroundColor: mine ? (t.dark ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.14)') : t.fill }]}>
                <Text style={{ color: hueFor(quoted.sender), fontWeight: '600', fontSize: 13 }}>{quoted.sender === S.userId ? 'You' : memberName(r, quoted.sender)}</Text>
                <Text numberOfLines={2} style={{ color: fg, opacity: 0.8, fontSize: 14 }}>{bodyPreview(quoted)}</Text>
              </View>
            )}
            {body}
            {!bare && <Text style={[styles.time, { color: mine ? (t.dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)') : t.soft }]}>
              {meta}{tick ? ' ' : ''}{tick ? <Text style={{ color: tick === '✓✓' ? t.blue : undefined }}>{tick}</Text> : null}</Text>}
          </Pressable>
          {bare && <Text style={[styles.time, { color: t.soft, marginHorizontal: 6 }]}>{meta}{tick ? ' ' + tick : ''}</Text>}
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
    </ReanimatedSwipeable>
  );
});

export function ChatView({ id, onBack, embedded }: { id: string; onBack?: () => void; embedded?: boolean }) {
  const v = useStore(); const t = useTheme(); const ins = useSafeAreaInsets(); const { width: winW, height } = useWindowDimensions(); const gut = useStatusGutter();
  const r = S.rooms.get(id);
  const [text, setText] = useState(S.drafts[id] || '');
  const [replyTo, setReplyTo] = useState<MEvent | null>(null); const [editing, setEditing] = useState<MEvent | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<MEvent | null>(null); const [grid, setGrid] = useState<MEvent | null>(null);
  const [fwd, setFwd] = useState<MEvent | null>(null); const [sched, setSched] = useState(false);
  const [up, setUp] = useState(false); const [newCount, setNewCount] = useState(0);
  const [attachSheet, setAttachSheet] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const mentions = useRef<{ id: string; name: string }[]>([]);
  const [width, setWidth] = useState(winW);
  const listRef = useRef<FlatList<Item>>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const unreadAtOpen = useRef<number>(r ? r.unread : 0);
  const lastCount = useRef(r ? r.events.length : 0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const fs = S.prefs.fontScale;

  useEffect(() => {
    setText(S.drafts[id] || ''); setReplyTo(null); setEditing(null); setPeople(null); setMentionQ(null); mentions.current = []; unreadAtOpen.current = r ? r.unread : 0; lastCount.current = r ? r.events.length : 0;
    S.current = id; if (r) markRead(r);
    return () => { if (S.current === id) S.current = null; };
  }, [id]);
  useEffect(() => {
    if (!r) return;
    if (r.unread || r.markedUnread) markRead(r);
    const n = r.events.length;
    if (up && n > lastCount.current) setNewCount(c => c + (n - lastCount.current));
    lastCount.current = n;
  }, [v]);

  const items = useMemo<Item[]>(() => {
    if (!r) return [];
    const evs = r.events; const out: Item[] = [];
    let lastDay = '';
    const unreadIdx = unreadAtOpen.current > 0 ? Math.max(0, evs.length - unreadAtOpen.current) : -1;
    evs.forEach((ev, i) => {
      const day = new Date(ev.origin_server_ts).toDateString();
      if (day !== lastDay) { out.push({ key: 'd' + day, kind: 'day', label: dayLabel(ev.origin_server_ts) }); lastDay = day; }
      if (i === unreadIdx) out.push({ key: 'unread', kind: 'unread' });
      const prev = evs[i - 1], next = evs[i + 1];
      const near = (a?: MEvent, b?: MEvent) => !!a && !!b && a.sender === b.sender && Math.abs(a.origin_server_ts - b.origin_server_ts) < 5 * 60e3
        && new Date(a.origin_server_ts).toDateString() === new Date(b.origin_server_ts).toDateString();
      out.push({ key: ev.txn || ev.event_id, kind: 'msg', ev, first: !near(prev, ev), last: !near(ev, next), recent: i >= evs.length - 30 });
    });
    return out.reverse();
  }, [v, id]);

  if (!r) return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  const n = netOf(r) || botNetOf(r);
  const sub = r.typing.length ? 'typing…' : isGroup(r) ? `${memberCount(r)} members${n ? ' · ' + NETS[n].label : ''}` : n ? NETS[n].label : '';
  const showInfo = () => router.push({ pathname: '/info/[id]', params: { id: r.id } });

  function onLong(ev: MEvent) { if (ev.redacted || ev.pending) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setMenu(ev); }
  function onChange(s: string) {
    setText(s); if (!editing) setDraft(r!.id, s);
    if (s.trim()) sendTyping(r!, true);
    const m = isGroup(r!) && !botNetOf(r!) ? /(^|\s)@([^\s@]{0,30})$/.exec(s) : null;
    setMentionQ(m ? m[2].toLowerCase() : null);
    if (m && !people) roomMembers(r!).then(setPeople).catch(() => setPeople([]));
  }
  function pickMention(p: { id: string; name: string }) {
    setText(text.replace(/@([^\s@]{0,30})$/, '@' + p.name + ' ')); mentions.current.push(p); setMentionQ(null);
  }
  async function send() {
    const s = text.trim(); if (!s) return;
    setText(''); setDraft(r!.id, ''); sendTyping(r!, false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (editing) { const ev = editing; setEditing(null); try { await editMessage(r!, ev, s); } catch { Alert.alert('Could not edit', 'WhatsApp only allows edits for about 15 minutes.'); } return; }
    const rt = replyTo; setReplyTo(null); setMentionQ(null);
    const ms = mentions.current; mentions.current = [];
    await sendRich(r!, s, ms, rt);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }
  async function attach(camera = false) {
    const res = camera
      ? await ImagePicker.requestCameraPermissionsAsync().then(p => p.granted ? ImagePicker.launchCameraAsync({ quality: 0.85 }) : null)
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 10, orderedSelection: true });
    if (!res || res.canceled || !res.assets?.length) return;
    setSending(true);
    let failed = 0;
    for (const a of res.assets) {
      try { await sendImage(r!, a.uri, a.mimeType || 'image/jpeg', a.width, a.height, a.fileName || 'photo.jpg'); } catch { failed++; }
    }
    if (failed) Alert.alert('Some photos didn’t send', `${failed} of ${res.assets.length} failed. Try again.`);
    setSending(false);
  }
  async function startRec() {
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) { Alert.alert('Microphone', 'Allow microphone access for Inbox in Settings to send voice messages.'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(); recorder.record(); setRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
  async function stopRec(sendIt: boolean) {
    const dur = rec.durationMillis || 0;
    await recorder.stop(); setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (!sendIt || !recorder.uri || dur < 700) return;
    setSending(true);
    try { await sendVoice(r!, recorder.uri, dur); } catch (e: any) { Alert.alert('Could not send voice message', e.message || ''); }
    setSending(false);
  }
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isUp = e.nativeEvent.contentOffset.y > 500;
    if (isUp !== up) { setUp(isUp); if (!isUp) setNewCount(0); }
  };
  const mineMenu = menu && menu.sender === S.userId;
  const menuText = menu ? mdPlain(stripReply(menu.content?.body || '')) : '';
  const targets = visibleRooms().filter(x => x.id !== r.id).sort((a, b) => b.lastTs - a.lastTs);
  const fmtRec = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={items}
          inverted
          keyExtractor={it => it.key}
          extraData={v}
          onScroll={onScroll}
          scrollEventThrottle={64}
          renderItem={({ item }) => item.kind === 'day'
            ? <View style={styles.dayWrap}><Text style={[styles.day, { color: t.soft, backgroundColor: t.fill }]}>{item.label}</Text></View>
            : item.kind === 'unread'
              ? <View style={styles.unreadLine}><View style={[styles.ul, { backgroundColor: t.line }]} /><Text style={{ color: t.soft, fontSize: 12, fontWeight: '600' }}>Unread messages</Text><View style={[styles.ul, { backgroundColor: t.line }]} /></View>
              : <Bubble r={r} ev={item.ev} first={item.first} last={item.last} recent={item.recent} t={t} onLong={onLong} onReply={setReplyTo} onPhoto={setPhoto} width={width} fs={fs} v={v} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: ins.top + 70, paddingHorizontal: 10 }}
          onEndReached={() => loadOlder(r)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={r.loadingOlder ? <ActivityIndicator style={{ margin: 12 }} /> : undefined}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        />
        {up && (
          <Pressable onPress={() => { listRef.current?.scrollToOffset({ offset: 0, animated: true }); setNewCount(0); }} style={[styles.jump, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="chevron-down" size={22} color={t.ink} />
            {newCount > 0 && <View style={[styles.jumpBadge, { backgroundColor: t.blue }]}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{newCount}</Text></View>}
          </Pressable>
        )}
        {/* composer */}
        <View style={[styles.composerWrap, { paddingBottom: Math.max(ins.bottom, 8) }]}>
          {mentionQ !== null && people && people.filter(p => p.name.toLowerCase().includes(mentionQ)).length > 0 && (
            <View style={[styles.mentions, { backgroundColor: t.surface }]}>
              {people.filter(p => p.name.toLowerCase().includes(mentionQ)).slice(0, 6).map(p => (
                <Pressable key={p.id} onPress={() => pickMention(p)} style={({ pressed }) => [styles.mentionRow, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
                  <View style={[styles.mAv, { backgroundColor: hueFor(p.id) }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{(p.name.replace(/[^\p{L}\p{N}]/gu, '')[0] || '#').toUpperCase()}</Text></View>
                  <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {botNetOf(r) && !recording && (
            <View style={styles.chips}>
              {setupChips(r).map(c => (
                <Pressable key={c} onPress={() => sendText(r, c)} style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? t.fill : t.surface, borderColor: t.line }]}>
                  <Text style={{ color: t.ink, fontWeight: '600', fontSize: 14 }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {(replyTo || editing) && (
            <View style={[styles.replyBar, { backgroundColor: t.surface }]}>
              <Ionicons name={editing ? 'pencil' : 'arrow-undo'} size={18} color={t.blue} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.blue, fontWeight: '600', fontSize: 13 }}>{editing ? 'Editing message' : 'Replying to ' + (replyTo!.sender === S.userId ? 'yourself' : memberName(r, replyTo!.sender))}</Text>
                <Text numberOfLines={1} style={{ color: t.soft, fontSize: 14 }}>{bodyPreview((editing || replyTo)!)}</Text>
              </View>
              <Pressable onPress={() => { if (editing) setText(S.drafts[r.id] || ''); setReplyTo(null); setEditing(null); }} hitSlop={10}><Ionicons name="close-circle" size={22} color={t.soft} /></Pressable>
            </View>
          )}
          {recording ? (
            <View style={styles.composer}>
              <Pressable onPress={() => stopRec(false)} style={[styles.round, { backgroundColor: t.fill }]}><Ionicons name="trash" size={20} color={t.red} /></Pressable>
              <View style={[styles.recBox, { backgroundColor: t.fill }]}>
                <View style={[styles.recDot, { backgroundColor: t.red }]} />
                <Text style={{ color: t.ink, fontSize: 17, fontVariant: ['tabular-nums'] }}>{fmtRec(rec.durationMillis || 0)}</Text>
                <Text style={{ color: t.soft, fontSize: 14, marginLeft: 'auto' }}>Recording…</Text>
              </View>
              <Pressable onPress={() => stopRec(true)} style={[styles.round, { backgroundColor: t.primary }]}><Ionicons name="arrow-up" size={22} color={t.primaryText} /></Pressable>
            </View>
          ) : (
            <View style={styles.composer}>
              <Pressable onPress={() => setAttachSheet(true)} hitSlop={8} style={[styles.round, { backgroundColor: t.fill }]}>
                {sending ? <ActivityIndicator /> : <Ionicons name="add" size={24} color={t.ink} />}
              </Pressable>
              <TextInput ref={inputRef} value={text} onChangeText={onChange} placeholder="Message" placeholderTextColor={t.soft}
                multiline style={[styles.input, { backgroundColor: t.fill, color: t.ink, fontSize: 17 * Math.max(1, fs) }]}
                autoCapitalize={botNetOf(r) ? 'none' : 'sentences'} autoCorrect={!botNetOf(r)} spellCheck={!botNetOf(r)} />
              {text.trim() ? (
                <Pressable onPress={send} onLongPress={() => { if (!editing && !botNetOf(r)) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); setSched(true); } }} delayLongPress={350}
                  style={({ pressed }) => [styles.round, { backgroundColor: t.primary, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                  <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={22} color={t.primaryText} />
                </Pressable>
              ) : (
                <Pressable onPress={startRec} style={[styles.round, { backgroundColor: t.fill }]}><Ionicons name="mic" size={21} color={t.ink} /></Pressable>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* glass header — controls stay on the left (the iPhone Duo's status pill sits top-right) */}
      <View pointerEvents="none" style={[styles.statusFade, { height: ins.top, backgroundColor: t.bg, opacity: 0.9 }]} />
      <View pointerEvents="box-none" style={[styles.header, { paddingTop: ins.top + 4, paddingRight: 12 + gut }]}>
        {onBack && <Glass interactive style={styles.backBtn}><Pressable onPress={onBack} hitSlop={8} style={styles.backHit}><Ionicons name="chevron-back" size={26} color={t.ink} /></Pressable></Glass>}
        <Glass interactive style={styles.hCapsule}>
          <Pressable onPress={showInfo} style={styles.hInfo}>
            <Avatar room={r} size={34} />
            <View style={{ flexShrink: 1, marginLeft: 9, marginRight: 6 }}>
              <Text numberOfLines={1} style={[styles.hName, { color: t.ink }]}>{roomName(r)}{S.muted.has(r.id) ? '  🔕' : ''}</Text>
              {!!sub && <Text numberOfLines={1} style={[styles.hSub, { color: r.typing.length ? t.blue : t.soft }]}>{sub}</Text>}
            </View>
          </Pressable>
        </Glass>
        {isPrivateRoom(r) && callsAvailable && <>
          <Glass interactive style={styles.backBtn}><Pressable onPress={() => startCall(r, false).catch((e: any) => Alert.alert('Can’t call', e.message || ''))} hitSlop={6} style={styles.backHit} accessibilityLabel="Voice call"><Ionicons name="call" size={20} color={t.ink} /></Pressable></Glass>
          <Glass interactive style={styles.backBtn}><Pressable onPress={() => startCall(r, true).catch((e: any) => Alert.alert('Can’t call', e.message || ''))} hitSlop={6} style={styles.backHit} accessibilityLabel="Video call"><Ionicons name="videocam" size={22} color={t.ink} /></Pressable></Glass>
        </>}
      </View>

      {/* message menu */}
      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? bodyPreview(menu).slice(0, 80) : ''}>
        {menu && <>
          <View style={[styles.emojiRow, { backgroundColor: t.dark ? '#2C2C2E' : '#fff' }]}>
            {QUICK.map(e => <Pressable key={e} onPress={() => { react(r, menu, e); setMenu(null); }} style={styles.emojiBtn}><Text style={{ fontSize: 28 }}>{e}</Text></Pressable>)}
            <Pressable onPress={() => { const m = menu; setMenu(null); setTimeout(() => setGrid(m), 250); }} style={[styles.emojiBtn, { backgroundColor: t.fill, borderRadius: 22 }]}><Ionicons name="add" size={24} color={t.ink} /></Pressable>
          </View>
          <SheetGroup>
            <SheetItem label="Reply" icon={<Ionicons name="arrow-undo" size={20} color={t.ink} />} onPress={() => { setReplyTo(menu); setMenu(null); inputRef.current?.focus(); }} />
            {!botNetOf(r) && <SheetItem label="Forward" icon={<Ionicons name="arrow-redo" size={20} color={t.ink} />} onPress={() => { const m = menu; setMenu(null); setTimeout(() => setFwd(m), 250); }} />}
            {!!menuText && <SheetItem label="Copy" icon={<Ionicons name="copy-outline" size={20} color={t.ink} />} onPress={() => { Clipboard.setStringAsync(menuText).catch(() => {}); setMenu(null); }} />}
            <SheetItem label={isStarred(menu) ? 'Unstar' : 'Star'} icon={<Ionicons name={isStarred(menu) ? 'star' : 'star-outline'} size={20} color={t.ink} />} onPress={() => { toggleStar(r, menu).catch(() => {}); setMenu(null); }} last={!mineMenu} />
            {mineMenu && menu.content?.msgtype === 'm.text' && <SheetItem label="Edit" icon={<Ionicons name="pencil" size={20} color={t.ink} />} onPress={() => { setEditing(menu); setReplyTo(null); setText(menuText); setMenu(null); inputRef.current?.focus(); }} />}
            {mineMenu && <SheetItem label="Delete for everyone" danger last icon={<Ionicons name="trash" size={20} color={t.red} />} onPress={() => {
              const m = menu; setMenu(null);
              Alert.alert('Delete this message?', 'It will be deleted for everyone in the chat.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => redact(r, m).catch(() => Alert.alert('Could not delete')) }]);
            }} />}
          </SheetGroup>
        </>}
      </Sheet>

      {/* all emojis */}
      <Sheet visible={!!grid} onClose={() => setGrid(null)} title="React" scroll>
        <View style={styles.grid}>
          {EMOJI_ALL.map((e, i) => <Pressable key={i} onPress={() => { if (grid) react(r, grid, e); setGrid(null); }} style={styles.gridBtn}><Text style={{ fontSize: 30 }}>{e}</Text></Pressable>)}
        </View>
      </Sheet>

      {/* forward */}
      <Sheet visible={!!fwd} onClose={() => setFwd(null)} title="Forward to…" scroll>
        <SheetGroup>
          {targets.slice(0, 60).map((x, i) => (
            <Pressable key={x.id} onPress={async () => { const m = fwd!; setFwd(null); try { await forward(m, x); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch { Alert.alert('Could not forward'); } }}
              style={({ pressed }) => [styles.fwdRow, { backgroundColor: pressed ? t.fill : 'transparent', borderBottomColor: t.line, borderBottomWidth: i < 59 ? StyleSheet.hairlineWidth : 0 }]}>
              <Avatar room={x} size={36} /><Text numberOfLines={1} style={{ color: t.ink, fontSize: 17, flex: 1 }}>{roomName(x)}</Text>
            </Pressable>
          ))}
        </SheetGroup>
      </Sheet>

      {/* attach */}
      <Sheet visible={attachSheet} onClose={() => setAttachSheet(false)}>
        <SheetGroup>
          <SheetItem label="Photo library" icon={<Ionicons name="images-outline" size={20} color={t.ink} />} onPress={() => { setAttachSheet(false); setTimeout(() => attach(false), 300); }} />
          <SheetItem label="Camera" last icon={<Ionicons name="camera-outline" size={20} color={t.ink} />} onPress={() => { setAttachSheet(false); setTimeout(() => attach(true), 300); }} />
        </SheetGroup>
      </Sheet>

      {/* schedule */}
      <Sheet visible={sched} onClose={() => setSched(false)} title="Send later">
        <SheetGroup>
          {quickTimes().map(([label, ts], i, a) => (
            <SheetItem key={label} label={label} last={i === a.length - 1} onPress={async () => {
              setSched(false); const s = text.trim();
              try { await scheduleSend(r, s, ts); setText(''); setDraft(r.id, ''); Alert.alert('Scheduled', 'Will send ' + fmtWhen(ts) + '. See or cancel it in Chat info.'); }
              catch (e: any) { Alert.alert('Could not schedule', e.message || ''); }
            }} />
          ))}
        </SheetGroup>
      </Sheet>

      {/* full-screen photo */}
      <PhotoViewer mxc={photo} onClose={() => setPhoto(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  backHit: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingRight: 2 },
  hCapsule: { height: 48, borderRadius: 24, overflow: 'hidden', flexShrink: 1, maxWidth: 420 },
  hInfo: { flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: 7, paddingRight: 12 },
  statusFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  hName: { fontSize: 17, fontWeight: '600' },
  hSub: { fontSize: 13 },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  day: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  unreadLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  ul: { flex: 1, height: StyleSheet.hairlineWidth },
  msgRow: { flexDirection: 'row' },
  swipeReply: { width: 50, alignItems: 'center', justifyContent: 'center' },
  who: { fontSize: 12, fontWeight: '600', marginLeft: 12, marginBottom: 2 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  media: { borderRadius: 16, overflow: 'hidden' },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  txt: { fontSize: 17, lineHeight: 22 },
  time: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  lp: { borderRadius: 12, overflow: 'hidden', marginTop: 8, maxWidth: 300 },
  reacts: { flexDirection: 'row', gap: 4, marginTop: -4, paddingHorizontal: 6 },
  react: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  jump: { position: 'absolute', right: 14, bottom: 80, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  jumpBadge: { position: 'absolute', top: -6, right: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  composerWrap: { paddingHorizontal: 10, paddingTop: 6, gap: 6 },
  replyBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 38, maxHeight: 140, borderRadius: 19, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 17 },
  recBox: { flex: 1, height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 14, padding: 8, marginBottom: 10 },
  emojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingBottom: 20 },
  gridBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fwdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  mentions: { borderRadius: 14, overflow: 'hidden', paddingVertical: 4 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mAv: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
});
