// "Me" plus family members as one list, and matching a name read from a document to the right person.
import { Profile } from './profile';
import { Member } from './family';

export type Person = { id: string; name: string; relation: string; profile: Profile | null };

// name = what to show (first name when known); named = whether a real name was entered.
export type Shown = Person & { named: boolean; short: string };
const first = (n: string) => n.trim().split(/\s+/)[0] || n;
export const people = (me: Profile | null, family: Member[]): Shown[] => [
  { id: 'me', name: me?.name?.trim() || 'Me', short: me?.name?.trim() ? first(me.name) : 'Me', relation: 'Me', profile: me, named: !!me?.name?.trim() },
  ...family.map((f) => {
    const named = !!f.name?.trim() && f.name.trim() !== f.relation;
    return { id: f.id, name: named ? f.name.trim() : f.relation, short: named ? first(f.name) : f.relation, relation: f.relation, profile: f.profile, named };
  }),
];

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('') || '?';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((x) => x.length > 1);

// Best person for a name printed on a document: a first-name match wins; otherwise any shared name part.
export function matchOwner(docName: string | undefined, list: Person[], fallback = 'me'): string {
  if (!docName) return fallback;
  const parts = norm(docName);
  let best = { id: fallback, score: 0 };
  for (const p of list) {
    const pn = norm(p.id === 'me' ? p.profile?.name || '' : p.name);
    if (!pn.length) continue;
    let score = 0;
    if (parts[0] && pn[0] === parts[0]) score += 3;
    score += pn.filter((x) => parts.includes(x)).length;
    if (score > best.score) best = { id: p.id, score };
  }
  return best.score >= 2 || (best.score >= 1 && list.length > 1) ? best.id : fallback;
}
