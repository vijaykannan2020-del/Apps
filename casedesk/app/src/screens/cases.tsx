// Cases tab and case detail. Status is checked only on the official site in Safari (copy flow) —
// CaseDesk never logs in to USCIS or reads the site.
import React from 'react';
import { Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fmt, daysTo } from '../core/dates';
import { isPendingCase, type CaseView } from '../core/cases';
import { useFamily } from '../data/FamilyProvider';
import { TourButton, TourTarget, useTour, useSheetTour, Columns, useLayout, Button, Card, EmptyState, Group, Hint, Icon, IconButton, LargeTitle, LegalLine, Note, Pill, Row, Screen, SectionHeader, T, Timeline, font, useSheet, useTheme, useToast, tint } from '../ui';
import { asOfText, back, DataFooter, go } from './common';
import { SOURCES } from '../content/legal';
import { AddCase, AddKeyDate, CheckStatus, Confirm, startCaseCheck } from './sheets';
import { copy } from '../native/device';
import { ExpectCard } from './expect';

const inDays = (n: number) => (n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export function CaseStatusPill({ c }: { c: CaseView }) {
  const t = useTheme();
  if (c.status === 'Approved') return <Pill severity="good" text="Approved" />;
  if (c.status === 'RFE') return <Pill severity="review" text="RFE" />;
  if (c.status === 'Denied') return <Pill severity="act" text="Denied" />;
  return <View style={{ backgroundColor: t.fill, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T style={[font.caption, { fontWeight: '600' }]}>{c.status}</T></View>;
}

export function CaseRow({ c, who = true, onPick, on }: { c: CaseView; who?: boolean; onPick?: (id: string) => void; on?: boolean }) {
  const f = useFamily();
  const nd = c.keyDates.find((k) => (daysTo(k.date) ?? -1) >= 0);
  const name = f.people.find((p) => p.id === c.ownerId)?.name;
  return (
    <Row icon={on ? 'checkc' : 'doc'} onPress={() => (onPick ? onPick(c.id) : go(`/case/${encodeURIComponent(c.id)}`))} chevron={false} trailing={<CaseStatusPill c={c} />}
      title={<T style={font.body}><T style={[font.body, { fontWeight: '600' }]}>{c.form ?? 'Case'}</T>{` · ${c.name}`}</T>}
      subtitle={`${who && name ? `${name} · ` : ''}${nd ? `${nd.label} ${fmt(nd.date)}` : c.updated ? `Updated ${fmt(c.updated)}` : 'Added by you'}`} />
  );
}

export function CasesTab() {
  const f = useFamily();
  const sheet = useSheet();
  const L = useLayout();
  const [sel, setSel] = React.useState<string>();
  const selected = L.twoCol ? (f.caseList.find((c) => c.id === sel) ?? f.caseList[0])?.id : undefined;
  const pick = L.twoCol ? setSel : undefined;
  const pend = f.caseList.filter(isPendingCase), done = f.caseList.filter((c) => !isPendingCase(c));
  const byPerson = (list: CaseView[]) => f.people.map((p) => {
    const l = list.filter((c) => c.ownerId === p.id);
    return l.length ? <View key={p.id}><SectionHeader>{p.name}</SectionHeader><Group>{l.map((c) => <CaseRow key={c.id} c={c} who={false} onPick={pick} on={selected === c.id} />)}</Group></View> : null;
  });
  const add = () => sheet.open('Add a case', <AddCase />);
  const tour = useTour('cases');
  return (
    <Screen tabRoot wide paneRatio={0.9} tour={tour} panes={{ left: <>
      <LargeTitle title="Cases" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><TourButton /><TourTarget id="add"><IconButton icon="plus" label="Add a case" onPress={add} /></TourTarget></View>} />
      <T tone="text2" style={[font.sub, { marginTop: 2 }]}>Every USCIS form, by person. Pending first.</T>
      {f.caseList.length ? (
        <TourTarget id="list">
          {pend.length ? <T a11y="header" style={[font.title2, { marginTop: 24 }]}>{`Pending · ${pend.length}`}</T> : null}
          {byPerson(pend)}
          {done.length ? <T a11y="header" style={[font.title2, { marginTop: 28 }]}>{`Completed · ${done.length}`}</T> : null}
          {byPerson(done)}
        </TourTarget>
      ) : <EmptyState small icon="clock" title="No cases yet" body="Add a receipt number from an I-797C notice." action={{ title: 'Add a case', onPress: add }} />}
      <SectionHeader>Look up</SectionHeader>
      <Group><Row icon="search" onPress={() => go('/tools/lca')} title="LCA / PERM status" subtitle="Look up your employer’s filing with the Department of Labor" /></Group>
      </>, right: selected ? <View style={{ marginTop: 4 }}><CaseBody id={selected} /></View> : null }} />
  );
}

export function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFamily();
  const c = f.caseList.find((x) => x.id === decodeURIComponent(id ?? ''));
  const tour = useTour('case');
  if (!c) return <Screen nav={{ back: 'Cases', onBack: back }}><EmptyState icon="doc" title="Case deleted" /></Screen>;
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: c.form ?? 'Case' }} tour={tour}>
      <CaseBody id={c.id} />
    </Screen>
  );
}

