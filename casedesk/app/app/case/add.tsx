import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Field, Button, T, Note, Card } from '../../src/components/ui';
import { RECEIPT_RE, normalizeReceipt, CENTERS } from '../../src/lib/caseStatus';
import { upsertCase } from '../../src/lib/store';
import { useProfile } from '../../src/lib/profile';
import { useFamily } from '../../src/lib/family';
import { people } from '../../src/lib/people';
import { Chips } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

export default function AddCase() {
  const t = useTheme();
  const router = useRouter();
  const [receipt, setReceipt] = useState('');
  const [nickname, setNickname] = useState('');
  const [owner, setOwner] = useState('me');
  const [me] = useProfile();
  const [family] = useFamily();
  const plist = people(me, family);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = normalizeReceipt(receipt);
  const valid = RECEIPT_RE.test(r);
  const center = CENTERS[r.slice(0, 3)];

  const save = async () => {
    setBusy(true); setError('');
    try {
      await upsertCase({ receipt: r, nickname: nickname.trim() || (owner !== 'me' ? plist.find((x) => x.id === owner)?.name : undefined), owner, history: [] });
      router.replace({ pathname: '/case/[id]', params: { id: r, check: '1' } });
    } catch (e: any) { setError(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <DetailScreen title="Add a case" modal>
      <View style={{ padding: 20 }}>
        <T v="h1">Track a case</T>
        <T v="sub" style={{ marginTop: 6, marginBottom: 22 }}>Find the receipt number at the top left of your Form I-797C notice.</T>
        <Field label="Receipt number" placeholder="IOE0123456789" autoCapitalize="characters" autoCorrect={false} value={receipt} onChangeText={setReceipt} maxLength={16} style={{ fontSize: 20, letterSpacing: 1.5, fontWeight: '600' }} />
        {r.length >= 3 ? (
          <T v="small" style={{ marginTop: -6, marginBottom: 14, color: valid ? t.green : r.length >= 13 ? t.red : t.sub }}>
            {valid ? `✓ ${center ?? 'USCIS'}` : r.length >= 13 ? 'That doesn’t look like a USCIS receipt number' : `${center ? center + ' · ' : ''}3 letters + 10 digits — ${Math.max(0, r.replace(/^[A-Z]+/, '').length)} of 10 digits entered`}
          </T>
        ) : null}
        {plist.length > 1 ? (
          <>
            <T v="label" style={{ marginBottom: 8 }}>Whose case</T>
            <View style={{ marginHorizontal: -20, marginBottom: 14 }}><Chips options={plist.map((x) => ({ label: x.short, value: x.id }))} value={owner} onChange={setOwner} /></View>
          </>
        ) : null}
        <Field label="Nickname (optional)" placeholder="e.g. My H-1B extension" value={nickname} onChangeText={setNickname} />
        {error ? <View style={{ marginBottom: 12 }}><Note tone="red">{error}</Note></View> : null}
        <View style={{ marginTop: 8 }}>
          {busy ? <ActivityIndicator color={t.text} style={{ paddingVertical: 14 }} /> : <Button label="Add & check on USCIS" icon="search" onPress={save} disabled={!valid} />}
        </View>
        <Card style={{ marginTop: 24, backgroundColor: t.surface2 }}>
          <T v="label">Privacy</T>
          <T v="sub" style={{ marginTop: 6 }}>USCIS Case Status opens in Safari with your receipt number ready to paste. Copy the result and CaseDesk fills in the case. Nothing is sent to CaseDesk servers; cases stay on this phone.</T>
        </Card>
      </View>
    </DetailScreen>
  );
}
