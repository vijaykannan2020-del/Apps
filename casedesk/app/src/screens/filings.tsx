// "Your next filing" (person page + Tools → Processing times): earliest date to file, typical USCIS
// processing time, premium option, and the decision window if filed on the earliest date.
import React from 'react';
import { View } from 'react-native';
import type { Person } from '../core/model';
import { nextFilings, decisionWindow, planDate, type Filing } from '../core/filings';
import { fmt, today } from '../core/dates';
import { PT_AS_OF, fmtMonths } from '../content/processing';
import { useFamily } from '../data/FamilyProvider';
import { monthsFor, useProcessing } from '../data/processing';
import { Card, LegalLine, SectionHeader, T, font } from '../ui';
import { HelpButton } from './help';

const monthYear = (d: string) => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return fmt(d); } };

export function FilingCard({ x, name }: { x: Filing; name?: string }) {
  const pt = useProcessing();
  const now = today();
  const months = x.pt ? monthsFor(pt.data, x.pt.form, x.pt.category) : undefined;
  if (x.kind === 'report') {
    return (
      <Card style={{ marginTop: 10 }}>
        <T tone="text2" style={font.foot}>{`${name ? `${name} · ` : ''}STEM OPT`}</T>
        <T style={[font.headline, { marginTop: 2 }]}>{x.title}</T>
        <View style={{ marginTop: 10, gap: 6 }}>{(x.dates ?? []).map((d) => <Line key={d.label} k={d.label} v={fmt(d.date)} strong={d.date === x.earliest} tone={d.date < now ? 'dim' : undefined} />)}</View>
        <T tone="text2" style={[font.foot, { marginTop: 8 }]}>{x.why}</T>
        <T tone="text2" style={[font.caption, { marginTop: 8 }]}>ice.gov/sevis · studyinthestates.dhs.gov · checked Nov 18, 2026</T>
      </Card>
    );
  }
  if (x.filed) {
    const w = months && x.filed.received ? decisionWindow(x.filed.received, months) : undefined;
    return (
      <Card style={{ marginTop: 10 }}>
        <T tone="text2" style={font.foot}>{`${name ? `${name} · ` : ''}${x.form}`}</T>
        <T style={[font.headline, { marginTop: 2 }]}>{`${x.title} · filed`}</T>
        <View style={{ marginTop: 10, gap: 6 }}>
          <Line k="Filed" v={x.filed.received ? fmt(x.filed.received) : 'Yes'} strong />
          {x.filed.receipt ? <Line k="Receipt" v={x.filed.receipt} /> : null}
          <Line k="Status" v="Pending" />
          <Line k="Typical processing" v={months ? `${fmtMonths(months)} (8 in 10 cases)` : 'See the USCIS page'} />
        </View>
        {w ? <T style={[font.sub, { marginTop: 10 }]}>{`A decision is expected around ${monthYear(w.from)} – ${monthYear(w.to)}.`}</T> : null}
        <T tone="text2" style={[font.foot, { marginTop: 6 }]}>Nothing more to file now. Check the case in Cases.</T>
        <T tone="text2" style={[font.caption, { marginTop: 8 }]}>{`egov.uscis.gov/processing-times · ${pt.live ? 'live' : `checked ${PT_AS_OF}`}`}</T>
      </Card>
    );
  }
  const when = planDate(x, now);
  const late = x.deadline && x.deadline < now;
  const w = months ? decisionWindow(when, months) : undefined;
  return (
    <Card style={{ marginTop: 10 }}>
      <T tone="text2" style={font.foot}>{`${name ? `${name} · ` : ''}${x.form}`}</T>
      <T style={[font.headline, { marginTop: 2 }]}>{x.title}</T>
      <View style={{ marginTop: 10, gap: 6 }}>
        <Line k="Earliest filing date" v={x.earliest <= now ? `${fmt(x.earliest)} — you can file now` : fmt(x.earliest)} strong />
        {x.deadline ? <Line k={late ? 'Deadline passed' : 'File before'} v={fmt(x.deadline)} tone={late ? 'red' : undefined} /> : null}
        <Line k="Typical processing" v={months ? `${fmtMonths(months)} (8 in 10 cases)` : 'See the USCIS page'} />
        {x.premium ? <Line k="Premium processing" v={x.premium} /> : <Line k="Premium processing" v="Not available" />}
      </View>
      {w && !late ? <T style={[font.sub, { marginTop: 10 }]}>{`If filed on ${fmt(when)}, a decision is expected around ${monthYear(w.from)} – ${monthYear(w.to)}.`}</T> : null}
      <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{x.why}</T>
      <T tone="text2" style={[font.caption, { marginTop: 8 }]}>{`egov.uscis.gov/processing-times · ${pt.live ? 'live' : `checked ${PT_AS_OF}`}`}</T>
    </Card>
  );
}
function Line({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: 'red' | 'dim' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <T tone="text2" style={font.sub}>{k}</T>
      <T tone={tone === 'red' ? 'red' : tone === 'dim' ? 'text2' : 'text'} style={[font.sub, { fontWeight: strong ? '600' : '500', flexShrink: 1, textAlign: 'right' }]}>{v}</T>
    </View>
  );
}

/** Person page: their next filing(s). Nothing for people with nothing to file. */
export function NextFiling({ p }: { p: Person }) {
  const f = useFamily();
  const list = nextFilings(p, f.records[p.id], f.results[p.id]?.facts, manualCases(f, p.id));
  if (!list.length) return null;
  return (
    <>
      <SectionHeader right={<HelpButton topic="processing" />}>Next filing</SectionHeader>
      {list.slice(0, 2).map((x) => <FilingCard key={x.form + x.title} x={x} />)}
      <LegalLine />
    </>
  );
}

/** Tools → Processing times: the family's next filings first. */
export function FamilyFilings() {
  const f = useFamily();
  const all = f.people.flatMap((p) => nextFilings(p, f.records[p.id], f.results[p.id]?.facts, manualCases(f, p.id)).map((x) => ({ x, name: p.name })));
  if (!all.length) return null;
  return (
    <>
      <SectionHeader>For your family</SectionHeader>
      {all.map(({ x, name }) => <FilingCard key={x.personId + x.form + x.title} x={x} name={name} />)}
      <LegalLine />
    </>
  );
}
/** Cases added in Cases (or with a status pasted from USCIS) count as filed too. */
const manualCases = (f: ReturnType<typeof useFamily>, pid: string) => f.caseList.filter((c) => c.ownerId === pid).map((c) => ({ form: c.form, status: c.status, received: c.filed, receipt: c.receipt }));
export const familyForms = (f: ReturnType<typeof useFamily>) => f.people.flatMap((p) => nextFilings(p, f.records[p.id], f.results[p.id]?.facts, manualCases(f, p.id))).filter((x) => x.pt).map((x) => x.pt!);
