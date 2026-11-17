import React from 'react';
import { View, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { DetailScreen } from '../src/components/TopBar';
import { Card, T, Section, Row, Pill } from '../src/components/ui';
import { isLive, API_BASE } from '../src/lib/api';
import { useCases, useI9 } from '../src/lib/store';

export default function About() {
  const router = useRouter();
  const [cases] = useCases();
  const [i9] = useI9();
  return (
    <DetailScreen title="Settings">
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <T v="h1">CaseDesk</T>
        <T v="sub" style={{ marginTop: 4 }}>Tracker & toolkit for USCIS · v{Constants.expoConfig?.version}</T>
      </View>
      <Section title="Notifications">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="notifications-outline" tone="accent" title="Alerts" subtitle="Reminders, case updates, news and Visa Bulletin" onPress={() => router.push('/alerts')} last />
        </Card>
      </Section>
      <Section title="Connection">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="cloud-outline" tone={isLive() ? 'green' : 'amber'} title="CaseDesk server" subtitle={isLive() ? API_BASE : 'Not connected — demo mode'} right={<Pill label={isLive() ? 'Live' : 'Demo'} tone={isLive() ? 'green' : 'amber'} small />} />
          <Row icon="phone-portrait-outline" tone="neutral" title="Stored on this phone" subtitle={`${cases.length} cases · ${i9.length} I-9 records`} last />
        </Card>
      </Section>
      <Section title="Where the data comes from">
        <Card style={{ paddingVertical: 4 }}>
          <Row icon="document-text-outline" tone="neutral" title="USCIS Case Status API" subtitle="developer.uscis.gov (Torch)" href={'https://developer.uscis.gov/'} />
          <Row icon="newspaper-outline" tone="neutral" title="Federal Register & newsrooms" subtitle="USCIS, DHS, DOL official notices" href={'https://www.federalregister.gov/agencies/u-s-citizenship-and-immigration-services'} />
          <Row icon="trending-up" tone="neutral" title="DOL OFLC wage data" subtitle="flag.dol.gov" href={'https://flag.dol.gov/wage-data/wage-search'} />
          <Row icon="bar-chart-outline" tone="neutral" title="H-1B Employer Data Hub" subtitle="uscis.gov" href={'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub'} last />
        </Card>
      </Section>
      <Section title="Disclaimer">
        <Card>
          <T v="sub">CaseDesk is an independent app. It is not affiliated with, endorsed by, or sponsored by USCIS, DHS, the Department of Labor or any government agency. Information comes from public government sources and is provided for general information only — it is not legal advice. Always confirm with the official source or an immigration attorney.</T>
        </Card>
      </Section>
    </DetailScreen>
  );
}
