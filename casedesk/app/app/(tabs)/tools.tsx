import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Section, Card, Row, T } from '../../src/components/ui';
import { useI9 } from '../../src/lib/store';
import { BULLETIN } from '../../src/data/bulletin';

export default function Tools() {
  const router = useRouter();
  const [records] = useI9();
  return (
    <Screen title="Tools" subtitle="Calculators, trackers & guides">
      <Section title="Timelines">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="calendar-number-outline" tone="amber" title="Visa Bulletin" subtitle={`Green card dates by country · ${BULLETIN.month}`} onPress={() => router.push('/tools/bulletin')} />
          <Row icon="time-outline" tone="amber" title="Processing times" subtitle="USCIS published times by form" onPress={() => router.push('/tools/times')} />
          <Row icon="briefcase-outline" tone="amber" title="LCA / PERM / PWD status" subtitle="DOL case status search (FLAG)" onPress={() => router.push('/tools/dol-status')} last />
        </Card>
      </Section>
      <Section title="Wages & costs">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="trending-up" title="Prevailing wage" subtitle="By state, county / metro area and occupation" onPress={() => router.push('/tools/wage')} />
          <Row icon="cash-outline" tone="green" title="Fee calculator" subtitle="H-1B, L-1, TN, OPT, H-4, green card, citizenship" onPress={() => router.push('/tools/fees')} last />
        </Card>
      </Section>
      <Section title="Form I-9">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="id-card-outline" tone="neutral" title="Acceptable documents" subtitle="What to show for each visa type" onPress={() => router.push('/tools/i9')} />
          <Row icon="people-outline" tone="neutral" title="Team I-9 records" subtitle={records.length ? `${records.length} saved · reverification dates` : 'For HR: track employees’ reverification dates'} onPress={() => router.push('/tools/i9?tab=records')} last />
        </Card>
      </Section>
      <Section title="Learn">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="book-outline" tone="accent" title="Visa guides" subtitle="H-1B, L-1, L blanket, TN, OPT, STEM, H-4, L-2S, green card, N-400" onPress={() => router.push('/guides')} last />
        </Card>
      </Section>
      <Section title="Official websites">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="pricetag-outline" tone="neutral" title="Fee schedule (G-1055)" subtitle="uscis.gov" href="https://www.uscis.gov/g-1055" />
          <Row icon="search-outline" tone="neutral" title="FLAG wage search" subtitle="flag.dol.gov" href="https://flag.dol.gov/wage-data/wage-search" />
          <Row icon="book-outline" tone="neutral" title="I-9 handbook (M-274)" subtitle="uscis.gov/i-9-central" href="https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274" last />
        </Card>
      </Section>
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <T v="small" style={{ textAlign: 'center' }}>Information only — not legal advice.</T>
      </View>
    </Screen>
  );
}
