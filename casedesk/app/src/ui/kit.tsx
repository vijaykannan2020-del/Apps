// The design-system set every screen uses (matches the approved prototype 1:1). Every touchable has
// an accessibility role + label and a 44-pt target; status colour is always paired with a word.
// Nothing here has a fixed width: layouts flex, wrap at large Dynamic Type sizes and centre on wide
// screens (fold open, iPad, landscape).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, BackHandler, Dimensions, Keyboard, KeyboardAvoidingView, TextInput as RNTextInput, Modal, Platform, Pressable, ScrollView, Switch as RNSwitch,
  Text as RNText, TextInput, View, StyleSheet, type TextStyle, type ViewStyle, type KeyboardTypeOptions, type TextProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { font, MIN_TOUCH, radius, space, tint, toneColor, toneInk, TONE_WORD, useLayout, useTheme, useReduceMotion, PastelScope, PlainScope, OutlineScope, pastelFor, tonePastel, listOS, m3Roles, type ListOS, type Tone, type PastelTone } from './theme';
import type { Severity } from '../core/rules/types';
import { fmt, isISO } from '../core/dates';

import { WEB_TEXT_SCALE } from './theme';
import { TourButton, TourScope, TourScroll, type Tour } from './tour';

/** Text that also follows the web preview's simulated text size (phones use Dynamic Type natively). */
function Text(props: TextProps) {
  if (WEB_TEXT_SCALE === 1) return <RNText {...props} />;
  const st = StyleSheet.flatten(props.style) ?? {};
  return <RNText {...props} style={[st, { fontSize: (st.fontSize ?? 14) * WEB_TEXT_SCALE, lineHeight: st.lineHeight ? st.lineHeight * WEB_TEXT_SCALE : undefined }]} />;
}
export { Text };

let BlurView: any;
try { BlurView = require('expo-blur').BlurView; } catch { BlurView = undefined; }

// ---------- text ----------
/**
 * Line height for a font size: never tighter than 1.2× (iOS clips the top of big digits otherwise —
 * owner feedback "Jan 15, 2015" cut off). A lineHeight smaller than that is raised.
 */
export const safeLineHeight = (fontSize: number, lineHeight?: number) => Math.max(lineHeight ?? 0, Math.ceil(fontSize * 1.22));

export function T({ children, style, tone = 'text', numberOfLines, a11y, selectable }: { children: React.ReactNode; style?: TextStyle | TextStyle[]; tone?: 'text' | 'text2' | 'text3' | 'accent' | 'red' | 'green' | 'amber'; numberOfLines?: number; a11y?: 'header'; selectable?: boolean }) {
  const t = useTheme();
  const color = tone === 'text' ? t.text : tone === 'text2' ? t.text2 : tone === 'text3' ? t.text3 : tone === 'accent' ? t.inkAccent : tone === 'red' ? t.inkRed : tone === 'green' ? t.inkGreen : t.inkAmber;
  const st = StyleSheet.flatten([font.body, ...(Array.isArray(style) ? style : style ? [style] : [])]) as TextStyle;
  const fs = st.fontSize ?? 17;
  return <Text selectable={selectable} accessibilityRole={a11y} numberOfLines={numberOfLines} style={[{ color }, st, { lineHeight: safeLineHeight(fs, st.lineHeight) }]}>{children}</Text>;
}

/**
 * Big numbers and dates (priority date, KPIs, counters, totals). One line, shrinks to fit the card
 * instead of clipping, follows Dynamic Type, and has a line height that never cuts the digits.
 */
export function BigText({ children, size = 34, tone = 'text', style, label }: { children: string; size?: number; tone?: 'text' | 'accent' | 'green' | 'amber' | 'red'; style?: TextStyle; label?: string }) {
  const t = useTheme();
  const color = tone === 'text' ? t.text : tone === 'accent' ? t.inkAccent : tone === 'green' ? t.inkGreen : tone === 'amber' ? t.inkAmber : t.inkRed;
  return (
    <Text accessibilityLabel={label} allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={1.6}
      style={[{ color, fontSize: size, lineHeight: safeLineHeight(size), fontWeight: '700', includeFontPadding: false, paddingTop: 2 }, style ?? {}]}>{children}</Text>
  );
}

/** Two columns on wide screens (≥ 700 pt: unfolded fold, iPad, landscape); one column on phones. */
export function Columns({ left, right, ratio = 1, gap = 20, stack }: { left: React.ReactNode; right: React.ReactNode; ratio?: number; gap?: number; stack?: boolean }) {
  const L = useLayout();
  if (!L.twoCol || stack) return <>{left}{right}</>;
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      <View style={{ flex: ratio, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );
}
export const H1 = ({ children }: { children: React.ReactNode }) => <T a11y="header" style={font.title}>{children}</T>;
/** One short line under a title (longer explanations live behind the ? tips). */
export const Why = ({ children }: { children: React.ReactNode }) => <T tone="text2" style={[font.sub, { marginTop: 4 }]}>{children}</T>;
export const Hint = ({ children, center, style }: { children: React.ReactNode; center?: boolean; style?: TextStyle }) => <T tone="text2" style={[font.caption, { marginTop: 8 }, center ? { textAlign: 'center' } : {}, style ?? {}]}>{children}</T>;

/** Inside a <SettingsList>: Group, Row and SectionHeader draw the platform's own list style. */
const ListCtx = createContext<ListOS | null>(null);
/**
 * A platform-native settings list. iOS: inset grouped — rows joined in rounded groups with inset
 * hairlines, small icon tiles, grey section headers. Android: Material 3 preference list —
 * full-width rows, no cards, section headers in the accent colour, switches at the end.
 * Put the usual <SectionHeader>, <Group> and <Row> inside; they pick the style up from here.
 */
export function SettingsList({ children, os }: { children: React.ReactNode; os?: ListOS }) {
  return <ListCtx.Provider value={os ?? listOS()}>{children}</ListCtx.Provider>;
}
const flat = (children: React.ReactNode): React.ReactNode[] => React.Children.toArray(children).flatMap((c) => (React.isValidElement(c) && c.type === React.Fragment ? flat((c.props as { children?: React.ReactNode }).children) : [c])).filter(Boolean);

export function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <T a11y="header" style={[font.largeTitle, { flexShrink: 1 }]}>{title}</T>
      {right}
    </View>
  );
}

