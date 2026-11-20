// "What to expect" card on each case: typical decision window with a small timeline chart, official USCIS rates,
// premium clock, then anonymous "Cases like mine" (expectShare.tsx). Estimate only — says so, with dates and sources.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Line, Circle, Text as SvgText } from 'react-native-svg';
import type { CaseView } from '../core/cases';
import { CLASS_CHOICES, classLabel, decidedOf, describe, fmtDate, officeOf, outcomeOf, receivedOf, type ChartModel, type ExpectInput } from '../core/expect';
import { useExpect, usePrefs, syncShare } from '../data/expect';
import { useFamily } from '../data/FamilyProvider';
import { Card, ChipToggle, Chips, Hint, SectionHeader, T, font, useTheme, tint, TourButton, TourScope, TourTarget, useTour } from '../ui';
import { CasesLikeMine } from './expectShare';
import { go } from './common';

const PREMIUM_FORMS = /^(I-129|I-140|I-539|I-765)$/;

export function ExpectCard({ c }: { c: CaseView }) {
  const f = useFamily();
  const t = useTheme();
  const { prefs, update } = usePrefs(c.receipt);
  const tour = useTour('case-expect');
  const recCls = f.records[c.ownerId]?.cases.find((x) => x.receipt && x.receipt === c.receipt)?.cls;
  const cls = prefs?.cls ?? recCls;
  const office = officeOf(c.receipt);
  const received = receivedOf(c);
  const q: ExpectInput | null = c.form && !c.consular ? { form: c.form, office, received, premium: !!prefs?.premium, cls } : null;
  const s = useExpect(q);
  // Keep a shared entry current as the case moves (status or class change).
  useEffect(() => { if (prefs?.on) syncShare(c, prefs).catch(() => {}); }, [c.status, received, prefs?.on, prefs?.cls, prefs?.premium]);
  if (!q || !s) return null;
  const outcome = outcomeOf(c);
  const v = describe(s.result, { live: s.live, outcome, decided: decidedOf(c), asOf: s.cachedAt && !s.live ? `saved ${fmtDate(s.cachedAt.slice(0, 10))}` : undefined });
  const choices = CLASS_CHOICES[q.form] ?? [];
  return (
    <TourScope tour={tour}>
      <SectionHeader right={<TourButton label="Tips for What to expect" />}>What to expect</SectionHeader>
      <Card>
        <TourTarget id="window">
          <T style={[font.headline, { lineHeight: 22 }]}>{v.headline}</T>
          {v.sub ? <T tone="text2" style={[font.foot, { marginTop: 6 }]}>{v.sub}</T> : null}
          {v.chart ? <ExpectChart m={v.chart} /> : <Hint>Add the date USCIS received the case to see your own window.</Hint>}
          {v.mine ? <T style={[font.sub, { marginTop: 4 }]}>{v.mine}</T> : null}
        </TourTarget>
        {v.tiles.length ? (
          <TourTarget id="numbers" style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 12 }}>
            {v.tiles.map((x, i) => (
              <View key={i} style={{ width: '50%', paddingRight: 8 }} accessible accessibilityLabel={`${x.value} ${x.label}`}>
                <T style={{ fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], color: x.tone === 'green' ? t.inkGreen : x.tone === 'amber' ? t.inkAmber : t.text }}>{x.value}</T>
                <T tone="text2" style={font.caption}>{x.label}</T>
              </View>
            ))}
          </TourTarget>
        ) : null}
        {PREMIUM_FORMS.test(q.form) || choices.length ? (
          <TourTarget id="options">
            <Chips>
              {PREMIUM_FORMS.test(q.form) ? <ChipToggle role="checkbox" text="Premium" on={!!prefs?.premium} onPress={() => update({ premium: !prefs?.premium })} /> : null}
              {choices.map((k) => <ChipToggle key={k} text={classLabel(k)} on={cls === k || (!!cls && classLabel(cls) === classLabel(k))} onPress={() => update({ cls: cls === k ? undefined : k })} />)}
            </Chips>
          </TourTarget>
        ) : null}
        {v.premiumLine ? <Hint>{v.premiumLine}</Hint> : null}
        {v.rfeLine ? <Hint>{v.rfeLine}</Hint> : null}
        <TourTarget id="office"><Hint>{v.officeLine}</Hint></TourTarget>
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: t.sep }}>
          <T tone="text2" style={font.caption}>{`${s.live ? 'Live' : s.cachedAt ? 'Offline — last update' : `Offline — built-in summary, checked ${v.asOf}`}${s.live || s.cachedAt ? ` · ${v.asOf}` : ''}`}</T>
          {v.sources.map((x, i) => <T key={i} tone="text3" style={[font.caption, { marginTop: 2 }]}>{x}</T>)}
          <T tone="text2" style={[font.caption, { marginTop: 6 }]}>{v.disclaimer}</T>
        </View>
      </Card>
      <HowLink />
      <CasesLikeMine c={c} view={v} prefs={prefs} cls={cls} />
    </TourScope>
  );
}
function HowLink() {
  return <Chips style={{ marginTop: 8 }}><ChipToggle role="button" text="How expected timing works" onPress={() => go('/help/expect')} /></Chips>;
}

