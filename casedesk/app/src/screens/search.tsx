// v2.9 search from Home: one field, results grouped by section, tap goes straight to the screen.
// The index is built on the phone from what is already saved here; nothing is sent anywhere.
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { search, STATIC_ITEMS, type SearchItem } from '../core/search';
import { docTitle } from '../core/docs';
import { fmt } from '../core/dates';
import { useFamily, type FamilyState } from '../data/FamilyProvider';
import { HELP } from '../content/help';
import { Group, Hint, Icon, Row, Screen, SectionHeader, T, font, radius, useTheme, MIN_TOUCH } from '../ui';
import { back, go, relationLabel, statusLabel } from './common';
import { TOOLS } from './tools';

const DOC_ICON: Record<string, string> = { People: 'user', Documents: 'doc', Cases: 'list', Tools: 'grid', Help: 'help', Community: 'chat' };

/** Everything searchable, from the family on this phone plus the app's own screens. */
export function searchIndex(f: FamilyState): SearchItem[] {
  const name = (id: string) => f.people.find((p) => p.id === id)?.name ?? '';
  const people: SearchItem[] = f.people.map((p) => ({ id: `p:${p.id}`, section: 'People', title: p.name, sub: `${relationLabel(p)} · ${statusLabel(p, f.records[p.id], f.results[p.id])}`, path: `/person/${p.id}`, keywords: [f.records[p.id]?.legalName ?? '', f.records[p.id]?.visa ?? ''] }));
  const docs: SearchItem[] = f.docs.map((d) => ({
    id: `d:${d.id}`, section: 'Documents', title: docTitle(d), sub: [name(d.ownerId), d.fields.validTo ? `ends ${fmt(d.fields.validTo)}` : undefined].filter(Boolean).join(' · '), path: `/document/${d.id}`,
    keywords: [d.type, d.fields.form ?? '', d.fields.receipt ?? '', d.fields.category ?? '', d.fields.classOfAdmission ?? '', name(d.ownerId), d.type === 'visa' ? 'visa stamp' : '', d.type === 'ead' ? 'work permit' : '', d.type === 'green-card' ? 'green card' : '', d.type === 'advance-parole' ? 'advance parole' : ''],
  }));
  const cases: SearchItem[] = f.caseList.map((c) => ({ id: `c:${c.id}`, section: 'Cases', title: `${c.form ?? 'Case'} · ${c.name}`, sub: [name(c.ownerId), c.status, c.receipt].filter(Boolean).join(' · '), path: `/case/${encodeURIComponent(c.id)}`, keywords: [c.receipt ?? '', c.form ?? ''] }));
  const tools: SearchItem[] = TOOLS.flatMap(([, list]) => list).map((t) => ({ id: `t:${t.id}`, section: 'Tools', title: t.title, sub: t.sub, path: `/tools/${t.id}`, keywords: [t.id] }));
  const help: SearchItem[] = HELP.map((h) => ({ id: `h:${h.id}`, section: h.id === 'community' ? 'Community' : 'Help', title: h.title, sub: h.sub, path: `/help/${h.id}`, keywords: h.body.slice(0, 3) }));
  const seen = new Set(tools.map((t) => t.path));
  return [...people, ...docs, ...cases, ...tools, ...STATIC_ITEMS.filter((s) => !seen.has(s.path)), ...help];
}

export function SearchScreen() {
  const f = useFamily();
  const t = useTheme();
  const [q, setQ] = useState('');
  const index = useMemo(() => searchIndex(f), [f]);
  const groups = useMemo(() => search(index, q), [index, q]);
  return (
    <Screen keyboard nav={{ back: 'Home', onBack: back, title: 'Search' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.field, borderRadius: radius.field, paddingHorizontal: 12, minHeight: MIN_TOUCH, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }}>
        <Icon name="search" size={18} color={t.text2} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="People, documents, GC, EAD, stamping…" placeholderTextColor={t.text3} accessibilityLabel="Search"
          autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" style={[font.body, { flex: 1, color: t.text, minHeight: MIN_TOUCH }]} />
        {q ? <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}><Icon name="x" size={16} color={t.text2} /></Pressable> : null}
      </View>
      {!q ? <Hint style={{ marginHorizontal: 4 }}>Searches what is saved on this phone and the app’s screens. Try GC, EAD, AP, stamping, a name or a receipt number.</Hint> : null}
      {q && !groups.length ? <T tone="text2" style={[font.sub, { marginTop: 20, textAlign: 'center' }]}>{`Nothing found for “${q}”.`}</T> : null}
      {groups.map((g) => (
        <View key={g.section}>
          <SectionHeader>{g.section}</SectionHeader>
          <Group>
            {g.items.map((it) => <Row key={it.id} icon={DOC_ICON[g.section]} title={it.title} subtitle={it.sub} onPress={() => go(it.path, it.params)} />)}
          </Group>
        </View>
      ))}
    </Screen>
  );
}