export function SectionHeader({ children, right }: { children: string; right?: React.ReactNode }) {
  const os = useContext(ListCtx);
  const t = useTheme();
  if (os === 'ios') return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 7, marginHorizontal: 18, gap: 8 }}><T tone="text2" a11y="header" style={[font.caption, { flexShrink: 1 }]}>{children}</T>{right}</View>;
  if (os === 'android') return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4, gap: 8, minHeight: 32 }}><Text accessibilityRole="header" style={{ color: m3Roles(t).primary, fontSize: 14, fontWeight: '600', letterSpacing: 0.1, flexShrink: 1 }}>{children}</Text>{right}</View>;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12, marginHorizontal: 2, gap: 8, minHeight: 28 }}>
      <T a11y="header" style={[font.title2, { fontSize: 20, lineHeight: 26, flexShrink: 1 }]}>{children}</T>
      {right}
    </View>
  );
}

// ---------- bars ----------
function Bar({ children, style, edge }: { children: React.ReactNode; style?: ViewStyle; edge: 'top' | 'bottom' }) {
  const t = useTheme();
  const border = {};
  void edge;
  // v3.0 (owner): bars sit on the page colour like native iOS 26+ apps, so no lighter band runs across
  // the top and bottom and under the foldable's status column; Android keeps its tonal app bar.
  void BlurView;
  return <View style={[{ backgroundColor: Platform.OS === 'android' ? t.bar : t.bg }, border, style]}>{children}</View>;
}

export type NavProps = { title?: string; back?: string; onBack?: () => void; right?: React.ReactNode; appBar?: 'android'; progress?: { label: string; right?: string; value: number } };

export function NavBar({ title, back, onBack, right, progress, appBar }: NavProps) {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const t = useTheme();
  // Material 3 small top app bar: back arrow, title at the start, actions at the end
  if (appBar === 'android') {
    return (
      <Bar edge="top" style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 4, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>
          {back !== undefined ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Navigate up" android_ripple={{ color: t.fill, borderless: true, radius: 22 }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrowL" size={24} color={t.text} />
            </Pressable>
          ) : <View style={{ width: 12 }} />}
          <T a11y="header" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28, fontWeight: '400', flex: 1 }}>{title ?? ''}</T>
          {right}
        </View>
      </Bar>
    );
  }
  // iOS bar: [back | title | actions]. Both sides get the SAME width (the wider of the two, measured)
  // so the title stays centred, and the title takes only what is left and truncates with "…".
  // The back label is dropped first when space is short; actions never cover the title.
  const [bar, setBar] = useState(0);
  const [lw, setLw] = useState(0);
  const [rw, setRw] = useState(0);
  const cap = bar ? Math.floor(bar * 0.36) : 0;
  const showLabel = !L.compact && !!back && (!cap || lw <= cap);
  const side = bar ? Math.min(Math.max(lw, rw, MIN_TOUCH), Math.max(cap, rw)) : undefined;
  return (
    <Bar edge="top" style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View onLayout={(e) => setBar(e.nativeEvent.layout.width)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>
        <View style={{ width: side, flexShrink: 0, flexDirection: 'row', overflow: 'hidden' }}>
          <View onLayout={(e) => setLw(Math.ceil(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', flexShrink: 0 }}>
            {back !== undefined ? (
              <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={`Back to ${back}`} hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 4 }}>
                <Icon name="chevL" size={22} color={t.text} weight="semibold" />
                {!L.compact ? <T numberOfLines={1} style={{ maxWidth: 96, marginLeft: 2, opacity: showLabel ? 1 : 0 }}>{back}</T> : null}
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
          <T a11y="header" numberOfLines={1} style={[font.headline, { textAlign: 'center' }]}>{title ?? ''}</T>
        </View>
        <View style={{ width: side, flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View onLayout={(e) => setRw(Math.ceil(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>{right}</View>
        </View>
      </View>
      {progress ? <Progress {...progress} /> : null}
    </Bar>
  );
}

export function NavButton({ title, onPress, label }: { title: string; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title} hitSlop={6} style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontWeight: '600' }}>{title}</T>
    </Pressable>
  );
}

function Progress({ label, right, value }: { label: string; right?: string; value: number }) {
  const t = useTheme();
  const L = useLayout();
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(w, { toValue: value, duration: 550, useNativeDriver: false }).start(); }, [value, w]);
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <T style={[font.caption, { fontWeight: '600' }]}>{label}</T>
        {right ? <T tone="text2" style={font.caption}>{right}</T> : null}
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 6, borderRadius: 3, backgroundColor: t.fill, overflow: 'hidden' }}>
        <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: t.green, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
}

export function Footer({ children, column }: { children: React.ReactNode; column?: boolean }) {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  return (
    <Bar edge="bottom" style={{ paddingBottom: Math.max(12, insets.bottom), paddingTop: 12, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ flexDirection: column ? 'column' : 'row', flexWrap: column || L.width >= 360 ? 'nowrap' : 'wrap', alignItems: column ? undefined : 'center', gap: 10, paddingHorizontal: L.side, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>{children}</View>
    </Bar>
  );
}

/**
 * v3.0 (owner): bottom padding while the keyboard covers a text field. Replaces KeyboardAvoidingView,
 * which on the foldable left a large empty band under the bottom buttons with no keyboard showing.
 * Only a real keyboard over a focused field counts; the footer's own safe-area padding is subtracted.
 */
export function useKeyboardPad(on: boolean): number {
  const [h, setH] = useState(0);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!on || Platform.OS !== 'ios') return;
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const focused = !!RNTextInput.State?.currentlyFocusedInput?.();
      const overlap = Math.max(0, Dimensions.get('window').height - e.endCoordinates.screenY);
      setH(focused && overlap > 120 ? Math.max(0, overlap - insets.bottom) : 0);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setH(0));
    return () => { change.remove(); hide.remove(); };
  }, [on, insets.bottom]);
  return h;
}

// ---------- screen ----------
/**
 * Screen. `panes` (wide screens ≥ 700 pt): two independent full-height scroll areas side by side, so
 * the left column (list) stays put while the right one (detail) scrolls on its own. On phones the
 * panes are one normal scrolling page: left, then right.
 */
