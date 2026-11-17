import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Section, Card, Row, T, Grid } from '../../src/components/ui';
import { BULLETIN } from '../../src/data/bulletin';

type Item = { icon: any; title: string; sub: string; to: string; tone?: any };
const GROUPS: { title: string; tone: any; items: Item[] }[] = [
  {
    title: 'My plans', tone: 'accent', items: [
      { icon: 'airplane-outline', title: 'Can I travel?', sub: 'Check a trip', to: '/tools/travel' },
      { icon: 'calendar-outline', title: 'Priority date', sub: 'Alert when current', to: '/tools/priority-date' },
      { icon: 'flag-outline', title: 'Green card planner', sub: 'PERM → I-140 → I-485', to: '/tools/gc-planner' },
    ],
  },
  {
    title: 'Look up', tone: 'amber', items: [
      { icon: 'calendar-number-outline', title: 'Visa Bulletin', sub: BULLETIN.month, to: '/tools/bulletin' },
      { icon: 'time-outline', title: 'Processing times', sub: 'By form', to: '/tools/times' },
      { icon: 'trending-up', title: 'Prevailing wage', sub: 'Level I–IV', to: '/tools/wage' },
      { icon: 'cash-outline', title: 'Fees', sub: 'Filing costs', to: '/tools/fees' },
      { icon: 'hourglass-outline', title: 'Visa appointment waits', sub: 'By consulate', to: '/tools/visa-waits' },
      { icon: 'briefcase-outline', title: 'LCA / PERM status', sub: 'DOL case search', to: '/tools/dol-status' },
      { icon: 'business-outline', title: 'Employer H-1B data', sub: 'Approvals by company', to: '/tools/employers' },
    ],
  },
  {
    title: 'Learn', tone: 'green', items: [
      { icon: 'book-outline', title: 'Visa guides', sub: 'H-1B, L-1, TN, OPT, H-4, GC', to: '/guides' },
      { icon: 'ticket-outline', title: 'H-1B lottery', sub: 'How selection works', to: '/tools/h1b-lottery' },
      { icon: 'ribbon-outline', title: 'Citizenship test', sub: 'Practice the civics test', to: '/tools/civics' },
      { icon: 'id-card-outline', title: 'I-9 documents', sub: 'What to show', to: '/tools/i9' },
    ],
  },
  {
    title: 'For HR', tone: 'neutral', items: [
      { icon: 'people-outline', title: 'Employer dashboard', sub: 'Team expiries & I-9', to: '/tools/employer' },
    ],
  },
];

export default function Tools() {
  const router = useRouter();
  return (
    <Screen title="Tools">
      <Grid gap={0}>
        {GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            <Card style={{ paddingVertical: 4 }}>
              {g.items.map((it, i) => (
                <Row key={it.to} icon={it.icon} tone={g.tone} title={it.title} subtitle={it.sub} onPress={() => router.push(it.to as any)} last={i === g.items.length - 1} />
              ))}
            </Card>
          </Section>
        ))}
      </Grid>
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <T v="small" style={{ textAlign: 'center' }}>Information only — not legal advice.</T>
      </View>
    </Screen>
  );
}
