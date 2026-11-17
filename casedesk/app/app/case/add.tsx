import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Field, Button, T, Note, Card } from '../../src/components/ui';
import { RECEIPT_RE, normalizeReceipt, CENTERS } from '../../src/lib/caseStatus';
import { fetchCase } from '../../src/lib/api';
import { upsertCase } from '../../src/lib/store';
import { useTheme } from '../../src/theme';

export default function AddCase() {
  const t = useTheme();
  const router = useRouter();
  const [receipt, setReceipt] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = normalizeReceipt(receipt);
  const valid = RECEIPT_RE.test(r);
  const center = CENTERS[r.slice(0, 3)];

  const save = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetchCase(r);
      await upsertCase({ receipt: r, nickname: nickname.trim() || undefined, form: res.form, status: res.status, detail: res.detail, updated: res.updated, history: res.history, demo: res.demo });
      router.replace(`/case/${r}`);
    } catch (e: any) {
      setError(e.message || 'Could not reach USCIS. Saved — try again later.');
      await upsertCase({ receipt: r, nickname: nickname.trim() || undefined, history: [] });
    } finally { setBusy(false); }
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
        <Field label="Nickname (optional)" placeholder="e.g. My H-1B extension" value={nickname} onChangeText={setNickname} />
        {error ? <View style={{ marginBottom: 12 }}><Note tone="red">{error}</Note></View> : null}
        <View style={{ marginTop: 8 }}>
          {busy ? <ActivityIndicator color={t.text} style={{ paddingVertical: 14 }} /> : <Button label="Check status" icon="search" onPress={save} disabled={!valid} />}
        </View>
        <Card style={{ marginTop: 24, backgroundColor: t.surface2 }}>
          <T v="label">Privacy</T>
          <T v="sub" style={{ marginTop: 6 }}>The app checks the official USCIS Case Status page (egov.uscis.gov) from this phone. Only the receipt number goes to USCIS. Cases are stored on this phone.</T>
        </Card>
      </View>
    </DetailScreen>
  );
}
