import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Section, Card, T, Pill, IconBubble, Row, Button, Grid, tap } from '../../src/components/ui';
import { useLayout, tileWidth } from '../../src/lib/layout';
import { useTheme } from '../../src/theme';
import { useProfile, usesEAD } from '../../src/lib/profile';
import { runChecks, fmt, daysTo } from '../../src/lib/compliance';
import { useVault } from '../../src/lib/vault';

function DateTile({ label, value }: { label: string; value?: string }) {
  const t = useTheme();
  const L = useLayout();
  const d = daysTo(value);
  const color = d === null ? t.faint : d < 0 ? t.red : d <= 90 ? t.amber : t.text;
  return (
    <Card style={{ width: tileWidth(L.tiles), paddingVertical: 14 }}>
      <T v="label">{label}</T>
      <T v="h3" style={{ marginTop: 6, color: value ? t.text : t.faint }}>{value ? fmt(value) : 'Not added'}</T>
      {d !== null ? <T v="small" style={{ marginTop: 2, color }}>{d < 0 ? `${-d} days ago` : `${d} days left`}</T> : null}
    </Card>
  );
}

export default function Status() {
  const t = useTheme();
  const router = useRouter();
  const [p, ready] = useProfile();
  const [docs] = useVault();
  const checks = p ? runChecks(p) : [];
  const issues = checks.filter((c) => c.tone === 'red' || c.tone === 'amber').length;

  return (
    <Screen
      title="My Status"
      subtitle={p ? `${p.visa}${p.employer ? ' · ' + p.employer : ''}` : 'Your own compliance'}
      right={p ? (
        <Pressable onPress={() => { tap(); router.push('/status/edit'); }} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name="create-outline" size={19} color={t.text} />
        </Pressable>
      ) : undefined}
    >
      {ready && !p ? (
        <Section>
          <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
            <IconBubble name="shield-checkmark-outline" size={56} />
            <T v="h2" style={{ marginTop: 16 }}>Track your own status</T>
            <T v="sub" style={{ textAlign: 'center', marginTop: 6, maxWidth: 280 }}>Add your visa type and key dates (I-94, approval, passport, EAD). CaseDesk checks them and warns you before anything lapses.</T>
            <View style={{ marginTop: 18, alignSelf: 'stretch' }}><Button label="Set up my status" onPress={() => router.push('/status/edit')} /></View>
            <T v="small" style={{ marginTop: 12 }}>Saved only on this phone.</T>
          </Card>
        </Section>
      ) : null}

      {p ? (
        <>
          <Section>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconBubble name={issues ? 'alert-circle' : 'shield-checkmark'} tone={checks.some((c) => c.tone === 'red') ? 'red' : issues ? 'amber' : 'green'} size={46} />
              <View style={{ flex: 1 }}>
                <T v="h2">{issues ? `${issues} thing${issues > 1 ? 's' : ''} to act on` : 'You’re in good shape'}</T>
                <T v="sub" style={{ marginTop: 2 }}>Checked {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} from your saved dates</T>
              </View>
            </Card>
          </Section>

          <Section title="Checks">
            <Grid>{checks.map((c) => (
              <Card key={c.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IconBubble name={c.icon as any} tone={c.tone === 'neutral' ? 'neutral' : c.tone} size={34} />
                  <View style={{ flex: 1 }}>
                    <T v="h3" style={{ lineHeight: 21 }}>{c.title}</T>
                    <T v="sub" style={{ marginTop: 4 }}>{c.detail}</T>
                  </View>
                </View>
              </Card>
            ))}</Grid>
          </Section>

          <Section title="Key dates" action="Edit" onAction={() => router.push('/status/edit')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <DateTile label="I-94 admit until" value={p.i94Expiry} />
              <DateTile label="Approval valid to" value={p.petitionEnd} />
              <DateTile label="Passport" value={p.passportExpiry} />
              <DateTile label="Visa stamp" value={p.visaStampExpiry} />
              {usesEAD(p.visa) ? <DateTile label="EAD card" value={p.eadExpiry} /> : null}
              {p.extFiled ? <DateTile label="Extension filed" value={p.extFiled} /> : null}
            </View>
          </Section>
        </>
      ) : null}

      <Section title="My documents" action={docs.length ? 'Open' : undefined} onAction={() => router.push('/status/vault')}>
        <Card onPress={() => router.push('/status/vault')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconBubble name="folder-open-outline" tone="amber" size={42} />
          <View style={{ flex: 1 }}>
            <T v="h3">{docs.length ? `${docs.length} document${docs.length > 1 ? 's' : ''}` : 'Store receipts & approvals'}</T>
            <T v="sub" style={{ marginTop: 2 }}>I-797s, I-94, passport, EAD, LCA — kept on this phone only.</T>
          </View>
          <Pill label="On device" tone="green" small />
        </Card>
      </Section>

      <Section title="Get your official records">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="document-text-outline" title="Download my latest I-94" subtitle="CBP · Get Most Recent I-94 → passport details → print/save PDF" href="https://i94.cbp.dhs.gov/search/recent-search" />
          <Row icon="airplane-outline" title="My travel history" subtitle="CBP · past 10 years of entries and exits" href="https://i94.cbp.dhs.gov/search/history-search" />
          <Row icon="person-circle-outline" title="myUSCIS account" subtitle="Receipts, approvals and notices filed online" href="https://my.uscis.gov/" />
          <Row icon="search-outline" title="USCIS case status" subtitle="egov.uscis.gov" href="https://egov.uscis.gov/" last />
        </Card>
      </Section>

      <Section title="How to read your I-94">
        <Card>
          {[
            ['Class of admission', 'Must match your current visa (e.g. H1B, L1A, H4).'],
            ['Admit Until Date', 'Your stay ends on this date — not the visa stamp date.'],
            ['Wrong date?', 'If it’s shorter than your approval and not due to your passport, ask CBP Deferred Inspection to correct it.'],
            ['After every trip', 'You get a new I-94 on each entry. Download it and add it here.'],
          ].map(([a, b], i) => (
            <View key={a} style={{ paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
              <T v="h3" style={{ fontSize: 14 }}>{a}</T>
              <T v="sub" style={{ marginTop: 2 }}>{b}</T>
            </View>
          ))}
        </Card>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <T v="small" style={{ textAlign: 'center' }}>Checks are reminders based on your dates — not legal advice.</T>
      </View>
    </Screen>
  );
}
