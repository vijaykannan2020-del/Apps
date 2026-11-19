// Settings (v2.7): a platform-native settings page pushed from the profile avatar on Home (and the
// gear in Profile) — no longer a tab. iOS: large title, inset grouped rows with icon tiles. Android:
// Material 3 preference list under a top app bar with a back arrow. One <SettingsList> draws both.
// Deep link: casedesk://settings (app/settings.tsx).
import React, { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fmt } from '../core/dates';
import { RULES_CHECKED } from '../core/rules/catalog';
import { useFamily } from '../data/FamilyProvider';
import { canUseBiometrics, authenticate } from '../native/device';
import { askNotificationPermission } from '../native/reminders';
import { Avatar, Button, ChipToggle, Chips, Group, LargeTitle, Row, Screen, SectionHeader, Segmented, SettingsList, SheetButtons, Switch, T, Why, font, listOS, useSheet, useToast, TourTarget, useTour } from '../ui';
import { back, go, LegalFooter, replace, statusLabel } from './common';
import { useThemeChoice } from './themeChoice';
import { Confirm } from './sheets';
import { BackupSheet, DiagSheet, RestoreSheet, WipeSheet, leadText } from './profile';
import { ICloudRows } from './icloud';
import { HELP } from '../content/help';
import { NotifyRows } from './notify';
import { FamilyWalletRow, WidgetRows } from './wallet';

