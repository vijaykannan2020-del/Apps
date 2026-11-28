// Notifications (v2.3): when to ask, and what to alert. Pure — tested in tests/v23.test.ts.
import type { Person, Settings } from './model';
import type { PersonRecord } from './record';
import { birthCountryOf, chargeabilityOf } from './birth';
import { categoryOf, countryOf, type BulletinCountry } from './bulletin';
import { familyTags, type UpdateTag } from './updates';

export type Perm = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type Alert = { title: string; body: string; url?: string };

/** Ask once, at a useful moment: after the first case or document is saved, never before. */
export function shouldAskNotifications(o: { perm: Perm; settings: Pick<Settings, 'notifAskedAt'>; docs: number; cases: number }): boolean {
  if (o.perm !== 'undetermined') return false;
  // Asked before but iOS still says "not decided": either "Not now" on this phone (ask again after 14 days)
  // or the date came from a backup made on another phone.
  if (o.settings.notifAskedAt && Date.now() - Date.parse(o.settings.notifAskedAt) < 14 * 864e5) return false;
  return o.docs + o.cases > 0;
}

export type AlertKind = 'cases' | 'bulletin' | 'docs' | 'news' | 'daily';
/** Each alert kind is on unless the user turned it off in Settings. */
export const alertOn = (s: Pick<Settings, 'alerts'>, k: AlertKind) => s.alerts?.[k] !== false;

/** Server alerts sign-up (news + Visa Bulletin), without the push token. Only topics, one bulletin column
 *  and EB categories — no names, dates or receipt numbers. */
export type PushTopics = {
  news: { enabled: boolean; tags: UpdateTag[]; importantOnly: boolean; webNews: boolean };
  bulletin: { enabled: boolean; country: BulletinCountry; categories: string[] };
};
const SERVER_CATS = ['EB-1', 'EB-2', 'EB-3', 'EB-3 OW', 'EB-5'];
export function pushTopics(s: Pick<Settings, 'alerts'>, people: Person[], records: Record<string, PersonRecord | undefined>): PushTopics {
  let country: BulletinCountry | undefined;
  const cats = new Set<string>();
  for (const p of people) {
    const rec = records[p.id];
    for (const c of rec?.cases ?? []) {
      if (c.form !== 'I-140') continue;
      const cat = categoryOf(c.category);
      if (!cat || !SERVER_CATS.includes(cat)) continue;
      const born = birthCountryOf(p.facts?.birthCountry, rec as PersonRecord);
      const ctry: BulletinCountry = p.facts?.gc?.chargeability ?? (born && born.from !== 'nationality' ? chargeabilityOf(born.code) : countryOf(rec?.nationality));
      if (country && ctry !== country) continue; // one column per phone: the first person with a priority date
      country = ctry;
      cats.add(cat);
    }
  }
  return {
    news: { enabled: alertOn(s, 'news'), tags: familyTags(people, records), importantOnly: s.alerts?.newsAll !== true, webNews: false },
    bulletin: { enabled: alertOn(s, 'bulletin') && cats.size > 0, country: country ?? 'all', categories: [...cats] },
  };
}
/** Short text for the News row: which topics the family gets. */
export const newsTopicsText = (t: PushTopics) => (t.news.tags.length ? t.news.tags.slice(0, 4).join(', ') : 'All visa types');

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
export function permText(p: Perm, settingsName = 'iOS Settings'): { title: string; sub: string } {
  switch (p) {
    case 'granted': return { title: 'On', sub: 'Case changes, document expiry, Visa Bulletins and news' };
    case 'denied': return { title: 'Off', sub: `Turned off in ${settingsName} — tap to open Settings and allow notifications` };
    case 'undetermined': return { title: 'Not turned on', sub: 'Tap to turn on alerts' };
    default: return { title: 'Not available', sub: 'Notifications work in the iPhone and Android app' };
  }
}
