// The design-system set every screen uses (matches the approved prototype 1:1). Every touchable has
// an accessibility role + label and a 44-pt target; status colour is always paired with a word.
// Nothing here has a fixed width: layouts flex, wrap at large Dynamic Type sizes and centre on wide
// screens (fold open, iPad, landscape).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch as RNSwitch,
  Text as RNText, TextInput, View, StyleSheet, type TextStyle, type ViewStyle, type KeyboardTypeOptions, type TextProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { font, MIN_TOUCH, radius, space, tint, toneColor, TONE_WORD, useLayout, useTheme, type Tone } from './theme';
import type { Severity } from '../core/rules/types';
import { fmt, isISO } from '../core/dates';

import { WEB_TEXT_SCALE } from './theme';

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
export function T({ children, style, tone = 'text', numberOfLines, a11y }: { children: React.ReactNode; style?: TextStyle | TextStyle[]; tone?: 'text' | 'text2' | 'text3' | 'accent' | 'red' | 'green' | 'amber'; numberOfLines?: number; a11y?: 'header' }) {
  const t = useTheme();
  const color = tone === 'text' ? t.text : tone === 'text2' ? t.text2 : tone === 'text3' ? t.text3 : tone === 'accent' ? t.accent : t[tone];
  return <Text accessibilityRole={a11y} numberOfLines={numberOfLines} style={[{ color }, font.body, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</Text>;
}
export const H1 = ({ children }: { children: React.ReactNode }) => <T a11y="header" style={font.title}>{children}</T>;
export const Why = ({ children }: { children: React.ReactNode }) => <T tone="text2" style={[font.body, { marginTop: 6, lineHeight: 23 }]}>{children}</T>;
export const Hint = ({ children, center, style }: { children: React.ReactNode; center?: boolean; style?: TextStyle }) => <T tone="text2" style={[font.caption, { marginTop: 8 }, center ? { textAlign: 'center' } : {}, style ?? {}]}>{children}</T>;

export function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <T a11y="header" style={[font.largeTitle, { flexShrink: 1 }]}>{title}</T>
      {right}
    </View>
  );
}

export function SectionHeader({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, marginBottom: 8, marginHorizontal: 4, gap: 8 }}>
      <T tone="text2" a11y="header" style={[font.caption, { textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 1 }]}>{children}</T>
      {right}
    </View>
  );
}

// ---------- bars ----------
function Bar({ children, style, edge }: { children: React.ReactNode; style?: ViewStyle; edge: 'top' | 'bottom' }) {
  const t = useTheme();
  const border = edge === 'top' ? { borderBottomWidth: 0.5, borderBottomColor: t.sep } : { borderTopWidth: 0.5, borderTopColor: t.sep };
  if (BlurView && Platform.OS === 'ios') {
    return <BlurView intensity={60} tint={t.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={[border, style]}>{children}</BlurView>;
  }
  return <View style={[{ backgroundColor: t.bar }, border, style]}>{children}</View>;
}

export type NavProps = { title?: string; back?: string; onBack?: () => void; right?: React.ReactNode; progress?: { label: string; right?: string; value: number } };

export function NavBar({ title, back, onBack, right, progress }: NavProps) {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const t = useTheme();
  return (
    <Bar edge="top" style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {back !== undefined ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={`Back to ${back}`} hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 4 }}>
              <Icon name="chevL" size={22} color={t.accent} weight="semibold" />
              {!L.compact ? <T tone="accent" numberOfLines={1} style={{ maxWidth: 110, marginLeft: 2 }}>{back}</T> : null}
            </Pressable>
          ) : null}
        </View>
        <T a11y="header" numberOfLines={1} style={[font.headline, { flexShrink: 1, textAlign: 'center', maxWidth: '55%' }]}>{title ?? ''}</T>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>{right}</View>
      </View>
      {progress ? <Progress {...progress} /> : null}
    </Bar>
  );
}

