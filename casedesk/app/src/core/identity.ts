// Whose document is it? Only passport data is compared — never the name the family typed ("Dad", "Asha").
// A document is flagged only when it does NOT match its own step's person and its passport number,
// or its full passport name (2+ name parts in common), matches someone else.
import type { DocFields, DocType } from './model';

export type Identity = { id: string; passportNos: string[]; legalName?: string };
type DocLike = { type: DocType; fields: DocFields };

const words = (n?: string) => (n || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** Same person by name: 2+ name parts in common (or one-word names that are equal). */
export function sameName(a?: string, b?: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const shared = x.filter((w) => y.includes(w)).length;
  return shared >= 2 || (x.length === 1 && y.length === 1 && x[0] === y[0]);
}

/**
 * Who someone is, from the documents in their steps: the passport number seen most often (a
 * misfiled document is the odd one out; passports count 1.5), old numbers printed on their
 * passports, and the name on their latest passport.
 */
export function identityOf(id: string, docs: DocLike[], known: { passportNos?: string[]; legalName?: string } = {}): Identity {
  const count = new Map<string, number>();
  for (const d of docs) if (d.fields.passportNo) count.set(d.fields.passportNo, (count.get(d.fields.passportNo) || 0) + (d.type === 'passport' ? 1.5 : 1));
  const top = Math.max(0, ...count.values());
  const nos = new Set<string>(known.passportNos || []);
  for (const [n, c] of count) if (c === top) nos.add(n);
  for (const d of docs) if (d.type === 'passport' && d.fields.oldPassportNo && d.fields.passportNo && nos.has(d.fields.passportNo)) nos.add(d.fields.oldPassportNo);
  const pass = docs
    .filter((d) => d.type === 'passport' && (!d.fields.passportNo || nos.has(d.fields.passportNo)))
    .sort((a, b) => (b.fields.validTo || '').localeCompare(a.fields.validTo || ''))[0];
  return { id, passportNos: [...nos], legalName: pass?.fields.name || known.legalName };
}

/** The other person this document looks like it belongs to, or undefined. */
export function belongsElsewhere(f: DocFields | undefined, ownerId: string, people: Identity[]): Identity | undefined {
  if (!f) return undefined;
  const owner = people.find((x) => x.id === ownerId);
  if (f.passportNo) {
    if (owner?.passportNos.includes(f.passportNo)) return undefined;
    const byNo = people.find((x) => x.id !== ownerId && x.passportNos.includes(f.passportNo!));
    if (byNo) return byNo;
    if (owner && f.oldPassportNo && owner.passportNos.includes(f.oldPassportNo)) return undefined;
  }
  if (!f.name || (owner?.legalName && sameName(f.name, owner.legalName))) return undefined;
  return people.find((x) => x.id !== ownerId && x.legalName && sameName(f.name, x.legalName));
}

/** How the match was made (for the warning text). */
export const matchedBy = (f: DocFields, who: Identity) => (f.passportNo && who.passportNos.includes(f.passportNo) ? 'passport number' : 'passport name');
