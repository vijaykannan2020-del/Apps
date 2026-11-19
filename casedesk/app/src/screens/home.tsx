// Home tab: greeting, the optional "Add your family" / "Add your documents" cards (owner change),
// backup reminder, family strip, Needs attention, cases at a glance, official updates.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { fmt, today, toDate } from '../core/dates';
import { isPendingCase } from '../core/cases';
import { needsAttention } from '../core/rules/engine';
import { useFamily } from '../data/FamilyProvider';
import { backupDue } from '../data/backupIO';
import { Avatar, BigText, Columns, Button, Card, EmptyState, Group, Hint, Icon, LargeTitle, LinkButton, Pill, Row, Screen, SectionHeader, T, Tag, font, useSheet, useTheme, useToast, tint } from '../ui';
import { AttentionRow, go, needsLocation, runFlow, statusLabel, untilText } from './common';
import { Confirm, SourceSheet } from './sheets';
import { endFlow, unsavedCount, useFlow } from '../data/flow';
import { RULES_CHECKED } from '../core/rules/catalog';
import { HomeUpdates } from './news';
import { HelpCard } from './help';
import { ICloudAfterRestore } from './icloud';
import { listNames, type AttentionItem } from '../core/rules/engine';
import { familyTags, orderTags, updateAlerts } from '../core/updates';
import { useNews, type NewsItem } from '../data/news';

export const UPDATES = [
  { tag: 'EAD', t: 'EAD renewals filed on or after Oct 30, 2025 don’t get an automatic extension', src: 'uscis.gov', url: 'https://www.uscis.gov/i-765', body: 'If a work permit renewal is pending when the card ends, work has to stop until the new card arrives. Plan renewals up to 180 days early.' },
  { tag: 'Visa', t: 'Visa interviews must be in your country of nationality or residence', src: 'travel.state.gov', url: 'https://travel.state.gov/content/travel/en/News/visas-news.html', body: 'Most applicants also need an in-person interview — the interview waiver (“dropbox”) ended for most categories. Book early.' },
  { tag: 'F-1', t: 'F-1 students admitted from Sep 15, 2026 get a fixed I-94 end date', src: 'ice.gov/sevp', url: 'https://studyinthestates.dhs.gov/students', body: '“D/S” is being replaced by a fixed date. If your program runs longer, file I-539 before the I-94 ends.' },
  { tag: 'Citizenship', t: '2025 civics test: 20 questions asked, 12 right to pass', src: 'uscis.gov', url: 'https://www.uscis.gov/citizenship', body: 'Applies to N-400s filed on or after Oct 20, 2025. Practise in Tools → Citizenship test.' },
];

