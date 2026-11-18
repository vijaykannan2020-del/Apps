// Profile: who you are, your family, reminders, privacy and your data — like any standard app's account page.
import React, { useEffect, useState } from 'react';
import { View, Switch, Alert, Platform, Share } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DetailScreen } from '../src/components/TopBar';
import { Card, T, Section, Row, Note } from '../src/components/ui';
import { useTheme } from '../src/theme';
import { visaLabel, useProfile } from '../src/lib/profile';
import { useFamily } from '../src/lib/family';
import { people, initials } from '../src/lib/people';
import { useVault, getLock, setLock, deleteDoc } from '../src/lib/vault';
import { useCases } from '../src/lib/store';
import { versionLine } from '../src/lib/version';

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const [me] = useProfile();
  const [family] = useFamily();
  const [docs] = useVault();
  const [cases] = useCases();
  const [lock, setLockState] = useState(false);
  const list = people(me, family);
  const self = list[0];
  useEffect(() => { getLock().then(setLockState); }, []);

  const toggleLock = async (on: boolean) => {
    if (on && Platform.OS !== 'web') {
      const LA = require('expo-local-authentication');
      if (!(await LA.hasHardwareAsync()) || !(await LA.isEnrolledAsync())) { Alert.alert('Face ID / passcode not set up', 'Turn on Face ID or a passcode in Settings first.'); return; }
      const r = await LA.authenticateAsync({ promptMessage: 'Lock documents with Face ID' });
      if (!r.success) return;
    }
    await setLock(on); setLockState(on);
  };

  const exportData = async () => {
    const keys = ['cd.profile.v1', 'cd.family.v1', 'cd.cases.v1', 'cd.vault.v1', 'cd.gc.v1', 'cd.pd.v1', 'cd.i9.v1', 'cd.alerts.v1'];
    const out: Record<string, unknown> = { exported: new Date().toISOString(), app: 'CaseDesk' };
    for (const k of keys) { try { const v = await AsyncStorage.getItem(k); if (v) out[k] = JSON.parse(v); } catch {} }
    await Share.share({ message: JSON.stringify(out, null, 2), title: 'CaseDesk data' });
  };

  const deleteAll = () => {
    const go = async () => {
      for (const d of docs) { try { await deleteDoc(d); } catch {} }
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('cd.'));
      await AsyncStorage.multiRemove(keys);
      router.replace('/');
    };
    if (Platform.OS === 'web') { go(); return; }
    Alert.alert('Delete everything?', 'Removes your status, family, cases, documents and settings from this phone. This can’t be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete all', style: 'destructive', onPress: go }]);
  };

  return (
    <DetailScreen title="Profile">
      <View style={{ alignItems: 'center', paddingTop: 4, paddingHorizontal: 20 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 30, fontWeight: '800', color: '#fff' }}>{self.named ? initials(self.name) : 'Me'}</T>
        </View>
        <T v="h1" style={{ marginTop: 12, textAlign: 'center' }}>{self.named ? self.name : 'Your profile'}</T>
        <T v="sub" style={{ marginTop: 4, textAlign: 'center' }}>{me ? `${visaLabel(me)}${me.employer ? ' · ' + me.employer : ''}` : 'Add your name and status'}</T>
      </View>

      <Section title="Me">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="person-outline" tone="accent" title={self.named ? 'Name & status' : 'Add your name'} subtitle="Name, visa, dates and employer" onPress={() => router.push('/status/edit')} />
          <Row icon="documents-outline" tone="accent" title="My documents" subtitle={`${docs.filter((d) => (d.owner || 'me') === 'me').length} saved`} onPress={() => router.push('/status/person?id=me' as any)} last />
        </Card>
      </Section>

      <Section title="Family" note="Each person has their own dates, documents, cases and reminders.">
        <Card style={{ paddingVertical: 4 }}>
          {list.slice(1).map((x) => (
            <Row key={x.id} icon="person-circle-outline" tone="neutral" title={x.named ? x.name : `${x.relation} (add name)`} subtitle={`${x.relation}${x.profile ? ' · ' + visaLabel(x.profile) : ''}`} onPress={() => router.push(`/status/person?id=${x.id}` as any)} />
          ))}
          <Row icon="person-add-outline" tone="accent" title="Add family member" subtitle="Spouse, child or parent" onPress={() => router.push('/status/edit?member=new' as any)} last />
        </Card>
      </Section>

      <Section title="Notifications">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="notifications-outline" tone="accent" title="Reminders & alerts" subtitle="Who to remind, how early, case updates, news" onPress={() => router.push('/alerts')} last />
        </Card>
      </Section>

      <Section title="Privacy & security">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <T v="h3" style={{ fontSize: 15 }}>Lock documents with Face ID</T>
              <T v="small" style={{ marginTop: 2 }}>Ask for Face ID / passcode before opening documents</T>
            </View>
            <Switch value={lock} onValueChange={toggleLock} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
          </View>
          <View style={{ marginTop: 12 }}><Note>No account, no sign-in. Your status, family details and documents stay on this phone; only receipt numbers are looked up with USCIS.</Note></View>
        </Card>
      </Section>

      <Section title="Your data">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="phone-portrait-outline" tone="neutral" title="On this phone" subtitle={`${list.length} ${list.length === 1 ? 'person' : 'people'} · ${cases.length} cases · ${docs.length} documents`} />
          <Row icon="download-outline" tone="neutral" title="Export my data" subtitle="Your details as a file (documents themselves stay on the phone)" onPress={exportData} />
          <Row icon="trash-outline" tone="red" title="Delete all my data" subtitle="Remove everything from this phone" onPress={deleteAll} last />
        </Card>
      </Section>

      <Section title="About">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="information-circle-outline" tone="neutral" title="About CaseDesk" subtitle={versionLine()} onPress={() => router.push('/about')} last />
        </Card>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}><T v="small" style={{ textAlign: 'center' }}>Not affiliated with USCIS or any government agency. Not legal advice.</T></View>
    </DetailScreen>
  );
}
