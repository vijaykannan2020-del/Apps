// Community v2.7 building blocks (pastel-on-black look): avatar circles, pastel tag chips, the vote /
// comment / share / save row, timeline and poll cards, the embedded card of a reposted post, and the
// small menu / confirm sheets. Presentational only — no network calls here (see communityCards.tsx).
import React, { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { avatarOf, byline, daysLabel, fmtCount, pastelFor, pollPercents, shortDate, timelineView, typeLabel, type AuthorLike, type Dir, type PastelName, type TimelineData } from '../core/community';
import type { Embed, Poll } from '../data/communityApi';
import { Button, Group, Icon, MIN_TOUCH, Note, Row, SheetButtons, T, Why, font, radius, useTheme } from '../ui';
import { go } from './common';

export const openProfile = (a: AuthorLike) => { if (a.id && !a.deleted) go(`/community/user/${a.id}`); };

/** Pastel circle with dark ink initials, or one of the built-in emoji avatars. */
export function CAvatar({ a, size = 30, onPress }: { a: AuthorLike; size?: number; onPress?: () => void }) {
  const t = useTheme();
  const v = avatarOf(a);
  const circle = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: a.deleted ? t.fill : t.pastel[v.pastel], alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={v.emoji ? { fontSize: size * 0.54, lineHeight: size * 0.72, textAlign: 'center' } : { color: a.deleted ? t.text2 : t.ink, fontWeight: '700', fontSize: Math.max(10, size * 0.37) }}>{v.text}</Text>
    </View>
  );
  if (!onPress || !a.id || a.deleted) return <View accessible={false}>{circle}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${a.name}’s profile`} hitSlop={8}>{circle}</Pressable>;
}

/** Avatar + "Name · flair · 2 h" (+ badges). Tapping the avatar or name opens the public profile. */
export function AuthorLine({ a, at, edited, size = 30, badges, link = true }: { a: AuthorLike; at: string; edited?: string | null; size?: number; badges?: React.ReactNode; link?: boolean }) {
  const can = link && !!a.id && !a.deleted;
  const who = (
    <>
      <CAvatar a={a} size={size} />
      <T tone="text2" numberOfLines={1} style={[font.caption, { flexShrink: 1 }]}>{`${byline(a, at)}${edited ? ' · edited' : ''}`}</T>
    </>
  );
  // One 44 pt link (avatar + name) without making the row taller than the avatar.
  const pad = Math.max(0, (MIN_TOUCH - size) / 2);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: size }}>
      {can ? <Pressable onPress={() => openProfile(a)} accessibilityRole="link" accessibilityLabel={`${byline(a, at)}. Opens the profile`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, marginVertical: -pad }}>{who}</Pressable>
        : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>{who}</View>}
      {badges}
    </View>
  );
}

export function TagChip({ text, pastel, icon }: { text: string; pastel?: PastelName; icon?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.pastel[pastel ?? pastelFor(text)], borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
      {icon ? <Icon name={icon} size={12} color={t.ink} weight="bold" /> : null}
      <Text style={{ color: t.ink, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
export const TypeChip = ({ type }: { type: string }) => (type === 'question' ? null : <TagChip text={typeLabel(type)} pastel={type === 'poll' ? 'sage' : type === 'timeline' ? 'blush' : 'butter'} />);
export const Tags = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, style]}>{children}</View>;

export function useVoteColors() {
  const t = useTheme();
  return { up: t.pos, down: t.inkRed };
}

/** ▲ 24 ▽ — one pill; the arrow you picked is coloured, tapping it again clears the vote. */
export function VoteCluster({ score, myVote, onVote, disabled, small }: { score: number; myVote: Dir; onVote: (d: 1 | -1) => void; disabled?: boolean; small?: boolean }) {
  const t = useTheme();
  const c = useVoteColors();
  const tone = myVote === 1 ? c.up : myVote === -1 ? c.down : t.text2;
  const btn = (d: 1 | -1) => (
    <Pressable onPress={() => onVote(d)} disabled={disabled} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="button" accessibilityState={{ selected: myVote === d, disabled: !!disabled }}
      accessibilityLabel={d === 1 ? (myVote === 1 ? 'Remove upvote' : 'Upvote') : myVote === -1 ? 'Remove downvote' : 'Downvote'}
      style={({ pressed }) => ({ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.6 : 1 })}>
      <Icon name={d === 1 ? 'up' : 'down'} size={small ? 16 : 18} color={myVote === d ? (d === 1 ? c.up : c.down) : t.text2} weight="bold" />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: small ? 'transparent' : t.fill, borderRadius: 22 }}>
      {btn(1)}
      <Text accessibilityLabel={`${score} points`} style={{ color: tone, fontSize: small ? 13.5 : 14.5, fontWeight: '700', minWidth: 16, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{fmtCount(score)}</Text>
      {btn(-1)}
    </View>
  );
}

/** One icon (+ optional short text) in an action row — 44 pt target. */
export function ActionButton({ icon, text, label, onPress, active, color }: { icon: string; text?: string; label: string; onPress: () => void; active?: boolean; color?: string }) {
  const t = useTheme();
  const col = color ?? (active ? t.text : t.text2);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: text ? 6 : 0, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={18} color={col} weight={active ? 'bold' : 'regular'} />
      {text ? <Text style={{ color: col, fontSize: 13.5, fontWeight: '600' }}>{text}</Text> : null}
    </Pressable>
  );
}

/** The dark rounded card every post sits in. */
export function PostShell({ children, onPress, label, style }: { children: React.ReactNode; onPress?: () => void; label?: string; style?: ViewStyle }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.card, borderRadius: radius.card, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
}

// ---------- timeline share ----------
export function TimelineCard({ tl, compact }: { tl: TimelineData; compact?: boolean }) {
  const t = useTheme();
  const v = timelineView(tl);
  const c = useVoteColors();
  const tone = v.outcome === 'approved' ? c.up : v.outcome === 'denied' ? c.down : t.text;
  const first = v.rows[0], last = v.rows[v.rows.length - 1];
  return (
    <View accessible accessibilityLabel={`Timeline: ${tl.form} at ${tl.office}${tl.premium ? ', premium' : ''}. ${v.rows.map((r) => `${r.label} ${shortDate(r.date)}`).join(', ')}. ${daysLabel(v.totalDays)} in total.`}
      style={{ backgroundColor: t.card2, borderRadius: 22, padding: 14, marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Tags style={{ flexShrink: 1 }}><TagChip text={tl.form} pastel="sky" /><TagChip text={tl.office} pastel="sage" />{tl.premium ? <TagChip text="Premium" pastel="butter" /> : null}</Tags>
        <Text style={{ color: tone, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 }}>{daysLabel(v.totalDays)}</Text>
      </View>
      {compact ? (
        first && last ? <T tone="text2" style={[font.caption, { marginTop: 10 }]}>{`${first.label} ${shortDate(first.date)}  →  ${last.label} ${shortDate(last.date)}${v.rows.length > 2 ? `  ·  ${v.rows.length} steps` : ''}`}</T> : null
      ) : (
        <View style={{ marginTop: 12 }}>
          {v.rows.map((r, i) => (
            <View key={r.label} style={{ flexDirection: 'row', gap: 12, minHeight: 34 }}>
              <View style={{ width: 12, alignItems: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: i === v.rows.length - 1 ? tone : t.green }} />
                {i < v.rows.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.sep, marginVertical: 2 }} /> : null}
              </View>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingBottom: 8 }}>
                <View style={{ flexShrink: 1 }}><T style={[font.sub, { fontWeight: '600' }]}>{r.label}</T><T tone="text2" style={font.caption}>{shortDate(r.date)}</T></View>
                {r.gap !== null ? <T tone="text2" style={[font.caption, { marginTop: 2 }]}>{`+${daysLabel(r.gap)}`}</T> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- poll ----------
/** Before you vote: the choices. After (or for your own poll): thin pastel bars with percentages. */
export function PollCard({ poll, onVote, mine, busy }: { poll: Poll; onVote?: (i: number) => void; mine?: boolean; busy?: boolean }) {
  const t = useTheme();
  const showResults = poll.myVote !== null || !!mine || !onVote;
  const pct = pollPercents(poll.options.map((o) => o.votes));
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {poll.options.map((o, i) => {
        const picked = poll.myVote === i;
        const inner = (
          <View style={{ backgroundColor: t.card2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, minHeight: MIN_TOUCH, justifyContent: 'center', borderWidth: 1.5, borderColor: picked ? t.green : 'transparent' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {picked ? <Icon name="checkc" size={16} color={t.green} weight="bold" /> : null}
              <T style={[font.sub, { flex: 1, fontWeight: picked ? '700' : '500' }]}>{o.text}</T>
              {showResults ? <T tone="text2" style={[font.sub, { fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{`${pct[i]}%`}</T> : null}
            </View>
            {showResults ? <View style={{ height: 6, borderRadius: 3, backgroundColor: t.fill, marginTop: 8, overflow: 'hidden' }}><View style={{ height: 6, borderRadius: 3, width: `${pct[i]}%`, backgroundColor: picked ? t.green : t.accent }} /></View> : null}
          </View>
        );
        if (!onVote || mine) return <View key={i} accessible accessibilityLabel={`${o.text}, ${pct[i]} percent`}>{inner}</View>;
        return <Pressable key={i} disabled={busy} onPress={() => onVote(i)} accessibilityRole="radio" accessibilityState={{ checked: picked }} accessibilityLabel={showResults ? `${o.text}, ${pct[i]} percent` : o.text} style={({ pressed }) => ({ opacity: pressed || busy ? 0.7 : 1 })}>{inner}</Pressable>;
      })}
      <T tone="text2" style={font.caption}>{`${poll.total} vote${poll.total === 1 ? '' : 's'}${poll.myVote === null && onVote && !mine ? ' · tap to vote' : poll.myVote !== null ? ' · tap another to change' : ''}`}</T>
    </View>
  );
}

// ---------- the original post inside a repost ----------
export function EmbedCard({ e, press = true }: { e: Embed; press?: boolean }) {
  const t = useTheme();
  const box: ViewStyle = { borderWidth: 1.5, borderColor: t.sep, borderRadius: 22, padding: 14, marginTop: 10 };
  if (e.removed || !e.author) return <View style={box}><T tone="text2" style={font.sub}>The original post was removed.</T></View>;
  const inner = (
    <>
      <AuthorLine a={e.author} at={e.createdAt ?? ''} size={24} link={false} />
      <T numberOfLines={3} style={[font.sub, { fontWeight: '600', marginTop: 8 }]}>{e.title}</T>
      {e.excerpt ? <T tone="text2" numberOfLines={2} style={[font.foot, { marginTop: 4 }]}>{e.excerpt}</T> : null}
      {e.timeline ? <TimelineCard tl={e.timeline} compact /> : null}
      {e.poll ? <T tone="text2" style={[font.caption, { marginTop: 6 }]}>{`Poll · ${e.poll.options.map((o) => o.text).join(' / ')}`}</T> : null}
      <T tone="text2" style={[font.caption, { marginTop: 8 }]}>{`${fmtCount(e.score ?? 0)} point${e.score === 1 ? '' : 's'} · ${fmtCount(e.comments ?? 0)} comment${e.comments === 1 ? '' : 's'}`}</T>
    </>
  );
  if (!press) return <View style={box}>{inner}</View>;
  return <Pressable onPress={() => go(`/community/post/${e.id}`)} accessibilityRole="button" accessibilityLabel={`Original post: ${e.title}, by ${e.author.name}`} style={({ pressed }) => [box, pressed && { opacity: 0.7 }]}>{inner}</Pressable>;
}

// ---------- small sheets ----------
export type MenuItem = { icon: string; title: string; red?: boolean; run: () => void };
export function MenuSheet({ items }: { items: MenuItem[] }) {
  return <Group style={{ marginTop: 12 }}>{items.map((i) => <Row key={i.title} icon={i.icon} iconTone={i.red ? 'red' : undefined} titleTone={i.red ? 'red' : undefined} title={i.title} chevron={false} onPress={i.run} />)}</Group>;
}
export function ConfirmSheet({ body, action, onConfirm, onClose }: { body: string; action: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <View>
      <Why>{body}</Why>
      {error ? <Note tone="red">{error}</Note> : null}
      <SheetButtons>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button grow kind="danger" title={action} busy={busy} onPress={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      </SheetButtons>
    </View>
  );
}
