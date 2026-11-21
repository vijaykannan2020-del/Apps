// Family tab, "Who's in your family?" (from Home, anytime) and "Add family member".
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { Person, Relation, StatusCategory } from '../core/model';
import { dependentStatusFor, } from '../core/model';
import { today } from '../core/dates';
import { useFamily } from '../data/FamilyProvider';
import { newId } from '../data/store';
import { Avatar, Button, Card, Chip, ChipToggle, Chips, EmptyState, H1, Icon, IconButton, LargeTitle, NavButton, Pill, Screen, Stack, T, Tag, Why, font, radius, useTheme, useToast, MIN_TOUCH } from '../ui';
import { ReviewChip, go, home, locationChip, relationLabel, runFlow, statusLabel, untilText } from './common';
import { reasonLine } from '../core/review';
import { BirthCountryField, statusGroups } from './sheets';
import { SelectField } from '../ui';
import { PersonBody } from './person';
// Wallet status cards: on each person's page and in Settings → Face ID & privacy (not on the Family list)
import { ShareRow } from './share';
import { StatusView } from './priority';
import { Columns, LinkButton, useLayout, TourButton, TourTarget, useTour } from '../ui';

export function FamilyTab() {
  const f = useFamily();
  const t = useTheme();
  const L = useLayout();
  const [sel, setSel] = useState<string | undefined>(undefined);
  const selected = L.twoCol ? (f.people.find((p) => p.id === sel) ?? f.people[0])?.id : undefined;
  const tour = useTour('family');
  return (
    <Screen tabRoot wide paneRatio={0.8} tour={tour} panes={{ left: <>
      <LargeTitle title="Family" right={<TourButton />} />
      <T tone="text2" style={[font.sub, { marginTop: 2 }]}>{`${f.people.length} ${f.people.length === 1 ? 'person' : 'people'} · saved only on this phone`}</T>
      {f.people.length ? (
        <TourTarget id="list"><Stack style={{ marginTop: 20 }}>
          {f.people.map((p) => {
            const r = f.records[p.id], res = f.results[p.id];
            return (
              <Card key={p.id} onPress={() => (L.twoCol ? setSel(p.id) : go(`/person/${p.id}`))} label={`${p.name}, ${res ? res.worst : ''}`} style={selected === p.id ? { borderWidth: 2, borderColor: t.text } : { borderWidth: 2, borderColor: 'transparent' }}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <Avatar name={p.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <T style={[font.body, { fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>{p.name}</T>
                      {res ? <ReviewChip findings={res.findings} until={res.facts.statusUntil} worst={res.worst} name={p.name} /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <T tone="text2" style={font.sub}>{`${relationLabel(p)} · ${statusLabel(p, r, res)}`}</T>
                      <Chip text={locationChip(p, r)} />
                    </View>
                    <T tone="text2" style={[font.sub, { marginTop: 6 }]}>{untilText(p, r, res)}</T>
                    {res && reasonLine(res.findings, res.facts.statusUntil) ? <T tone={res.worst === 'act' ? 'red' : 'amber'} numberOfLines={1} style={[font.foot, { marginTop: 2, fontWeight: '600' }]}>{reasonLine(res.findings, res.facts.statusUntil)}</T> : null}
                  </View>
                </View>
              </Card>
            );
          })}
        </Stack></TourTarget>
      ) : <EmptyState small icon="users" title="No family members yet" />}
      <TourTarget id="add"><AddButton title="Add family member" onPress={() => go('/add-member')} /></TourTarget>
      <ShareRow />
      {L.twoCol ? null : <StatusView title="Family documents" />}
      </>, right: selected ? <View style={{ marginTop: 4 }}><PersonBody key={selected} id={selected} single /><LinkButton title="Open full page" onPress={() => go(`/person/${selected}`)} /></View> : null }} />
  );
}

export function AddButton({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderRadius: radius.row, paddingHorizontal: 18, paddingVertical: 12, marginTop: 10, minHeight: MIN_TOUCH, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.pastel.mint, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} color={t.ink} weight="semibold" /></View>
      <T style={[font.callout, { fontWeight: '600' }]}>{title}</T>
    </Pressable>
  );
}

type Draft = { id: string; name: string; relation: Relation; status: StatusCategory; isNew?: boolean; touched?: boolean; birthCountry?: string };

function PersonForm({ d, onChange, onRemove, fixedYou, index = 0 }: { d: Draft; onChange: (d: Draft) => void; onRemove?: () => void; fixedYou?: boolean; index?: number }) {
  const t = useTheme();
  const f = useFamily();
  const mainStatus = f.main?.status;
  return (
    <Card style={{ paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={d.name} size="sm" />
        <TextInput value={d.name} onChangeText={(name) => onChange({ ...d, name })} placeholder={fixedYou ? 'Your name' : 'Name'} placeholderTextColor={t.text3} autoCapitalize="words"
          accessibilityLabel={fixedYou ? 'Your name' : `Name of family member ${index}${d.relation ? ` (${d.relation})` : ''}`}
          style={[font.body, { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 12, backgroundColor: t.field, color: t.text, paddingHorizontal: 12, borderWidth: t.dark ? 0 : 1, borderColor: t.fieldBorder }]} />
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${d.name || 'person'}`} hitSlop={8} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="minus" size={24} color={t.red} />
          </Pressable>
        ) : null}
      </View>
      <Chips>
        {fixedYou ? <ChipToggle text="You" on /> : (['spouse', 'child', 'parent'] as Relation[]).map((r) => (
          <ChipToggle key={r} role="radio" text={r[0].toUpperCase() + r.slice(1)} on={d.relation === r}
            onPress={() => onChange({ ...d, relation: r, status: d.touched ? d.status : dependentStatusFor(mainStatus, r) })} />
        ))}
      </Chips>
      <SelectField label="Status" value={d.status} onChange={(status) => onChange({ ...d, status, touched: true })} groups={statusGroups()} />
      <BirthCountryField value={d.birthCountry ?? ''} onChange={(v) => onChange({ ...d, birthCountry: v || undefined })} />
    </Card>
  );
}

/** "Who's in your family?" — reachable from Home anytime; Home (top right) saves and leaves. */
export function FamilySetup() {
  const f = useFamily();
  if (!f.ready) return <Screen nav={{ title: 'Your family' }}><View /></Screen>;
  return <FamilySetupForm />;
}
function FamilySetupForm() {
  const f = useFamily();
  const toast = useToast();
  const [list, setList] = useState<Draft[]>(() => {
    const cur = f.people.map((p) => ({ id: p.id, name: p.name, relation: p.relation, status: p.status ?? 'unsure', touched: true, birthCountry: p.facts.birthCountry }));
    return cur.length > 1 ? cur : [...cur, { id: newId('p'), name: '', relation: 'spouse' as Relation, status: dependentStatusFor(f.main?.status, 'spouse'), isNew: true }];
  });
  const save = async () => {
    const keep = list.filter((d) => d.name.trim() || d.relation === 'self');
    const people: Person[] = keep.map((d) => {
      const old = f.people.find((p) => p.id === d.id);
      const base: Pick<Person, 'facts' | 'createdAt' | 'reminders'> = old ?? { facts: {}, createdAt: today(), reminders: { on: true, lead: f.settings.reminderLeadDays } };
      return { ...base, id: d.id, name: d.name.trim() || 'Person', relation: d.relation, status: d.status, facts: { ...base.facts, birthCountry: d.birthCountry ?? base.facts.birthCountry } } as Person;
    });
    const removed = f.people.filter((p) => !keep.some((d) => d.id === p.id));
    for (const p of removed) if (p.relation !== 'self') await f.actions.removePerson(p.id);
    await f.actions.savePeople(people);
    return people;
  };
  const toHome = async () => { await save(); home(); toast('Saved · add the rest anytime from Home'); };
  const toDocs = async () => {
    const people = await save();
    setTimeout(() => runFlow({ mode: 'family', pids: people.map((p) => p.id), missingOnly: true }, { ...f, people }, toast), 50);
  };
  return (
    <Screen keyboard nav={{ title: 'Your family', back: 'Home', onBack: () => router.back(), right: <NavButton title="Home" label="Save and go to Home" onPress={toHome} /> }}
      footer={<Button title="Continue to documents" onPress={toDocs} />}>
      <H1>Who’s in your family?</H1>
      <Why>Add everyone on a visa or green card — even if they’re in India now. Names are just labels; legal names come from passports.</Why>
      <Stack style={{ marginTop: 18 }}>
        {list.map((d, i) => (
          <PersonForm key={d.id} d={d} index={i} fixedYou={d.relation === 'self'} onChange={(x) => setList(list.map((y, j) => (j === i ? x : y)))}
            onRemove={d.relation === 'self' ? undefined : () => { setList(list.filter((_, j) => j !== i)); toast(`Removed ${d.name || 'person'}`); }} />
        ))}
      </Stack>
      <AddButton title="Add spouse, child or parent" onPress={() => setList([...list, { id: newId('p'), name: '', relation: 'child', status: dependentStatusFor(f.main?.status, 'child'), isNew: true }])} />
    </Screen>
  );
}

export function AddMember() {
  const f = useFamily();
  if (!f.ready) return <Screen nav={{ title: 'Add family member' }}><View /></Screen>;
  return <AddMemberForm />;
}
function AddMemberForm() {
  const f = useFamily();
  const toast = useToast();
  const [d, setD] = useState<Draft>({ id: newId('p'), name: '', relation: 'spouse', status: dependentStatusFor(f.main?.status, 'spouse'), isNew: true });
  const goNext = async () => {
    if (!d.name.trim()) { toast('Type a name first'); return; }
    const p: Person = { id: d.id, name: d.name.trim(), relation: d.relation, status: d.status, facts: d.birthCountry ? { birthCountry: d.birthCountry } : {}, createdAt: today(), reminders: { on: true, lead: f.settings.reminderLeadDays } };
    await f.actions.upsertPerson(p);
    router.back();
    setTimeout(() => runFlow({ mode: 'add', pids: [p.id], returnTo: `/person/${p.id}` }, { ...f, people: [...f.people, p], records: f.records, missing: f.missing }, toast), 80);
  };
  return (
    <Screen keyboard nav={{ title: 'Add family member', back: 'Family', onBack: () => router.back(), right: <NavButton title="Home" label="Save and go to Home" onPress={async () => { if (d.name.trim()) { await f.actions.upsertPerson({ id: d.id, name: d.name.trim(), relation: d.relation, status: d.status, facts: d.birthCountry ? { birthCountry: d.birthCountry } : {}, createdAt: today(), reminders: { on: true, lead: f.settings.reminderLeadDays } }); toast(`${d.name.trim()} saved · add documents anytime from Home`); } home(); }} /> }} footer={<Button title="Continue to documents" onPress={goNext} />}>
      <H1>Who are you adding?</H1>
      <Why>Same short form as setup. Then we’ll go through their documents.</Why>
      <View style={{ marginTop: 22 }}><PersonForm d={d} index={1} onChange={setD} /></View>
    </Screen>
  );
}