export function Screen({ nav, footer, children, scroll = true, tabRoot, keyboard, padTop = true, wide, panes, paneRatio = 1, tour }: { nav?: NavProps; footer?: React.ReactNode; children?: React.ReactNode; scroll?: boolean; tabRoot?: boolean; keyboard?: boolean; padTop?: boolean; wide?: boolean; panes?: { left: React.ReactNode; right: React.ReactNode }; paneRatio?: number; tour?: Tour }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardPad(!!keyboard);
  const [dbg, setDbg] = useState<{ r?: { y: number; height: number }; f?: { y: number; height: number } }>({}); // temporary layout check
  const L = useLayout();
  // iOS tab roots: contentInsetAdjustmentBehavior=automatic already clears the tab bar (bottom, floating or
  // side rail), so they get no extra bottom gap; Android and web still pad for the bottom bar.
  const inner: ViewStyle = { paddingHorizontal: L.side, paddingTop: nav ? 20 : padTop ? insets.top + 14 : 0, paddingBottom: (footer ? 24 : 32) + (tabRoot ? (Platform.OS === 'ios' ? 0 : insets.bottom + 56) : footer ? 0 : insets.bottom), alignSelf: 'center', width: '100%', maxWidth: wide && L.twoCol ? L.wideMax + 2 * L.side : L.maxWidth + 2 * L.side };
  const split = !!panes && L.twoCol;
  // Full-bleed (owner, v3.0 fix8): the background, bars and scroll areas reach every edge; only the
  // content column keeps clear of the safe-area insets (top, bottom, left and right — e.g. the
  // system status column on the right of a foldable), centred in what is left.
  const sides: ViewStyle = { paddingLeft: insets.left, paddingRight: insets.right };
  const paneInner = (left: boolean): ViewStyle => ({ ...inner, maxWidth: undefined, alignSelf: 'stretch', paddingLeft: left ? L.side : 10, paddingRight: left ? 10 : L.side });
  const body = split ? (
    <View style={[{ flex: 1 }, sides]}>
      <View style={{ flex: 1, flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: L.wideMax + 2 * L.side }}>
        <TourScroll testID="pane-left" style={{ flex: paneRatio }} contentContainerStyle={paneInner(true)} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior={tabRoot ? 'automatic' : 'never'}>{panes!.left}</TourScroll>
        <TourScroll testID="pane-right" style={{ flex: 1 }} contentContainerStyle={paneInner(false)} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior={tabRoot ? 'automatic' : 'never'}>{panes!.right}</TourScroll>
      </View>
    </View>
  ) : scroll ? (
    <TourScroll style={{ flex: 1 }} contentContainerStyle={sides} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior={tabRoot ? 'automatic' : 'never'}>
      <View style={inner}>{panes ? <>{panes.left}{panes.right}</> : children}</View>
    </TourScroll>
  ) : <View style={[{ flex: 1 }, sides]}><View style={[{ flex: 1 }, inner]}>{children}</View></View>;
  const content = (
    <View style={{ flex: 1, backgroundColor: t.bg }} onLayout={(e) => setDbg((d) => ({ ...d, r: e.nativeEvent.layout }))}>
      {nav ? <NavBar {...nav} right={tour && tour.steps.length ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><TourButton tour={tour} />{nav.right}</View> : nav.right} /> : null}
      {body}
      {footer ? <View onLayout={(e) => setDbg((d) => ({ ...d, f: e.nativeEvent.layout }))}><Footer>{footer}</Footer></View> : null}
      {Platform.OS === 'ios' && footer ? (
        <T style={{ position: 'absolute', bottom: 0, left: 8, fontSize: 10, lineHeight: 12, color: '#C0392B' }}>
          {`layout check · win ${Math.round(Dimensions.get('window').height)} scr ${Math.round(Dimensions.get('screen').height)} · inset t${Math.round(insets.top)} b${Math.round(insets.bottom)} l${Math.round(insets.left)} r${Math.round(insets.right)} · root ${Math.round(dbg.r?.y ?? -1)}/${Math.round(dbg.r?.height ?? -1)} · footer ${Math.round(dbg.f?.y ?? -1)}/${Math.round(dbg.f?.height ?? -1)} · kb ${kb}`}
        </T>
      ) : null}
    </View>
  );
  const scoped = tour ? <TourScope tour={tour}>{content}</TourScope> : content;
  return keyboard && Platform.OS === 'ios' ? <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: kb }}>{scoped}</View> : scoped;
}

// ---------- surfaces ----------
export function Card({ children, onPress, style, label }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle | ViewStyle[]; label?: string }) {
  const t = useTheme();
  // a normal card nested in a pastel block keeps the page's own colours
  const base: ViewStyle = { backgroundColor: t.onPastel ? (t.dark ? '#1C1D1F' : '#FFFFFF') : t.card, borderRadius: radius.card, padding: 18 };
  const kids = t.onPastel ? <PlainScope>{children}</PlainScope> : children;
  if (!onPress) return <View style={[base, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{kids}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [base, ...(Array.isArray(style) ? style : style ? [style] : []), pressed && { transform: [{ scale: 0.98 }] }]}>{kids}</Pressable>;
}

/**
 * A pastel block (hero, tiles, notes, wallet header). Everything inside reads the "ink" theme, so
 * text, icons, pills and buttons placed in it stay AA-readable without knowing where they are.
 */
export function Pastel({ tone, children, onPress, style, label, r = radius.card, pad = 18 }: { tone: PastelTone; children: React.ReactNode; onPress?: () => void; style?: ViewStyle | ViewStyle[]; label?: string; r?: number; pad?: number }) {
  const t = useTheme();
  const outlined = tone === 'warn';
  const base: ViewStyle = outlined
    ? { backgroundColor: t.card, borderRadius: r, padding: pad, borderWidth: 1.5, borderColor: t.inkAmber }
    : { backgroundColor: t.pastel[tone], borderRadius: r, padding: pad };
  const extra = Array.isArray(style) ? style : style ? [style] : [];
  const kids = outlined ? <OutlineScope>{children}</OutlineScope> : <PastelScope tone={tone}>{children}</PastelScope>;
  if (!onPress) return <View style={[base, ...extra]}>{kids}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [base, ...extra, pressed && { transform: [{ scale: 0.98 }], opacity: 0.94 }]}>{kids}</Pressable>;
}
export const Stack = ({ children, gap = 12, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) => <View style={[{ gap }, style]}>{children}</View>;

/**
 * A list of rows. Pastel look: each row is its own rounded pill with a small gap (the mock's rows).
 * `joined` keeps the rows in one card with hairlines (long tables).
 */
export function Group({ children, style, joined }: { children: React.ReactNode; style?: ViewStyle; joined?: boolean }) {
  const t = useTheme();
  const os = useContext(ListCtx);
  const L = useLayout();
  const items = flat(children);
  const { backgroundColor, ...rest } = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const bg = backgroundColor ?? t.card;
  // Android preference list: full-width rows straight on the page, no cards, no dividers
  if (os === 'android') return <View style={[{ marginHorizontal: -L.side }, rest]}>{items.map((c, i) => <View key={i}>{c}</View>)}</View>;
  // iOS inset grouped: one rounded group, hairlines inset past the icon tile
  if (os === 'ios') {
    return (
      <View style={[{ backgroundColor: bg, borderRadius: 24, overflow: 'hidden' }, rest]}>
        {items.map((c, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.sep, marginLeft: 60 }} /> : null}
            {c}
          </View>
        ))}
      </View>
    );
  }
  if (joined) {
    return (
      <View style={[{ backgroundColor: bg, borderRadius: radius.card, overflow: 'hidden' }, rest]}>
        {items.map((c, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: 0.5, backgroundColor: t.sep, marginLeft: 18 }} /> : null}
            {c}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={[{ gap: 8 }, rest]}>
      {items.map((c, i) => <View key={i} style={{ backgroundColor: bg, borderRadius: radius.row, overflow: 'hidden' }}>{c}</View>)}
    </View>
  );
}