export function Home() {
  const f = useFamily();
  const t = useTheme();
  const toast = useToast();
  const sheet = useSheet();
  const me = f.main;
  const draft = useFlow();
  const news = useNews();
  const unsaved = draft ? unsavedCount() : 0;
  if (!f.people.length || !me) {
    return (
      <Screen tabRoot>
        <LargeTitle title="Home" />
        <EmptyState icon="users" title="No one added yet" body="Tell us about you to see your status." action={{ title: 'Get started', onPress: () => go('/about-you') }} />
      </Screen>
    );
  }
  const att = needsAttention(f.results, 99);
  const alerts = updateAlerts(news.items, familyTags(f.people, f.records), f.settings.updatesDismissed ?? [], today());
  const total = att.length + Math.min(2, alerts.length);
  const missingCount = f.people.reduce((n, p) => n + (f.missing[p.id]?.length ?? 0), 0);
  const noDocs = f.docs.length === 0;
  const onlyMe = f.people.length === 1;
  const d = toDate(today())!;
  const dateLine = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const continueDocs = () => {
    const pids = f.people.filter((p) => (f.missing[p.id]?.length ?? 0) > 0).map((p) => p.id);
    if (!pids.length) { toast('Everything is added'); return; }
    runFlow({ mode: 'missing', pids, missingOnly: true }, f, toast);
  };
  const locAsk = f.people.filter((p) => needsLocation(f.records[p.id]));

  return (
    <Screen tabRoot wide>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T tone="text2" style={[font.caption, { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }]}>{dateLine}</T>
          <T a11y="header" style={font.largeTitle}>{`Hi, ${me.name}`}</T>
        </View>
        <Pressable onPress={() => go('/profile')} accessibilityRole="button" accessibilityLabel="Profile and settings" style={{ marginBottom: 4 }}><Avatar name={me.name} accent /></Pressable>
      </View>

      {onlyMe && !f.settings.familyCardDismissed ? (
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="users" size={20} color={t.accent} /><T style={[font.headline, { flex: 1 }]}>Add your family</T><Tag text="Optional" /></View>
          <T tone="text2" style={[font.foot, { marginTop: 4 }]}>Spouse, children or parents on a visa or green card — even if they’re in India now.</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button title="Add family" onPress={() => go('/family-setup')} grow />
            <Button kind="ghost" title="Not now" onPress={() => f.actions.updateSettings({ familyCardDismissed: true })} />
          </View>
        </Card>
      ) : null}

      {draft && unsaved > 0 ? (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="doc" size={20} color={t.amber} /><T style={[font.headline, { flex: 1 }]}>{`${unsaved} document${unsaved === 1 ? '' : 's'} read, not saved yet`}</T></View>
          <T tone="text2" style={[font.foot, { marginTop: 4 }]}>Pick up where you left off, or discard them.</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button title="Continue" grow onPress={() => go('/flow/review')} />
            <Button kind="ghost" title="Discard" onPress={() => sheet.open('Discard these documents?', <Confirm body="The documents you read but didn’t save are removed from this phone." action="Discard" onConfirm={() => { endFlow(); toast('Discarded'); }} />)} />
          </View>
        </Card>
      ) : null}

      {missingCount > 0 ? (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="doc" size={20} color={t.accent} /><T style={[font.headline, { flex: 1 }]}>{noDocs ? 'Add your documents' : `${missingCount} document${missingCount === 1 ? '' : 's'} still to add`}</T></View>
          <T tone="text2" style={[font.foot, { marginTop: 4 }]}>{noDocs ? 'Start with the passport. Each one is read on this phone, and the checks get better with every document. Skip any you don’t have.' : 'Add them whenever you’re ready. Checks get better with each one.'}</T>
          <Button block title={noDocs ? 'Add documents' : 'Continue adding documents'} onPress={continueDocs} />
        </Card>
      ) : null}

      {backupDue(f.settings, f.docs.length) ? (
        <Card style={{ marginTop: 12, backgroundColor: tint(t.accent, 0.12) }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="backup" size={20} color={t.accent} /><T style={[font.headline, { flex: 1 }]}>Back up your documents</T></View>
          <T tone="text2" style={[font.foot, { marginTop: 4 }]}>{f.settings.lastBackupAt ? `Last backup ${fmt(f.settings.lastBackupAt.slice(0, 10))}.` : 'No backup yet.'} A password-protected copy keeps them safe if you lose or change your phone.</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button title="Back up now" grow onPress={() => router.navigate({ pathname: '/(tabs)/settings', params: { backup: '1' } } as never)} />
            <Button kind="ghost" title="Later" onPress={() => f.actions.updateSettings({ backupReminderSnoozed: new Date(Date.now() + 7 * 864e5).toISOString() })} />
          </View>
        </Card>
      ) : null}

      <ICloudAfterRestore />
      <HelpCard tab="home" />
      <Columns
        left={<>
          <SectionHeader>Family</SectionHeader>
          <Group>
            {f.people.map((p) => (
              <Row key={p.id} avatar={p.name} onPress={() => go(`/person/${p.id}`)} pill={f.results[p.id]?.worst} chevron={false}
                label={`${p.name}, ${statusLabel(p, f.records[p.id], f.results[p.id])}, ${untilText(p, f.records[p.id], f.results[p.id])}`}
                title={<T style={[font.body, { fontWeight: '600' }]}>{p.name} <T tone="text2" style={font.foot}>· {statusLabel(p, f.records[p.id], f.results[p.id])}</T></T>}
                subtitle={untilText(p, f.records[p.id], f.results[p.id]).replace('Status valid until', 'Valid until')} />
            ))}
          </Group>
        </>}
        right={<>
          <SectionHeader right={total > 3 ? <T tone="text2" style={font.caption}>{`${total} items`}</T> : undefined}>Needs attention</SectionHeader>
          {att.length || locAsk.length || alerts.length ? (
            <>
              <Group>
                {locAsk.slice(0, 1).map((p) => (
                  <Row key={`loc-${p.id}`} dot="amber" alignTop onPress={() => go(`/person/${p.id}`)} title={p.relation === 'self' ? 'Are you in the US right now?' : `Is ${p.name} in the US right now?`} titleStyle={{ ...font.callout, fontWeight: '500' }} subtitle={`${p.name} · People outside the US don’t have an I-94.`} />
                ))}
                {att.slice(0, locAsk.length ? 2 : 3).map((x) => <GroupedAttention key={x.personId + x.finding.id} x={x} />)}
                {alerts.slice(0, 2).map((n) => <UpdateAlertRow key={n.id} n={n} />)}
              </Group>
              {total > 3 ? <LinkButton title="See all on Family" onPress={() => router.navigate('/(tabs)/family' as never)} /> : null}
            </>
          ) : (
            <Card><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="checkc" size={20} color={t.green} /><T style={font.headline}>Nothing needs attention</T></View></Card>
          )}
        </>}
      />

      <Columns
        left={<>
          <SectionHeader>Cases at a glance</SectionHeader>
          <CasesGlance />
        </>}
        right={<HomeUpdates />}
      />
      <Hint center style={{ marginTop: 18 }}>{`General information, not legal advice. Rules checked ${fmt(RULES_CHECKED)}.`}</Hint>
    </Screen>
  );
}

/** One Needs-attention item; the same finding for several dependents is listed once with their names. */
function GroupedAttention({ x }: { x: AttentionItem }) {
  const f = useFamily();
  const name = (id: string) => f.people.find((p) => p.id === id)?.name ?? '';
  if (x.finding.id === 'principal-first' || x.people.length > 1) {
    const principalId = f.results[x.people[0]]?.principalId;
    const principal = principalId ? name(principalId) : undefined;
    const who = listNames(x.people.map(name));
    const detail = `${who} ${x.people.length === 1 ? 'follows' : 'follow'} it — plan ${principal ? `${principal}’s` : 'the principal’s'} extension first.`;
    return <AttentionRow f={{ ...x.finding, detail }} onPress={() => go(`/person/${principalId ?? x.personId}`)} />;
  }
  return <AttentionRow f={x.finding} name={name(x.personId)} onPress={() => go(`/person/${x.personId}`)} />;
}

/** A high-impact update for the family's visa types: Info, shown once (dismiss or open it). */
function UpdateAlertRow({ n }: { n: NewsItem }) {
  const f = useFamily();
  const t = useTheme();
  const seen = () => f.actions.updateSettings({ updatesDismissed: [...new Set([...(f.settings.updatesDismissed ?? []), n.id])] });
  return (
    <Row dot="blue" alignTop title={n.title} titleStyle={{ ...font.callout, fontWeight: '500' }} label={`Info: ${n.title}`}
      onPress={() => { seen(); go(`/news/${encodeURIComponent(n.id)}`); }} chevron={false}
      subtitle={<T tone="text2" style={[font.foot, { marginTop: 2 }]}>{`Update for ${orderTags(n.tags, familyTags(f.people, f.records)).slice(0, 2).join(', ')} · ${n.agency}`}</T>}
      trailing={<Pressable onPress={seen} accessibilityRole="button" accessibilityLabel="Dismiss this update" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -8 }}><Icon name="x" size={15} color={t.text2} /></Pressable>} />
  );
}

