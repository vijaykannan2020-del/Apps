// Employer / HR dashboard: every employee's expiring dates in one place, with CSV export and import.
import React, { useMemo, useState } from 'react';
import { View, Alert, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Button, Note, Segmented, Pill, IconBubble } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useLayout, tileWidth } from '../../src/lib/layout';
import { useI9, importI9 } from '../../src/lib/store';
import { deadlines, toCsv, fromCsv, shareCsv, pickCsv } from '../../src/lib/employer';
import { fmt } from '../../src/lib/compliance';

type Range = 30 | 90 | 180 | 365;

export default function Employer() {
  const t = useTheme();
  const router = useRouter();
  const [recs] = useI9();
  const [range, setRange] = useState<Range>(90);
  const [msg, setMsg] = useState('');
  const all = useMemo(() => deadlines(recs), [recs]);
  const overdue = all.filter((d) => d.days < 0);
  const within = (n: number) => all.filter((d) => d.days >= 0 && d.days <= n);
  const list = [...overdue, ...within(range)];
  const tone = (d: number) => (d < 0 ? t.red : d <= 30 ? t.red : d <= 90 ? t.amber : t.sub);

  const doImport = async () => {
    try {
      const text = await pickCsv();
      if (!text) return;
      const { recs: got, skipped } = fromCsv(text);
      if (!got.length) { setMsg('No rows found. Use the template: a name and a work-authorization date are required.'); return; }
      await importI9(got);
      setMsg(`Imported ${got.length} employee${got.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} row${skipped > 1 ? 's' : ''} skipped (missing name or date)` : ''}.`);
    } catch (e: any) { setMsg(e.message || 'Could not read that file.'); }
  };
  const template = () => shareCsv(toCsv([{ id: 'x', name: 'Jane Doe', team: 'Engineering', visa: 'H-1B', doc: 'Passport + I-94 (H-1B)', expires: '2027-09-30', i94: '2027-09-30', petitionEnd: '2027-09-30', passport: '2030-01-15' }]), 'casedesk-template.csv');

  return (
    <DetailScreen title="Employer dashboard" right={<Pressable onPress={() => router.push('/tools/i9-record')} hitSlop={10} accessibilityLabel="Add employee"><Ionicons name="person-add-outline" size={20} color={t.text} /></Pressable>}>
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Employer dashboard</T>
        <T v="sub" style={{ marginTop: 4 }}>{recs.length} employee{recs.length === 1 ? '' : 's'} · I-9, I-94, approvals, EAD and passports</T>
      </View>

      {!recs.length ? (
        <Section>
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <IconBubble name="people-outline" size={52} />
            <T v="h2" style={{ marginTop: 12 }}>Track your team</T>
            <T v="sub" style={{ marginTop: 6, textAlign: 'center', maxWidth: 300 }}>Add employees or import a spreadsheet. CaseDesk shows what expires next and reminds you before I-9 reverification.</T>
            <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 10 }}>
              <Button label="Add an employee" icon="person-add-outline" onPress={() => router.push('/tools/i9-record')} />
              <Button label="Import CSV" kind="secondary" icon="cloud-upload-outline" onPress={doImport} />
              <Button label="Get the CSV template" kind="secondary" icon="document-outline" onPress={template} />
            </View>
          </Card>
        </Section>
      ) : (
        <>
          <Section>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[['Overdue', overdue.length, t.red], ['Next 30 days', within(30).length, t.red], ['31–90 days', within(90).length - within(30).length, t.amber], ['91–180 days', within(180).length - within(90).length, t.text]].map(([l, n, c]) => (
                <Card key={l as string} style={{ width: tileWidth(2), paddingVertical: 14 }}>
                  <T style={{ fontSize: 28, fontWeight: '800', color: (n as number) ? (c as string) : t.faint, fontVariant: ['tabular-nums'] }}>{n as number}</T>
                  <T v="small">{l as string}</T>
                </Card>
              ))}
            </View>
          </Section>
          <Section title="Coming up">
            <Segmented<any> options={[{ label: '30 days', value: 30 }, { label: '90 days', value: 90 }, { label: '6 months', value: 180 }, { label: '1 year', value: 365 }]} value={range} onChange={setRange} />
            <Card style={{ marginTop: 10, paddingVertical: 4 }}>
              {list.length ? list.map((d, i) => (
                <Pressable key={`${d.id}-${d.what}`} onPress={() => router.push(`/tools/i9-record?id=${d.id}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                  <View style={{ flex: 1 }}>
                    <T v="h3" style={{ fontSize: 15 }}>{d.name}</T>
                    <T v="small">{d.what} · {fmt(d.date)}</T>
                  </View>
                  <T v="h3" style={{ color: tone(d.days), fontVariant: ['tabular-nums'] }}>{d.days < 0 ? `${-d.days}d ago` : `${d.days}d`}</T>
                </Pressable>
              )) : <T v="sub" style={{ paddingVertical: 12 }}>Nothing due in this window.</T>}
            </Card>
          </Section>
          <Section title="Employees">
            <Card style={{ paddingVertical: 4 }}>
              {[...recs].sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => {
                const next = all.find((d) => d.id === r.id && d.days >= 0);
                return (
                  <Pressable key={r.id} onPress={() => router.push(`/tools/i9-record?id=${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ fontSize: 15 }}>{r.name}</T>
                      <T v="small">{r.visa}{r.team ? ` · ${r.team}` : ''}{next ? ` · next: ${next.what.toLowerCase()} ${fmt(next.date)}` : ''}</T>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={t.faint} />
                  </Pressable>
                );
              })}
            </Card>
          </Section>
          <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
            <Button label="Export CSV (Excel)" icon="download-outline" onPress={() => shareCsv(toCsv(recs))} />
            <Button label="Import CSV" kind="secondary" icon="cloud-upload-outline" onPress={doImport} />
          </View>
        </>
      )}
      {msg ? <View style={{ paddingHorizontal: 20, marginTop: 12 }}><Note tone="accent">{msg}</Note></View> : null}
      <View style={{ paddingHorizontal: 20, marginTop: 12 }}><Note>Employee data stays on this phone. Reminders for I-9 reverification use your Alerts settings.</Note></View>
    </DetailScreen>
  );
}