export function Avatar({ name, size = 'md', accent, tone }: { name: string; size?: 'sm' | 'md' | 'lg'; accent?: boolean; tone?: PastelTone }) {
  const t = useTheme();
  const d = size === 'sm' ? 40 : size === 'lg' ? 76 : 46;
  const initials = (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  void accent;
  // identity colour: the same person always gets the same pastel (never a status colour by itself)
  return (
    <View accessible={false} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: t.pastel[tone ?? pastelFor(name || '?')], alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ color: t.ink, fontWeight: '700', fontSize: size === 'sm' ? 14 : size === 'lg' ? 28 : 16 }}>{initials}</Text>
    </View>
  );
}

export function Pill({ severity, text, plain }: { severity: Severity; text?: string; plain?: boolean }) {
  const t = useTheme();
  const tone: Tone = severity === 'act' ? 'red' : severity === 'review' ? 'amber' : severity === 'good' ? 'green' : 'blue';
  const c = toneColor(t, tone);
  const label = text ?? (severity === 'info' ? 'Info' : TONE_WORD[tone]);
  // plain = the coloured word alone, as at the end of a row in the mock
  if (plain) return <Text accessible accessibilityLabel={`Status: ${label}`} style={[font.sub, { color: toneInk(t, tone), fontWeight: '600' }]}>{label}</Text>;
  return (
    <View accessible accessibilityLabel={`Status: ${label}`} style={{ backgroundColor: t.onPastel ? t.fill : tint(c, t.pillAlpha), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' }}>
      <Text style={[font.caption, { color: toneInk(t, tone), fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}
export function Chip({ text }: { text: string }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.fill, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
}
export function Tag({ text }: { text: string }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.fill, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={[font.tiny, { color: t.text2, textTransform: 'uppercase' }]}>{text}</Text></View>;
}
export function Dot({ tone, label }: { tone: Tone; label?: string }) {
  const t = useTheme();
  return <View accessible={!!label} accessibilityLabel={label} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: toneColor(t, tone) }} />;
}

/** Leading icon of a row: a pastel disc with an ink glyph. With a tone the disc carries the meaning
 *  (red urgent · amber attention · green good); without one it is sky (information). */
export function RowIcon({ name, tone, pastel, size = 40 }: { name: string; tone?: Tone; pastel?: PastelTone; size?: number }) {
  const t = useTheme();
  const os = useContext(ListCtx);
  const bg = t.onPastel ? t.fill : t.pastel[pastel ?? (tone ? tonePastel(tone) : 'sky')];
  // iOS settings rows: the small rounded-square icon tile
  if (os === 'ios') return <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={name} size={17} color={t.ink} /></View>;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={name} size={Math.round(size * 0.47)} color={t.ink} /></View>;
}

/** Grouped-list row: leading icon / avatar / dot, title + subtitle, trailing value / pill / chevron. */
export function Row({ title, subtitle, value, icon, iconTone, iconPastel, avatar, dot, pill, chevron, onPress, titleTone, titleStyle, children, label, alignTop, trailing }: {
  trailing?: React.ReactNode; iconPastel?: PastelTone;
  title: React.ReactNode; subtitle?: React.ReactNode; value?: string; icon?: string; iconTone?: Tone; avatar?: string; dot?: Tone; pill?: Severity; chevron?: boolean;
  onPress?: () => void; titleTone?: 'accent' | 'red' | 'text2'; titleStyle?: TextStyle; children?: React.ReactNode; label?: string; alignTop?: boolean;
}) {
  const t = useTheme();
  const os = useContext(ListCtx);
  const L = useLayout();
  const box: ViewStyle = os === 'ios' ? { gap: 14, paddingHorizontal: 16, paddingVertical: 11, minHeight: 52 } : os === 'android' ? { gap: 16, paddingHorizontal: L.side + 4, paddingVertical: 12, minHeight: 68 } : { gap: 14, paddingHorizontal: 18, paddingVertical: 14, minHeight: 60 };
  if (os && typeof title === 'string' && !titleStyle) titleStyle = os === 'ios' ? { ...font.body, fontWeight: '400' } : { fontSize: 16, lineHeight: 22, fontWeight: '400' };
  const inner = (
    <View style={[{ flexDirection: 'row', alignItems: alignTop ? 'flex-start' : 'center' }, box]}>
      {dot ? <View style={{ marginTop: alignTop ? 7 : 0 }}><Dot tone={dot} label={TONE_WORD[dot]} /></View> : null}
      {avatar !== undefined ? <Avatar name={avatar} size="sm" /> : null}
      {icon ? <RowIcon name={icon} tone={iconTone} pastel={iconPastel} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T tone={titleTone === 'text2' ? 'text2' : titleTone ?? 'text'} style={[font.callout, { fontWeight: '600' }, titleStyle ?? {}]}>{title}</T> : title}
        {subtitle ? (typeof subtitle === 'string' ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{subtitle}</T> : subtitle) : null}
        {children}
      </View>
      {value ? <T tone="text2" style={[font.sub, { textAlign: 'right', flexShrink: 0, maxWidth: '45%' }]}>{value}</T> : null}
      {pill ? <Pill severity={pill} plain /> : null}
      {trailing}
      {os !== 'android' && (chevron ?? !!onPress) ? <Icon name="chevR" size={14} color={t.text3} weight="semibold" /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? (typeof title === 'string' ? [title, typeof subtitle === 'string' ? subtitle : '', value].filter(Boolean).join(', ') : undefined)}
      android_ripple={os === 'android' ? { color: t.fill } : undefined} style={({ pressed }) => pressed && { backgroundColor: t.fill }}>{inner}</Pressable>
  );
}

// ---------- notes ----------
/** Notes: urgent / attention / good are pastel blocks (blush / butter / sage) with ink text;
 *  information stays a calm grey card so a screen never has more colour than meaning. */
export function Note({ tone, children, actions, style }: { tone: Tone; children: React.ReactNode; actions?: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const icon = tone === 'red' || tone === 'amber' ? 'alert' : tone === 'green' ? 'checkc' : 'info';
  const body = (c: string) => (
    <>
      <View style={{ marginTop: 1 }}><Icon name={icon} size={19} color={c} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === 'string' ? <T style={font.sub}>{children}</T> : children}
        {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{actions}</View> : null}
      </View>
    </>
  );
  if (tone === 'blue' || tone === 'grey' || t.onPastel) {
    return <View accessibilityRole="text" style={[{ borderRadius: 22, padding: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10, backgroundColor: t.onPastel ? t.fill : t.card2, marginTop: 14 }, style]}>{body(t.inkAccent)}</View>;
  }
  return (
    <View accessibilityRole="text" style={[{ borderRadius: 22, backgroundColor: t.pastel[tonePastel(tone)], marginTop: 14 }, style]}>
      <PastelScope tone={tonePastel(tone)}><View style={{ padding: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10 }}>{body(t.ink)}</View></PastelScope>
    </View>
  );
}
export function LegalLine() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <Icon name="scale" size={13} color={t.text2} />
      <T tone="text2" style={font.caption}>Not legal advice · talk to an attorney</T>
    </View>
  );
}

// ---------- buttons ----------
/**
 * Buttons. primary = white on black (dark) / black on light — the one main action; tint = sky pastel
 * and danger = blush pastel with ink text (secondary actions); ghost = quiet grey.
 */
export function Button({ title, onPress, kind = 'primary', icon, busy, disabled, size, grow, block, label }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'tint' | 'danger'; icon?: string; busy?: boolean; disabled?: boolean; size?: 'sm'; grow?: boolean; block?: boolean; label?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'ghost' ? (t.onPastel ? t.fill : t.dark ? t.card2 : '#E4E5E9') : t.onPastel ? t.fill : kind === 'tint' ? t.pastel.sky : t.pastel.urgent;
  const fg = kind === 'primary' ? t.onPrimary : kind === 'ghost' ? t.text : t.ink;
  const sm = size === 'sm';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => ({
        flexGrow: sm ? 0 : grow ? 2 : 1, flexShrink: 1, flexBasis: sm ? 'auto' : block ? '100%' : 0, minWidth: sm ? undefined : 96, minHeight: sm ? MIN_TOUCH : 52,
        borderRadius: sm ? 22 : radius.button, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingHorizontal: sm ? 16 : 14, paddingVertical: 6, opacity: disabled ? 0.35 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        marginTop: block ? 16 : 0, alignSelf: sm ? 'flex-start' : undefined,
      })}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={sm ? 16 : 18} color={fg} weight="semibold" /> : null}
      <Text style={{ color: fg, fontSize: sm ? 15 : 16, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}
/** Round-square icon button (the mock's + in the header): outlined, or filled = primary. */
export function IconButton({ icon, label, onPress, filled, pastel, plain }: { icon: string; label: string; onPress: () => void; filled?: boolean; pastel?: PastelTone; plain?: boolean }) {
  const t = useTheme();
  // plain: a bare toolbar glyph (iOS large-title bar / M3 top app bar action), 44 pt square
  if (plain) return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={2}
      style={({ pressed }) => ({ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={22} color={t.text} />
    </Pressable>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 17, backgroundColor: pastel ? t.pastel[pastel] : filled ? t.primary : 'transparent', borderWidth: filled || pastel ? 0 : 1.5, borderColor: t.outline, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={pastel ? t.ink : filled ? t.onPrimary : t.text} />
    </Pressable>
  );
}
export function LinkButton({ title, onPress, align = 'right' }: { title: string; onPress: () => void; align?: 'left' | 'right' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: align === 'right' ? 'flex-end' : 'flex-start', paddingHorizontal: 6 }}>
      <T tone="text2" style={[font.sub, { fontWeight: '600' }]}>{title}</T>
    </Pressable>
  );
}

// ---------- choice controls ----------
export function ChipToggle({ text, on, onPress, role = 'radio', size }: { text: string; on?: boolean; onPress?: () => void; role?: 'radio' | 'checkbox' | 'button'; size?: 'sm' }) {
  const t = useTheme();
  if (size === 'sm') return <SmallChip text={text} on={on} onPress={onPress} role={role} />;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={role} accessibilityState={{ checked: role !== 'button' ? !!on : undefined, selected: !!on }} accessibilityLabel={text}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? (t.onPastel ? t.primary : t.chipOn) : t.onPastel ? t.fill : t.dark ? t.card2 : '#E4E5E9', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Text style={{ color: on ? (t.onPastel ? t.onPrimary : t.onChipOn) : t.text, fontSize: 15, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}
/**
 * v2.9 filter chip: 32 pt tall (44 pt hit area). iOS: a filled capsule, the selected one in the brand
 * chip colour. Android: a Material 3 filter chip — 8 dp corners, outlined, a check and the secondary
 * container when selected.
 */
function SmallChip({ text, on, onPress, role }: { text: string; on?: boolean; onPress?: () => void; role: 'radio' | 'checkbox' | 'button' }) {
  const t = useTheme();
  const m3 = listOS() === 'android' && !t.onPastel;
  const r = m3Roles(t);
  const bg = m3 ? (on ? r.secondaryContainer : 'transparent') : on ? (t.onPastel ? t.primary : t.chipOn) : t.onPastel ? t.fill : t.dark ? t.card2 : '#E4E5E9';
  const fg = m3 ? (on ? r.onSecondaryContainer : t.text2) : on ? (t.onPastel ? t.onPrimary : t.onChipOn) : t.text;
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} accessibilityRole={role} accessibilityState={{ checked: role !== 'button' ? !!on : undefined, selected: !!on }} accessibilityLabel={text}
      style={({ pressed }) => ({ height: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: m3 && on ? 8 : 12, paddingRight: 12, borderRadius: m3 ? 8 : 16, backgroundColor: bg, borderWidth: m3 && !on ? 1 : 0, borderColor: t.outline, opacity: pressed ? 0.75 : 1 })}>
      {m3 && on ? <Icon name="check" size={16} color={fg} weight="semibold" /> : null}
      <Text numberOfLines={1} style={{ color: fg, fontSize: 14, fontWeight: on ? '600' : '500', letterSpacing: m3 ? 0.1 : -0.1 }}>{text}</Text>
    </Pressable>
  );
}
/**
 * ONE horizontally scrolling row of filters that never wraps. The scroll area runs to the screen edge
 * (content keeps the page margin) so chips slide out under the edge instead of stopping short.
 * `lead`: a control that stays put at the start of the row (e.g. a sort menu button).
 */
export function ChipRow({ children, lead, style }: { children: React.ReactNode; lead?: React.ReactNode; style?: ViewStyle }) {
  const L = useLayout();
  const t = useTheme();
  // phones: run to the screen edge; wide screens (centred column): stop at the column edge
  const bleed = L.wide ? 0 : L.side;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginHorizontal: -bleed }, style]}>
      {lead ? <View style={{ paddingLeft: bleed, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{lead}<View style={{ width: StyleSheet.hairlineWidth, height: 20, backgroundColor: t.sep }} /></View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingLeft: lead ? 0 : bleed, paddingRight: bleed, paddingVertical: 6, alignItems: 'center' }}>{children}</ScrollView>
    </View>
  );
}
/** A compact menu button (sort): "Hot ⌄". 32 pt tall, 44 pt hit area. */
export function MenuButton({ title, label, onPress, icon }: { title: string; label: string; onPress: () => void; icon?: string }) {
  const t = useTheme();
  const m3 = listOS() === 'android';
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens a menu"
      style={({ pressed }) => ({ height: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: m3 ? 8 : 16, borderWidth: 1, borderColor: t.outline, opacity: pressed ? 0.7 : 1 })}>
      {icon ? <Icon name={icon} size={15} color={t.text} /> : null}
      <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
      <Icon name="chevD" size={13} color={t.text2} weight="semibold" />
    </Pressable>
  );
}
export const Chips = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }, style]}>{children}</View>;

