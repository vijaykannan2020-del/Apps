// Pastel building blocks (v2.7): the hero card, stat tiles, wallet-style person card, ring and bar
// charts and tool tiles. Every block shows something the rules engine worked out — never decoration.
// Colour = meaning: sage good / valid · butter attention / soon · blush urgent / expired · sky
// information / identity. Charts use react-native-svg (already in the build); each has a text
// alternative for VoiceOver / TalkBack and never relies on colour alone (numbers and words too).
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from './Icon';
import { BigText, Pastel, T, Text } from './kit';
import { onOutline } from './tokens';
import { font, radius, useLayout, useReduceMotion, useTheme, type PastelTone } from './theme';

/** Fade + small rise when a block first appears (nothing with Reduce Motion). */
export function Appear({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (reduce) { a.setValue(1); return; }
    Animated.spring(a, { toValue: 1, delay, damping: 22, stiffness: 180, useNativeDriver: true }).start();
  }, [a, reduce, delay]);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

/** The one big card on Home: label + chip, a big number, one line of who / what / next, progress. */
export function HeroCard({ tone, icon, label, chip, big, line, progress, onPress, a11y }: {
  tone: PastelTone; icon: string; label: string; chip?: string; big: string; line: string; progress?: number; onPress?: () => void; a11y: string;
}) {
  const t0 = useTheme();
  const t = tone === 'warn' ? onOutline(t0) : t0; // attention cards are outlined (v2.9)
  return (
    <Pastel tone={tone} r={radius.hero} pad={20} onPress={onPress} label={a11y} style={{ paddingHorizontal: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>
          <Icon name={icon} size={17} color={t.inkLabel} />
          <Text numberOfLines={1} style={[font.sub, { color: t.inkLabel, fontWeight: '600', flexShrink: 1 }]}>{label}</Text>
        </View>
        {chip ? <View style={{ backgroundColor: t.track, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}><Text numberOfLines={1} style={{ color: t.ink, fontSize: 13, fontWeight: '700' }}>{chip}</Text></View> : null}
      </View>
      <BigText size={44} style={{ color: t.ink, letterSpacing: -1, marginTop: 8 }}>{big}</BigText>
      <Text style={[font.foot, { color: t.ink2, marginTop: 2 }]}>{line}</Text>
      {progress !== undefined ? (
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ height: 8, borderRadius: 4, backgroundColor: t.track, marginTop: 14, overflow: 'hidden' }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.inkLabel, width: `${Math.round(Math.max(0.03, Math.min(1, progress)) * 100)}%` }} />
        </View>
      ) : null}
    </Pastel>
  );
}

