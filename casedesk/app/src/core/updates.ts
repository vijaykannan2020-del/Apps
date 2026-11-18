// Updates by visa type: which news / rule-change tags matter to this family, and which high-impact
// items become a one-time Info alert in Needs attention.
import type { Person, VisaType } from './model';
import type { PersonRecord } from './record';
import { daysBetween } from './dates';

export type UpdateTag = 'H-1B' | 'L-1' | 'TN' | 'OPT' | 'STEM OPT' | 'H-4' | 'L-2' | 'I-9' | 'Fees' | 'Wages' | 'Green card' | 'Citizenship';
type Item = { id: string; date: string; title: string; impact: 'high' | 'medium' | 'info'; tags: string[] };

const BY_KEY: Record<string, UpdateTag[]> = {
  'H-1B': ['H-1B'], 'H-4': ['H-4', 'H-1B'], 'H-4 EAD': ['H-4', 'H-1B'],
  'L-1': ['L-1'], 'L-1A': ['L-1'], 'L-1B': ['L-1'], 'L-2': ['L-2', 'L-1'], 'L-2S': ['L-2', 'L-1'],
  TN: ['TN'], TD: ['TN'],
  'F-1': ['OPT'], 'F-1 OPT': ['OPT'], 'STEM OPT': ['STEM OPT', 'OPT'],
  'green-card-applicant': ['Green card'], 'Green card pending': ['Green card'],
  'green-card': ['Green card', 'Citizenship'], 'Green card': ['Green card', 'Citizenship'],
  'conditional-green-card': ['Green card', 'Citizenship'], 'Conditional green card': ['Green card', 'Citizenship'],
  'citizenship-applicant': ['Citizenship', 'Green card'],
};

/** Tags for everyone in the family, from what their documents show (else the status they picked). */
export function familyTags(people: Person[], records: Record<string, PersonRecord | undefined>): UpdateTag[] {
  const out = new Set<UpdateTag>();
  for (const p of people) {
    const v: VisaType | undefined = records[p.id]?.visa;
    for (const k of [v, p.status]) for (const t of BY_KEY[k ?? ''] ?? []) out.add(t);
  }
  return [...out];
}

export const matchesFamily = (n: { tags: string[] }, tags: UpdateTag[]) => n.tags.some((t) => tags.includes(t as UpdateTag) || (t === 'STEM OPT' && tags.includes('OPT')));

/** "For my family": items with one of the family's tags (all items when the family has no visa tags). */
export function forFamily<T extends { tags: string[] }>(items: T[], tags: UpdateTag[]): T[] {
  return tags.length ? items.filter((n) => matchesFamily(n, tags)) : items;
}

/** High-impact items for the family's visa types from the last 120 days, not yet dismissed or opened. */
export function updateAlerts<T extends Item>(items: T[], tags: UpdateTag[], dismissed: string[], todayIso: string, days = 120): T[] {
  if (!tags.length) return [];
  return items.filter((n) => n.impact === 'high' && matchesFamily(n, tags) && !dismissed.includes(n.id) && n.date <= todayIso && daysBetween(n.date.slice(0, 10), todayIso) <= days)
    .sort((a, b) => b.date.localeCompare(a.date));
}
