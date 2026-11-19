// v2.9 search from Home: one field over the whole app, results grouped by section, a tap goes
// straight to the screen. The index is built on the phone from what is saved here plus the app's
// own screens and content; queries are never sent anywhere. Recent searches stay on this phone.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { search, SUGGESTIONS, type SearchItem, type SearchSection } from '../core/search';
import { buildSearchIndex } from '../core/searchIndex';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { newsOnPhone } from '../data/news';
import { clearRecent, loadRecent, rememberSearch } from '../data/recentSearches';
import { ChipToggle, Chips, Group, Hint, Icon, LinkButton, Row, Screen, SectionHeader, T, font, radius, useTheme, MIN_TOUCH } from '../ui';
import { back, go, statusLabel } from './common';
import { TOOLS } from './tools';

const ICON: Record<SearchSection, string> = {
  People: 'user', 'Needs attention': 'alert', Documents: 'doc', Cases: 'list', 'Green card': 'idcard', Screens: 'grid', Tools: 'grid', Settings: 'gear',
  Updates: 'news', 'Visa types': 'book', Help: 'help', Checks: 'checkc', Community: 'chat',
};

/** Everything searchable on this phone. */
export function searchIndex(f: FamilyState): SearchItem[] {
  return buildSearchIndex({
    people: f.people, records: f.records, results: f.results, docs: f.docs, caseList: f.caseList,
    news: newsOnPhone(), tools: TOOLS.flatMap(([, list]) => list), statusLabel: (p) => statusLabel(p, f.records[p.id], f.results[p.id]),
  });
}

export function SearchScreen() {
  const f = useFamily();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { loadRecent().then(setRecent); }, []);
  const index = useMemo(() => searchIndex(f), [f]);
  const groups = useMemo(() => search(index, q), [index, q]);
  const remember = () => { if (q.trim().length >= 2) rememberSearch(recent, q).then(setRecent); };
  const open = (it: SearchItem) => { remember(); go(it.path, it.params); };
  const names = f.people.slice(0, 2).map((p) => p.name.split(' ')[0]);
  return (
    <Screen keyboard nav={{ back: 'Home', onBack: back, title: 'Search' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.field, borderRadius: radius.field, paddingHorizontal: 12, minHeight: MIN_TOUCH, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }}>
        <Icon name="search" size={18} color={t.text2} />
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={remember} autoFocus placeholder="Search the whole app" placeholderTextColor={t.text3} accessibilityLabel="Search"
          autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" style={[font.body, { flex: 1, color: t.text, minHeight: MIN_TOUCH }]} />
        {q ? <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}><Icon name="x" size={16} color={t.text2} /></Pressable> : null}
      </View>
      {!q ? (
        <>
          {recent.length ? (
            <>
              <SectionHeader right={<LinkButton title="Clear" onPress={() => { clearRecent(); setRecent([]); }} />}>Recent</SectionHeader>
              <Group>{recent.map((r) => <Row key={r} icon="clock" title={r} onPress={() => setQ(r)} chevron={false} />)}</Group>
            </>
          ) : null}
          <SectionHeader>Try</SectionHeader>
          <Chips style={{ marginTop: 0 }}>{[...SUGGESTIONS, ...names].map((s) => <ChipToggle key={s} role="button" text={s} onPress={() => setQ(s)} />)}</Chips>
          <Hint style={{ marginHorizontal: 4 }}>Searches people, documents, cases, every screen and setting, updates and help. Only on this phone — nothing is sent.</Hint>
        </>
      ) : null}
      {q && !groups.length ? <T tone="text2" style={[font.sub, { marginTop: 20, textAlign: 'center' }]}>{`Nothing found for “${q}”.`}</T> : null}
      {groups.map((g) => (
        <View key={g.section}>
          <SectionHeader>{g.section}</SectionHeader>
          <Group>
            {g.items.map((it) => <Row key={it.id} icon={ICON[g.section]} title={it.title} subtitle={it.sub} onPress={() => open(it)} />)}
          </Group>
        </View>
      ))}
    </Screen>
  );
}