/** A small pastel fact under the hero: label, big value, optional line. */
export function StatTile({ tone, icon, label, big, sub, onPress }: { tone: PastelTone; icon: string; label: string; big: string; sub?: string; onPress?: () => void }) {
  const t0 = useTheme();
  const t = tone === 'warn' ? onOutline(t0) : t0; // attention cards are outlined (v2.9)
  return (
    <Pastel tone={tone} r={radius.tile} pad={16} onPress={onPress} label={`${label}: ${big}${sub ? `. ${sub}` : ''}`} style={{ flex: 1, minWidth: 0, minHeight: 108, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={15} color={t.inkLabel} />
        <Text numberOfLines={1} style={{ color: t.inkLabel, fontSize: 13, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
      </View>
      <View>
        <BigText size={26} style={{ color: t.inkLabel, letterSpacing: -0.5 }}>{big}</BigText>
        {sub ? <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 12.5, fontWeight: '500' }}>{sub}</Text> : null}
      </View>
    </Pastel>
  );
}

/** Wallet-style card at the top of a person page: sky header (identity), dark body with the number. */
export function WalletCard({ name, line, corner, caption, big, foot, footTone, footWord, reason, reasonTone, onPress, a11y }: {
  name: string; line: string; corner?: string; caption: string; big: string; foot?: string; footTone?: 'green' | 'amber' | 'red'; footWord?: string; reason?: string; reasonTone?: 'amber' | 'red'; onPress?: () => void; a11y: string;
}) {
  const t = useTheme();
  const body = (
    <>
      <Pastel tone="sky" r={0} pad={18} style={{ paddingHorizontal: 20 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 20, fontWeight: '600', letterSpacing: -0.2 }}>{name}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
          <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>{line}</Text>
          {corner ? <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{corner}</Text> : null}
        </View>
      </Pastel>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
        <T tone="text2" style={font.foot}>{caption}</T>
        <BigText size={34} style={{ letterSpacing: -0.5 }}>{big}</BigText>
        {foot ? <T tone="text2" style={font.foot}>{foot}{footWord ? <T tone={footTone ?? 'green'} style={[font.foot, { fontWeight: '600' }]}>{` · ${footWord}`}</T> : null}</T> : null}
        {reason ? <T tone={reasonTone ?? 'amber'} numberOfLines={1} style={[font.foot, { fontWeight: '600', marginTop: 2 }]}>{reason}</T> : null}
      </View>
    </>
  );
  const st: ViewStyle = { borderRadius: radius.hero, overflow: 'hidden', backgroundColor: t.dark ? t.card2 : t.card };
  if (!onPress) return <View accessible accessibilityLabel={a11y} style={st}>{body}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => [st, pressed && { transform: [{ scale: 0.985 }] }]}>{body}</Pressable>;
}

export type RingPart = { key: string; label: string; value: number; color: string };
/** Donut of parts with a number in the middle and a legend (label, count, mini bar) underneath. */
export function Ring({ parts, caption, center, size = 220 }: { parts: RingPart[]; caption: string; center: string; size?: number }) {
  const t = useTheme();
  const L = useLayout();
  const d = Math.max(60, Math.min(size, L.width - 2 * L.side - 40));
  const sw = Math.round(d * 0.13);
  const r = (d - sw) / 2;
  const C = 2 * Math.PI * r;
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const gap = shown.length > 1 ? sw * 0.9 : 0; // room for the round caps between segments
  let at = 0;
  return (
    <View>
      <View accessible accessibilityRole="image" accessibilityLabel={`${caption}: ${center}. ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`} style={{ width: d, height: d, alignSelf: 'center' }}>
        <Svg width={d} height={d} viewBox={`0 0 ${d} ${d}`}>
          <Circle cx={d / 2} cy={d / 2} r={r} stroke={t.dark ? t.card2 : t.fill} strokeWidth={sw} fill="none" />
          {total > 0 ? shown.map((p) => {
            const len = (p.value / total) * C;
            const dash = Math.max(1, len - gap);
            const el = <Circle key={p.key} cx={d / 2} cy={d / 2} r={r} stroke={p.color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-(at + gap / 2)} transform={`rotate(-90 ${d / 2} ${d / 2})`} />;
            at += len;
            return el;
          }) : null}
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', left: sw, right: sw, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T tone="text2" style={[d < 200 ? font.caption : font.foot, { textAlign: 'center' }]}>{caption}</T>
          <BigText size={d < 200 ? 30 : 36} style={{ letterSpacing: -1, textAlign: 'center' }}>{center}</BigText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        {parts.map((p) => (
          <View key={p.key} style={{ flex: 1, minWidth: 0 }}>
            <T tone="text2" style={font.caption} numberOfLines={1}>{p.label}</T>
            <BigText size={22}>{String(p.value)}</BigText>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.dark ? t.card2 : t.fill, marginTop: 4, overflow: 'hidden' }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: p.color, width: `${total ? Math.max(p.value ? 8 : 0, Math.round((p.value / total) * 100)) : 0}%` }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export type BarItem = { key: string; label: string; value: string; fill: number; color: string; a11y: string; onPress?: () => void };
/** Vertical pill bars (time left per document): value on top, label underneath. */
export function Bars({ items, height = 150 }: { items: BarItem[]; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 2 }}>
      {items.map((b) => (
        <Pressable key={b.key} disabled={!b.onPress} onPress={b.onPress} accessibilityRole={b.onPress ? 'button' : 'text'} accessibilityLabel={b.a11y} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 12.5, fontWeight: '700' }}>{b.value}</Text>
          <View style={{ height, width: 26, borderRadius: 13, backgroundColor: t.dark ? t.card2 : t.fill, justifyContent: 'flex-end', overflow: 'hidden' }}>
            <View style={{ height: `${Math.round(Math.max(0.1, Math.min(1, b.fill)) * 100)}%`, borderRadius: 13, backgroundColor: b.color }} />
          </View>
          <Text numberOfLines={1} style={{ color: t.text2, fontSize: 12, textAlign: 'center' }}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Tools grid tile: a pastel icon tile with the tool's name and one line. */
export function IconTile({ tone, icon, title, sub, onPress, style }: { tone: PastelTone; icon: string; title: string; sub?: string; onPress: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => [{ backgroundColor: t.card, borderRadius: radius.tile, padding: 16, minHeight: 132, justifyContent: 'space-between', gap: 12 }, style, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={{ width: 46, height: 46, borderRadius: 17, backgroundColor: t.pastel[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={22} color={t.ink} /></View>
      <View>
        <T style={[font.callout, { fontWeight: '600' }]} numberOfLines={2}>{title}</T>
        {sub ? <T tone="text2" style={[font.caption, { marginTop: 2 }]} numberOfLines={2}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}
