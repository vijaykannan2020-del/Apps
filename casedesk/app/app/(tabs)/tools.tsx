import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Section, Card, Row, T, Grid } from '../../src/components/ui';
import { BULLETIN } from '../../src/data/bulletin';

type Item = { icon: any; title: string; sub: string; to: string; tone?: any };
const GROUPS: { title: string; tone: any; items: Item[] }[] = [
  {
    title: 'My plans', tone: 'accent', items: [
      { icon: 'airplane-outline', title: 'Can I travel?', sub: 'Visa, I-94, passport and AP checked for your trip dates', to: '/tools/travel' },
      { icon: 'calendar-outline', title: 'Priority date', sub: 'See if your green card date is current; get an alert', to: '/tools/priority-date' },
      { icon: 'flag-outline', title: 'Green card planner', sub: 'Your PERM → I-140 → I-485 steps, AC21 and 6-year dates', to: '/tools/gc-planner' },
    ],
  },
  {
    title: 'Look up', tone: 'amber', items: [
      { icon: 'calendar-number-outline', title: 'Visa Bulletin', sub: `${BULLETIN.month} cutoff dates by category and country`, to: '/tools/bulletin' },
      { icon: 'time-outline', title: 'Processing times', sub: 'How long USCIS is taking for I-129, I-485, I-765…', to: '/tools/times' },
      { icon: 'trending-up', title: 'Prevailing wage', sub: 'DOL wage levels I–IV by county and job (OFLC data)', to: '/tools/wage' },
      { icon: 'cash-outline', title: 'Fees', sub: 'USCIS and employer fees for H-1B, L-1, green card', to: '/tools/fees' },
      { icon: 'hourglass-outline', title: 'Visa appointment waits', sub: 'Interview wait times by US consulate; dropbox rules', to: '/tools/visa-waits' },
      { icon: 'briefcase-outline', title: 'LCA / PERM status', sub: 'Look up a Department of Labor case on FLAG', to: '/tools/dol-status' },
      { icon: 'business-outline', title: 'Employer H-1B data', sub: 'H-1B approvals and denials by employer (USCIS data)', to: '/tools/employers' },
    ],
  },
  {
    title: 'Learn', tone: 'green', items: [
      { icon: 'book-outline', title: 'Visa guides', sub: 'Plain-English guides: H-1B, L-1, TN, OPT, H-4, green card', to: '/guides' },
      { icon: 'ticket-outline', title: 'H-1B lottery', sub: 'Registration dates, weighted odds by wage level, cap-gap', to: '/tools/h1b-lottery' },
      { icon: 'ribbon-outline', title: 'Citizenship test', sub: '128 official civics questions, flashcards and mock test', to: '/tools/civics' },
      { icon: 'id-card-outline', title: 'I-9 documents', sub: 'Which documents prove work authorization, by visa', to: '/tools/i9' },
    ],
  },
  {
    title: 'For HR', tone: 'neutral', items: [
      { icon: 'people-outline', title: 'Employer dashboard', sub: 'Team expiries, I-9 reverification, CSV import/export', to: '/tools/employer' },
    ],
  },
];

export default function Tools() {
  const router = useRouter();
  return (
    <Screen title="Tools" subtitle="Checks, lookups and guides">
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