export function Option({ title, subtitle, selected, onPress, style }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: t.card, borderRadius: radius.row, borderWidth: 2, borderColor: selected ? t.text : 'transparent' }, style]}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 7 : 2, borderColor: selected ? t.text : t.text3 }} />
      <View style={{ flex: 1 }}>
        <T style={[font.body, { fontWeight: '500' }]}>{title}</T>
        {subtitle ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{subtitle}</T> : null}
      </View>
    </Pressable>
  );
}

export function CheckRow({ title, checked, onPress }: { title: string; checked: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, minHeight: 60 }, pressed && { backgroundColor: t.fill }]}>
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: checked ? t.pastel.sageD : t.text3, backgroundColor: checked ? t.pastel.sageD : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={14} color={t.ink} weight="bold" /> : null}
      </View>
      <T style={[font.callout, { flex: 1 }]}>{title}</T>
    </Pressable>
  );
}

export function Segmented({ options, value, onChange, compact }: { options: string[]; value: string; onChange: (v: string) => void; compact?: boolean }) {
  const t = useTheme();
  const L = useLayout();
  if (compact && L.fontScale <= 1.35) return <CompactSegmented options={options} value={value} onChange={onChange} />;
  // Large text or a narrow screen: stack the segments instead of squeezing them (they'd overlap).
  const longest = Math.max(...options.map((o) => o.length));
  const stack = L.fontScale > 1.35 || (options.length > 2 && longest * 9 * L.fontScale * options.length > L.width - 2 * L.side - 40);
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: stack ? 'column' : 'row', backgroundColor: t.onPastel ? t.fill : t.dark ? t.card2 : '#E4E5E9', borderRadius: 18, padding: 3, marginTop: 10, gap: stack ? 2 : 0 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="tab" accessibilityState={{ selected: o === value }} accessibilityLabel={o}
          style={{ flex: stack ? undefined : 1, minHeight: MIN_TOUCH, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: o === value ? t.primary : 'transparent', paddingHorizontal: 6, paddingVertical: 4 }}>
          <Text style={{ color: o === value ? t.onPrimary : t.text2, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** v2.9 compact segmented control: iOS 32 pt (2 pt inset, 7 pt corners); Android a Material 3 segmented
 *  button (40 dp, outlined, check on the selected one). The hit area is always 44 pt. */
function CompactSegmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  if (listOS() === 'android') {
    const r = m3Roles(t);
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.outline, overflow: 'hidden', marginTop: 8 }}>
        {options.map((o, i) => (
          <Pressable key={o} onPress={() => onChange(o)} hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="tab" accessibilityState={{ selected: o === value }} accessibilityLabel={o}
            style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: o === value ? r.secondaryContainer : 'transparent', borderLeftWidth: i ? 1 : 0, borderColor: t.outline, paddingHorizontal: 8 }}>
            {o === value ? <Icon name="check" size={16} color={r.onSecondaryContainer} weight="semibold" /> : null}
            <Text numberOfLines={1} style={{ color: o === value ? r.onSecondaryContainer : t.text, fontSize: 14, fontWeight: '600' }}>{o}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', height: 32, backgroundColor: t.onPastel ? t.fill : t.dark ? t.card2 : '#E4E5E9', borderRadius: 9, padding: 2, marginTop: 8 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="tab" accessibilityState={{ selected: o === value }} accessibilityLabel={o}
          style={{ flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: o === value ? (t.dark ? '#5A5B60' : '#FFFFFF') : 'transparent', paddingHorizontal: 6, ...(o === value && !t.dark ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}) }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 13.5, fontWeight: o === value ? '600' : '500' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Switch({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const t = useTheme();
  return <RNSwitch value={value} onValueChange={onValueChange} accessibilityLabel={label} trackColor={{ true: t.pastel.sageD, false: t.dark ? '#3A3B3F' : '#D5D7DB' }} thumbColor="#fff" ios_backgroundColor={t.dark ? '#3A3B3F' : '#D5D7DB'} />;
}

// ---------- fields ----------
export function Field({ label, value, onChangeText, placeholder, secure, keyboardType, autoCapitalize = 'sentences', mono, onBlur, autoFocus, maxLength, error, nativeID, multiline, returnKeyType, onSubmitEditing, inputRef, autoComplete }: {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; secure?: boolean; keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'characters' | 'sentences'; mono?: boolean; onBlur?: () => void; autoFocus?: boolean; maxLength?: number; error?: string; nativeID?: string; multiline?: boolean;
  /** v3.0: keyboard Next / Done and what it does (onboarding moves to the next field or step). */
  returnKeyType?: 'next' | 'done' | 'go'; onSubmitEditing?: () => void; inputRef?: React.Ref<any>; autoComplete?: 'given-name' | 'family-name' | 'name' | 'postal-code' | 'off';
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginTop: 12 }}>
      <T tone="text2" style={[font.caption, { marginBottom: 5, marginLeft: 2 }]}>{label}</T>
      <TextInput ref={inputRef} returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing} submitBehavior={onSubmitEditing && returnKeyType === 'next' ? 'submit' : undefined} autoComplete={autoComplete} nativeID={nativeID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.text3} secureTextEntry={secure} keyboardType={keyboardType}
        autoCapitalize={autoCapitalize} autoCorrect={false} autoFocus={autoFocus} maxLength={maxLength} accessibilityLabel={label} multiline={multiline} textAlignVertical={multiline ? 'top' : undefined}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); onBlur?.(); }}
        style={[font.body, { minHeight: multiline ? 110 : 50, borderRadius: radius.field, backgroundColor: t.field, color: t.text, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: focus ? t.text : t.fieldBorder, fontFamily: mono ? Platform.select({ ios: 'Menlo', default: 'monospace' }) : undefined }]} />
      {error ? <T tone="red" style={[font.caption, { marginTop: 6 }]}>{error}</T> : null}
    </View>
  );
}

