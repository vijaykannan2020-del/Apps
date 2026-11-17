import React, { useCallback, useState } from 'react';
import { View, Switch } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Field, Button, T, Chips, DateField, Note, Divider } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { VISA_TYPES, VisaType, Profile, loadProfile, saveProfile, usesEAD, hasPetition } from '../../src/lib/profile';

export default function EditStatus() {
  const t = useTheme();
  const router = useRouter();
  const [p, setP] = useState<Profile>({ visa: 'H-1B' });
  const [existing, setExisting] = useState(false);
  // Reload when coming back (e.g. after scanning a document that filled some dates)
  useFocusEffect(useCallback(() => { loadProfile().then((v) => { if (v) { setP(v); setExisting(true); } }); }, []));
  const set = (k: keyof Profile) => (v: any) => setP({ ...p, [k]: v });
  const ok = (s?: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
  const valid = [p.i94Expiry, p.petitionEnd, p.passportExpiry, p.visaStampExpiry, p.eadExpiry, p.statusStart, p.extFiled].every(ok);

  return (
    <DetailScreen title={existing ? 'Edit my status' : 'Set up my status'}>
      <View style={{ paddingHorizontal: 20 }}>
        <T v="sub" style={{ marginBottom: 14 }}>Copy the dates from your I-94, approval notice (I-797), passport and EAD — or scan them. Everything stays on this phone.</T>
        <View style={{ marginBottom: 16 }}><Button label="Scan a document to fill dates" icon="scan" kind="secondary" onPress={() => router.push('/status/vault?add=1')} /></View>
        <T v="label" style={{ marginBottom: 8 }}>Current status</T>
      </View>
      <Chips options={VISA_TYPES.map((v) => ({ label: v, value: v }))} value={p.visa} onChange={(v) => set('visa')(v as VisaType)} />
      <View style={{ padding: 20 }}>
        <Field label="Employer" placeholder="e.g. HCL America Inc." value={p.employer ?? ''} onChangeText={set('employer')} />
        <DateField label="I-94 “Admit Until” date" value={p.i94Expiry} onChange={set('i94Expiry')} hint="From i94.cbp.dhs.gov — the date that controls your stay." />
        {hasPetition(p.visa) || p.visa === 'H-4' || p.visa === 'H-4 EAD' || p.visa === 'L-2S' ? <DateField label="Approval notice valid to (I-797)" value={p.petitionEnd} onChange={set('petitionEnd')} /> : null}
        <DateField label="Passport expires" value={p.passportExpiry} onChange={set('passportExpiry')} />
        <DateField label="Visa stamp expires" value={p.visaStampExpiry} onChange={set('visaStampExpiry')} hint="Only matters for travel." />
        {usesEAD(p.visa) ? <DateField label="EAD card valid to" value={p.eadExpiry} onChange={set('eadExpiry')} /> : null}
        {['H-1B', 'L-1A', 'L-1B'].includes(p.visa) ? <DateField label={`First day in ${p.visa.startsWith('L') ? 'L-1' : 'H-1B'} status`} value={p.statusStart} onChange={set('statusStart')} hint="Starts the 6-year (H-1B), 7-year (L-1A) or 5-year (L-1B) clock." /> : null}
        {p.visa === 'H-1B' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <T v="h3" style={{ flex: 1, fontSize: 15 }}>I have an approved I-140</T>
            <Switch value={!!p.i140Approved} onValueChange={set('i140Approved')} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
          </View>
        ) : null}
        <Divider />
        <T v="h3" style={{ marginBottom: 4 }}>Extension or renewal filed?</T>
        <T v="sub" style={{ marginBottom: 12 }}>Add it so CaseDesk can check it was filed in time.</T>
        <DateField label="Date filed (receipt date)" value={p.extFiled} onChange={set('extFiled')} />
        <Field label="Receipt number" placeholder="e.g. WAC2690012345" autoCapitalize="characters" value={p.extReceipt ?? ''} onChangeText={set('extReceipt')} />
        {!valid ? <View style={{ marginBottom: 12 }}><Note tone="red">Check the dates — use YYYY-MM-DD.</Note></View> : null}
        <Button label="Save" onPress={async () => { await saveProfile(p); router.back(); }} disabled={!valid} />
        {existing ? <View style={{ marginTop: 10 }}><Button label="Clear my status" kind="secondary" icon="trash-outline" onPress={async () => { await saveProfile(null); router.back(); }} /></View> : null}
      </View>
    </DetailScreen>
  );
}
