// Settings tab (v2.1): every app setting in one place — appearance, Face ID, reminder defaults,
// backup & restore, delete all, HR tools, diagnostics, help and about. Profile keeps people only.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { RULES_CHECKED } from '../core/rules/catalog';
import { useFamily } from '../data/FamilyProvider';
import { canUseBiometrics, authenticate } from '../native/device';
import { askNotificationPermission } from '../native/reminders';
import { Button, ChipToggle, Chips, Group, Hint, LargeTitle, Row, Screen, SectionHeader, Segmented, SheetButtons, Switch, T, Why, font, useLayout, useSheet, useToast, Columns } from '../ui';
import { go, replace } from './common';
import { useThemeChoice } from './themeChoice';
import { Confirm } from './sheets';
import { BackupSheet, DiagSheet, RestoreSheet, WipeSheet, leadText } from './profile';
import { HelpCard } from './help';
import { ICloudRows } from './icloud';
import { HELP } from '../content/help';

export function SettingsTab() {
  const f = useFamily();
  const sheet = useSheet();
  const toast = useToast();
  const theme = useThemeChoice();
  const L = useLayout();
  const params = useLocalSearchParams<{ backup?: string }>();
  useEffect(() => { if (params.backup === '1') { router.setParams({ backup: undefined } as never); setTimeout(() => sheet.open('Back up now', <BackupSheet />), 350); } }, [params.backup, sheet]);
  const lastBackup = f.settings.lastBackupAt ? fmt(f.settings.lastBackupAt.slice(0, 10)) : 'Never';
  let version = '2.1';
  try { version = require('expo-constants').default?.expoConfig?.version ?? version; } catch {}

  const look = (
    <>
      <SectionHeader>Appearance &amp; privacy</SectionHeader>
      <Group>
        <Row icon={theme.value === 'light' ? 'sun' : 'moon'} title="Appearance">
          <Segmented options={['System', 'Dark', 'Light']} value={theme.value[0].toUpperCase() + theme.value.slice(1)} onChange={(v) => theme.set(v.toLowerCase() as never)} />
        </Row>
        <Row icon="face" title="Face ID lock" subtitle="Also hides documents in the app switcher" trailing={<Switch value={!!f.settings.faceId} label="Face ID lock" onValueChange={async (on) => {
          if (on && !(await canUseBiometrics())) { toast('Set up Face ID or a passcode in iOS Settings first'); return; }
          if (on && !(await authenticate('Turn on Face ID lock'))) return;
          await f.actions.updateSettings({ faceId: on, hideInSwitcher: on }); toast(on ? 'Face ID on' : 'Face ID off');
        }} />} />
      </Group>
      <SectionHeader>Reminders</SectionHeader>
      <Group>
        <Row icon="bell" title="Default reminders" subtitle={leadText(f.settings.reminderLeadDays, ' · ')} onPress={() => sheet.open('Default reminders', <ReminderDefaults />)} />
        <Row icon="users" title="Per person" subtitle="Turn reminders on or off for each person" onPress={() => go('/profile')} />
      </Group>
      <SectionHeader>Backup &amp; restore</SectionHeader>
      <Group>
        <ICloudRows />
        <Row icon="share" title="Back up to a file" subtitle={`Files, Google Drive or AirDrop · last: ${lastBackup}`} onPress={() => sheet.open('Back up now', <BackupSheet />)} chevron={false} />
        <Row icon="restore" title="Restore from backup" subtitle="From a .casedesk file in Files, iCloud Drive or Google Drive" onPress={() => sheet.open('Restore from backup', <RestoreSheet />)} chevron={false} />
        <Row icon="trash" iconTone="red" title="Delete all data" titleTone="red" chevron={false} onPress={() => sheet.open('Delete all data?', <WipeSheet />)} />
      </Group>
    </>
  );
  const help = (
    <>
      <SectionHeader>Help</SectionHeader>
      <Group>
        {HELP.slice(0, 8).map((h) => <Row key={h.id} icon="help" title={h.title} subtitle={h.sub} onPress={() => go(`/help/${h.id}`)} />)}
        <Row icon="play" title="How CaseDesk works" subtitle="A 4-screen tour" onPress={() => go('/tour')} />
        <Row icon="users" title="Example family" subtitle="Look around with made-up data (replaces what’s here)" chevron={false} onPress={() => sheet.open('Load the example family?', <Confirm body="Everything on this phone is replaced by a made-up H-1B family. Back up first if you need your data." action="Load example" onConfirm={() => { try { router.dismissAll(); } catch {} replace('/demo'); }} />)} />
      </Group>
      <SectionHeader>More</SectionHeader>
      <Group>
        <Row icon="hr" title="Show HR tools" subtitle="Expiring documents across the family" trailing={<Switch value={!!f.settings.hrTools} label="Show HR tools" onValueChange={(on) => f.actions.updateSettings({ hrTools: on })} />} />
        <Row icon="info" title="Diagnostics" subtitle="What the app did — send this if something goes wrong" chevron={false} onPress={() => sheet.open('Diagnostics', <DiagSheet />)} />
        <Row icon="shield" title="About CaseDesk" subtitle={`Version ${version} · not legal advice · sources`} onPress={() => go('/about')} />
      </Group>
      <Hint center style={{ marginTop: 18 }}>{`Not affiliated with USCIS or any government agency. Rules checked ${fmt(RULES_CHECKED)}.`}</Hint>
    </>
  );
  return (
    <Screen tabRoot wide panes={{ left: <>
      <LargeTitle title="Settings" />
      <T tone="text2" style={[font.sub, { marginTop: 2 }]}>Your data stays on this phone.</T>
      <HelpCard tab="settings" />
      {look}
    </>, right: <>{L.twoCol ? <View style={{ height: 70 }} /> : null}{help}</> }} />
  );
}

function ReminderDefaults() {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const lead = f.settings.reminderLeadDays;
  const set = (l: number[]) => f.actions.updateSettings({ reminderLeadDays: l });
  return (
    <View>
      <Why>How early to remind you before passport, I-94, approval, EAD and green card dates. Used for people you add from now on.</Why>
      <Chips>{[180, 90, 60, 30, 14, 7, 1].map((d) => <ChipToggle key={d} role="checkbox" text={`${d} day${d === 1 ? '' : 's'}`} on={lead.includes(d)} onPress={() => set(lead.includes(d) ? lead.filter((x) => x !== d) : [...lead, d].sort((a, b) => b - a))} />)}</Chips>
      <SheetButtons>
        <Button kind="ghost" title="Apply to everyone" onPress={async () => { for (const p of f.people) await f.actions.updatePerson(p.id, { reminders: { on: p.reminders?.on ?? true, lead } }); toast('Applied to everyone'); }} />
        <Button grow title="Done" onPress={async () => { s.close(); await askNotificationPermission(); }} />
      </SheetButtons>
    </View>
  );
}
