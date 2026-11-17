// "Cases like mine": anonymous timelines from other CaseDesk users with the same form and office.
// Sharing is opt-in per case and sends only: form, 3-letter office code, received/decided dates, outcome.
import React, { useEffect, useState } from 'react';
import { View, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, T, Section, Pill } from './ui';
import { useTheme } from '../theme';
import { API_BASE } from '../lib/api';
import { CENTERS } from '../lib/caseStatus';
import { fmt } from '../lib/compliance';

type Stats = { total: number; decided: number; medianDays: number | null; p25: number | null; p75: number | null; approvalRate: number | null; lastApprovals: { received: string; decided: string; office: string }[]; minSample: number };
type Share = Record<string, { id: string; on: boolean }>;
const KEY = 'cd.community.v1';

const randomId = () => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const outcomeOf = (s = '') => (/denied|rejected/i.test(s) ? 'denied' : /approved|card (was )?(produced|mailed|delivered)|oath/i.test(s) ? 'approved' : /evidence/i.test(s) ? 'rfe' : 'pending');

export function CaseCommunity({ receipt, form, history, status }: { receipt: string; form?: string; history?: { date: string; status: string }[]; status?: string }) {
  const t = useTheme();
  const office = receipt.slice(0, 3);
  const [stats, setStats] = useState<Stats | null>(null);
  const [share, setShare] = useState<{ id: string; on: boolean } | null>(null);
  const received = [...(history || [])].reverse().find((h) => /received|accepted/i.test(h.status))?.date;
  const outcome = outcomeOf(status);
  const decided = outcome === 'approved' || outcome === 'denied' ? history?.[0]?.date : undefined;

  useEffect(() => {
    if (!API_BASE || !form) return;
    fetch(`${API_BASE}/api/community/stats?form=${encodeURIComponent(form)}&office=${office}`).then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => {});
    AsyncStorage.getItem(KEY).then((raw) => { const all: Share = raw ? JSON.parse(raw) : {}; setShare(all[receipt] || null); });
  }, [form, office, receipt]);

  // Keep a shared entry up to date as the case moves.
  useEffect(() => {
    if (!share?.on || !form || !received || !API_BASE) return;
    fetch(`${API_BASE}/api/community`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: share.id, form, office, received, decided, outcome }) }).catch(() => {});
  }, [share?.on, status, received]);

  const toggle = async (on: boolean) => {
    const raw = await AsyncStorage.getItem(KEY);
    const all: Share = raw ? JSON.parse(raw) : {};
    const entry = { id: all[receipt]?.id || randomId(), on };
    all[receipt] = entry;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    setShare(entry);
    if (!on && API_BASE) fetch(`${API_BASE}/api/community`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id }) }).catch(() => {});
  };

  if (!form || !API_BASE) return null;
  const enough = stats && stats.decided >= (stats.minSample || 5);
  return (
    <Section title="Cases like mine">
      <Card>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pill label={`Form ${form}`} tone="accent" small />
          <Pill label={CENTERS[office] ?? office} small />
        </View>
        {enough ? (
          <>
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 30, fontWeight: '800', color: t.text, fontVariant: ['tabular-nums'] }}>{Math.round(stats!.medianDays! / 30.44 * 10) / 10}</T>
                <T v="small">months, typical (median)</T>
              </View>
              {stats!.approvalRate !== null ? (
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 30, fontWeight: '800', color: t.green, fontVariant: ['tabular-nums'] }}>{stats!.approvalRate}%</T>
                  <T v="small">approved</T>
                </View>
              ) : null}
            </View>
            {stats!.p25 && stats!.p75 ? <T v="sub" style={{ marginTop: 8 }}>Most took {Math.round(stats!.p25 / 30.44)}–{Math.round(stats!.p75 / 30.44)} months · {stats!.decided} decided in the last year</T> : null}
            {stats!.lastApprovals.length ? (
              <View style={{ marginTop: 12 }}>
                <T v="label">Recent approvals</T>
                {stats!.lastApprovals.slice(0, 5).map((a, i) => (
                  <View key={i} style={{ flexDirection: 'row', paddingVertical: 7, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                    <T v="small" style={{ flex: 1 }}>Received {fmt(a.received)}</T>
                    <T v="small" style={{ color: t.green }}>Approved {fmt(a.decided)}</T>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <T v="sub" style={{ marginTop: 12 }}>{stats ? `${stats.total} shared so far — timelines appear once ${stats.minSample} cases are decided.` : 'Timelines from other CaseDesk users appear here.'}</T>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: t.border }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <T v="h3" style={{ fontSize: 15 }}>Add my case anonymously</T>
            <T v="small" style={{ marginTop: 2 }}>{received ? 'Shares only the form, office and dates — never your receipt number.' : 'Available once CaseDesk has seen your “Case Was Received” status.'}</T>
          </View>
          <Switch disabled={!received || Platform.OS === 'web'} value={!!share?.on} onValueChange={toggle} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
        </View>
      </Card>
    </Section>
  );
}
