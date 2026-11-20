// Profile: you, family, reminders, privacy & look, help, Data (Back up now / Restore / Delete all), About.
import { reminderSummary, typesFor } from '../core/reminders';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { backupLabel } from '../core/backup';
import { RULES_CHECKED } from '../core/rules/catalog';
import { useFamily } from '../data/FamilyProvider';
import { backUpNow, markBackedUp, openBackup, pickBackupFile, restore, type MergeReport, type RestorePreview } from '../data/backupIO';
import { canUseBiometrics, authenticate } from '../native/device';
import { Avatar, BigText, Button, Card, Field, Group, Hint, Icon, Meter, Note, Option, Row, Screen, SectionHeader, Segmented, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useTheme, useToast, TourButton, TourScope, TourTarget, useSheetTour } from '../ui';
import { back, go, home, relationLabel, statusLabel, replace } from './common';
import { useThemeChoice } from './themeChoice';
import { Confirm } from './sheets';
import { diagLines, clearDiag } from '../native/diag';
import { writeCacheText, share } from '../native/files';
import { ScrollView } from 'react-native';
import { appInfo } from '../native/appInfo';
import { versionRows } from '../core/appinfo';
import { DATA_SOURCES } from '../content/sources';
import { LICENCES, LICENCE_NOTE } from '../content/licences';
import { CONTACT_EMAIL, DISCLAIMER, NOT_OFFICIAL_ID, PRIVACY_URL, SUPPORT_URL } from '../content/legal';

export const leadText = (lead: number[], sep = ', ') => (lead.length ? `${lead.join(sep)} day${lead.length === 1 && lead[0] === 1 ? '' : 's'} before` : 'No reminders');

/** Profile (from the avatar on Home): you, your family, and alerts / reminders per person.
 *  Everything else moved to the Settings tab (v2.1). */
