// Android home-screen widget (same data as the iPhone widget: core/widgets buildWidgetSnapshot).
// Rendered by react-native-android-widget from the snapshot the app saves; dates and labels only,
// never a document or receipt number. Hidden details while the app lock is on (snapshot.locked).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetItem, WidgetSnapshot } from '../core/widgets';
import { daysBetween, fmt, today } from '../core/dates';

const C = { bg: '#0F1115', card: '#1A1D24', text: '#F5F6F8', sub: '#9AA0AA', red: '#FF6B6B', amber: '#F5B544', green: '#5BD18B', accent: '#7FB2FF' } as const;

function right(it: WidgetItem): { text: string; color: `#${string}` } {
  if (it.mode === 'until' && it.date) {
    const d = daysBetween(today(), it.date);
    const color = d < 0 ? C.red : d <= 30 ? C.red : d <= 90 ? C.amber : C.green;
    return { text: d < 0 ? 'Ended' : d === 0 ? 'Today' : d < 100 ? `${d} days` : fmt(it.date), color };
  }
  return { text: (it.text ?? (it.date ? fmt(it.date) : '')).slice(0, 28), color: C.sub };
}

export function AndroidFamilyWidget({ snap }: { snap: WidgetSnapshot | null }) {
  const items = (snap?.familyItems?.length ? snap.familyItems : snap?.items ?? []).slice(0, 4);
  const msg = !snap ? 'Open Immigration Wallet to set up' : snap.locked ? 'Locked · open the app to see dates' : !items.length ? 'Add a document to see dates here' : null;
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.bg, borderRadius: 22, padding: 14, flexDirection: 'column' }}>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', marginBottom: 8 }}>
        <TextWidget text="Immigration Wallet" style={{ fontSize: 14, fontWeight: '700', color: C.text }} />
        {snap?.bulletin?.month ? <TextWidget text={`VB ${snap.bulletin.month}`} style={{ fontSize: 11, color: C.accent }} /> : <TextWidget text="" />}
      </FlexWidget>
      {msg ? <TextWidget text={msg} style={{ fontSize: 13, color: C.sub, marginTop: 6 }} /> : null}
      {items.map((it, i) => {
        const r = right(it);
        return (
          <FlexWidget key={`${it.kind}-${it.personId}-${i}`} clickAction="OPEN_URI" clickActionData={{ uri: it.url.startsWith('casedesk:') ? it.url : `casedesk://${it.url.replace(/^\//, '')}` }}
            style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, marginTop: i ? 6 : 0 }}>
            <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
              <TextWidget text={it.label.slice(0, 32)} style={{ fontSize: 13, color: C.text }} maxLines={1} truncate="END" />
              <TextWidget text={it.who} style={{ fontSize: 11, color: C.sub }} maxLines={1} />
            </FlexWidget>
            <TextWidget text={r.text} style={{ fontSize: 13, fontWeight: '600', color: r.color }} />
          </FlexWidget>
        );
      })}
      {snap?.disclaimer && items.length ? <TextWidget text="Not legal advice" style={{ fontSize: 9, color: C.sub, marginTop: 6 }} /> : null}
    </FlexWidget>
  );
}
