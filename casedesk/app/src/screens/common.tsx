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
import { reasonLine, reviewReasons } from '../core/review';
import { startFlow, type Flow } from '../data/flow';
import type { FamilyState } from '../data/FamilyProvider';
import { Pressable } from 'react-native';
import { TourTarget, Button, Icon, LegalLine, MIN_TOUCH, Row, T, font, severityTone, TONE_WORD, useSheet, useTheme } from '../ui';
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
    default: return f.id.startsWith('rfe-') ? { label: 'Open cases', run: () => router.navigate('/cases' as never) } : undefined;
  }
}

/** Attention row: a pastel disc in the colour of its meaning + the word, title, "Name · detail", optional action, legal line on Act now. */
export function AttentionRow({ f, name, onPress, cta }: { f: Finding; name?: string; onPress?: () => void; cta?: Cta }) {
  const tone = severityTone(f.severity);
  return (
    <Row icon={tone === 'red' || tone === 'amber' ? 'alert' : 'info'} iconTone={tone === 'grey' ? 'blue' : tone} alignTop onPress={onPress} chevron={!!onPress} title={f.title}
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

/** The one compact line: "Source · as of date · Not legal advice". */
export function footerLine(o: { live?: boolean; asOf?: string; source?: Source }): string {
  const src = o.source ? o.source.label.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\s/—–(]/)[0] : undefined;
  const as = o.asOf ? `as of ${o.asOf}` : o.live ? 'live' : o.live === false ? 'built-in copy' : undefined;
  return [src, as, 'Not legal advice'].filter(Boolean).join(' · ');
}

/**
 * Footer for every government-data screen — ONE compact line ("Source · as of date · Not legal
 * advice"). Tap it for the full text: live / built-in copy, when it was fetched, the official source
 * link and the disclaimer. (Owner: calmer screens; the detail stays one tap away.)
 */
export function DataFooter({ live, asOf, fetchedAt, source, note }: { live?: boolean; asOf?: string; fetchedAt?: string; source?: Source; note?: string }) {
  const t = useTheme();
  const sheet = useSheet();
  const line = footerLine({ live, asOf, source });
  const full = (
    <View style={{ gap: 10, marginTop: 10 }}>
      {asOf || live !== undefined ? <T style={font.sub}>{asOfText({ live, asOf, fetchedAt })}</T> : null}
      {note ? <T tone="text2" style={font.sub}>{note}</T> : null}
      {source ? <Button kind="tint" icon="globe" title={`Official source: ${source.label}`} onPress={() => openUrl(source.url)} /> : null}
      <T tone="text2" style={font.foot}>{DISCLAIMER}</T>
    </View>
  );
  return (
    <TourTarget id="source" style={{ marginTop: 16 }}>
      <Pressable onPress={() => sheet.open('Source and disclaimer', full)} accessibilityRole="button" accessibilityLabel={`${line}. Tap for the source and full disclaimer`}
        style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH, paddingHorizontal: 8 }}>
        <Icon name="info" size={13} color={t.text2} />
        <T tone="text2" numberOfLines={1} style={[font.caption, { flexShrink: 1 }]}>{line}</T>
      </Pressable>
    </TourTarget>
  );
}

/** Screens without a data source: the same compact line, opening the disclaimer. */
export function LegalFooter({ asOf }: { asOf?: string }) {
  const t = useTheme();
  const sheet = useSheet();
  const line = [asOf ? `Rules checked ${asOf}` : undefined, 'Not legal advice'].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => sheet.open('Not legal advice', <T tone="text2" style={[font.sub, { marginTop: 10 }]}>{DISCLAIMER}</T>)} accessibilityRole="button" accessibilityLabel={`${line}. Tap for the full disclaimer`}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH, marginTop: 14 }}>
      <Icon name="info" size={13} color={t.text2} />
      <T tone="text2" numberOfLines={1} style={[font.caption, { flexShrink: 1 }]}>{line}</T>
    </Pressable>
  );
}

/** v2.9: the Review / Act now chip always says why. Tapping it opens this short sheet: each reason and what to do. */
export function ReviewSheet({ findings, until, name }: { findings: Finding[]; until?: string; name?: string }) {
  const t = useTheme();
  const list = reviewReasons(findings, until);
  if (!list.length) return <T tone="text2" style={[font.sub, { marginTop: 10 }]}>Nothing to review right now.</T>;
  return (
    <View style={{ gap: 14, marginTop: 12 }}>
      {name ? <T tone="text2" style={font.sub}>{name}</T> : null}
      {list.map((r) => {
        const tone = severityTone(r.finding.severity);
        return (
          <View key={r.finding.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone === 'red' ? t.red : t.amber }} />
              <T style={[font.body, { fontWeight: '600', flex: 1 }]}>{r.finding.title}</T>
            </View>
            <T tone="text2" style={font.sub}>{r.finding.detail}</T>
            <T style={[font.sub, { fontWeight: '600' }]}>{`What to do: ${r.todo}`}</T>
          </View>
        );
      })}
      <LegalLine />
    </View>
  );
}

/** The severity chip, tappable: opens the ReviewSheet. */
export function ReviewChip({ findings, until, worst, name }: { findings: Finding[]; until?: string; worst: PersonResult['worst']; name: string }) {
  const sheet = useSheet();
  const t = useTheme();
  if (worst === 'good' || worst === 'info') return null;
  const tone = worst === 'act' ? 'red' : 'amber';
  const word = TONE_WORD[tone];
  return (
    <Pressable onPress={() => sheet.open(`Why ${word.toLowerCase()}`, <ReviewSheet findings={findings} until={until} />)} accessibilityRole="button" accessibilityLabel={`${word}: ${reasonLine(findings, until) ?? ''}. ${name}. Tap for what to do`} hitSlop={8}
      style={({ pressed }) => ({ minHeight: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: tone === 'red' ? t.pastel.urgent : t.pastel.butter, opacity: pressed ? 0.8 : 1, flexDirection: 'row', alignItems: 'center', gap: 4 })}>
      <T style={[font.foot, { fontWeight: '700', color: t.ink }]}>{word}</T>
      <Icon name="chevR" size={12} color={t.ink} />
    </Pressable>
  );
}
