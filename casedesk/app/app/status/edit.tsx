import React, { useCallback, useState } from 'react';
import { View, Switch } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Field, Button, T, Chips, DateField, Note, Divider } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { VisaType, Profile, loadProfile, saveProfile, usesEAD, hasPetition, visasFor, hasApprovalNotice } from '../../src/lib/profile';
import { loadFamily, saveMember, removeMember, RELATIONS } from '../../src/lib/family';

export default function EditStatus() {
  const t = useTheme();
  const router = useRouter();
  const [p, setP] = useState<Profile>({ visa: 'H-1B' });
  const { member: memberParam } = useLocalSearchParams<{ member?: string }>();
  const [existing, setExisting] = useState(false);
  const member = memberParam;
  const isMember = !!member;
  const [name, setName] = useState('');
  const [relation, setRelationRaw] = useState('Spouse');
  const options = visasFor(isMember ? relation : undefined);
  const setRelation = (r: string) => { setRelationRaw(r); const allowed = visasFor(r); if (!allowed.includes(p.visa)) setP((x) => ({ ...x, visa: allowed[0], employer: undefined })); };
  React.useEffect(() => { if (isMember && !existing && !visasFor(relation).includes(p.visa)) setP((x) => ({ ...x, visa: visasFor(relation)[0] })); }, [isMember]);
  const [memberId] = useState(() => (member && member !== 'new' ? member : String(Date.now())));
  // Reload when coming back (e.g. after scanning a document that filled some dates)
  useFocusEffect(useCallback(() => {
    if (isMember) {
      loadFamily().then((all) => { const m = all.find((x) => x.id === memberId); if (m) { setP(m.profile); setName(m.name); setRelation(m.relation); setExisting(true); } });
    } else loadProfile().then((v) => { if (v) { setP(v); setExisting(true); } });
  }, [isMember, memberId]));
  const save = async () => {
    if (isMember) await saveMember({ id: memberId, name: name.trim() || relation, relation, profile: p });
    else await saveProfile(p);
    router.back();
  };
  // Scanning fills this person's dates: save what's typed so far, then open the scanner for them.
  const scan = async () => {
    if (isMember) { await saveMember({ id: memberId, name: name.trim() || relation, relation, profile: p }); setExisting(true); router.push(`/status/vault?add=1&member=${memberId}` as any); }
    else router.push('/status/vault?add=1');
  };
  const clear = async () => { if (isMember) await removeMember(memberId); else await saveProfile(null); router.back(); };
  const set = (k: keyof Profile) => (v: any) => setP({ ...p, [k]: v });
  const ok = (s?: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
  const valid = [p.i94Expiry, p.petitionEnd, p.passportExpiry, p.visaStampExpiry, p.eadExpiry, p.statusStart, p.extFiled].every(ok);

  return (
    <DetailScreen title={isMember ? (existing ? `Edit ${name || 'family member'}` : 'Add family member') : existing ? 'Edit my status' : 'Set up my status'}>
      <View style={{ paddingHorizontal: 20 }}>
        <T v="sub" style={{ marginBottom: 14 }}>{isMember ? 'Scan their I-94, I-797, passport, visa or EAD — or pick the dates.' : 'Scan your I-94, I-797, passport, visa or EAD — or pick the dates.'} Everything stays on this phone.</T>
        {isMember ? (
          <>
            <Field label="Name" placeholder="e.g. Priya" value={name} onChangeText={setName} />
            <T v="label" style={{ marginBottom: 8 }}>Relation</T>
            <View style={{ marginHorizontal: -20, marginBottom: 14 }}><Chips options={RELATIONS.map((r) => ({ label: r, value: r }))} value={relation} onChange={setRelation} /></View>
          </>
        ) : null}
        <View style={{ marginBottom: 16 }}><Button label={isMember ? `Scan ${name.trim() || 'their'}${name.trim() ? '’s' : ''} document` : 'Scan a document to fill dates'} icon="scan" kind="secondary" onPress={scan} /></View>
        <T v="label" style={{ marginBottom: 8 }}>Current status</T>
      </View>
      <Chips options={options.map((v) => ({ label: v, value: v }))} value={p.visa} onChange={(v) => set('visa')(v as VisaType)} />
      <View style={{ padding: 20 }}>
        {!isMember && hasPetition(p.visa) ? <Field label="Employer" placeholder="e.g. HCL America Inc." value={p.employer ?? ''} onChangeText={set('employer')} /> : null}
        <DateField label="I-94 “Admit Until” date" value={p.i94Expiry} onChange={set('i94Expiry')} hint="From i94.cbp.dhs.gov — the date that controls your stay." />
        {hasApprovalNotice(p.visa) ? <DateField label="Approval notice valid to (I-797)" value={p.petitionEnd} onChange={set('petitionEnd')} /> : null}
        <DateField label="Passport expires" value={p.passportExpiry} onChange={set('passportExpiry')} />
        <DateField label="Visa stamp expires" value={p.visaStampExpiry} onChange={set('visaStampExpiry')} hint="Only matters for travel." />
        {usesEAD(p.visa) ? <DateField label="EAD card valid to" value={p.eadExpiry} onChange={set('eadExpiry')} /> : null}
        {!isMember && ['H-1B', 'L-1A', 'L-1B'].includes(p.visa) ? <DateField label={`First day in ${p.visa.startsWith('L') ? 'L-1' : 'H-1B'} status`} value={p.statusStart} onChange={set('statusStart')} hint="Starts the 6-year (H-1B), 7-year (L-1A) or 5-year (L-1B) clock." /> : null}
        {!isMember && p.visa === 'H-1B' ? (
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
        {!valid ? <View style={{ marginBottom: 12 }}><Note tone="red">Check the dates.</Note></View> : null}
        <Button label="Save" onPress={save} disabled={!valid} />
        {isMember && !existing ? <View style={{ marginTop: 10 }}><Button label="Save & add another" kind="secondary" icon="person-add-outline" disabled={!valid} onPress={async () => { await saveMember({ id: memberId, name: name.trim() || relation, relation, profile: p }); router.replace('/status/edit?member=new' as any); }} /></View> : null}
        {existing ? <View style={{ marginTop: 10 }}><Button label={isMember ? 'Remove family member' : 'Clear my status'} kind="secondary" icon="trash-outline" onPress={clear} /></View> : null}
      </View>
    </DetailScreen>
  );
}