/** Cases at a glance: one simple card with no cases; counts that fit when there are some. */
function CasesGlance() {
  const f = useFamily();
  const t = useTheme();
  const pending = f.caseList.filter(isPendingCase);
  const latest = [...f.caseList].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0];
  if (!f.caseList.length) {
    return <Card onPress={() => router.navigate('/(tabs)/cases' as never)} label="No cases yet. Add a receipt number">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="doc" size={22} color={t.inkAccent} />
        <View style={{ flex: 1 }}><T style={font.headline}>No cases yet</T><T tone="accent" style={[font.foot, { marginTop: 2 }]}>Add a receipt number</T></View>
        <Icon name="chevR" size={14} color={t.text3} />
      </View>
    </Card>;
  }
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Card style={{ flex: 1, minWidth: 0 }} onPress={() => router.navigate('/(tabs)/cases' as never)} label={`${pending.length} pending, ${f.caseList.length - pending.length} completed`}>
        <BigText size={32}>{String(pending.length)}</BigText>
        <T tone="text2" style={[font.foot, { marginTop: 4 }]}>{`pending · ${f.caseList.length - pending.length} done`}</T>
      </Card>
      <Card style={{ flex: 1.4, minWidth: 0 }} onPress={() => (latest ? go(`/case/${encodeURIComponent(latest.id)}`) : router.navigate('/(tabs)/cases' as never))} label="Latest update">
        <T tone="text2" style={font.foot}>Latest update</T>
        <T style={[font.callout, { fontWeight: '600', marginTop: 4 }]} numberOfLines={2}>{`${latest.form ?? 'Case'} · ${latest.status}`}</T>
        {latest.updated ? <T tone="text2" style={font.foot}>{fmt(latest.updated)}</T> : null}
      </Card>
    </View>
  );
}
