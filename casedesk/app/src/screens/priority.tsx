// Binds the pure priority functions (core/priority.ts) to the family's data, and draws the shared
// Status view (ring of documents + time-left bars) used on Family, the person page and wide Home.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { today } from '../core/dates';
import { nextFilings } from '../core/filings';
import { FIELDS, docTitle } from '../core/docs';
import { barFill, homeHero, homeTiles, shortSpan, stateTone, statusSummary, type Meaning, type PriorityInput, type Target } from '../core/priority';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { backupDue } from '../data/backupIO';
import { Bars, Card, Ring, SectionHeader, T, font, useLayout, useTheme, type PastelTone, type Theme } from '../ui';
import { go, runFlow } from './common';

const manual = (f: FamilyState, pid: string) => f.caseList.filter((c) => c.ownerId === pid).map((c) => ({ form: c.form, status: c.status, received: c.filed, receipt: c.receipt }));
export const familyFilings = (f: FamilyState) => f.people.flatMap((p) => nextFilings(p, f.records[p.id], f.results[p.id]?.facts, manual(f, p.id)));

/** The date a document runs to (the same field the document rows show). */
export function docUntil(d: { type: keyof typeof FIELDS; fields: any }): string | undefined {
  if (d.type === 'travel-history' || d.type === 'receipt' || d.type === 'notice') return undefined;
  if (d.type === 'i94' && d.fields.durationOfStatus) return undefined;
  const v = d.fields.validTo ?? (d.type === 'i20' ? d.fields.programEnd : undefined);
  return typeof v === 'string' ? v : undefined;
}

/** Saved, current documents with their end date — one person's, or the whole family's. */
export function useDocTimes(pid?: string) {
  const f = useFamily();
  return useMemo(() => {
    const docs = f.docs.filter((d) => !f.superseded.has(d.id) && (!pid || d.ownerId === pid));
    const missing = f.people.filter((p) => !pid || p.id === pid).reduce((n, p) => n + (f.missing[p.id]?.length ?? 0), 0);
    const short = (d: (typeof docs)[number]) => docTitle(d).replace(/ ?\(.*\)$/, '').replace(/^Form /, '').replace(/ (record|approval|card|stamp)$/i, '');
    return statusSummary(docs.map((d) => ({ id: d.id, ownerId: d.ownerId, label: short(d), until: docUntil(d as never), soft: d.type === 'visa' && f.records[d.ownerId]?.location !== 'Outside' })), missing, today());
  }, [f.docs, f.superseded, f.missing, f.people, f.records, pid]);
}

export function usePriority() {
  const f = useFamily();
  const sum = useDocTimes();
  return useMemo(() => {
    const input: PriorityInput = {
      today: today(), people: f.people.map((p) => ({ id: p.id, name: p.name })), results: f.results,
      starts: Object.fromEntries(f.people.map((p) => [p.id, f.records[p.id]?.i94?.issuedOn ?? f.records[p.id]?.statusStart])),
      filings: familyFilings(f), cases: f.caseList,
      docs: { saved: f.docs.filter((d) => !f.superseded.has(d.id)).length, missing: sum.missing, expiring: sum.expiring + sum.expired },
      backup: { due: backupDue(f.settings, f.docs.length), lastAt: f.settings.lastBackupAt },
    };
    const hero = homeHero(input);
    return { input, hero, tiles: homeTiles(input, hero) };
  }, [f, sum]);
}

/** Where a hero / tile leads. */
export function useOpenTarget() {
  const f = useFamily();
  return (x: Target) => {
    if (x.to === 'person' && x.id) go(`/person/${x.id}`);
    else if (x.to === 'case' && x.id) go(`/case/${encodeURIComponent(x.id)}`);
    else if (x.to === 'cases') router.navigate('/(tabs)/cases' as never);
    else if (x.to === 'backup') go('/settings', { backup: '1' });
    else if (x.to === 'docs') {
      const pids = f.people.filter((p) => (f.missing[p.id]?.length ?? 0) > 0).map((p) => p.id);
      if (pids.length) runFlow({ mode: 'missing', pids, missingOnly: true }, f); else router.navigate('/(tabs)/family' as never);
    } else router.navigate('/(tabs)/family' as never);
  };
}

/** Meaning → the fill colour for charts in this theme (deeper on white so segments stay visible). */
export const meaningFill = (t: Theme, m: Meaning) => (m === 'sage' ? t.green : m === 'butter' ? t.amber : m === 'blush' ? t.red : t.accent);

/** Ring of documents (valid / expiring / expired / missing) and bars of time left, most urgent first. */
export function StatusView({ pid, title = 'Documents', card }: { pid?: string; title?: string; card?: boolean }) {
  const t = useTheme();
  const L = useLayout();
  const s = useDocTimes(pid);
  const total = s.valid + s.expiring + s.expired + s.missing;
  if (!total) return null;
  const parts = [
    { key: 'valid', label: 'Valid', value: s.valid, color: meaningFill(t, 'sage') },
    { key: 'expiring', label: 'Expiring', value: s.expiring, color: meaningFill(t, 'butter') },
    ...(s.expired ? [{ key: 'expired', label: 'Expired', value: s.expired, color: meaningFill(t, 'blush') }] : []),
    { key: 'missing', label: 'Missing', value: s.missing, color: t.dark ? '#5A5C61' : '#A9ACB2' },
  ];
  const max = L.width < 380 || L.fontScale > 1.3 ? 4 : 5;
  const bars = s.bars.slice(0, max);
  const body = (
    <>
      <Ring parts={parts} caption={s.missing ? 'Documents added' : 'Documents valid'} center={s.missing ? `${total - s.missing} of ${total}` : `${s.valid} of ${total}`} size={card ? 190 : 220} />
      {bars.length ? (
        <>
          <T a11y="header" style={[font.headline, { marginTop: 22, marginBottom: 12 }]}>Time left by document</T>
          <Bars height={card ? 110 : 130} items={bars.map((b) => ({
            key: b.id, label: b.label, value: shortSpan(b.days), fill: barFill(b.days), color: meaningFill(t, stateTone(b.state)),
            a11y: `${b.label}: ${b.days < 0 ? 'ended' : `${b.days} days left`}`, onPress: () => go(`/document/${b.id}`),
          }))} />
        </>
      ) : null}
    </>
  );
  return (
    <View>
      <SectionHeader>{title}</SectionHeader>
      {card ? <Card>{body}</Card> : body}
    </View>
  );
}

/** Meaning → block. Attention and urgent are fixed status blocks; "good" is the fixed green on a
 *  tile and the brand block on the hero (all good = the theme's own colour); sky = brand. */
export const meaningBlock = (m: Meaning, hero?: boolean): PastelTone => (m === 'butter' ? 'warn' : m === 'blush' ? 'urgent' : m === 'sage' ? (hero ? 'sage' : 'good') : 'sky');
