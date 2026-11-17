// Personal priority date tracker with movement history and an alert when the date becomes current.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Chips, Button, Note, Pill, DateField, tap } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { BULLETIN, COUNTRIES, Country, fmtCell, Bulletin } from '../../src/data/bulletin';
import { fmt } from '../../src/lib/compliance';
import { PdSettings, loadPd, savePd, getBulletin, recordBulletin, evaluate, pace, humanGap, PdSnap, PdResult } from '../../src/lib/pd';
import { ensurePermission } from '../../src/lib/alerts';
import { ShareCardButton } from '../../src/components/ShareCard';

export default function PriorityDate() {
  const t = useTheme();
  const [p, setP] = useState<PdSettings>({ pd: '', category: 'EB-2', country: 'india', notify: true });
  const [saved, setSaved] = useState<PdSettings | null>(null);
  const [b, setB] = useState<Bulletin>(BULLETIN);
  const [hist, setHist] = useState<PdSnap[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const s = await loadPd();
    if (s) { setP(s); setSaved(s); }
    const r = await getBulletin();
    setB(r.b);
    const h = r.live ? await recordBulletin(r.b) : await (await import('../../src/lib/pd')).loadHistory();
    const sp = s ?? p;
    setHist(h[`${sp.category}|${sp.country}`] || []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { (async () => { const h = await (await import('../../src/lib/pd')).loadHistory(); setHist(h[`${p.category}|${p.country}`] || []); })(); }, [p.category, p.country]);

  const ok = /^\d{4}-\d{2}-\d{2}$/.test(p.pd);
  const r: PdResult | null = saved && !editing ? evaluate(saved, b) : null;
  const usable = r ? (r.uscisChart === 'filing' ? r.filingCurrent : r.finalCurrent) : false;
  const speed = pace(hist, 'final');
  const eta = r && r.gapFinalDays && r.gapFinalDays > 0 && speed && speed > 0 ? r.gapFinalDays / speed : null;

  const save = async () => {
    const s = { ...p, notified: saved?.notified || [] };
    await savePd(s); setSaved(s); setEditing(false); tap();
    if (s.notify) await ensurePermission();
  };

  return (
    <DetailScreen title="Priority date">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">My priority date</T>
        <T v="sub" style={{ marginTop: 4 }}>Checked against each month’s Visa Bulletin · {b.month}</T>
      </View>

      {r && saved ? (
        <>
          <Section>
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Pill label={`${saved.category} · ${COUNTRIES.find((c) => c.value === saved.country)?.label}`} tone="accent" />
              <T style={{ fontSize: 30, fontWeight: '800', color: r.finalCurrent ? t.green : usable ? t.green : t.text, marginTop: 12, textAlign: 'center' }}>
                {r.finalCurrent ? 'Current' : usable ? 'You can file I-485' : r.gapFinalDays ? `${humanGap(r.gapFinalDays)} to go` : 'Not current'}
              </T>
              <T v="sub" style={{ marginTop: 6, textAlign: 'center' }}>Your date {fmt(saved.pd)} · Final Action cutoff {fmtCell(r.final)}</T>
              {eta ? <T v="small" style={{ marginTop: 8, textAlign: 'center' }}>At the recent pace (~{Math.round(speed!)} days of movement per month) that’s roughly {humanGap(eta * 30.44)} — bulletins can stall or retrogress.</T> : null}
              <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
                <ShareCardButton card={{ kind: 'pd', title: r.finalCurrent ? 'My priority date is current! 🎉' : usable ? 'I can file my I-485! 🎉' : `${saved.category} · ${humanGap(r.gapFinalDays || 0)} to go`, subtitle: `${saved.category} ${COUNTRIES.find((c) => c.value === saved.country)?.label} · ${b.month} Visa Bulletin`, stat: r.finalCurrent || usable ? 'Current' : fmtCell(r.final), statLabel: r.finalCurrent || usable ? '' : 'Final Action cutoff' }} />
              </View>
            </Card>
          </Section>
          <Section title="This month">
            <Card style={{ paddingVertical: 4 }}>
              {[['Final Action (green card approval)', r.final, r.finalCurrent], ['Dates for Filing (submit I-485)', r.filing, r.filingCurrent]].map(([label, cut, cur], i) => (
                <View key={String(label)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                  <T v="body" style={{ flex: 1 }}>{label as string}</T>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="h3">{fmtCell(cut as any)}</T>
                    <T v="small" style={{ color: cur ? t.green : t.sub }}>{cut ? (cur ? 'Current for you' : 'Not yet') : '—'}</T>
                  </View>
                </View>
              ))}
              <T v="small" style={{ paddingVertical: 8 }}>USCIS is accepting I-485s using {r.uscisChart === 'filing' ? 'Dates for Filing' : 'Final Action dates'} this month.</T>
            </Card>
          </Section>
          {hist.length ? (
            <Section title="Movement">
              <Card style={{ paddingVertical: 4 }}>
                {[...hist].reverse().slice(0, 12).map((h, i, arr) => {
                  const prev = arr[i + 1];
                  const moved = prev && h.final && prev.final && /^\d/.test(h.final) && /^\d/.test(prev.final) ? Math.round((new Date(h.final).getTime() - new Date(prev.final).getTime()) / 864e5) : null;
                  return (
                    <View key={h.month} style={{ flexDirection: 'row', paddingVertical: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
                      <T v="body" style={{ width: 90 }}>{h.month}</T>
                      <T v="h3" style={{ flex: 1 }}>{fmtCell(h.final)}</T>
                      <T v="small" style={{ color: moved === null ? t.faint : moved > 0 ? t.green : moved < 0 ? t.red : t.sub }}>{moved === null ? '' : moved > 0 ? `+${moved}d` : moved < 0 ? `${moved}d` : 'no move'}</T>
                    </View>
                  );
                })}
                {hist.length < 3 ? <T v="small" style={{ paddingVertical: 8 }}>History builds month by month on this phone; an estimate appears after 3 bulletins.</T> : null}
              </Card>
            </Section>
          ) : null}
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}><Button label="Change my details" kind="secondary" icon="create-outline" onPress={() => setEditing(true)} /></View>
        </>
      ) : (
        <Section>
          <Card>
            <DateField label="Priority date" value={p.pd} onChange={(v) => setP({ ...p, pd: v })} hint="On your I-140 approval notice (usually your PERM filing date)." />
            <T v="label" style={{ marginBottom: 8 }}>Category</T>
          </Card>
          <View style={{ marginTop: 8 }}><Chips options={b.rows.map((x) => ({ label: x.cat, value: x.cat }))} value={p.category} onChange={(v) => setP({ ...p, category: v })} /></View>
          <T v="label" style={{ marginTop: 14, marginBottom: 8, paddingHorizontal: 4 }}>Country of birth (chargeability)</T>
          <Chips<Country> options={COUNTRIES} value={p.country} onChange={(v) => setP({ ...p, country: v })} />
          <Card style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="h3">Alert me</T>
              <T v="sub" style={{ marginTop: 2 }}>When my date becomes current or I can file</T>
            </View>
            <Switch value={p.notify} onValueChange={(v) => setP({ ...p, notify: v })} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
          </Card>
          <View style={{ marginTop: 14 }}><Button label="Save" onPress={save} disabled={!ok} /></View>
          {saved ? <View style={{ marginTop: 10 }}><Button label="Remove my priority date" kind="secondary" icon="trash-outline" onPress={async () => { await savePd(null); setSaved(null); setEditing(false); setP({ pd: '', category: 'EB-2', country: 'india', notify: true }); }} /></View> : null}
          <View style={{ marginTop: 12 }}><Note>Saved only on this phone. CaseDesk checks the bulletin in the background and notifies you here — your date is never sent anywhere.</Note></View>
        </Section>
      )}
    </DetailScreen>
  );
}