export function NavButton({ title, onPress, label }: { title: string; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title} hitSlop={6} style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
      <T tone="accent">{title}</T>
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
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 4, borderRadius: 2, backgroundColor: t.fill, overflow: 'hidden' }}>
        <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: t.accent, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
}

export function Footer({ children, column }: { children: React.ReactNode; column?: boolean }) {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  return (
    <Bar edge="bottom" style={{ paddingBottom: 12 + insets.bottom, paddingTop: 12, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ flexDirection: column ? 'column' : 'row', flexWrap: column ? 'nowrap' : 'wrap', gap: 10, paddingHorizontal: L.side, alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side }}>{children}</View>
    </Bar>
  );
}

// ---------- screen ----------
export function Screen({ nav, footer, children, scroll = true, tabRoot, keyboard, padTop = true }: { nav?: NavProps; footer?: React.ReactNode; children: React.ReactNode; scroll?: boolean; tabRoot?: boolean; keyboard?: boolean; padTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const inner: ViewStyle = { paddingHorizontal: L.side, paddingTop: nav ? 20 : padTop ? insets.top + 14 : 0, paddingBottom: (footer ? 24 : 32) + (tabRoot ? insets.bottom + 56 : footer ? 0 : insets.bottom), alignSelf: 'center', width: '100%', maxWidth: L.maxWidth + 2 * L.side };
  const body = scroll ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={inner} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior={tabRoot ? 'automatic' : 'never'}>{children}</ScrollView>
  ) : <View style={[{ flex: 1 }, inner]}>{children}</View>;
  const content = (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingLeft: insets.left, paddingRight: insets.right }}>
      {nav ? <NavBar {...nav} /> : null}
      {body}
      {footer ? <Footer>{footer}</Footer> : null}
    </View>
  );
  return keyboard && Platform.OS === 'ios' ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>{content}</KeyboardAvoidingView> : content;
}