/** Horizontal timeline in days from receipt: typical window (blue), app users' middle half (green), premium deadline, today. */
export function ExpectChart({ m }: { m: ChartModel }) {
  const t = useTheme();
  // sized by the space the chart really has (the card), never the window
  const [box, setBox] = React.useState(0);
  const W = Math.max(120, Math.min(box || 280, 520)), H = 74, pad = 8;
  const x = (d: number) => pad + (Math.min(d, m.maxDays) / m.maxDays) * (W - pad * 2);
  const label = [m.window ? `Typical window ${Math.round(m.window[0] / 30.44)} to ${Math.round(m.window[1] / 30.44)} months` : '', m.community ? `app users ${Math.round(m.community[0] / 30.44)} to ${Math.round(m.community[1] / 30.44)} months` : '', m.todayDays != null ? `today ${Math.round(m.todayDays / 30.44)} months` : ''].filter(Boolean).join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label || 'Timeline'} style={{ marginTop: 12, marginBottom: 6 }} onLayout={(e) => setBox(Math.floor(e.nativeEvent.layout.width))}>
      <Svg width={W} height={H}>
        <Line x1={x(0)} x2={x(m.maxDays)} y1={30} y2={30} stroke={t.sep} strokeWidth={2} strokeLinecap="round" />
        {m.window ? <Rect x={x(m.window[0])} y={22} width={Math.max(4, x(m.window[1]) - x(m.window[0]))} height={16} rx={8} fill={tint(t.accent, 0.5)} /> : null}
        {m.community ? <Rect x={x(m.community[0])} y={42} width={Math.max(4, x(m.community[1]) - x(m.community[0]))} height={6} rx={3} fill={t.green} /> : null}
        {m.premiumDays != null ? <Line x1={x(m.premiumDays)} x2={x(m.premiumDays)} y1={16} y2={44} stroke={t.amber} strokeWidth={2} /> : null}
        {m.decidedDays != null ? <Circle cx={x(m.decidedDays)} cy={30} r={6} fill={t.green} /> : null}
        {m.todayDays != null ? <Circle cx={x(m.todayDays)} cy={30} r={6} fill={t.text} stroke={t.card} strokeWidth={2} /> : null}
        <Circle cx={x(0)} cy={30} r={4} fill={t.text2} />
        {m.ticks.map((k) => <SvgText key={k.days} x={x(k.days)} y={66} fontSize={10} fill={t.text2} textAnchor={k.days === 0 ? 'start' : 'middle'}>{k.label}</SvgText>)}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 }}>
        {m.window ? <Legend color={tint(t.accent, 0.5)} text="Typical window" /> : null}
        {m.community ? <Legend color={t.green} text="App users" /> : null}
        {m.premiumDays != null ? <Legend color={t.amber} text="Premium deadline" /> : null}
        {m.todayDays != null ? <Legend color={t.text} text="Today" round /> : null}
        {m.decidedDays != null ? <Legend color={t.green} text="Decided" round /> : null}
      </View>
    </View>
  );
}
function Legend({ color, text, round }: { color: string; text: string; round?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: round ? 9 : 14, height: round ? 9 : 6, borderRadius: 5, backgroundColor: color }} />
      <T tone="text2" style={font.caption}>{text}</T>
    </View>
  );
}
