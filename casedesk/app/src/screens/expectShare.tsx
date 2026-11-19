// "Cases like mine": anonymous timelines from other app users, and the opt-in to add this case.
// Shares only: form, 3-letter office code, received/decided dates, outcome, premium yes/no, visa class.
// Never the receipt number, names or a device id (the entry id is random and made on this phone).
import React, { useState } from 'react';
import { View } from 'react-native';
import type { CaseView } from '../core/cases';
import { classLabel, officeOf, receivedOf, sharePayload, type ExpectView } from '../core/expect';
import { toggleShare, type CasePrefs } from '../data/expect';
import { apiBase } from '../data/api';
import { Card, Hint, LinkButton, SectionHeader, Switch, T, font, useSheet, useTheme, useToast, TourButton, TourScope, TourTarget, useTour } from '../ui';

export function CasesLikeMine({ c, view, prefs, cls }: { c: CaseView; view: ExpectView; prefs: CasePrefs | null; cls?: string }) {
  const t = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const tour = useTour('case-community');
  const [on, setOn] = useState<boolean | null>(null);
  const shared = on ?? !!prefs?.on;
  const office = officeOf(c.receipt), received = receivedOf(c);
  const can = !!(c.form && office && received && apiBase());
  const why = !apiBase() ? 'Needs a connection to the Immigration Wallet server.' : !office ? 'Needs a 13-character USCIS receipt number.' : !received ? 'Needs the date USCIS received the case.' : '';
  const flip = async (v: boolean) => {
    setOn(v);
    const p = await toggleShare(c, v);
    if (!p) { setOn(!v); return; }
    toast(v ? 'Shared anonymously — thank you' : 'Stopped sharing — your entry was deleted');
  };
  const preview = sharePayload('random id', c, cls, prefs?.premium);
  return (
    <TourScope tour={tour}>
      <SectionHeader right={<TourButton label="Tips for Cases like mine" />}>Cases like mine</SectionHeader>
      <Card>
        <TourTarget id="community">
          {!view.communityHidden && view.communityLine ? (
            <T style={font.sub}>{view.communityLine}</T>
          ) : (
            <T tone="text2" style={font.sub}>{view.communityShared ? `${view.communityShared} similar case${view.communityShared === 1 ? '' : 's'} shared so far. Timelines appear once at least 10 are decided.` : 'Timelines from other app users appear here once at least 10 similar cases are decided.'}</T>
          )}
          <Hint>Shared by app users, not checked by USCIS. Fewer cases than the official numbers above.</Hint>
        </TourTarget>
        <TourTarget id="share" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: t.sep }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <T style={[font.body, { fontWeight: '600' }]}>Add my case anonymously</T>
            <T tone="text2" style={[font.caption, { marginTop: 2 }]}>{can ? 'Only the form, office code, dates and outcome — never your receipt number or name.' : why}</T>
          </View>
          {can ? <Switch label="Add my case anonymously" value={shared} onValueChange={flip} /> : null}
        </TourTarget>
        {can ? <LinkButton align="left" title="What exactly is shared?" onPress={() => sheet.open('What is shared', <SharedDetails preview={preview} cls={cls} />)} /> : null}
      </Card>
    </TourScope>
  );
}

function SharedDetails({ preview, cls }: { preview: ReturnType<typeof sharePayload>; cls?: string }) {
  const rows: [string, string][] = preview ? [
    ['Form', preview.form], ['Office code', preview.office], ['Received', preview.received], ['Decided', preview.decided ?? '—'],
    ['Outcome', preview.outcome], ['Premium processing', preview.premium ? 'Yes' : 'No'], ['Visa class', cls ? classLabel(cls) : '—'],
  ] : [];
  return (
    <View>
      <T style={font.sub}>When you turn sharing on, this case adds one anonymous line to the Cases like mine timelines:</T>
      <View style={{ marginTop: 12 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 6 }}>
            <T tone="text2" style={[font.foot, { width: 150 }]}>{k}</T>
            <T style={font.foot}>{v}</T>
          </View>
        ))}
      </View>
      <Hint>Not shared: your receipt number, names, documents, contacts or anything that identifies this phone. The entry has a random id made on this phone so it can be updated when your case moves — and deleted when you turn sharing off. Others only ever see totals for groups of at least 10 decided cases.</Hint>
    </View>
  );
}