// ---------- surfaces ----------
export function Card({ children, onPress, style, label }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle | ViewStyle[]; label?: string }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.card, borderRadius: radius.card, padding: 16 };
  if (!onPress) return <View style={[base, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [base, ...(Array.isArray(style) ? style : style ? [style] : []), pressed && { transform: [{ scale: 0.98 }] }]}>{children}</Pressable>;
}
export const Stack = ({ children, gap = 12, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) => <View style={[{ gap }, style]}>{children}</View>;

export function Group({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' }, style]}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: 0.5, backgroundColor: t.sep, marginLeft: 16 }} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

export function Avatar({ name, size = 'md', accent }: { name: string; size?: 'sm' | 'md' | 'lg'; accent?: boolean }) {
  const t = useTheme();
  const d = size === 'sm' ? 34 : size === 'lg' ? 76 : 44;
  const initials = (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <View accessible={false} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: accent ? t.accent : t.avatar, alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ color: accent ? '#fff' : t.text, fontWeight: '600', fontSize: size === 'sm' ? 13 : size === 'lg' ? 28 : 16 }}>{initials}</Text>
    </View>
  );
}

export function Pill({ severity, text }: { severity: Severity; text?: string }) {
  const t = useTheme();
  const tone: Tone = severity === 'act' ? 'red' : severity === 'review' ? 'amber' : severity === 'good' ? 'green' : 'blue';
  const c = toneColor(t, tone);
  const label = text ?? (severity === 'info' ? 'Info' : TONE_WORD[tone]);
  return (
    <View accessible accessibilityLabel={`Status: ${label}`} style={{ backgroundColor: tint(c, 0.16), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={[font.caption, { color: c, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}
export function Chip({ text }: { text: string }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.fill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
}
export function Tag({ text }: { text: string }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.fill, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' }}><Text style={[font.tiny, { color: t.text2, textTransform: 'uppercase' }]}>{text}</Text></View>;
}
export function Dot({ tone, label }: { tone: Tone; label?: string }) {
  const t = useTheme();
  return <View accessible={!!label} accessibilityLabel={label} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone === 'blue' ? t.grey : toneColor(t, tone) }} />;
}

export function RowIcon({ name, tone }: { name: string; tone?: Tone }) {
  const t = useTheme();
  return <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Icon name={name} size={17} color={tone ? toneColor(t, tone) : t.accent} /></View>;
}

/** Grouped-list row: leading icon / avatar / dot, title + subtitle, trailing value / pill / chevron. */
export function Row({ title, subtitle, value, icon, iconTone, avatar, dot, pill, chevron, onPress, titleTone, titleStyle, children, label, alignTop, trailing }: {
  trailing?: React.ReactNode;
  title: React.ReactNode; subtitle?: React.ReactNode; value?: string; icon?: string; iconTone?: Tone; avatar?: string; dot?: Tone; pill?: Severity; chevron?: boolean;
  onPress?: () => void; titleTone?: 'accent' | 'red' | 'text2'; titleStyle?: TextStyle; children?: React.ReactNode; label?: string; alignTop?: boolean;
}) {
  const t = useTheme();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: alignTop ? 'flex-start' : 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 54 }}>
      {dot ? <View style={{ marginTop: alignTop ? 7 : 0 }}><Dot tone={dot} label={TONE_WORD[dot]} /></View> : null}
      {avatar !== undefined ? <Avatar name={avatar} size="sm" /> : null}
      {icon ? <RowIcon name={icon} tone={iconTone} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T tone={titleTone === 'text2' ? 'text2' : titleTone ?? 'text'} style={[font.body, titleStyle ?? {}]}>{title}</T> : title}
        {subtitle ? (typeof subtitle === 'string' ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{subtitle}</T> : subtitle) : null}
        {children}
      </View>
      {value ? <T tone="text2" style={[font.sub, { textAlign: 'right', flexShrink: 0, maxWidth: '45%' }]}>{value}</T> : null}
      {pill ? <Pill severity={pill} /> : null}
      {trailing}
      {chevron ?? !!onPress ? <Icon name="chevR" size={14} color={t.text3} weight="semibold" /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? (typeof title === 'string' ? [title, typeof subtitle === 'string' ? subtitle : '', value].filter(Boolean).join(', ') : undefined)}
      style={({ pressed }) => pressed && { backgroundColor: t.fill }}>{inner}</Pressable>
  );
}

// ---------- notes ----------
export function Note({ tone, children, actions, style }: { tone: Tone; children: React.ReactNode; actions?: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const c = toneColor(t, tone);
  const bg = tone === 'blue' || tone === 'grey' ? t.fill : tint(c, 0.14);
  return (
    <View accessibilityRole="text" style={[{ borderRadius: 14, padding: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, backgroundColor: bg, marginTop: 14 }, style]}>
      <View style={{ marginTop: 1 }}><Icon name={tone === 'red' || tone === 'amber' ? 'alert' : tone === 'green' ? 'checkc' : 'info'} size={19} color={tone === 'grey' ? t.accent : c} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === 'string' ? <T style={font.sub}>{children}</T> : children}
        {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{actions}</View> : null}
      </View>
    </View>
  );
}
export function LegalLine() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <Icon name="scale" size={13} color={t.text2} />
      <T tone="text2" style={font.caption}>Not legal advice — talk to an attorney.</T>
    </View>
  );
}