export function ProfileScreen() {
  const f = useFamily();
  const me = f.main;
  const t = useTheme();
  const params = useLocalSearchParams<{ backup?: string }>();
  // Old links (Home's "Back up now" in v2.0) go to Settings now.
  useEffect(() => { if (params.backup === '1') router.replace({ pathname: '/settings', params: { backup: '1' } } as never); }, [params.backup]);
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'Profile', right: <Pressable onPress={() => go('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="gear" size={22} color={t.text} /></Pressable> }}>
      {me ? (
        <Card onPress={() => go(`/person/${me.id}`)} label={`${me.name}, your page`}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Avatar name={me.name} />
            <View style={{ flex: 1 }}><T style={[font.body, { fontWeight: '600' }]}>{me.name}</T><T tone="text2" style={font.sub}>{`${statusLabel(me, f.records[me.id], f.results[me.id])} · ${f.people.length} in family`}</T></View>
            <Icon name="chevR" size={14} color={t.text3} />
          </View>
        </Card>
      ) : null}
      <SectionHeader>Family</SectionHeader>
      <Group>
        {f.people.map((p) => <Row key={p.id} avatar={p.name} title={p.name} subtitle={`${relationLabel(p)} · ${statusLabel(p, f.records[p.id], f.results[p.id])}`} onPress={() => go(`/person/${p.id}`)} />)}
        <Row icon="plus" title="Add family member" titleTone="accent" chevron={false} onPress={() => go('/add-member')} />
      </Group>
      <SectionHeader>Alerts &amp; reminders</SectionHeader>
      <Group>
        {f.people.map((p) => { const r = p.reminders ?? { on: true, lead: f.settings.reminderLeadDays }; return <Row key={p.id} icon="bell" title={p.name} subtitle={reminderSummary(r, typesFor(f.records[p.id], f.caseList.some((c) => c.ownerId === p.id && c.keyDates.length > 0)))} onPress={() => go(`/reminders/${p.id}`)} />; })}
      </Group>
      <Group style={{ marginTop: 24 }}><Row icon="gear" title="Settings" subtitle="Appearance, Face ID, backups, help, about" onPress={() => go('/settings')} /></Group>
    </Screen>
  );
}

export function BackupSheet() {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [ask, setAsk] = useState(false);
  const tour = useSheetTour('backup');
  const go2 = async () => {
    if (pw.length < 8) { toast('Use at least 8 characters'); return; }
    if (pw !== pw2) { toast('The passwords don’t match'); return; }
    setBusy(true); setPct(0);
    try {
      const r = await backUpNow(f.store, pw, (x) => setPct(Math.round(x * 100)));
      if (r.shared) setAsk(true); // the share sheet doesn't tell us if it was saved — ask
      else { s.close(); toast(r.uri ? 'Backup file created, but the share sheet isn’t available here' : 'Couldn’t create the backup'); }
    } catch (e) { toast((e as Error).message || 'Couldn’t create the backup'); } finally { setBusy(false); }
  };
  if (ask) return (
    <View>
      <Why>Did you save the backup file (to Files, iCloud Drive, Google Drive or AirDrop)?</Why>
      <SheetButtons>
        <Button kind="ghost" title="No, try again" onPress={() => setAsk(false)} />
        <Button grow title="Yes, it’s saved" onPress={async () => { await markBackedUp(f.store); s.close(); toast(`Backup saved · ${f.docs.length} documents`); }} />
      </SheetButtons>
    </View>
  );
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Why>One password-protected file with everyone’s documents (images and PDFs), people and cases. Save it to Files, iCloud Drive, Google Drive — or AirDrop it to your new phone.</Why></View><TourButton /></View>
      <TourTarget id="password"><Field label="Password for the file" value={pw} onChangeText={setPw} secure placeholder="At least 8 characters" autoCapitalize="none" /></TourTarget>
      <Field label="Type it again" value={pw2} onChangeText={setPw2} secure autoCapitalize="none" />
      <Hint>You’ll need this password to restore. We can’t recover it.</Hint>
      {busy ? <Progress pct={pct} label="Protecting with your password" /> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={s.close} /><TourTarget id="save" style={{ flexGrow: 1 }}><Button grow title="Back up" busy={busy} onPress={go2} /></TourTarget></SheetButtons>
    </TourScope>
  );
}

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <View style={{ marginTop: 12 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Spinner /><T tone="text2" style={font.foot}>{`${label}… ${pct}%`}</T></View>
      <Meter value={pct} max={100} />
    </View>
  );
}

export function RestoreSheet() {
  const s = useSheet();
  return <RestorePanel onDone={s.close} onCancel={s.close} />;
}

/** Restore: choose file → password → preview → Replace (default) or Merge → exactly what was added / skipped. */
export function RestorePanel({ onDone, onCancel, initial, autoPick }: { onDone: () => void; onCancel: () => void; initial?: { text: string; name: string }; autoPick?: boolean }) {
  const f = useFamily(); const toast = useToast();
  const [file, setFile] = useState<{ text: string; name: string } | null>(initial ?? null);
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [prev, setPrev] = useState<RestorePreview | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [report, setReport] = useState<MergeReport | null>(null);
  const fresh = !f.people.length && !f.docs.length;
  const tour = useSheetTour('restore');
  const choose = async () => { try { const x = await pickBackupFile(); if (x) setFile(x); } catch (e) { toast((e as Error).message); } };
  // v3.0 fix8 (owner): the Restore screen opens the file picker straight away (Choose backup file
  // stays for another try). Not on the web preview: browsers block a picker no one tapped for.
  useEffect(() => {
    if (!autoPick || initial || Platform.OS === 'web') return;
    const h = setTimeout(choose, 450); // after the push animation, or iOS refuses to present it
    return () => clearTimeout(h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async (p: RestorePreview, m: 'replace' | 'merge') => {
    setBusy(true);
    try {
      const r = await restore(f.store, p.payload, m);
      if (m === 'merge') setReport(r);
      else { onDone(); home(); toast(`Restored · ${p.people} people, ${p.docs} documents`); }
    } catch { toast('Couldn’t restore this backup'); } finally { setBusy(false); }
  };
  const open = async () => {
    if (!file) return; setBusy(true); setPct(0);
    try {
      const p = await openBackup(file.text, pw, (x) => setPct(Math.round(x * 100)));
      setBusy(false);
      if (fresh) await apply(p, 'replace'); // nothing on this phone: restore everything, no question
      else setPrev(p);
    } catch (e) { setBusy(false); toast((e as Error).message); }
  };
  if (report) return (
    <View>
      <Why>Merged. Here’s exactly what changed:</Why>
      <Group style={{ marginTop: 12 }}>
        <Row title="People added" subtitle={report.added.people.join(', ') || 'None'} value={String(report.added.people.length)} />
        <Row title="People already here (kept)" subtitle={report.skipped.people.join(', ') || 'None'} value={String(report.skipped.people.length)} />
        <Row title="Documents added" value={String(report.added.docs)} />
        <Row title="Documents already here (skipped)" value={String(report.skipped.docs)} />
        <Row title="Cases added / skipped" value={`${report.added.cases} / ${report.skipped.cases}`} />
      </Group>
      {report.renamed.length ? <Note tone="blue">{`${report.renamed.join(', ')} from the backup ${report.renamed.length === 1 ? 'was' : 'were'} added as a separate family member, because this phone already has a different “You”. Edit details on their page if needed.`}</Note> : null}
      <SheetButtons><Button grow title="Done" onPress={() => { onDone(); home(); }} /></SheetButtons>
    </View>
  );
  if (prev) return (
    <View>
      <Why>{`Backup from ${fmt(prev.exportedAt.slice(0, 10))}.`}</Why>
      <Group style={{ marginTop: 12 }}>
        <Row title="People" subtitle={(prev.payload.people as { name: string }[]).map((x) => x.name).join(', ')} value={String(prev.people)} /><Row title="Documents" value={String(prev.docs)} /><Row title="Images and PDFs" value={String(prev.files)} /><Row title="Cases" value={String(prev.cases)} />
      </Group>
      <View style={{ gap: 10, marginTop: 14 }}>
        <Option title="Replace" subtitle="Use what’s in the backup (recommended for a new phone)" selected={mode === 'replace'} onPress={() => setMode('replace')} />
        <Option title="Merge" subtitle="Keep what’s here and add what’s missing — you’ll see exactly what was added" selected={mode === 'merge'} onPress={() => setMode('merge')} />
      </View>
      {mode === 'replace' ? <Note tone="amber">{`Everything on this phone (${f.people.length} people, ${f.docs.length} documents) is replaced by the backup.`}</Note> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={onCancel} /><Button grow title={mode === 'merge' ? 'Merge' : 'Replace'} busy={busy} onPress={() => apply(prev, mode)} /></SheetButtons>
    </View>
  );
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Why>{initial ? 'Type the backup password to open it.' : 'Choose the backup file you saved from Immigration Wallet, then type its password. Nothing leaves this phone.'}</Why></View><TourButton /></View>
      {initial ? <T style={[font.headline, { marginTop: 14 }]}>{backupLabel(initial.name)}</T> : <TourTarget id="pick" style={{ marginTop: 14 }}><Button kind={file ? 'ghost' : 'tint'} icon="folder" title={file ? backupLabel(file.name) : 'Choose backup file'} onPress={choose} /></TourTarget>}
      {file ? <TourTarget id="password"><Field label="Password" value={pw} onChangeText={setPw} secure autoCapitalize="none" /></TourTarget> : null}
      {busy ? <Progress pct={pct} label="Opening with your password" /> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={onCancel} /><Button grow title="Open" disabled={!file || !pw} busy={busy} onPress={open} /></SheetButtons>
    </TourScope>
  );
}

export function RestoreScreen() {
  return (
    <Screen nav={{ back: 'Welcome', onBack: back, title: 'Restore' }}>
      <T a11y="header" style={font.title}>Restore from a backup</T>
      <RestorePanel autoPick onDone={() => {}} onCancel={back} />
    </Screen>
  );
}

export function WipeSheet() {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  return (
    <View>
      <Why>Every person, document, case and reminder is erased from this phone. This can’t be undone. Back up first if you might need them.</Why>
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={s.close} /><Button grow kind="danger" title="Delete everything" onPress={async () => { s.close(); await f.actions.wipe(); try { router.dismissAll(); } catch {} replace('/welcome'); toast('All data deleted'); }} /></SheetButtons>
    </View>
  );
}

export function AboutScreen() {
  const t = useTheme();
  const f = useFamily();
  const info = appInfo();
  const [lic, setLic] = useState(false);
  const open = (u: string) => require('../native/device').openUrl(u);
  const live: Record<string, string | undefined> = { bulletin: f.bulletin.live ? `Live · ${f.bulletin.data.month}` : undefined };
  const statusWord = (s: string) => (s === 'checked' ? 'Checked' : s === 'partly checked' ? 'Partly checked' : s === 'live only' ? 'Live only' : 'Not yet checked');
  return (
    <Screen nav={{ back: 'Back', onBack: back, title: 'About' }}>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ width: 76, height: 76, borderRadius: 26, backgroundColor: t.pastel.sage, alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={34} color={t.ink} /></View>
        <BigText size={24} style={{ marginTop: 12 }}>Immigration Wallet</BigText>
        <T tone="text2" style={font.sub}>{`USCIS case updates & status · rules checked ${fmt(RULES_CHECKED)}`}</T>
      </View>
      <Note tone="amber">{`${DISCLAIMER} It can be wrong or out of date. For decisions — especially “Act now” items — talk to an immigration attorney or, for students, your DSO.`}</Note>
      <T tone="text2" style={[font.caption, { marginTop: 8, textAlign: 'center' }]}>{NOT_OFFICIAL_ID}</T>

      <SectionHeader>Version</SectionHeader>
      <Group>{versionRows(info).map((r) => <Row key={r.label} title={r.label} value={r.value} chevron={false} />)}</Group>

      <SectionHeader>Privacy</SectionHeader>
      <Card>
        {['Documents are read and stored only on this phone.', 'No account needed (Community sign-in is optional), no ads, no analytics, no tracking, no selling data.', 'Our server never receives your documents, names or receipt numbers. What to expect sends only the form, office code and dates.', 'Community posts and anonymous Cases like mine timelines are sent only when you choose to post or share.', 'Never logs in to USCIS, CBP or SEVP for you.', 'Backups are encrypted with your password before they leave the app.'].map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline', paddingVertical: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.green }} /><T style={[font.sub, { flex: 1 }]}>{x}</T></View>
        ))}
      </Card>
      <Group style={{ marginTop: 10 }}>
        <Row icon="lock" title="Privacy policy" chevron={false} trailing={<Icon name="ext" size={15} color={t.text3} />} onPress={() => open(PRIVACY_URL)} />
        <Row icon="help" title="Support" subtitle={CONTACT_EMAIL} chevron={false} trailing={<Icon name="ext" size={15} color={t.text3} />} onPress={() => open(SUPPORT_URL)} />
      </Group>

      <SectionHeader>Data sources</SectionHeader>
      <Group>
        {DATA_SOURCES.map((d) => (
          <Row key={d.id} icon="globe" alignTop title={d.name} titleStyle={{ ...font.callout, fontWeight: '500' }}
            subtitle={`${live[d.id] ?? `As of ${d.asOf}`} · ${statusWord(d.status)}\n${d.note}`}
            chevron={false} trailing={<Icon name="ext" size={15} color={t.text3} />} onPress={() => open(d.source.url)} label={`${d.name}, ${d.asOf}. Opens ${d.source.label}`} />
        ))}
      </Group>
      <Hint>Each data screen also shows its date, whether it is live or the built-in copy, and a link to the official source.</Hint>

      <SectionHeader>Official sources</SectionHeader>
      <Group>
        {[['uscis.gov', 'https://www.uscis.gov'], ['travel.state.gov', 'https://travel.state.gov'], ['cbp.gov', 'https://www.cbp.gov'], ['ice.gov/sevp', 'https://www.ice.gov/sevis'], ['dol.gov', 'https://www.dol.gov']].map(([l, u]) => (
          <Row key={l} icon="globe" title={l} chevron={false} trailing={<Icon name="ext" size={15} color={t.text3} />} onPress={() => open(u)} />
        ))}
      </Group>

      <SectionHeader>Open-source licences</SectionHeader>
      <Group>
        {(lic ? LICENCES : LICENCES.slice(0, 5)).map(([n, l]) => <Row key={n} title={n} titleStyle={font.sub} value={l} chevron={false} />)}
        <Row title={lic ? 'Show fewer' : `Show all ${LICENCES.length}`} titleTone="accent" chevron={false} onPress={() => setLic(!lic)} />
      </Group>
      <Hint>{LICENCE_NOTE}</Hint>
    </Screen>
  );
}

export function DiagSheet() {
  const [lines, setLines] = useState<string[] | null>(null);
  const toast = useToast();
  useEffect(() => { diagLines().then(setLines); }, []);
  const text = (lines ?? []).join('\n');
  return (
    <View>
      <Why>No document details are in here — only what the app did and any errors.</Why>
      <ScrollView style={{ maxHeight: 360, marginTop: 12 }}>
        <T style={{ fontSize: 12, fontFamily: 'Menlo' }}>{lines == null ? 'Loading…' : text || 'Nothing logged yet.'}</T>
      </ScrollView>
      <SheetButtons>
        <Button kind="ghost" title="Clear" onPress={async () => { await clearDiag(); setLines([]); }} />
        <Button grow title="Share" onPress={async () => { const u = await writeCacheText('immigration-wallet-diagnostics.txt', text); if (!u || !(await share(u, 'text/plain', 'Immigration Wallet diagnostics'))) toast('Couldn’t open the share sheet'); }} />
      </SheetButtons>
    </View>
  );
}