/** Date field: shows "Sep 30, 2028"; picker in a sheet (iOS inline calendar / Android dialog); typed on the web. */
export function DateField({ label, value, onChange, allowDS }: { label: string; value?: string; onChange: (iso?: string) => void; allowDS?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(value ?? '');
  let Picker: any;
  if (Platform.OS !== 'web') { try { Picker = require('@react-native-community/datetimepicker').default; } catch { Picker = undefined; } }
  if (!Picker) return <Field label={label} value={typed} placeholder="YYYY-MM-DD" onChangeText={setTyped} onBlur={() => onChange(typed || undefined)} autoCapitalize="none" />;
  const d = value && isISO(value) ? new Date(value + 'T12:00:00') : new Date();
  const toIso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return (
    <View style={{ marginTop: 12 }}>
      <T tone="text2" style={[font.caption, { marginBottom: 5, marginLeft: 2 }]}>{label}</T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? (isISO(value) ? fmt(value) : value) : 'not set'}`} accessibilityHint="Opens a date picker"
        style={{ minHeight: 50, borderRadius: radius.field, backgroundColor: t.field, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: t.fieldBorder }}>
        <T tone={value ? 'text' : 'text3'}>{value ? (isISO(value) ? fmt(value) : value) : 'Choose a date'}</T>
      </Pressable>
      {open && Platform.OS === 'android' ? <Picker value={d} mode="date" onChange={(_: unknown, x?: Date) => { setOpen(false); if (x) onChange(toIso(x)); }} /> : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          <Picker value={d} mode="date" display="inline" themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.dark ? t.pastel.sage : t.inkGreen} onChange={(_: unknown, x?: Date) => { if (x) onChange(toIso(x)); }} />
          <SheetButtons>
            {allowDS ? <Button kind="ghost" title="D/S" onPress={() => { onChange('D/S'); setOpen(false); }} /> : null}
            {value ? <Button kind="ghost" title="Clear" onPress={() => { onChange(undefined); setOpen(false); }} /> : null}
            <Button title="Done" grow onPress={() => setOpen(false)} />
          </SheetButtons>
        </Sheet>
      ) : null}
    </View>
  );
}

/** A select that opens a sheet of options (no native picker module needed). */
export function SelectField<V extends string>({ label, value, options, onChange, groups }: {
  label?: string; value: V; options?: { value: V; label: string; sub?: string }[]; groups?: { title: string; options: { value: V; label: string; sub?: string }[] }[]; onChange: (v: V) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const all = groups ? groups.flatMap((g) => g.options) : options ?? [];
  const cur = all.find((o) => o.value === value);
  const list = (opts: { value: V; label: string; sub?: string }[]) => (
    <Group style={{ backgroundColor: t.dark ? t.card2 : t.card }}>
      {opts.map((o) => (
        <Row key={o.value} title={o.label} subtitle={o.sub} onPress={() => { onChange(o.value); setOpen(false); }} chevron={false} label={o.label}
          value={o.value === value ? '✓' : undefined} />
      ))}
    </Group>
  );
  return (
    <View style={{ marginTop: label ? 12 : 12 }}>
      {label ? <T tone="text2" style={[font.caption, { marginBottom: 5, marginLeft: 2 }]}>{label}</T> : null}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label ?? 'Choose'}: ${cur?.label ?? 'none'}`}
        style={{ minHeight: 50, borderRadius: radius.field, backgroundColor: t.field, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: t.fieldBorder }}>
        <T style={[font.callout, { flex: 1 }]}>{cur?.label ?? 'Choose'}</T>
        <Icon name="chevR" size={13} color={t.grey} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? 'Choose'}>
        {groups ? groups.map((g) => <View key={g.title}><SectionHeader>{g.title}</SectionHeader>{list(g.options)}</View>) : list(options ?? [])}
      </Sheet>
    </View>
  );
}

