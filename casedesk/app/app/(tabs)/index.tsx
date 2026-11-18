import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Section, Card, T, Pill, IconBubble, Chips, Segmented, Note, Grid, Columns, GlassButton, tap } from '../../src/components/ui';
import { useLayout, tileWidth } from '../../src/lib/layout';
import { visaLabel, useProfile } from '../../src/lib/profile';
import { useFamily } from '../../src/lib/family';
import { people, initials } from '../../src/lib/people';
import { runChecks } from '../../src/lib/compliance';
import { useTheme } from '../../src/theme';
import { fetchNews } from '../../src/lib/api';
import { NewsItem, STARTER_NEWS } from '../../src/data/news';
import { useCases } from '../../src/lib/store';
import { stageOf } from '../../src/lib/caseStatus';
import { setNewsCache } from '../../src/lib/newsCache';
import { NewsCard } from '../../src/components/NewsCard';

const FILTERS = ['All', 'H-1B', 'L-1', 'OPT', 'I-9', 'Fees', 'Wages', 'Green card'] as const;
type F = (typeof FILTERS)[number];

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const [news, setNews] = useState<NewsItem[]>(STARTER_NEWS);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<F>('All');
  const [kind, setKind] = useState<'official' | 'news'>('official');
  const [profile] = useProfile();
  const [family] = useFamily();
  const everyone = people(profile, family).filter((x) => x.profile);
  const checks = profile ? runChecks(profile) : [];
  const top = checks.find((c) => c.tone === 'red') ?? checks.find((c) => c.tone === 'amber');
  const [refreshing, setRefreshing] = useState(false);
  const [cases] = useCases();
  const L = useLayout();

  const load = async () => {
    const r = await fetchNews();
    const sorted = [...r.items].sort((a, b) => b.date.localeCompare(a.date));
    setNews(sorted); setLive(r.live); setNewsCache(sorted);
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => news.filter((n) => (n.kind ?? 'official') === kind).filter((n) => filter === 'All' || n.tags.some((tg) => tg === filter || (filter === 'OPT' && tg === 'STEM OPT'))), [news, filter, kind]);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: t.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.sub} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      showsVerticalScrollIndicator={false}
    >
      <Screen
        title="Overview"
        subtitle={today}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GlassButton icon="notifications-outline" label="Alerts" onPress={() => router.push('/alerts')} />
            <GlassButton icon="person-circle-outline" label="Profile" onPress={() => router.push('/profile')} />
          </View>
        }
        scroll={false}
      >
        <Columns ratio={1.25} left={<>
        {/* Status for everyone */}
        <Section title="Status" note="Your family’s visa dates and anything that needs action." action={everyone.length ? 'Open' : undefined} onAction={() => router.push('/status')}>
          {everyone.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {everyone.map((x, i) => {
                const cs = runChecks(x.profile!);
                const tp = cs.find((c) => c.tone === 'red') ?? cs.find((c) => c.tone === 'amber');
                const col = tp?.tone === 'red' ? t.red : tp ? t.amber : t.green;
                return (
                  <Pressable key={x.id} onPress={() => router.push(`/status/person?id=${x.id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <T v="h3" style={{ fontSize: 13 }}>{x.named ? initials(x.name) : x.id === 'me' ? 'Me' : x.relation[0]}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ fontSize: 15 }}>{x.short} · {visaLabel(x.profile)}</T>
                      <T v="small" numberOfLines={1} style={{ marginTop: 1 }}>{tp ? tp.title : 'All good'}</T>
                    </View>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} />
                  </Pressable>
                );
              })}
            </Card>
          ) : (
            <Card onPress={() => router.push('/status/add')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconBubble name="documents-outline" size={42} />
              <View style={{ flex: 1 }}>
                <T v="h3">Add your documents</T>
                <T v="sub" style={{ marginTop: 2 }}>Scan your I-94, I-797, passport and visa — CaseDesk reads the dates and reminds you.</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.faint} />
            </Card>
          )}
        </Section>

        {/* Cases strip */}
        <Section title="Case status" note="USCIS receipts you’re tracking." action={cases.length ? 'See all' : undefined} onAction={() => router.push('/cases')}>
          {cases.length === 0 ? (
            <Card onPress={() => router.push('/case/add')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconBubble name="add" size={42} />
              <View style={{ flex: 1 }}>
                <T v="h3">Track a USCIS case</T>
                <T v="sub" style={{ marginTop: 2 }}>Add your receipt number — e.g. IOE, EAC, WAC.</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.faint} />
            </Card>
          ) : (
            <ScrollView horizontal={!L.wide} scrollEnabled={!L.wide} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: L.wide ? 0 : -20 }} contentContainerStyle={{ paddingHorizontal: L.wide ? 0 : 20, gap: 10 }}>
              {cases.map((c) => {
                const st = stageOf(c.status);
                return (
                  <Card key={c.receipt} onPress={() => router.push(`/case/${c.receipt}`)} style={{ width: L.wide ? undefined : 230 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <T v="label">{c.form ?? 'Case'}</T>
                      <Pill label={st.short} tone={st.tone === 'neutral' ? 'neutral' : st.tone} small />
                    </View>
                    <T v="h3" style={{ marginTop: 10 }} numberOfLines={1}>{c.nickname || c.receipt}</T>
                    <T v="sub" style={{ marginTop: 3 }} numberOfLines={2}>{c.status ?? 'Tap to check status'}</T>
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 14 }}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= st.step && c.status ? (st.tone === 'red' ? t.red : st.tone === 'amber' ? t.amber : st.tone === 'green' ? t.green : t.accent) : t.surface2 }} />
                      ))}
                    </View>
                  </Card>
                );
              })}
            </ScrollView>
          )}
        </Section>

        {/* Quick tools */}
        <Section title="Quick tools" note="Most-used checks — more in Tools." action="All tools" onAction={() => router.push('/tools')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { icon: 'airplane-outline', label: 'Can I travel?', sub: 'Trip check', to: '/tools/travel', tone: 'accent' },
              { icon: 'calendar-outline', label: 'Priority date', sub: 'Is it current?', to: '/tools/priority-date', tone: 'amber' },
              { icon: 'calendar-number-outline', label: 'Visa Bulletin', sub: 'By country', to: '/tools/bulletin', tone: 'amber' },
              { icon: 'time-outline', label: 'Processing times', sub: 'By form', to: '/tools/times', tone: 'neutral' },
            ].map((q) => (
              <Card key={q.label} onPress={() => router.push(q.to as any)} style={{ width: tileWidth(2), paddingVertical: 14 }}>
                <IconBubble name={q.icon as any} tone={q.tone as any} />
                <T v="h3" style={{ marginTop: 12 }}>{q.label}</T>
                <T v="small" style={{ marginTop: 2 }}>{q.sub}</T>
              </Card>
            ))}
          </View>
        </Section>
        </>} right={<>
        {/* Updates */}
        <View style={{ marginTop: 26, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, color: t.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 }}>Updates</Text>
        </View>
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <Text style={{ flex: 1, color: t.sub, fontSize: 13 }}>Rule changes from USCIS, DOL and State — plus news coverage.</Text>
          <Pill label={live ? 'Live' : 'Built-in'} tone={live ? 'green' : 'neutral'} small />
        </View>
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <Segmented options={[{ label: 'Official', value: 'official' }, { label: 'News & analysis', value: 'news' }]} value={kind} onChange={setKind} />
          {kind === 'news' ? <View style={{ marginTop: 10 }}><Note>From news sites and law firms on the web — not government sources. Check the official update before acting.</Note></View> : null}
        </View>
        <View style={{ marginTop: 12, marginBottom: 12 }}>
          <Chips options={FILTERS.map((f) => ({ label: f, value: f }))} value={filter} onChange={setFilter} />
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          {shown.map((n) => <NewsCard key={n.id} n={n} onPress={() => router.push(`/news/${n.id}`)} />)}
          {shown.length === 0 ? <T v="sub" style={{ textAlign: 'center', marginTop: 20 }}>No updates for this filter yet.</T> : null}
        </View>
        </>} />
        <View style={{ height: Platform.OS !== 'web' ? 24 : L.wide ? 30 : 110 }} />
      </Screen>
    </ScrollView>
  );
}
