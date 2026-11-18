import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ViewStyle, TextStyle, Platform, TextInput, TextInputProps, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, radius } from '../theme';
import { useLayout } from '../lib/layout';
import { Glass, hasLiquidGlass } from './Glass';

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// External links: real <a> tags on web (work inside sandboxed previews), Linking on iOS/Android.
export function ExtLink({ href, children, block = true }: { href: string; children: React.ReactNode; block?: boolean }) {
  if (Platform.OS === 'web') {
    return React.createElement('a', { href, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit', display: block ? 'block' : 'inline' } }, children);
  }
  return <Pressable onPress={() => { tap(); Linking.openURL(href); }} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{children}</Pressable>;
}

export function Screen({ title, subtitle, children, right, scroll = true }: {
  title?: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode; scroll?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const header = title ? (
    <View style={{ paddingHorizontal: 20, paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + 14, paddingBottom: 10, paddingLeft: 20 + insets.left }}>
      {subtitle ? <Text style={{ color: t.sub, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>{subtitle}</Text> : null}
      {/* Action sits right after the title, not in the far top-right corner (camera / status pill on foldables) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: t.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }}>{title}</Text>
        {right}
      </View>
    </View>
  ) : null;
  const body = (
    <View style={{ width: '100%', maxWidth: L.maxContent, alignSelf: 'center', paddingRight: insets.right }}>
      {header}
      {children}
    </View>
  );
  if (!scroll) return <View style={{ flex: 1, backgroundColor: t.bg }}>{body}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: Platform.OS !== 'web' ? 32 : L.wide ? insets.bottom + 40 : insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
      {body}
    </ScrollView>
  );
}

// Two-pane page: side by side on unfolded foldables / tablets, stacked on phones.
export function Columns({ left, right, ratio = 1 }: { left: React.ReactNode; right: React.ReactNode; ratio?: number }) {
  const L = useLayout();
  if (!L.wide) return <View>{left}{right}</View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      <View style={{ flex: ratio, minWidth: 0 }}>{right}</View>
    </View>
  );
}

// Lays children out in 1 column on phones, 2 on unfolded foldables / tablets, 3 on large tablets
export function Grid({ children, cols, gap = 10 }: { children: React.ReactNode; cols?: number; gap?: number }) {
  const L = useLayout();
  const n = cols ?? L.cols;
  const items = React.Children.toArray(children).filter(Boolean);
  if (n === 1) return <View>{items}</View>;
  const columns: React.ReactNode[][] = Array.from({ length: n }, () => []);
  items.forEach((c, i) => columns[i % n].push(c));
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      {columns.map((c, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

export function Section({ title, action, onAction, children, style, note }: {
  title?: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: ViewStyle; note?: string;
}) {
  const t = useTheme();
  return (
    <View style={[{ marginTop: 22, paddingHorizontal: 20 }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, color: t.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 }}>{title}</Text>
          {action ? <Pressable onPress={onAction} hitSlop={10}><Text style={{ color: t.accent, fontSize: 15, fontWeight: '600' }}>{action}</Text></Pressable> : null}
        </View>
      ) : null}
      {note ? <Text style={{ color: t.sub, fontSize: 13, marginTop: -6, marginBottom: 10, lineHeight: 18 }}>{note}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, href }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; href?: string }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.surface, borderRadius: radius.lg, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border };
  if (href) return <ExtLink href={href}><View style={[base, style]}>{children}</View></ExtLink>;
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [base, style, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

export function T({ children, style, v = 'body', numberOfLines }: {
  children: React.ReactNode; style?: TextStyle; v?: 'h1' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'label' | 'num'; numberOfLines?: number;
}) {
  const t = useTheme();
  const map: Record<string, TextStyle> = {
    h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: t.text },
    h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: t.text },
    h3: { fontSize: 16, fontWeight: '600', color: t.text },
    body: { fontSize: 15, lineHeight: 21, color: t.text },
    sub: { fontSize: 14, lineHeight: 19, color: t.sub },
    small: { fontSize: 12, color: t.sub },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: t.sub },
    num: { fontSize: 30, fontWeight: '700', letterSpacing: -1, color: t.text, fontVariant: ['tabular-nums'] },
  };
  return <Text numberOfLines={numberOfLines} style={[map[v], style]}>{children}</Text>;
}

export function Pill({ label, tone = 'neutral', small }: { label: string; tone?: 'neutral' | 'accent' | 'green' | 'amber' | 'red'; small?: boolean }) {
  const t = useTheme();
  const c = {
    neutral: [t.surface2, t.sub], accent: [t.accentSoft, t.accent], green: [t.greenSoft, t.green], amber: [t.amberSoft, t.amber], red: [t.redSoft, t.red],
  }[tone];
  return (
    <View style={{ backgroundColor: c[0], paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4, borderRadius: 99, alignSelf: 'flex-start' }}>
      <Text style={{ color: c[1], fontSize: small ? 11 : 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// Round header button: Liquid Glass on iOS 26+, tonal elsewhere
export function GlassButton({ icon, onPress, label, primary }: { icon: IconName; onPress: () => void; label: string; primary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} accessibilityLabel={label} hitSlop={8}>
      <Glass interactive style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: primary && !hasLiquidGlass ? t.accent : undefined }}>
        <Ionicons name={icon} size={20} color={primary && !hasLiquidGlass ? '#fff' : primary ? t.accent : t.text} />
      </Glass>
    </Pressable>
  );
}

export function IconBubble({ name, tone = 'accent', size = 36 }: { name: IconName; tone?: 'accent' | 'green' | 'amber' | 'red' | 'neutral'; size?: number }) {
  const t = useTheme();
  const c = { accent: [t.accentSoft, t.accent], green: [t.greenSoft, t.green], amber: [t.amberSoft, t.amber], red: [t.redSoft, t.red], neutral: [t.surface2, t.sub] }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: c[0], alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={c[1]} />
    </View>
  );
}

export function Row({ icon, tone, title, subtitle, right, onPress, last, href }: {
  icon?: IconName; tone?: 'accent' | 'green' | 'amber' | 'red' | 'neutral'; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean; href?: string;
}) {
  const t = useTheme();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
      {icon ? <IconBubble name={icon} tone={tone} size={34} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (href ? <Ionicons name="open-outline" size={16} color={t.faint} /> : onPress ? <Ionicons name="chevron-forward" size={17} color={t.faint} /> : null)}
    </View>
  );
  if (href) return <ExtLink href={href}>{inner}</ExtLink>;
  if (!onPress) return inner;
  return <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{inner}</Pressable>;
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { label: string; value: V }[]; value: V; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { tap(); onChange(o.value); }} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: on ? t.surface : 'transparent', alignItems: 'center' }}>
            <Text style={{ color: on ? t.text : t.sub, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange }: { options: { label: string; value: V }[]; value: V; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { tap(); onChange(o.value); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: on ? t.text : t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }}>
            <Text style={{ color: on ? t.bg : t.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, href }: { label: string; onPress?: () => void; kind?: 'primary' | 'secondary'; icon?: IconName; disabled?: boolean; href?: string }) {
  const t = useTheme();
  const primary = kind === 'primary';
  if (href) {
    return (
      <ExtLink href={href}>
        <View style={{ backgroundColor: primary ? t.text : t.surface2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {icon ? <Ionicons name={icon} size={17} color={primary ? t.bg : t.text} /> : null}
          <Text style={{ color: primary ? t.bg : t.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
        </View>
      </ExtLink>
    );
  }
  return (
    <Pressable disabled={disabled} onPress={() => { tap(); onPress?.(); }} style={({ pressed }) => ({
      backgroundColor: primary ? t.text : t.surface2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
      opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
    })}>
      {icon ? <Ionicons name={icon} size={17} color={primary ? t.bg : t.text} /> : null}
      <Text style={{ color: primary ? t.bg : t.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T v="label" style={{ marginBottom: 6 }}>{label}</T> : null}
      <TextInput placeholderTextColor={t.faint} {...rest} style={[{ backgroundColor: t.surface2, color: t.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 }, style]} />
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 12 }} />;
}

export function Note({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'amber' | 'red' | 'accent' }) {
  const t = useTheme();
  const bg = { neutral: t.surface2, amber: t.amberSoft, red: t.redSoft, accent: t.accentSoft }[tone];
  const fg = { neutral: t.sub, amber: t.amber, red: t.red, accent: t.accent }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 8 }}>
      <Ionicons name={tone === 'red' || tone === 'amber' ? 'alert-circle' : 'information-circle'} size={17} color={fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, color: tone === 'neutral' ? t.sub : t.text, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// Date input: type digits, dashes are added automatically (YYYY-MM-DD)
// Date picker everywhere: iOS inline calendar, Android system dialog, typed YYYY-MM-DD on the web preview.
export function DateField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (v: string) => void; hint?: string }) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const v = value ?? '';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00').getTime());
  const asDate = valid ? new Date(v + 'T12:00:00') : new Date();
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shown = valid ? asDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date';

  // Native picker if this build has it (older installed builds may not); otherwise typed dates.
  let Picker: any = null;
  if (Platform.OS !== 'web') { try { Picker = require('@react-native-community/datetimepicker'); if (!Picker?.default) Picker = null; } catch { Picker = null; } }
  if (!Picker) {
    const fmtRaw = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 8); return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
    return (
      <View style={{ marginBottom: 12 }}>
        <T v="label" style={{ marginBottom: 6 }}>{label}</T>
        <TextInput value={v} onChangeText={(x) => onChange(fmtRaw(x))} placeholder="YYYY-MM-DD" placeholderTextColor={t.faint} maxLength={10}
          style={{ backgroundColor: t.surface2, color: v.length === 10 && !valid ? t.red : t.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontVariant: ['tabular-nums'] }} />
        {hint ? <T v="small" style={{ marginTop: 5 }}>{hint}</T> : null}
      </View>
    );
  }
  const press = () => {
    tap();
    if (Platform.OS === 'android') {
      Picker.DateTimePickerAndroid.open({ value: asDate, mode: 'date', onChange: (e: any, d?: Date) => { if (e.type === 'set' && d) onChange(toIso(d)); } });
    } else setOpen(!open);
  };
  return (
    <View style={{ marginBottom: 12 }}>
      <T v="label" style={{ marginBottom: 6 }}>{label}</T>
      <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={`${label}: ${shown}`}
        style={{ backgroundColor: t.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="calendar-outline" size={18} color={valid ? t.accent : t.faint} />
        <Text style={{ flex: 1, marginLeft: 10, fontSize: 16, color: valid ? t.text : t.faint, fontVariant: ['tabular-nums'] }}>{shown}</Text>
        {valid ? (
          <Pressable onPress={() => { tap(); onChange(''); setOpen(false); }} hitSlop={10} accessibilityLabel="Clear date">
            <Ionicons name="close-circle" size={18} color={t.faint} />
          </Pressable>
        ) : <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.faint} />}
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={{ backgroundColor: t.surface2, borderRadius: 14, marginTop: 8, paddingBottom: 6, overflow: 'hidden' }}>
          <Picker.default value={asDate} mode="date" display="inline" themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.accent}
            onChange={(_e: any, d?: Date) => { if (d) onChange(toIso(d)); }} />
          <Pressable onPress={() => { if (!valid) onChange(toIso(asDate)); setOpen(false); }} style={{ alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>Done</Text>
          </Pressable>
        </View>
      ) : null}
      {hint ? <T v="small" style={{ marginTop: 5 }}>{hint}</T> : null}
    </View>
  );
}