// ---------- meters / timeline ----------
/** Progress pill. Colour = meaning: sage by default, butter (amber) = attention, blush (red) = urgent. */
export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'amber' | 'red' }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }} style={{ height: 8, borderRadius: 4, backgroundColor: t.onPastel ? t.track : t.fill, overflow: 'hidden', marginTop: 10 }}>
      <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: t.onPastel ? t.ink : tone === 'red' ? t.red : tone === 'amber' ? t.amber : t.green }} />
    </View>
  );
}
export function Timeline({ items }: { items: { title: string; sub?: string; state?: 'done' | 'now' | '' ; onPress?: () => void; extra?: React.ReactNode }[] }) {
  const t = useTheme();
  return (
    <View style={{ paddingLeft: 24 }}>
      <View style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, backgroundColor: t.sep, borderRadius: 1 }} />
      {items.map((it, i) => (
        <Pressable key={i} onPress={it.onPress} disabled={!it.onPress} accessibilityRole={it.onPress ? 'button' : undefined} accessibilityLabel={it.onPress ? it.title : undefined} style={{ paddingBottom: i === items.length - 1 ? 0 : 16, minHeight: it.onPress ? MIN_TOUCH : undefined }}>
          <View style={{ position: 'absolute', left: -24, top: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: it.state === 'done' ? t.green : it.state === 'now' ? t.text : t.text3, backgroundColor: it.state === 'done' ? t.green : it.state === 'now' ? t.text : t.card }} />
          <T style={[font.callout, { fontWeight: '600' }]}>{it.title}</T>
          {it.sub ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{it.sub}</T> : null}
          {it.extra}
        </Pressable>
      ))}
    </View>
  );
}