// ---------- buttons ----------
export function Button({ title, onPress, kind = 'primary', icon, busy, disabled, size, grow, block, label }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'tint' | 'danger'; icon?: string; busy?: boolean; disabled?: boolean; size?: 'sm'; grow?: boolean; block?: boolean; label?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'ghost' ? t.fill : kind === 'tint' ? tint(t.accent, 0.16) : tint(t.red, 0.15);
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'ghost' ? t.text : kind === 'tint' ? t.accent : t.red;
  const sm = size === 'sm';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => ({
        flexGrow: sm ? 0 : grow ? 2 : 1, flexShrink: 1, flexBasis: sm ? 'auto' : block ? '100%' : 0, minWidth: sm ? undefined : 96, minHeight: sm ? MIN_TOUCH : 50,
        borderRadius: sm ? 11 : radius.button, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingHorizontal: sm ? 14 : 12, paddingVertical: 6, opacity: disabled ? 0.35 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        marginTop: block ? 18 : 0, alignSelf: sm ? 'flex-start' : undefined,
      })}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={sm ? 16 : 18} color={fg} weight="semibold" /> : null}
      <Text style={{ color: fg, fontSize: sm ? 15 : 17, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}
export function IconButton({ icon, label, onPress, filled }: { icon: string; label: string; onPress: () => void; filled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: filled ? t.accent : t.fill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={filled ? '#fff' : t.text} />
    </Pressable>
  );
}
export function LinkButton({ title, onPress, align = 'right' }: { title: string; onPress: () => void; align?: 'left' | 'right' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: align === 'right' ? 'flex-end' : 'flex-start', paddingHorizontal: 6 }}>
      <T tone="accent" style={[font.sub, { fontWeight: '500' }]}>{title}</T>
    </Pressable>
  );
}

// ---------- choice controls ----------
export function ChipToggle({ text, on, onPress, role = 'radio' }: { text: string; on?: boolean; onPress?: () => void; role?: 'radio' | 'checkbox' | 'button' }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={role} accessibilityState={{ checked: role !== 'button' ? !!on : undefined, selected: !!on }} accessibilityLabel={text}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? t.accent : t.fill, justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Text style={{ color: on ? '#fff' : t.text, fontSize: 15, fontWeight: '500' }}>{text}</Text>
    </Pressable>
  );
}
export const Chips = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }, style]}>{children}</View>;

export function Option({ title, subtitle, selected, onPress, style }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: t.card, borderRadius: radius.card, borderWidth: 2, borderColor: selected ? t.accent : 'transparent' }, style]}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 7 : 2, borderColor: selected ? t.accent : t.text3 }} />
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
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 54 }, pressed && { backgroundColor: t.fill }]}>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: checked ? t.accent : t.text3, backgroundColor: checked ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={13} color="#fff" weight="bold" /> : null}
      </View>
      <T style={[font.callout, { flex: 1 }]}>{title}</T>
    </Pressable>
  );
}

