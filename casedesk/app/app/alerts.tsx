import React, { useEffect, useState } from 'react';
import { View, Switch, Pressable, Platform, ScrollView } from 'react-native';
import { DetailScreen } from '../src/components/TopBar';
import { Card, T, Section, Note, Button, Chips, Pill, tap } from '../src/components/ui';
import { useTheme } from '../src/theme';
import { useAlertPrefs, ensurePermission, sendTest, upcoming, AlertPrefs } from '../src/lib/alerts';
import { COUNTRIES } from '../src/data/bulletin';
import type { Tag } from '../src/data/news';
import { fmt } from '../src/lib/compliance';
import { isLive } from '../src/lib/api';

const TAGS: Tag[] = ['H-1B', 'L-1', 'TN', 'OPT', 'STEM OPT', 'H-4', 'L-2', 'I-9', 'Fees', 'Wages', 'Green card', 'Citizenship'];
const DAYS = [180, 90, 60, 30, 14, 7, 1];
const HOURS = [7, 9, 12, 18];

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <T v="h3" style={{ fontSize: 15 }}>{label}</T>
        {sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
    </View>
  );
}

function Multi<V extends string | number>({ options, value, onChange, fmtLabel }: { options: V[]; value: V[]; onChange: (v: V[]) => void; fmtLabel?: (v: V) => string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 6 }}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <Pressable key={String(o)} onPress={() => { tap(); onChange(on ? value.filter((x) => x !== o) : [...value, o]); }}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: on ? t.accent : t.surface2 }}>
            <T v="small" style={{ color: on ? '#fff' : t.text, fontWeight: '600' }}>{fmtLabel ? fmtLabel(o) : String(o)}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Alerts() {
  const t = useTheme();
  const [p, save] = useAlertPrefs();
  const [perm, setPerm] = useState<boolean | null>(null);
  const [next, setNext] = useState<{ title: string; date: string }[]>([]);
  const native = Platform.OS !== 'web';
  const set = (patch: Partial<AlertPrefs>) => save({ ...p, ...patch });

  useEffect(() => {
    if (native) require('expo-notifications').getPermissionsAsync().then((r: any) => setPerm(r.granted)).catch(() => setPerm(false));
  }, []);
  useEffect(() => { upcoming(p).then((l) => setNext(l.slice(0, 5))); }, [p]);

  return (
    <DetailScreen title="Alerts">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Alerts</T>
        <T v="sub" style={{ marginTop: 4 }}>Choose what CaseDesk tells you about. Date reminders are set up on your phone; nothing personal is sent anywhere.</T>
      </View>

      <Section>
        {!native ? <Note tone="amber">Notifications work in the phone app. You can set your choices here now.</Note> : perm === false ? (
          <Card>
            <T v="h3">Notifications are off</T>
            <T v="sub" style={{ marginTop: 4, marginBottom: 12 }}>Allow notifications so CaseDesk can remind you before dates and tell you when a case moves.</T>
            <Button label="Turn on notifications" icon="notifications" onPress={async () => setPerm(await ensurePermission())} />
          </Card>
        ) : (
          <Button label="Send a test notification" kind="secondary" icon="notifications-outline" onPress={() => sendTest()} />
        )}
      </Section>

      <Section title="My dates">
        <Card>
          <Toggle label="Expiry reminders" sub="I-94, approval, EAD, passport and visa stamp from My Status" value={p.statusReminders} onChange={(v) => set({ statusReminders: v })} />
          {p.statusReminders ? (
            <>
              <T v="label" style={{ marginTop: 6 }}>Remind me before</T>
              <Multi options={DAYS} value={p.reminderDays} onChange={(v) => set({ reminderDays: [...v].sort((a, b) => b - a) })} fmtLabel={(d) => (d === 1 ? '1 day' : d >= 60 ? `${Math.round(d / 30)} months` : `${d} days`)} />
              <T v="label" style={{ marginTop: 6 }}>At</T>
              <Multi options={HOURS} value={[p.hour]} onChange={(v) => v.length && set({ hour: v[v.length - 1] })} fmtLabel={(h) => (h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`)} />
            </>
          ) : null}
          <Toggle label="Document expiry" sub="Saved documents with a valid-until date (90 and 30 days before)" value={p.docReminders} onChange={(v) => set({ docReminders: v })} />
          <Toggle label="Team I-9 reverification" sub="90, 30 and 7 days before, and on the day" value={p.i9Reminders} onChange={(v) => set({ i9Reminders: v })} />
        </Card>
        {next.length ? (
          <Card style={{ marginTop: 10 }}>
            <T v="label">Next reminders</T>
            {next.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingTop: 10 }}>
                <T v="small" style={{ width: 96 }}>{fmt(r.date.slice(0, 10))}</T>
                <T v="body" style={{ flex: 1, fontSize: 14 }}>{r.title}</T>
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      <Section title="My cases">
        <Card>
          <Toggle label="Case status changes" sub="Your phone checks your tracked cases every few hours and tells you when one moves" value={p.caseUpdates} onChange={(v) => set({ caseUpdates: v })} />
          {!isLive() ? <T v="small" style={{ marginBottom: 6 }}>Starts once live case status is connected.</T> : null}
        </Card>
      </Section>

      <Section title="Updates">
        <Card>
          <Toggle label="Official updates" sub="New USCIS, DHS and DOL rules and notices" value={p.news.enabled} onChange={(v) => set({ news: { ...p.news, enabled: v } })} />
          {p.news.enabled ? (
            <>
              <T v="label" style={{ marginTop: 6 }}>Only about</T>
              <Multi options={TAGS} value={p.news.tags} onChange={(v) => set({ news: { ...p.news, tags: v } })} />
              <Toggle label="Only important ones" sub="Final rules, fee changes and other high-impact items" value={p.news.importantOnly} onChange={(v) => set({ news: { ...p.news, importantOnly: v } })} />
              <Toggle label="Big news stories too" sub="When 3+ outlets report the same story on your topics" value={p.news.webNews} onChange={(v) => set({ news: { ...p.news, webNews: v } })} />
            </>
          ) : null}
        </Card>
      </Section>

      <Section title="Visa Bulletin">
        <Card>
          <Toggle label="When my dates move" sub="Each month, if your country and category change" value={p.bulletin.enabled} onChange={(v) => set({ bulletin: { ...p.bulletin, enabled: v } })} />
          {p.bulletin.enabled ? (
            <>
              <T v="label" style={{ marginTop: 6, marginBottom: 6 }}>Country</T>
              <View style={{ marginHorizontal: -36 }}>
                <Chips options={COUNTRIES} value={p.bulletin.country} onChange={(c) => set({ bulletin: { ...p.bulletin, country: c } })} />
              </View>
              <T v="label" style={{ marginTop: 12 }}>Category</T>
              <Multi options={['EB-1', 'EB-2', 'EB-3', 'EB-3 OW', 'EB-5']} value={p.bulletin.categories} onChange={(v) => set({ bulletin: { ...p.bulletin, categories: v } })} />
            </>
          ) : null}
        </Card>
      </Section>

      <Section>
        <Note>Updates and Visa Bulletin alerts come from the CaseDesk server. It only receives an anonymous notification ID and the topics you pick — never your name, dates, documents or receipt numbers.</Note>
      </Section>
    </DetailScreen>
  );
}