export const Spinner = () => { const t = useTheme(); return <ActivityIndicator color={t.text2} />; };

export function EmptyState({ icon = 'users', title, body, action, small }: { icon?: string; title: string; body?: string; action?: { title: string; onPress: () => void }; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: small ? 28 : 72, paddingHorizontal: 16 }}>
      <View style={{ width: 72, height: 72, borderRadius: 26, backgroundColor: t.pastel.sky, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={30} color={t.ink} /></View>
      <T style={[font.headline, { marginTop: 14, textAlign: 'center' }]}>{title}</T>
      {body ? <T tone="text2" style={[font.foot, { marginTop: 6, textAlign: 'center' }]}>{body}</T> : null}
      {action ? <View style={{ alignSelf: 'stretch' }}><Button block title={action.title} onPress={action.onPress} /></View> : null}
    </View>
  );
}

// ---------- sheet ----------
// Sheets are NOT React Native <Modal>s. A Modal is a separate iOS view controller: when Safari
// (SFSafariViewController), the share sheet, a document/photo picker or Face ID is presented while a
// Modal is up, iOS can't stack them and the Modal can be left in a broken state that swallows every
// touch after returning (owner: stuck after "Copy number & open uscis.gov"). Instead every sheet is an
// overlay drawn by <OverlayHost> above the app's own root view, so native UI always presents on top
// of a normal view and nothing is left behind. Sheets still stack (a picker inside a sheet).
// Each sheet keeps its latest props in a small registry; the host only tracks which sheets are open
// (so updating a sheet's content never re-renders the host — no update loops).
type SheetProps = { onClose: () => void; title?: string; children: React.ReactNode };
const registry = new Map<number, { props: SheetProps | null; subs: Set<() => void> }>();
const slotOf = (id: number) => { let r = registry.get(id); if (!r) { r = { props: null, subs: new Set() }; registry.set(id, r); } return r; };
type OverlaySet = (id: number, open: boolean) => void;
const OverlayCtx = createContext<OverlaySet | null>(null);
let overlayIds = 1;

export function OverlayHost({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  const set = useCallback<OverlaySet>((id, open) => setIds((es) => {
    const has = es.includes(id);
    if (open === has) return es;
    return open ? [...es, id] : es.filter((e) => e !== id);
  }), []);
  return (
    <OverlayCtx.Provider value={set}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }} importantForAccessibility={ids.length ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={ids.length > 0}>{children}</View>
        {ids.map((id) => <Slot key={id} id={id} />)}
      </View>
    </OverlayCtx.Provider>
  );
}
function Slot({ id }: { id: number }) {
  const [, force] = useState(0);
  useEffect(() => { const r = slotOf(id); const f = () => force((n) => n + 1); r.subs.add(f); return () => { r.subs.delete(f); }; }, [id]);
  const p = registry.get(id)?.props;
  return p ? <SheetView {...p} /> : null;
}

function SheetView({ onClose, title, children }: { onClose: () => void; title?: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const a = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  // subtle spring up (fade only with Reduce Motion)
  useEffect(() => {
    if (reduce) { a.setValue(1); return; }
    Animated.spring(a, { toValue: 1, damping: 26, stiffness: 260, mass: 0.9, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [a, reduce]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; }); return () => sub.remove(); }, [onClose]);
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 50, elevation: 50 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: a }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.shade }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ maxHeight: '92%', alignSelf: 'center', width: '100%', maxWidth: L.wide ? 560 : undefined }}>
        <Animated.View accessibilityViewIsModal style={{ transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }], backgroundColor: t.dark ? '#141516' : t.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingLeft: 18 + insets.left, paddingRight: 18 + insets.right, paddingBottom: 18 + insets.bottom }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.outline, alignSelf: 'center', marginBottom: 14 }} />
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {title ? <T a11y="header" style={font.title2}>{title}</T> : null}
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const set = useContext(OverlayCtx);
  const id = useRef(0);
  if (!id.current) id.current = overlayIds++;
  useEffect(() => {
    const r = slotOf(id.current);
    r.props = visible ? { onClose, title, children } : null;
    set?.(id.current, visible);
    r.subs.forEach((f) => f());
  });
  useEffect(() => () => { set?.(id.current, false); registry.delete(id.current); }, [set]);
  if (set) return null;
  // No host (shouldn't happen — SheetProvider adds one): fall back to a Modal.
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>{visible ? <SheetView onClose={onClose} title={title}>{children}</SheetView> : null}</Modal>;
}
export const SheetButtons = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>{children}</View>;

/** Imperative sheets: const sheet = useSheet(); sheet.open(<Content />) — one sheet at a time, like the prototype. */
const SheetCtx = createContext<{ open: (title: string | undefined, node: React.ReactNode) => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useSheet = () => useContext(SheetCtx);
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ title?: string; node: React.ReactNode } | null>(null);
  const open = useCallback((title: string | undefined, node: React.ReactNode) => setState({ title, node }), []);
  const close = useCallback(() => setState(null), []);
  return (
    <SheetCtx.Provider value={{ open, close }}>
      <OverlayHost>
        {children}
        <Sheet visible={!!state} onClose={close} title={state?.title}>{state?.node}</Sheet>
      </OverlayHost>
    </SheetCtx.Provider>
  );
}

// ---------- toast (top) ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const a = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setMsg(null)), 2300);
  }, [a]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" accessibilityRole="alert"
          style={{ position: 'absolute', top: insets.top + 10, alignSelf: 'center', maxWidth: '92%', opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
            backgroundColor: t.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
          <Text numberOfLines={2} style={[font.sub, { color: t.onPrimary, fontWeight: '600', textAlign: 'center' }]}>{msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export { space, font, radius };
