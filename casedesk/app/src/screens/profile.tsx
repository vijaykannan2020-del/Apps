// Profile: you, family, reminders, privacy & look, help, Data (Back up now / Restore / Delete all), About.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { RULES_CHECKED } from '../core/rules/catalog';
import { useFamily } from '../data/FamilyProvider';
import { backUpNow, markBackedUp, openBackup, pickBackupFile, restore, type MergeReport, type RestorePreview } from '../data/backupIO';
import { canUseBiometrics, authenticate } from '../native/device';
import { Avatar, BigText, Button, Card, Field, Group, Hint, Icon, Meter, Note, Option, Row, Screen, SectionHeader, Segmented, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useTheme, useToast } from '../ui';
import { back, go, home, relationLabel, statusLabel, replace } from './common';
import { useThemeChoice } from './themeChoice';
import { Confirm } from './sheets';
import { diagLines, clearDiag } from '../native/diag';
import { writeCacheText, share } from '../native/files';
import { ScrollView } from 'react-native';

export const leadText = (lead: number[], sep = ', ') => (lead.length ? `${lead.join(sep)} day${lead.length === 1 && lead[0] === 1 ? '' : 's'} before` : 'No reminders');

/** Profile (from the avatar on Home): you, your family, and alerts / reminders per person.
 *  Everything else moved to the Settings tab (v2.1). */
export function ProfileScreen() {
  const f = useFamily();
  const me = f.main;
  const t = useTheme();
  const params = useLocalSearchParams<{ backup?: string }>();
  // Old links (Home's "Back up now" in v2.0) go to Settings now.
  useEffect(() => { if (params.backup === '1') router.replace({ pathname: '/(tabs)/settings', params: { backup: '1' } } as never); }, [params.backup]);
  return (
    <Screen nav={{ back: 'Home', onBack: back, title: 'Profile' }}>
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
        {f.people.map((p) => { const r = p.reminders ?? { on: true, lead: f.settings.reminderLeadDays }; return <Row key={p.id} icon="bell" title={p.name} subtitle={r.on ? leadText(r.lead, ' · ') : 'Off'} onPress={() => go(`/reminders/${p.id}`)} />; })}
      </Group>
      <Group style={{ marginTop: 24 }}><Row icon="gear" title="Settings" subtitle="Appearance, Face ID, backups, help, about" onPress={() => router.navigate('/(tabs)/settings' as never)} /></Group>
    </Screen>
  );
}

export function BackupSheet() {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [ask, setAsk] = useState(false);
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
    <View>
      <Why>One password-protected file with everyone’s documents (images and PDFs), people and cases. Save it to Files, iCloud Drive, Google Drive — or AirDrop it to your new phone.</Why>
      <Field label="Password for the file" value={pw} onChangeText={setPw} secure placeholder="At least 8 characters" autoCapitalize="none" />
      <Field label="Type it again" value={pw2} onChangeText={setPw2} secure autoCapitalize="none" />
      <Hint>You’ll need this password to restore. We can’t recover it.</Hint>
      {busy ? <Progress pct={pct} label="Protecting with your password" /> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={s.close} /><Button grow title="Back up" busy={busy} onPress={go2} /></SheetButtons>
    </View>
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
export function RestorePanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const f = useFamily(); const toast = useToast();
  const [file, setFile] = useState<{ text: string; name: string } | null>(null);
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const [prev, setPrev] = useState<RestorePreview | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [report, setReport] = useState<MergeReport | null>(null);
  const fresh = !f.people.length && !f.docs.length;
  const choose = async () => { try { const x = await pickBackupFile(); if (x) setFile(x); } catch (e) { toast((e as Error).message); } };
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
    <View>
      <Why>Choose a .casedesk file, then type its password. Nothing leaves this phone.</Why>
      <View style={{ marginTop: 14 }}><Button kind={file ? 'ghost' : 'tint'} icon="folder" title={file ? file.name : 'Choose backup file'} onPress={choose} /></View>
      {file ? <Field label="Password" value={pw} onChangeText={setPw} secure autoCapitalize="none" /> : null}
      {busy ? <Progress pct={pct} label="Opening with your password" /> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={onCancel} /><Button grow title="Open" disabled={!file || !pw} busy={busy} onPress={open} /></SheetButtons>
    </View>
  );
}

export function RestoreScreen() {
  return (
    <Screen nav={{ back: 'Welcome', onBack: back, title: 'Restore' }}>
      <T a11y="header" style={font.title}>Restore from a backup</T>
      <RestorePanel onDone={() => {}} onCancel={back} />
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
  let version = '2.0';
  try { version = require('expo-constants').default?.expoConfig?.version ?? version; } catch {}
  return (
    <Screen nav={{ back: 'Settings', onBack: back, title: 'About' }}>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={34} color="#fff" /></View>
        <BigText size={24} style={{ marginTop: 12 }}>CaseDesk</BigText>
        <T tone="text2" style={font.sub}>{`Version ${version} · rules checked ${fmt(RULES_CHECKED)}`}</T>
      </View>
      <Note tone="amber">Not legal advice. CaseDesk gives general information from official sources. It can be wrong or out of date. For decisions — especially “Act now” items — talk to an immigration attorney or, for students, your DSO.</Note>
      <SectionHeader>Privacy</SectionHeader>
      <Card>
        {['Documents are read and stored only on this phone.', 'No account, no ads, no tracking, no selling data.', 'Never logs in to USCIS, CBP or SEVP for you.', 'Backups are encrypted with your password before they leave the app.'].map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline', paddingVertical: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.green }} /><T style={[font.sub, { flex: 1 }]}>{x}</T></View>
        ))}
      </Card>
      <SectionHeader>Official sources</SectionHeader>
      <Group>
        {[['uscis.gov', 'https://www.uscis.gov'], ['travel.state.gov', 'https://travel.state.gov'], ['cbp.gov', 'https://www.cbp.gov'], ['ice.gov/sevp', 'https://www.ice.gov/sevis'], ['dol.gov', 'https://www.dol.gov']].map(([l, u]) => (
          <Row key={l} icon="globe" title={l} chevron={false} trailing={<Icon name="ext" size={15} color={t.text3} />} onPress={() => require('../native/device').openUrl(u)} />
        ))}
      </Group>
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
        <Button grow title="Share" onPress={async () => { const u = await writeCacheText('casedesk-diagnostics.txt', text); if (!u || !(await share(u, 'text/plain', 'CaseDesk diagnostics'))) toast('Couldn’t open the share sheet'); }} />
      </SheetButtons>
    </View>
  );
}
