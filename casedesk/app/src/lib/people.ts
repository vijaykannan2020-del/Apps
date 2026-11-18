// "Me" plus family members as one list, and matching a name read from a document to the right person.
import { Profile } from './profile';
import { Member } from './family';

export type Person = { id: string; name: string; relation: string; profile: Profile | null };

export const people = (me: Profile | null, family: Member[]): Person[] => [
  { id: 'me', name: me?.name?.trim() || 'Me', relation: 'Me', profile: me },
  ...family.map((f) => ({ id: f.id, name: f.name, relation: f.relation, profile: f.profile })),
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