export function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const L = useLayout();
  // Large text or a narrow screen: stack the segments instead of squeezing them (they'd overlap).
  const longest = Math.max(...options.map((o) => o.length));
  const stack = L.fontScale > 1.35 || (options.length > 2 && longest * 9 * L.fontScale * options.length > L.width - 2 * L.side - 40);
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: stack ? 'column' : 'row', backgroundColor: t.fill, borderRadius: 10, padding: 2, marginTop: 10, gap: stack ? 2 : 0 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="tab" accessibilityState={{ selected: o === value }} accessibilityLabel={o}
          style={{ flex: stack ? undefined : 1, minHeight: MIN_TOUCH, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: o === value ? t.segOn : 'transparent', paddingHorizontal: 6, paddingVertical: 4 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '500', textAlign: 'center' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Switch({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const t = useTheme();
  return <RNSwitch value={value} onValueChange={onValueChange} accessibilityLabel={label} trackColor={{ true: t.accent, false: t.fill }} thumbColor="#fff" ios_backgroundColor={t.fill} />;
}

// ---------- fields ----------
export function Field({ label, value, onChangeText, placeholder, secure, keyboardType, autoCapitalize = 'sentences', mono, onBlur, autoFocus, maxLength, error, nativeID }: {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; secure?: boolean; keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'characters' | 'sentences'; mono?: boolean; onBlur?: () => void; autoFocus?: boolean; maxLength?: number; error?: string; nativeID?: string;
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginTop: 12 }}>
      <T tone="text2" style={[font.caption, { marginBottom: 5, marginLeft: 2 }]}>{label}</T>
      <TextInput nativeID={nativeID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.text3} secureTextEntry={secure} keyboardType={keyboardType}
        autoCapitalize={autoCapitalize} autoCorrect={false} autoFocus={autoFocus} maxLength={maxLength} accessibilityLabel={label}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); onBlur?.(); }}
        style={[font.body, { minHeight: 46, borderRadius: radius.field, backgroundColor: t.field, color: t.text, paddingHorizontal: 12, paddingVertical: 10, borderWidth: t.dark ? 2 : 1, borderColor: focus ? t.accent : t.dark ? 'transparent' : t.fieldBorder, fontFamily: mono ? Platform.select({ ios: 'Menlo', default: 'monospace' }) : undefined }]} />
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
        style={{ minHeight: 46, borderRadius: radius.field, backgroundColor: t.field, paddingHorizontal: 12, justifyContent: 'center', borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }}>
        <T tone={value ? 'text' : 'text3'}>{value ? (isISO(value) ? fmt(value) : value) : 'Choose a date'}</T>
      </Pressable>
      {open && Platform.OS === 'android' ? <Picker value={d} mode="date" onChange={(_: unknown, x?: Date) => { setOpen(false); if (x) onChange(toIso(x)); }} /> : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          <Picker value={d} mode="date" display="inline" themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.accent} onChange={(_: unknown, x?: Date) => { if (x) onChange(toIso(x)); }} />
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
    <Group style={{ backgroundColor: t.card2 }}>
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
        style={{ minHeight: 46, borderRadius: radius.field, backgroundColor: t.field, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }}>
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
export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'amber' | 'red' }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }} style={{ height: 8, borderRadius: 4, backgroundColor: t.fill, overflow: 'hidden', marginTop: 10 }}>
      <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: tone === 'red' ? t.red : tone === 'amber' ? t.amber : t.accent }} />
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
          <View style={{ position: 'absolute', left: -24, top: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: it.state === 'done' ? t.green : it.state === 'now' ? t.accent : t.text3, backgroundColor: it.state === 'done' ? t.green : it.state === 'now' ? t.accent : t.card }} />
          <T style={[font.callout, { fontWeight: '600' }]}>{it.title}</T>
          {it.sub ? <T tone="text2" style={[font.foot, { marginTop: 2 }]}>{it.sub}</T> : null}
          {it.extra}
        </Pressable>
      ))}
    </View>
  );
}

export const Spinner = () => { const t = useTheme(); return <ActivityIndicator color={t.accent} />; };

export function EmptyState({ icon = 'users', title, body, action, small }: { icon?: string; title: string; body?: string; action?: { title: string; onPress: () => void }; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: small ? 28 : 72, paddingHorizontal: 16 }}>
      <Icon name={icon} size={42} color={t.text3} />
      <T style={[font.body, { marginTop: 12, textAlign: 'center' }]}>{title}</T>
      {body ? <T tone="text2" style={[font.foot, { marginTop: 6, textAlign: 'center' }]}>{body}</T> : null}
      {action ? <View style={{ alignSelf: 'stretch' }}><Button block title={action.title} onPress={action.onPress} /></View> : null}
    </View>
  );
}

// ---------- sheet ----------
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.shade }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ maxHeight: '92%', alignSelf: 'center', width: '100%', maxWidth: L.wide ? 560 : undefined }}>
          <View accessibilityViewIsModal style={{ backgroundColor: t.dark ? '#1C1C1E' : t.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16 + insets.bottom }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.text3, alignSelf: 'center', marginBottom: 14 }} />
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
              {title ? <T a11y="header" style={font.title2}>{title}</T> : null}
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
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
      {children}
      <Sheet visible={!!state} onClose={close} title={state?.title}>{state?.node}</Sheet>
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
    Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true }).start();
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
            backgroundColor: t.dark ? t.card2 : '#fff', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
          <Text numberOfLines={2} style={[font.sub, { color: t.text, fontWeight: '500', textAlign: 'center' }]}>{msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export { space, font, radius };
