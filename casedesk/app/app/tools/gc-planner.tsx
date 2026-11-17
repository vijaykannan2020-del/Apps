// Employment-based green card planner: PWD → recruitment → PERM → I-140 → I-485, with the key
// legal milestones (I-140 filing deadline, H-1B beyond 6 years, I-140 retention, AC21 portability).
import React, { useState } from 'react';
import { View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Button, Note, DateField, Pill } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useStored } from '../../src/lib/store';
import { fmt, daysTo } from '../../src/lib/compliance';

type GC = { pwdFiled?: string; pwdIssued?: string; permFiled?: string; permCertified?: string; i140Filed?: string; i140Approved?: string; i485Filed?: string; eadApproved?: string };
const AS_OF = 'Nov 2026';
const TYPICAL = {
  pwdMonths: [4, 6], // DOL was processing June–Aug 2026 requests in Oct–Nov 2026
  permDays: 330, // DOL analyst review averaged ~300–360 days (as of Oct 31, 2026)
};
const add = (s: string, days: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

type Step = { key: string; title: string; done?: string; detail: string; projected?: string; tone?: 'green' | 'accent' | 'amber' | 'neutral' };

export default function GcPlanner() {
  const t = useTheme();
  const router = useRouter();
  const [g, setG] = useStored<GC>('cd.gc.v1', {});
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<GC>({});
  const set = (k: keyof GC) => (v: string) => setDraft({ ...draft, [k]: v });

  const steps: Step[] = [
    { key: 'pwd', title: 'Prevailing wage (ETA-9141)', done: g.pwdIssued, detail: `DOL sets the minimum wage for the job. Typically ${TYPICAL.pwdMonths[0]}–${TYPICAL.pwdMonths[1]} months right now.`, projected: !g.pwdIssued && ok(g.pwdFiled) ? add(g.pwdFiled!, TYPICAL.pwdMonths[1] * 30) : undefined },
    { key: 'rec', title: 'Recruitment', done: g.permFiled, detail: 'Employer tests the US job market: job order, ads and a 30-day quiet period — about 2–3 months.' },
    { key: 'perm', title: 'PERM labor certification (ETA-9089)', done: g.permCertified, detail: `Filing date = your priority date. DOL review is averaging about ${Math.round(TYPICAL.permDays / 30)} months (${AS_OF}); audits add more.`, projected: !g.permCertified && ok(g.permFiled) ? add(g.permFiled!, TYPICAL.permDays) : undefined },
    { key: 'i140', title: 'I-140 petition', done: g.i140Approved, detail: g.permCertified && !g.i140Filed ? `Must be filed by ${fmt(add(g.permCertified, 180))} — PERM is valid for 180 days.` : 'Premium processing (15 business days) is available.' },
    { key: 'i485', title: 'I-485 adjustment of status', done: g.i485Filed, detail: 'Filed when your priority date is current on the chart USCIS uses that month. Can be filed with the I-140 if already current.' },
    { key: 'ead', title: 'EAD + advance parole', done: g.eadApproved, detail: 'Filed with the I-485; lets you work and travel on a combo card while the I-485 is pending.' },
    { key: 'gc', title: 'Green card', detail: 'Approved once the Final Action date is current and USCIS finishes the I-485.' },
  ];
  const nextIdx = steps.findIndex((s) => !s.done);

  const milestones: { title: string; date?: string; detail: string }[] = [];
  if (ok(g.permFiled)) milestones.push({ title: 'H-1B past 6 years (1-year extensions)', date: add(g.permFiled!, 365), detail: 'Once PERM (or I-140) has been pending 365 days, H-1B can be extended a year at a time beyond the 6-year limit.' });
  if (ok(g.permCertified) && !g.i140Filed) milestones.push({ title: 'Last day to file I-140', date: add(g.permCertified!, 180), detail: 'The certified PERM expires after 180 days.' });
  if (ok(g.i140Approved)) milestones.push({ title: 'I-140 protected (180 days)', date: add(g.i140Approved!, 180), detail: 'After 180 days the I-140 generally stays valid even if the employer withdraws it — you keep the priority date and H-1B extensions.' });
  if (ok(g.i140Approved)) milestones.push({ title: '3-year H-1B extensions', date: g.i140Approved, detail: 'With an approved I-140 and a priority date that isn’t current, H-1B can be extended in 3-year steps.' });
  if (ok(g.i485Filed)) milestones.push({ title: 'AC21 job portability', date: add(g.i485Filed!, 180), detail: 'Once the I-485 has been pending 180 days (and the I-140 is approved), you can move to a same-or-similar job (Supplement J).' });
  milestones.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const empty = !Object.values(g).some(Boolean);
  if (edit || empty) {
    const d = draft;
    const valid = Object.values(d).every((v) => !v || ok(v));
    return (
      <DetailScreen title="Green card planner">
        <View style={{ paddingHorizontal: 20 }}>
          <T v="h1">Your green card dates</T>
          <T v="sub" style={{ marginTop: 4, marginBottom: 12 }}>Add the dates you have — leave the rest blank. Saved on this phone.</T>
          <DateField label="Prevailing wage filed" value={d.pwdFiled} onChange={set('pwdFiled')} />
          <DateField label="Prevailing wage issued" value={d.pwdIssued} onChange={set('pwdIssued')} />
          <DateField label="PERM filed (priority date)" value={d.permFiled} onChange={set('permFiled')} />
          <DateField label="PERM certified" value={d.permCertified} onChange={set('permCertified')} />
          <DateField label="I-140 filed" value={d.i140Filed} onChange={set('i140Filed')} />
          <DateField label="I-140 approved" value={d.i140Approved} onChange={set('i140Approved')} />
          <DateField label="I-485 filed" value={d.i485Filed} onChange={set('i485Filed')} />
          <DateField label="EAD / AP approved" value={d.eadApproved} onChange={set('eadApproved')} />
          <Button label="Save" disabled={!valid} onPress={async () => { await setG(d); setEdit(false); }} />
          {edit ? <View style={{ marginTop: 10 }}><Button label="Cancel" kind="secondary" onPress={() => setEdit(false)} /></View> : null}
        </View>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Green card planner">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Green card journey</T>
        <T v="sub" style={{ marginTop: 4 }}>Employment-based (EB-2 / EB-3) · times as of {AS_OF}</T>
      </View>
      <Section>
        <Card>
          {steps.map((s, i) => {
            const state = s.done ? 'done' : i === nextIdx ? 'now' : 'later';
            const c = state === 'done' ? t.green : state === 'now' ? t.accent : t.faint;
            return (
              <View key={s.key} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 24 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: state === 'later' ? t.surface2 : c, alignItems: 'center', justifyContent: 'center' }}>
                    {state === 'done' ? <Ionicons name="checkmark" size={14} color={t.bg} /> : state === 'now' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.bg }} /> : null}
                  </View>
                  {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: state === 'done' ? t.green : t.surface2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <T v="h3" style={{ color: state === 'later' ? t.sub : t.text }}>{s.title}</T>
                    {s.done ? <Pill label={fmt(s.done)} tone="green" small /> : state === 'now' ? <Pill label="Next" tone="accent" small /> : null}
                  </View>
                  <T v="sub" style={{ marginTop: 3 }}>{s.detail}</T>
                  {s.projected ? <T v="small" style={{ marginTop: 4, color: t.amber }}>Estimated around {fmt(s.projected)}</T> : null}
                </View>
              </View>
            );
          })}
        </Card>
      </Section>
      {milestones.length ? (
        <Section title="Key dates for you">
          <Card style={{ paddingVertical: 4 }}>
            {milestones.map((m, i) => {
              const dd = daysTo(m.date);
              return (
                <View key={m.title} style={{ paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <T v="h3" style={{ flex: 1, fontSize: 15 }}>{m.title}</T>
                    <T v="small" style={{ color: dd !== null && dd <= 0 ? t.green : t.text }}>{dd !== null && dd <= 0 ? 'Reached' : fmt(m.date)}</T>
                  </View>
                  <T v="sub" style={{ marginTop: 3 }}>{m.detail}</T>
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}
      <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
        <Button label="Track my priority date" icon="calendar-outline" onPress={() => router.push('/tools/priority-date')} />
        <Button label="Edit dates" kind="secondary" icon="create-outline" onPress={() => { setDraft(g); setEdit(true); }} />
        <Button label="DOL processing times (FLAG)" kind="secondary" icon="open-outline" href="https://flag.dol.gov/processingtimes" />
        <Note>Estimates only. Your attorney’s timeline and USCIS/DOL notices take priority.</Note>
      </View>
    </DetailScreen>
  );
}
