// Notifications (v2.3): when to ask, and what to alert. Pure — tested in tests/v23.test.ts.
import type { Settings } from './model';

export type Perm = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type Alert = { title: string; body: string; url?: string };

/** Ask once, at a useful moment: after the first case or document is saved, never before. */
export function shouldAskNotifications(o: { perm: Perm; settings: Pick<Settings, 'notifAskedAt'>; docs: number; cases: number }): boolean {
  if (o.perm !== 'undetermined') return false;
  if (o.settings.notifAskedAt) return false;
  return o.docs + o.cases > 0;
}

export type AlertKind = 'cases' | 'bulletin' | 'docs';
/** Each alert kind is on unless the user turned it off in Settings. */
export const alertOn = (s: Pick<Settings, 'alerts'>, k: AlertKind) => s.alerts?.[k] !== false;

/** Case status changes between two snapshots (id → status). New cases and first loads don't alert. */
export function caseChanges(prev: Record<string, string> | null, now: { id: string; status: string; form?: string; ownerName?: string }[]): Alert[] {
  if (!prev) return [];
  const out: Alert[] = [];
  for (const c of now) {
    const was = prev[c.id];
    if (was === undefined || was === c.status) continue;
    const word = c.status === 'RFE' ? 'Request for Evidence' : c.status;
    out.push({ title: `${c.form ?? 'Case'} status: ${word}`, body: `${c.ownerName ? `${c.ownerName}’s case` : 'Case'} changed from ${was} to ${word}.`, url: `/case/${encodeURIComponent(c.id)}` });
  }
  return out;
}
export const statusMap = (list: { id: string; status: string }[]) => Object.fromEntries(list.map((c) => [c.id, c.status]));

/** A new monthly Visa Bulletin: alert only when a different month arrives after one was seen. */
export function bulletinAlert(seen: string | undefined, month: string | undefined, live: boolean): { alert?: Alert; seen?: string } {
  if (!live || !month) return {};
  if (!seen) return { seen: month }; // first time: just remember it
  if (seen === month) return {};
  return { seen: month, alert: { title: `${month} Visa Bulletin is out`, body: 'See whether your priority date is current.', url: '/tools/pd' } };
}

/** Settings row text for the permission state. */
export function permText(p: Perm): { title: string; sub: string } {
  switch (p) {
    case 'granted': return { title: 'On', sub: 'Case changes, document expiry and new Visa Bulletins' };
    case 'denied': return { title: 'Off', sub: 'Turned off in iOS Settings — tap to open Settings and allow notifications' };
    case 'undetermined': return { title: 'Not turned on', sub: 'Tap to turn on alerts' };
    default: return { title: 'Not available', sub: 'Notifications work in the iPhone and Android app' };
  }
}
