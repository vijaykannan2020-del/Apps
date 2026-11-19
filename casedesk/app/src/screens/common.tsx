// Shared screen helpers: navigation, person labels, attention rows and their actions.
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Person } from '../core/model';
import { isNonimmigrant, STATUS_LABEL } from '../core/model';
import type { PersonRecord } from '../core/record';
import type { PersonResult } from '../core/rules/engine';
import type { Finding } from '../core/rules/types';
import { statusLine } from '../core/rules/status';
import { fmt } from '../core/dates';
import { startFlow, type Flow } from '../data/flow';
import type { FamilyState } from '../data/FamilyProvider';
import { Pressable } from 'react-native';
import { Button, Icon, LegalLine, MIN_TOUCH, Row, T, font, severityTone, tint, TONE_WORD, useTheme } from '../ui';
import { DISCLAIMER, type Source } from '../content/legal';
import { openUrl } from '../native/device';

/** Typed-route-free navigation helpers. */
export const go = (path: string, params?: Record<string, string>) => router.push((params ? { pathname: path, params } : path) as never);
export const replace = (path: string) => router.replace(path as never);
export const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never));
export const home = () => { try { if (router.canDismiss()) router.dismissAll(); } catch {} router.replace('/(tabs)' as never); };

export function statusLabel(p: Person, rec?: PersonRecord, res?: PersonResult): string {
  if (rec?.visa) {
    const l = res?.facts.visaLabel ?? rec.visa;
    return l === 'Green card pending' ? 'Green card applicant' : l;
  }
  if (p.status === 'L-2' && p.relation === 'spouse') return 'L-2S';
  return p.status ? STATUS_LABEL[p.status] : 'Not sure yet';
}
export const relationLabel = (p: Person) => ({ self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', other: 'Family' })[p.relation];

/** "In US" / "In India" / "Location?" */
export function locationChip(p: Person, rec?: PersonRecord): string {
  if (!rec) return 'Location?';
  if (!isNonimmigrant(rec.visa) && rec.visa) return 'In US';
  if (rec.location === 'Outside') return `In ${rec.country ?? 'India'}`;
  if (!rec.locationKnown && !rec.i94) return 'Location?';
  return 'In US';
}

export function untilText(p: Person, rec?: PersonRecord, res?: PersonResult): string {
  if (!rec || (!rec.docTypes.length && rec.visa !== 'US citizen')) return 'Add documents to see status';
  if (isNonimmigrant(rec.visa) && !rec.locationKnown && !rec.i94) return 'Location unknown · no I-94';
  return statusLine(rec, res?.facts);
}

export const needsLocation = (rec?: PersonRecord) => !!rec && isNonimmigrant(rec.visa) && !rec.locationKnown && !rec.i94 && rec.visa !== 'Green card pending';

/** What a finding's button does (the prototype's CTAs). */
export type Cta = { label: string; run: () => void };
export function ctaFor(f: Finding, p: Person, handlers: { askWhere: () => void; fixClass: () => void; renew: (k: string) => void }): Cta | undefined {
  switch (f.id) {
    case 'i94-missing': return { label: 'Add I-94', run: () => handlers.renew('i94') };
    case 'pp-soon': case 'pp-exp': case 'pp-before': return { label: 'Add new passport', run: () => handlers.renew('passport') };
    case 'visa-need': case 'visa-exp-out': return { label: 'Add visa', run: () => handlers.renew('visa') };
    case 'class-mismatch': case 'l2-plain': return { label: 'How to fix it', run: handlers.fixClass };
    case 'visa-unset': return { label: 'Add a document', run: () => handlers.renew('passport') };
    case 'grace': case 'dep-grace': return { label: 'Open layoff plan', run: () => go(`/layoff/${p.id}`) };
    case 'stamping': return { label: 'Stamping checklist', run: () => go('/tools/travel', { pid: p.id }) };
    case 'i751-late': case 'i751-now': return { label: 'Add I-751 receipt', run: () => handlers.renew('receipt') };
    default: return f.id.startsWith('rfe-') ? { label: 'Open cases', run: () => router.navigate('/(tabs)/cases' as never) } : undefined;
  }
}

/** Attention row: dot + word, title, "Name · detail", optional action, legal line on Act now. */
export function AttentionRow({ f, name, onPress, cta }: { f: Finding; name?: string; onPress?: () => void; cta?: Cta }) {
  const tone = severityTone(f.severity);
  return (
    <Row dot={tone} alignTop onPress={onPress} chevron={!!onPress} title={f.title} titleStyle={{ ...font.callout, fontWeight: '500' }}
      label={`${TONE_WORD[tone]}: ${f.title}`}
      subtitle={<T tone="text2" style={[font.foot, { marginTop: 2 }]}>{name ? `${name} · ` : ''}{f.detail}</T>}>
      {cta && !onPress ? <View style={{ marginTop: 10 }}><Button size="sm" kind="tint" title={cta.label} onPress={cta.run} /></View> : null}
      {f.severity === 'act' ? <LegalLine /> : null}
      {f.source && !name ? <T tone="text2" style={[font.caption, { marginTop: 4 }]}>{f.source.label} · checked {fmt(f.checked ?? '')}</T> : null}
    </Row>
  );
}

/** Start a document flow and open its first step. */
export function runFlow(f: Omit<Flow, 'up' | 'where' | 'misDone'>, fam: FamilyState, toast?: (m: string) => void) {
  const first = startFlow(f, fam);
  if (!first) { toast?.('Everything is added'); return; }
  go('/flow/step', { pid: first.pid, k: first.k });
}

/** "as of" line for data screens: live vs built-in copy, the date of the data, when it was fetched. */
export function asOfText(o: { live?: boolean; asOf?: string; fetchedAt?: string }): string {
  const fetched = o.fetchedAt ? (() => { try { const d = new Date(o.fetchedAt); return `${fmt(o.fetchedAt.slice(0, 10))} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; } catch { return fmt(o.fetchedAt.slice(0, 10)); } })() : undefined;
  if (o.live) return ['Live', o.asOf ? `data as of ${o.asOf}` : undefined, fetched ? `updated ${fetched}` : undefined].filter(Boolean).join(' · ');
  return ['Built-in copy', o.asOf ? `data as of ${o.asOf}` : undefined].filter(Boolean).join(' · ');
}

/** Footer for every government-data screen: as-of line, the official source link, the disclaimer. */
export function DataFooter({ live, asOf, fetchedAt, source, note }: { live?: boolean; asOf?: string; fetchedAt?: string; source?: Source; note?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 14, gap: 4 }}>
      {asOf || live !== undefined ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: live ? tint(t.green, t.pillAlpha) : t.fill, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><T tone={live ? 'green' : 'text2'} style={[font.caption, { fontWeight: '600' }]}>{live ? 'Live' : 'Built-in copy'}</T></View>
          <T tone="text2" style={[font.caption, { flexShrink: 1 }]}>{asOfText({ live, asOf, fetchedAt }).replace(/^(Live|Built-in copy)( · )?/, '')}</T>
        </View>
      ) : null}
      {note ? <T tone="text2" style={font.caption}>{note}</T> : null}
      {source ? (
        <Pressable onPress={() => openUrl(source.url)} accessibilityRole="link" accessibilityLabel={`Official source: ${source.label}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: MIN_TOUCH }}>
          <Icon name="globe" size={14} color={t.inkAccent} /><T tone="accent" style={[font.caption, { fontWeight: '500' }]}>{`Official source: ${source.label}`}</T>
        </Pressable>
      ) : null}
      <T tone="text2" style={font.caption}>{DISCLAIMER}</T>
    </View>
  );
}
