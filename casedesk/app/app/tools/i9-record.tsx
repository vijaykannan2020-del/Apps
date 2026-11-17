import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Field, Button, T, Chips, Note, DateField, Divider } from '../../src/components/ui';
import { useI9, saveI9, removeI9 } from '../../src/lib/store';
import { VISAS } from '../../src/data/visas';

const DOCS: Record<string, string> = {
  h1b: 'Passport + I-94 (H-1B)', l1: 'Passport + I-94 (L-1)', lblanket: 'Passport + I-94 (L-1)', tn: 'Passport + I-94 (TN)',
  opt: 'EAD card (C3B)', stem: 'EAD card (C3C)', h4ead: 'EAD card (C26)', l2s: 'I-94 (L-2S) + ID', gc: 'EAD card (C9)',
};

export default function I9Record() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [records] = useI9();
  const existing = records.find((r) => r.id === id);
  const visas = VISAS.filter((v) => v.i9);
  const [name, setName] = useState(existing?.name ?? '');
  const [visa, setVisa] = useState(visas.find((v) => v.code === existing?.visa)?.id ?? 'h1b');
  const [doc, setDoc] = useState(existing?.doc ?? DOCS.h1b);
  const [expires, setExpires] = useState(existing?.expires ?? '');
  const [team, setTeam] = useState(existing?.team ?? '');
  const [i94, setI94] = useState(existing?.i94 ?? '');
  const [petitionEnd, setPetitionEnd] = useState(existing?.petitionEnd ?? '');
  const [ead, setEad] = useState(existing?.ead ?? '');
  const [passport, setPassport] = useState(existing?.passport ?? '');
  const okd = (v: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(expires) && [i94, petitionEnd, ead, passport].every(okd);

  const pickVisa = (v: string) => { setVisa(v); setDoc(DOCS[v] ?? ''); };
  const save = async () => {
    await saveI9({ id: existing?.id ?? String(Date.now()), name: name.trim(), visa: visas.find((v) => v.id === visa)?.code ?? existing?.visa ?? '—', doc, expires, team: team.trim() || undefined, i94: i94 || undefined, petitionEnd: petitionEnd || undefined, ead: ead || undefined, passport: passport || undefined, notes: existing?.notes });
    router.back();
  };

  return (
    <DetailScreen title={existing ? 'Edit employee' : 'New employee'} modal>
      <View style={{ padding: 20 }}>
        <Field label="Employee" placeholder="Name" value={name} onChangeText={setName} />
        <T v="label" style={{ marginBottom: 8 }}>Visa type</T>
      </View>
      <View style={{ marginTop: -14, marginBottom: 14 }}>
        <Chips options={visas.map((v) => ({ label: v.code, value: v.id }))} value={visa} onChange={pickVisa} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Field label="Document" value={doc} onChangeText={setDoc} />
        <DateField label="Work authorization expires (I-9)" value={expires} onChange={setExpires} />
        <Field label="Team / department (optional)" value={team} onChangeText={setTeam} />
        <Divider />
        <T v="label" style={{ marginBottom: 8 }}>More dates (optional, for the employer dashboard)</T>
        <DateField label="I-94 admit until" value={i94} onChange={setI94} />
        <DateField label="Approval (I-797) valid to" value={petitionEnd} onChange={setPetitionEnd} />
        <DateField label="EAD valid to" value={ead} onChange={setEad} />
        <DateField label="Passport expires" value={passport} onChange={setPassport} />
        <View style={{ marginBottom: 14 }}><Note>Reverify on or before this date. For a timely-filed H-1B, L-1 or TN extension you may continue up to 240 days.</Note></View>
        <Button label="Save" onPress={save} disabled={!valid} />
        {existing ? <View style={{ marginTop: 10 }}><Button label="Delete" kind="secondary" icon="trash-outline" onPress={async () => { await removeI9(existing.id); router.back(); }} /></View> : null}
      </View>
    </DetailScreen>
  );
}
