// Local notifications before each person's dates (N1). Re-scheduled from scratch after every save.
// iOS keeps at most 64 pending notifications, so the nearest 60 are scheduled.
import { Platform } from 'react-native';
import { native } from './safe';
import type { Person } from '../core/model';
import type { PersonResult } from '../core/rules/engine';
import type { PersonRecord } from '../core/record';
import { addDays, fmt, today } from '../core/dates';

type Item = { at: string; title: string; body: string; url: string };

export function reminderItems(people: Person[], records: Record<string, PersonRecord>, results: Record<string, PersonResult>, keyDates: { ownerId: string; label: string; date: string; caseId: string }[]): Item[] {
  const items: Item[] = [];
  const t = today();
  for (const p of people) {
    const rm = p.reminders ?? { on: true, lead: [180, 90, 30, 7] };
    if (!rm.on) continue;
    const r = records[p.id];
    const dates: [string, string | undefined][] = [
      ['passport expires', r?.passportExpiry], ['I-94 ends', r?.i94?.until], ['work permit ends', r?.ead?.expires],
      ['green card expires', r?.greenCard?.expires], ['approval ends', r?.petitionEnd], ['travel document ends', r?.advanceParole?.expires],
    ];
    for (const f of results[p.id]?.findings ?? []) if (f.date && (f.severity === 'act' || f.severity === 'review')) dates.push([f.title, f.date]);
    for (const k of keyDates.filter((x) => x.ownerId === p.id)) dates.push([k.label, k.date]);
    const seen = new Set<string>();
    for (const [what, d] of dates) {
      if (!d || seen.has(what + d)) continue;
      seen.add(what + d);
      for (const lead of rm.lead) {
        const at = addDays(d, -lead);
        if (at <= t) continue;
        items.push({ at, title: `${p.name}: ${what}`, body: `${fmt(d)} — in ${lead} day${lead === 1 ? '' : 's'}. Open Immigration Wallet to see what to do.`, url: `/person/${p.id}` });
      }
    }
  }
  return items.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 60);
}

export async function scheduleReminders(items: Item[], ask = false) {
  if (Platform.OS === 'web') return false;
  const N = native.notifications();
  if (!N?.scheduleNotificationAsync) return false;
  try {
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && ask) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return false;
    const pending = await N.getAllScheduledNotificationsAsync();
    for (const n of pending) if (n?.content?.data?.cd2) await N.cancelScheduledNotificationAsync(n.identifier);
    for (const it of items) {
      const [y, m, d] = it.at.split('-').map(Number);
      await N.scheduleNotificationAsync({
        content: { title: it.title, body: it.body, data: { cd2: true, url: it.url } },
        trigger: { type: N.SchedulableTriggerInputTypes?.DATE ?? 'date', date: new Date(y, m - 1, d, 9, 0, 0) },
      });
    }
    return true;
  } catch { return false; }
}

export async function askNotificationPermission() {
  const N = native.notifications();
  try { if (N?.requestPermissionsAsync) { const r = await N.requestPermissionsAsync(); return !!r.granted; } } catch {}
  return false;
}