/** Case detail — its own screen, or the right pane of Cases on wide screens. */
export function CaseBody({ id }: { id: string }) {
  const f = useFamily();
  const sheet = useSheet();
  const toast = useToast();
  const t = useTheme();
  const c = f.caseList.find((x) => x.id === id);
  if (!c) return <EmptyState icon="doc" title="Case deleted" />;
  const p = f.people.find((x) => x.id === c.ownerId);
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T tone="text2" style={font.foot}>{`${p?.name ?? ''} · ${c.form ?? 'Case'}`}</T>
            <T style={[font.big, { marginTop: 4 }]}>{c.name}</T>
          </View>
          <CaseStatusPill c={c} />
        </View>
        {!c.consular && c.receipt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <View style={{ flex: 1 }}><T tone="text2" style={font.foot}>Receipt number</T><T style={[font.sub, { fontFamily: 'Menlo', letterSpacing: 0.3, marginTop: 2 }]}>{c.receipt}</T></View>
            <Button size="sm" kind="tint" icon="copy" title="Copy" onPress={async () => { await copy(c.receipt!); toast(`Copied ${c.receipt}`); }} />
          </View>
        ) : null}
      </Card>
      {c.status === 'RFE' ? <Note tone="amber"><T style={font.sub}>USCIS asked for more evidence. Missing the due date can lead to denial.</T><LegalLine /></Note> : null}
      {c.status === 'Denied' ? <Note tone="red"><T style={font.sub}>Denied. Talk to an attorney about options now.</T><LegalLine /></Note> : null}
      <SectionHeader>Key dates</SectionHeader>
      <Group>
        {c.keyDates.map((k, i) => <Row key={i} icon="cal" iconTone={/RFE|NOID/.test(k.label) ? 'amber' : undefined} title={k.label} subtitle={`${fmt(k.date)} · ${inDays(daysTo(k.date) ?? 0)}`} />)}
        <Row icon="plus" title="Add biometrics, interview, RFE or oath date" titleTone="accent" chevron={false} onPress={() => sheet.open('Add a key date', <AddKeyDate view={c} />)} />
      </Group>
      {c.consular ? <Note tone="blue">Approved at a US consulate. There is no USCIS case to check online.</Note> : (
        <>
          <SectionHeader>Check status</SectionHeader>
          <Card>
            {['Copy the receipt number', 'Safari opens uscis.gov — paste it and tap Check Status', 'Copy what the page says, tap Done, then “Paste what USCIS says”'].map((x, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 5 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tint(t.accent, 0.18), alignItems: 'center', justifyContent: 'center' }}><T tone="accent" style={[font.foot, { fontWeight: '600' }]}>{String(i + 1)}</T></View>
                <T style={[font.callout, { flex: 1 }]}>{x}</T>
              </View>
            ))}
            <T tone="text2" style={[font.foot, { marginTop: 8 }]}>{c.checkedAt ? `Last checked on uscis.gov: ${asOfText({ live: true, fetchedAt: c.checkedAt }).replace(/^Live · updated /, '')}` : 'Not checked on uscis.gov yet'}</T>
            <Hint>Immigration Wallet never logs in to USCIS or reads the site for you.</Hint>
            <TourTarget id="check"><Button block icon="compass" title="Copy number & open uscis.gov" onPress={() => startCaseCheck(c, sheet.open)} /></TourTarget>
            <TourTarget id="paste"><Button block kind="ghost" icon="copy" title="Paste what USCIS says" onPress={() => sheet.open('What did USCIS say?', <CheckStatus view={c} copied />)} /></TourTarget>
          </Card>
        </>
      )}
      {!c.consular ? <ExpectCard c={c} /> : null}
      <SectionHeader>History</SectionHeader>
      <TourTarget id="history"><Card>{c.history.length ? <Timeline items={c.history.map((h, i) => ({ title: h.text, sub: fmt(h.date), state: i ? 'done' : 'now' }))} /> : <T tone="text2" style={font.foot}>No history yet.</T>}</Card></TourTarget>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <Button kind="ghost" icon="share" title="Share" onPress={() => Share.share({ message: `${c.form ?? 'Case'} · ${c.name}\nStatus: ${c.status}${c.updated ? ` (updated ${fmt(c.updated)})` : ''}` }).catch(() => {})} />
        <Button kind="danger" icon="trash" title="Delete" onPress={() => sheet.open('Delete this case?', <Confirm body="It’s removed from this phone only. Nothing changes at USCIS." action="Delete" onConfirm={async () => { back(); await f.actions.deleteCase(c); toast('Case deleted'); }} />)} />
      </View>
      <DataFooter source={SOURCES.caseStatus} note="Case status comes only from what you copy from uscis.gov — Immigration Wallet doesn’t contact USCIS." />
    </>
  );
}
