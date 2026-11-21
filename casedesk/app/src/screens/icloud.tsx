// Settings → iCloud backup rows, the turn-on sheet, and "Restore from iCloud" (Settings + Welcome).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { fmt } from '../core/dates';
import { useFamily } from '../data/FamilyProvider';
import { backUpToICloud, iCloudBackups, icloudSettings, readICloudBackup, type ICloudFile } from '../data/icloudBackup';
import { iCloudSupport, supportText, type Support } from '../native/icloud';
import { forgetPassword, hasKeychain, savePassword } from '../native/secret';
import { Button, Field, Group, Hint, Meter, Note, Row, Screen, SheetButtons, Spinner, Switch, T, Why, font, useSheet, useToast, TourButton, TourScope, TourTarget, useSheetTour } from '../ui';
import { RestorePanel } from './profile';
import { back, home } from './common';

const when = (iso?: string) => { if (!iso) return 'Never'; try { const d = new Date(iso); return `${fmt(iso.slice(0, 10))} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; } catch { return fmt(iso.slice(0, 10)); } };

export function useICloudSupport() {
  const [s, setS] = useState<Support | null>(null);
  useEffect(() => { iCloudSupport().then(setS).catch(() => setS({ ok: false, reason: 'old-build' })); }, []);
  return s;
}

/** Rows for Settings → Backup & restore. */
export function ICloudRows() {
  const f = useFamily(); const sheet = useSheet(); const toast = useToast();
  const sup = useICloudSupport();
  const ic = icloudSettings(f.settings);
  const [busy, setBusy] = useState(false);
  if (!sup) return <Row icon="backup" title="iCloud backup" subtitle="Checking iCloud…" />;
  if (!sup.ok) return <Row icon="backup" title="iCloud backup" subtitle={supportText(sup)} />;
  const set = (patch: Partial<typeof ic>) => f.actions.updateSettings({ icloud: { ...ic, ...patch } });
  const now = async () => {
    if (!hasKeychain() || !ic.on) { sheet.open('Back up to iCloud', <ICloudPasswordSheet mode="once" />); return; }
    setBusy(true); const r = await backUpToICloud(f.store); setBusy(false);
    toast(r.ok ? 'Backed up to iCloud' : r.error ?? 'Couldn’t back up to iCloud');
  };
  return (
    <>
      <Row icon="backup" title="iCloud backup" subtitle={ic.on ? `Automatic · daily and after changes · keeps the last 3` : 'Off — turn on to back up automatically'}
        trailing={<Switch value={ic.on} label="iCloud backup" onValueChange={async (on) => {
          if (on) { sheet.open('Turn on iCloud backup', <ICloudPasswordSheet mode="enable" />); return; }
          await set({ on: false }); await forgetPassword(); toast('iCloud backup off');
        }} />} />
      {ic.on ? <Row icon="globe" title="Only on Wi-Fi" subtitle="Skip automatic backups on cellular" trailing={<Switch value={ic.wifiOnly} label="Only on Wi-Fi" onValueChange={(v) => set({ wifiOnly: v })} />} /> : null}
      <Row icon="clock" title="Last iCloud backup" subtitle={ic.lastError ? `${when(ic.lastAt)} · last try failed: ${ic.lastError}` : when(ic.lastAt)} />
      <Row icon="refresh" title={busy ? 'Backing up…' : 'Back up to iCloud now'} chevron={false} onPress={busy ? undefined : now} />
      <Row icon="restore" title="Restore from iCloud" subtitle="Your last 3 iCloud backups" onPress={() => sheet.open('Restore from iCloud', <ICloudRestore onDone={sheet.close} />)} chevron={false} />
    </>
  );
}

/** Password for iCloud backups: once (kept in the keychain) to turn on automatic backup, or for one backup. */
export function ICloudPasswordSheet({ mode }: { mode: 'enable' | 'once' }) {
  const f = useFamily(); const s = useSheet(); const toast = useToast();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0);
  const keychain = hasKeychain();
  const tour = useSheetTour('icloud');
  const go = async () => {
    if (pw.length < 8) { toast('Use at least 8 characters'); return; }
    if (pw !== pw2) { toast('The passwords don’t match'); return; }
    setBusy(true);
    if (mode === 'enable' && keychain) {
      if (!(await savePassword(pw))) { setBusy(false); toast('Couldn’t save the password in the keychain'); return; }
      await f.actions.updateSettings({ icloud: { ...icloudSettings(f.settings), on: true } });
    }
    const r = await backUpToICloud(f.store, pw, (x) => setPct(Math.round(x * 100)));
    setBusy(false); s.close();
    toast(r.ok ? (mode === 'enable' ? 'iCloud backup on · first backup done' : 'Backed up to iCloud') : r.error ?? 'Couldn’t back up to iCloud');
  };
  return (
    <TourScope tour={tour}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><TourTarget id="toggle" style={{ flex: 1 }}><Why>{mode === 'enable'
        ? 'Like WhatsApp: Immigration Wallet backs up to your iCloud every day and after you change something, and keeps the last 3 backups. The file is locked with this password — Apple can’t read it, and neither can we.'
        : 'One backup to your iCloud, locked with this password.'}</Why></TourTarget><TourButton /></View>
      {mode === 'enable' && !keychain ? <Note tone="amber">This version can’t keep the password in the keychain, so backups can’t run on their own. Update the app from the App Store for automatic backups.</Note> : null}
      <TourTarget id="password"><Field label="Backup password" value={pw} onChangeText={setPw} secure placeholder="At least 8 characters" autoCapitalize="none" /></TourTarget>
      <Field label="Type it again" value={pw2} onChangeText={setPw2} secure autoCapitalize="none" />
      <Hint>{keychain ? 'Kept in this iPhone’s keychain for automatic backups. You’ll need it to restore on a new phone — we can’t recover it.' : 'You’ll need it to restore — we can’t recover it.'}</Hint>
      {busy ? <View style={{ marginTop: 12 }}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Spinner /><T tone="text2" style={font.foot}>{`Backing up… ${pct}%`}</T></View><Meter value={pct} max={100} /></View> : null}
      <SheetButtons><Button kind="ghost" title="Cancel" onPress={s.close} /><Button grow title={mode === 'enable' ? 'Turn on' : 'Back up'} busy={busy} onPress={go} /></SheetButtons>
    </TourScope>
  );
}

/** Pick one of the iCloud backups, then the usual restore (password → replace or merge). */
export function ICloudRestore({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const sup = useICloudSupport();
  const [files, setFiles] = useState<ICloudFile[] | null>(null);
  const [picked, setPicked] = useState<{ text: string; name: string } | null>(null);
  useEffect(() => { if (sup?.ok) iCloudBackups().then(setFiles).catch(() => setFiles([])); }, [sup?.ok]);
  if (!sup) return <Spinner />;
  if (!sup.ok) return <View><Why>{supportText(sup)}</Why><SheetButtons><Button grow title="OK" onPress={onDone} /></SheetButtons></View>;
  if (picked) return <RestorePanel initial={picked} onDone={onDone} onCancel={() => setPicked(null)} />;
  return (
    <View>
      <Why>Choose a backup. You’ll need its password.</Why>
      {files == null ? <View style={{ marginTop: 14 }}><Spinner /></View> : files.length ? (
        <Group style={{ marginTop: 12 }}>
          {files.map((x, i) => <Row key={x.name} icon="backup" title={i === 0 ? 'Latest backup' : `Backup ${i + 1}`} subtitle={when(x.at)} onPress={async () => {
            try { setPicked({ text: await readICloudBackup(x.name), name: x.name }); } catch { toast('Couldn’t download this backup from iCloud yet — try again in a moment'); }
          }} />)}
        </Group>
      ) : <Note tone="blue">No Immigration Wallet backups in this iCloud account yet.</Note>}
      <SheetButtons><Button kind="ghost" title="Close" onPress={onDone} /></SheetButtons>
    </View>
  );
}

/** Welcome → Restore from iCloud (a new phone). */
export function ICloudRestoreScreen() {
  return (
    <Screen nav={{ back: 'Welcome', onBack: back, title: 'Restore' }}>
      <T a11y="header" style={font.title}>Restore from iCloud</T>
      <ICloudRestore onDone={home} />
    </Screen>
  );
}

/** Home card after a restore: iCloud backup is off on this phone until it's turned on here. */
export function ICloudAfterRestore() {
  const f = useFamily(); const sheet = useSheet();
  const sup = useICloudSupport();
  if (!f.settings.icloudAsk || !sup?.ok || icloudSettings(f.settings).on) return null;
  const dismiss = () => f.actions.updateSettings({ icloudAsk: false });
  return (
    <Note tone="blue" style={{ marginTop: 12 }} actions={<>
      <Button size="sm" kind="tint" title="Turn on" onPress={() => { dismiss(); sheet.open('Turn on iCloud backup', <ICloudPasswordSheet mode="enable" />); }} />
      <Button size="sm" kind="ghost" title="Not now" onPress={dismiss} />
    </>}>
      <T style={[font.sub, { fontWeight: '600' }]}>Turn on iCloud backup on this phone?</T>
      <T tone="text2" style={[font.foot, { marginTop: 2 }]}>Your data was restored. Backups from the old phone’s settings aren’t copied — set a password to back up from this phone.</T>
    </Note>
  );
}

/** Settings → Backup (owner-approved preview, Nov 2026): one status, two big buttons, the two switches,
 *  then the other ways (file backup, restore from a file, import a family member's share file). */
export function backupSummary(settings: Parameters<typeof icloudSettings>[0] & { lastBackupAt?: string }): string {
  const ic = icloudSettings(settings);
  if (ic.on) return `iCloud · ${when(ic.lastAt)}`;
  return settings.lastBackupAt ? `File · ${fmt(settings.lastBackupAt.slice(0, 10))}` : 'Not backed up yet';
}
export function BackupPage({ fileBackup, fileRestore, importShared }: { fileBackup: () => void; fileRestore: () => void; importShared: React.ReactNode }) {
  const f = useFamily(); const sheet = useSheet(); const toast = useToast();
  const sup = useICloudSupport();
  const ic = icloudSettings(f.settings);
  const [busy, setBusy] = useState(false);
  const ok = !!sup?.ok;
  const set = (patch: Partial<typeof ic>) => f.actions.updateSettings({ icloud: { ...ic, ...patch } });
  const now = async () => {
    if (!ok) { fileBackup(); return; }
    if (!hasKeychain() || !ic.on) { sheet.open('Back up to iCloud', <ICloudPasswordSheet mode="once" />); return; }
    setBusy(true); const r = await backUpToICloud(f.store); setBusy(false);
    toast(r.ok ? 'Backed up to iCloud' : r.error ?? 'Couldn’t back up to iCloud');
  };
  const restore = () => {
    if (!ok) { fileRestore(); return; }
    sheet.open('Restore', (
      <View>
        <Group>
          <Row icon="backup" title="From iCloud" subtitle="Your last 3 iCloud backups" onPress={() => sheet.open('Restore from iCloud', <ICloudRestore onDone={sheet.close} />)} />
          <Row icon="restore" title="From a backup file" subtitle="A file you saved to Files, Drive or AirDrop" onPress={() => { sheet.close(); setTimeout(fileRestore, 300); }} />
        </Group>
        <SheetButtons><Button kind="ghost" title="Cancel" onPress={sheet.close} /></SheetButtons>
      </View>
    ));
  };
  const backedUp = ok && ic.on && !!ic.lastAt;
  const status = !sup ? 'Checking iCloud…' : backedUp ? 'Backed up to iCloud' : ic.on ? 'iCloud backup is on' : f.settings.lastBackupAt ? 'Backed up to a file' : 'Not backed up yet';
  const detail = !sup ? '' : !ok ? supportText(sup) : ic.on ? `${when(ic.lastAt)} · automatic, daily and after changes · last 3 kept${ic.lastError ? ` · last try failed: ${ic.lastError}` : ''}` : f.settings.lastBackupAt ? `${fmt(f.settings.lastBackupAt.slice(0, 10))} · turn on iCloud backup to keep it up to date` : 'Turn on iCloud backup, or back up to a file';
  return (
    <>
      <Group>
        <Row icon={backedUp || f.settings.lastBackupAt ? 'check' : 'backup'} iconTone={backedUp ? 'green' : undefined} title={status} subtitle={detail} chevron={false} />
      </Group>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Button grow title={busy ? 'Backing up…' : 'Back up now'} busy={busy} onPress={now} />
        <Button grow kind="ghost" title="Restore" onPress={restore} />
      </View>
      {ok ? (
        <Group style={{ marginTop: 16 }}>
          <Row icon="backup" title="Automatic iCloud backup" subtitle={ic.on ? 'Daily and after changes · keeps the last 3' : 'Off'}
            trailing={<Switch value={ic.on} label="Automatic iCloud backup" onValueChange={async (on) => {
              if (on) { sheet.open('Turn on iCloud backup', <ICloudPasswordSheet mode="enable" />); return; }
              await set({ on: false }); await forgetPassword(); toast('iCloud backup off');
            }} />} />
          {ic.on ? <Row icon="globe" title="Only on Wi-Fi" subtitle="Skip automatic backups on cellular" trailing={<Switch value={ic.wifiOnly} label="Only on Wi-Fi" onValueChange={(v) => set({ wifiOnly: v })} />} /> : null}
        </Group>
      ) : null}
      <T tone="text2" style={[font.foot, { marginTop: 22, marginBottom: 6, marginLeft: 4 }]}>Other ways</T>
      <Group>
        <Row icon="share" title="Back up to a file" subtitle={`Files, Google Drive or AirDrop · last: ${f.settings.lastBackupAt ? fmt(f.settings.lastBackupAt.slice(0, 10)) : 'never'}`} onPress={fileBackup} chevron={false} />
        <Row icon="restore" title="Restore from a file" subtitle="From a backup file you saved" onPress={fileRestore} chevron={false} />
        {importShared}
      </Group>
    </>
  );
}
