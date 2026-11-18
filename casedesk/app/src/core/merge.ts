// Backup merge: which person on this phone is the same as a person in the backup?
// Checked in order: same id (and same name or passport), passport number, legal name (as printed
// on their documents) + date of birth, then the name the family typed. Each person on the phone
// is matched at most once, so merging the same backup twice never adds anyone twice.
import type { Document, Person } from './model';
import { sameName } from './identity';

type Docs = Pick<Document, 'ownerId' | 'fields'>[];
const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function idOf(personId: string, docs: Docs) {
  const mine = docs.filter((d) => d.ownerId === personId);
  const passports = new Set<string>();
  const legal: { name: string; dob?: string }[] = [];
  for (const d of mine) {
    if (d.fields.passportNo) passports.add(d.fields.passportNo.toUpperCase());
    if (d.fields.oldPassportNo) passports.add(d.fields.oldPassportNo.toUpperCase());
    if (d.fields.name) legal.push({ name: d.fields.name, dob: d.fields.birthDate });
  }
  return { passports, legal };
}

export type PersonMatch = { id: string; by: 'id' | 'passport' | 'legal-name-dob' | 'name' };

/** For each backup person, the matching person here (or nothing → add them). */
export function matchPeople(incoming: Person[], incomingDocs: Docs, here: Person[], hereDocs: Docs): Map<string, PersonMatch> {
  const out = new Map<string, PersonMatch>();
  const used = new Set<string>();
  const hereIds = new Map(here.map((y) => [y.id, idOf(y.id, hereDocs)]));
  const inIds = new Map(incoming.map((x) => [x.id, idOf(x.id, incomingDocs)]));
  const passMatch = (a: Set<string>, b: Set<string>) => [...a].some((n) => b.has(n));
  const legalDobMatch = (a: ReturnType<typeof idOf>, b: ReturnType<typeof idOf>) =>
    a.legal.some((l) => l.dob && b.legal.some((m) => m.dob === l.dob && sameName(l.name, m.name)));
  const passes: [PersonMatch['by'], (x: Person, y: Person) => boolean][] = [
    ['id', (x, y) => x.id === y.id && (norm(x.name) === norm(y.name) || passMatch(inIds.get(x.id)!.passports, hereIds.get(y.id)!.passports))],
    ['passport', (x, y) => passMatch(inIds.get(x.id)!.passports, hereIds.get(y.id)!.passports)],
    ['legal-name-dob', (x, y) => legalDobMatch(inIds.get(x.id)!, hereIds.get(y.id)!)],
    ['name', (x, y) => !!norm(x.name) && norm(x.name) === norm(y.name)],
  ];
  for (const [by, same] of passes) {
    for (const x of incoming) {
      if (out.has(x.id)) continue;
      const y = here.find((p) => !used.has(p.id) && same(x, p));
      if (y) { out.set(x.id, { id: y.id, by }); used.add(y.id); }
    }
  }
  return out;
}
