// "Can I travel?" — quick yes / careful / no for an international trip, from the person's saved dates.
import React, { useState } from 'react';
import { View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../../src/components/TopBar';
import { Card, T, Section, Button, Note, DateField, Chips, IconBubble } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useProfile } from '../../src/lib/profile';
import { useFamily } from '../../src/lib/family';
import { checkTrip, Trip } from '../../src/lib/travel';
import { people } from '../../src/lib/people';

export default function Travel() {
  const t = useTheme();
  const router = useRouter();
  const [me] = useProfile();
  const [family] = useFamily();
  const [who, setWho] = useState('me');
  const [trip, setTrip] = useState<Trip>({ leave: '', back: '' });
  const p = who === 'me' ? me : family.find((f) => f.id === who)?.profile ?? null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(trip.back) && (!trip.leave || /^\d{4}-\d{2}-\d{2}$/.test(trip.leave));
  const res = p && ok ? checkTrip(p, trip) : null;
  const toggle = (k: keyof Trip, label: string, sub?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ flex: 1, paddingRight: 8 }}><T v="body">{label}</T>{sub ? <T v="small">{sub}</T> : null}</View>
      <Switch value={!!trip[k]} onValueChange={(v) => setTrip({ ...trip, [k]: v })} trackColor={{ true: t.green, false: t.surface2 }} thumbColor="#fff" />
    </View>
  );
  const V = res ? ({ ok: { c: t.green, i: 'airplane', h: 'Looks OK to travel' }, risky: { c: t.amber, i: 'alert-circle', h: 'Travel with care' }, no: { c: t.red, i: 'close-circle', h: 'Don’t travel yet' } } as const)[res.verdict] : null;

  return (
    <DetailScreen title="Can I travel?">
      <View style={{ paddingHorizontal: 20 }}>
        <T v="h1">Can I travel?</T>
        <T v="sub" style={{ marginTop: 4 }}>Checks a trip abroad against your saved status dates.</T>
      </View>
      {family.length ? (
        <View style={{ marginTop: 12 }}>
          <Chips options={[...people(me, family).map((x) => ({ label: x.short, value: x.id }))]} value={who} onChange={setWho} />
        </View>
      ) : null}
      {!p ? (
        <Section>
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <IconBubble name="shield-checkmark-outline" size={48} />
            <T v="h3" style={{ marginTop: 12 }}>Add your status first</T>
            <T v="sub" style={{ marginTop: 4, textAlign: 'center' }}>Visa type, approval, visa stamp and passport dates.</T>
            <View style={{ alignSelf: 'stretch', marginTop: 14 }}><Button label="Set up my status" onPress={() => router.push(who === 'me' ? '/status/edit' : `/status/edit?member=${who}`)} /></View>
          </Card>
        </Section>
      ) : (
        <>
          <Section>
            <Card>
              <DateField label="Leaving the US" value={trip.leave} onChange={(v) => setTrip({ ...trip, leave: v })} />
              <DateField label="Coming back" value={trip.back} onChange={(v) => setTrip({ ...trip, back: v })} />
              {p.visa === 'TN' ? toggle('canadian', 'I’m a Canadian citizen') : null}
              {p.visa === 'Green card pending' ? toggle('apOnHand', 'I have advance parole (AP or combo card)') : null}
              {p.visa === 'F-1 OPT' || p.visa === 'STEM OPT' ? <>{toggle('i20Signed', 'I-20 travel signature in the last 6 months')}{toggle('jobOffer', 'I have an employment letter')}{toggle('capGap', 'I’m on cap-gap (H-1B pending for Oct 1)')}</> : null}
            </Card>
          </Section>
          {res && V ? (
            <Section>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Ionicons name={V.i as any} size={40} color={V.c} />
                <View style={{ flex: 1 }}>
                  <T v="h2" style={{ color: V.c }}>{V.h}</T>
                  <T v="sub" style={{ marginTop: 2 }}>{p.visa}{trip.back ? ` · back ${trip.back}` : ''}</T>
                </View>
              </Card>
              {res.reasons.map((x, i) => (
                <Card key={i} style={{ marginTop: 10, flexDirection: 'row', gap: 12 }}>
                  <Ionicons name={x.tone === 'ok' ? 'checkmark-circle' : x.tone === 'risky' ? 'alert-circle' : 'close-circle'} size={22} color={x.tone === 'ok' ? t.green : x.tone === 'risky' ? t.amber : t.red} />
                  <View style={{ flex: 1 }}>
                    <T v="h3" style={{ fontSize: 15 }}>{x.title}</T>
                    <T v="sub" style={{ marginTop: 2 }}>{x.detail}</T>
                  </View>
                </Card>
              ))}
              <View style={{ marginTop: 12, gap: 10 }}>
                <Button label="Visa appointment wait times" kind="secondary" icon="time-outline" onPress={() => router.push('/tools/visa-waits')} />
                <Note>A general check, not legal advice — confirm with your employer’s immigration team before booking.</Note>
              </View>
            </Section>
          ) : null}
        </>
      )}
    </DetailScreen>
  );
}