export function SettingsScreen() {
  const f = useFamily();
  const sheet = useSheet();
  const toast = useToast();
  const theme = useThemeChoice();
  const os = listOS();
  const tour = useTour('settings');
  const params = useLocalSearchParams<{ backup?: string }>();
  useEffect(() => { if (params.backup === '1') { router.setParams({ backup: undefined } as never); setTimeout(() => sheet.open('Back up now', <BackupSheet />), 350); } }, [params.backup, sheet]);
  const lastBackup = f.settings.lastBackupAt ? fmt(f.settings.lastBackupAt.slice(0, 10)) : 'Never';
  let version = '2.1';
  try { version = require('expo-constants').default?.expoConfig?.version ?? version; } catch {}
  const me = f.main;
  const faceId = async (on: boolean) => {
    if (on && !(await canUseBiometrics())) { toast('Set up Face ID or a passcode in the system settings first'); return; }
    if (on && !(await authenticate('Turn on Face ID lock'))) return;
    await f.actions.updateSettings({ faceId: on, hideInSwitcher: on }); toast(on ? 'Face ID on' : 'Face ID off');
  };
  return (
    <Screen tour={tour} nav={os === 'android' ? { back: 'Back', onBack: back, title: 'Settings', appBar: 'android' } : { back: 'Back', onBack: back }}>
      <SettingsList os={os}>
        {os === 'ios' ? <View style={{ marginTop: -8, marginBottom: 14, marginHorizontal: 2 }}><LargeTitle title="Settings" /></View> : null}
        {/* Profile at the top, like the Apple ID row: you, your family and per-person reminders */}
        {me ? (
          <Group>
            <Row onPress={() => go('/profile')} label={`${me.name}. Profile, family and reminders`}
              title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Avatar name={me.name} tone="sky" size={os === 'ios' ? 'md' : 'sm'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={[font.headline, os === 'ios' ? { fontSize: 20 } : {}]} numberOfLines={1}>{me.name}</T>
                  <T tone="text2" style={font.foot} numberOfLines={1}>{`Profile · ${statusLabel(me, f.records[me.id], f.results[me.id])} · ${f.people.length} in family`}</T>
                </View>
              </View>} />
          </Group>
        ) : null}

        <SectionHeader>Appearance</SectionHeader>
        <Group>
          <Row icon={theme.value === 'light' ? 'sun' : 'moon'} iconPastel="butter" title="Appearance">
            <Segmented options={['System', 'Light', 'Dark']} value={theme.value[0].toUpperCase() + theme.value.slice(1)} onChange={(v) => theme.set(v.toLowerCase() as never)} />
          </Row>
        </Group>

        <SectionHeader>Privacy &amp; Face ID</SectionHeader>
        <Group>
          <Row icon="face" iconPastel="sage" title="Face ID lock" subtitle="Also hides documents in the app switcher" trailing={<Switch value={!!f.settings.faceId} label="Face ID lock" onValueChange={faceId} />} />
          <Row icon="shield" iconPastel="sage" title="Privacy" subtitle="Your documents stay on this phone" onPress={() => go('/help/privacy')} />
        </Group>

        <SectionHeader>Notifications</SectionHeader>
        <NotifyRows />
        <Group style={{ marginTop: os === 'ios' ? 12 : 0 }}>
          <Row icon="bell" iconPastel="butter" title="Default reminders" value={os === 'ios' ? undefined : undefined} subtitle={leadText(f.settings.reminderLeadDays, ' · ')} onPress={() => sheet.open('Default reminders', <ReminderDefaults />)} />
          <Row icon="users" iconPastel="butter" title="Per person" subtitle="Reminders on or off for each person" onPress={() => go('/profile')} />
          <Row icon="gear" iconPastel="mint" title="Open system settings" subtitle="Notifications, permissions and language for this app" chevron={false} onPress={() => { Linking.openSettings().catch(() => toast('Couldn’t open the system settings')); }} />
        </Group>

        <SectionHeader>Backup &amp; iCloud</SectionHeader>
        <TourTarget id="backup"><Group>
          <ICloudRows />
          <Row icon="share" title="Back up to a file" subtitle={`Files, Google Drive or AirDrop · last: ${lastBackup}`} onPress={() => sheet.open('Back up now', <BackupSheet />)} chevron={false} />
          <Row icon="restore" title="Restore from backup" subtitle="From a .casedesk file" onPress={() => sheet.open('Restore from backup', <RestoreSheet />)} chevron={false} />
        </Group></TourTarget>

        <SectionHeader>Widgets &amp; Wallet</SectionHeader>
        <WidgetRows />
        <FamilyWalletRow />

        <SectionHeader>Help</SectionHeader>
        <TourTarget id="helpsec"><Group>
          <Row icon="help" iconPastel="blush" title="Help topics" subtitle={`${HELP.length} short guides`} onPress={() => go('/help')} />
          <Row icon="play" iconPastel="blush" title="How Immigration Wallet works" subtitle="A 4-screen tour" onPress={() => go('/tour')} />
          <Row icon="users" iconPastel="blush" title="Example family" subtitle="Look around with made-up data" chevron={false} onPress={() => sheet.open('Load the example family?', <Confirm body="Everything on this phone is replaced by a made-up H-1B family. Back up first if you need your data." action="Load example" onConfirm={() => { try { router.dismissAll(); } catch {} replace('/demo'); }} />)} />
          <Row icon="bulb" iconPastel="blush" title="Show tips on every screen" subtitle="Off: only the harder screens show tips; tap ? anywhere" trailing={<Switch value={!!f.settings.toursAll} label="Show tips on every screen" onValueChange={(on) => { f.actions.updateSettings({ toursAll: on, toursOff: false }); toast(on ? 'Tips show once on every screen' : 'Tips only on the harder screens'); }} />} />
          <Row icon="refresh" iconPastel="blush" title="Show all tips again" subtitle="Replays the tips on every screen once" chevron={false} onPress={async () => { await f.actions.updateSettings({ toursSeen: [], toursOff: false, toursAll: true, helpSeen: [] }); toast('Tips will show again on every screen'); tour.start(); }} />
        </Group></TourTarget>

        <SectionHeader>About</SectionHeader>
        <Group>
          <Row icon="info" iconPastel="mint" title="About Immigration Wallet" value={`v${version}`} subtitle="Data sources, privacy, licences" onPress={() => go('/about')} />
          <Row icon="hr" iconPastel="mint" title="Show HR tools" subtitle="Expiring documents across the family" trailing={<Switch value={!!f.settings.hrTools} label="Show HR tools" onValueChange={(on) => f.actions.updateSettings({ hrTools: on })} />} />
          <Row icon="list" iconPastel="mint" title="Diagnostics" subtitle="Send this if something goes wrong" chevron={false} onPress={() => sheet.open('Diagnostics', <DiagSheet />)} />
        </Group>

        <SectionHeader>Delete all data</SectionHeader>
        <Group>
          <Row icon="trash" iconTone="red" title="Delete all data" titleTone="red" subtitle="Removes everything from this phone" chevron={false} onPress={() => sheet.open('Delete all data?', <WipeSheet />)} />
        </Group>
        <LegalFooter asOf={fmt(RULES_CHECKED)} />
      </SettingsList>
    </Screen>
  );
}
/** Old name (the Settings tab until v2.6). */
export const SettingsTab = SettingsScreen;

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
