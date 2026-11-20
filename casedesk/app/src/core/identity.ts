// Whose document is it? Passport data first. The name the family typed is used only as a second
// check (v2.9, owner feedback): a full name typed at setup ("Asha Kumar", not "Mom") that matches the
// name read from a document is as good a match as a passport name.
// A document is flagged only when it does NOT match its own step's person and its passport number,
// or its full name (2+ name parts in common), matches someone else.
import type { DocFields, DocType } from './model';
type DocLike2 = { id: string; ownerId: string; type: DocType; fields: DocFields };

export type Identity = { id: string; passportNos: string[]; legalName?: string; displayName?: string };
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
export function identityOf(id: string, docs: DocLike[], known: { passportNos?: string[]; legalName?: string; displayName?: string } = {}): Identity {
  const count = new Map<string, number>();
  for (const d of docs) if (d.fields.passportNo) count.set(d.fields.passportNo, (count.get(d.fields.passportNo) || 0) + (d.type === 'passport' ? 1.5 : 1));
  const top = Math.max(0, ...count.values());
  const nos = new Set<string>(known.passportNos || []);
  for (const [n, c] of count) if (c === top) nos.add(n);
  for (const d of docs) if (d.type === 'passport' && d.fields.oldPassportNo && d.fields.passportNo && nos.has(d.fields.passportNo)) nos.add(d.fields.oldPassportNo);
  const pass = docs
    .filter((d) => d.type === 'passport' && (!d.fields.passportNo || nos.has(d.fields.passportNo)))
    .sort((a, b) => (b.fields.validTo || '').localeCompare(a.fields.validTo || ''))[0];
  return { id, passportNos: [...nos], legalName: pass?.fields.name || known.legalName, displayName: known.displayName };
}

/** Is this name this person's (legal name from their documents, or the full name typed at setup)? */
const isNamed = (name: string, who?: Identity) => !!who && ((!!who.legalName && sameName(name, who.legalName)) || (!!who.displayName && sameName(name, who.displayName)));

/**
 * The person's own legal name among the names on their documents: the one that matches the name
 * typed at setup, else the one seen most often (a misfiled document is the odd one out).
 */
export function ownName(displayName: string | undefined, names: (string | undefined)[]): string | undefined {
  const list = names.filter((n): n is string => !!n && !!n.trim());
  if (!list.length) return undefined;
  const typed = list.find((n) => sameName(n, displayName));
  if (typed) return typed;
  let best: string | undefined, top = 0;
  for (const n of list) { const c = list.filter((m) => sameName(m, n)).length; if (c > top) { top = c; best = n; } }
  return best;
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
  if (!f.name || isNamed(f.name, owner)) return undefined;
  return people.find((x) => x.id !== ownerId && isNamed(f.name!, x));
}

/**
 * v3.0 fix8 bulk upload: whose document is this, from what is printed on it — the passport number
 * first (also an old number printed on a newer passport), then the full name (one person only;
 * a shared family name alone never decides). Undefined when nothing matches clearly.
 */
export function whoseDoc(f: DocFields | undefined, people: Identity[]): { id: string; by: 'passport number' | 'name' } | undefined {
  if (!f) return undefined;
  const nos = [f.passportNo, f.oldPassportNo].filter((x): x is string => !!x);
  const byNo = people.find((x) => nos.some((n) => x.passportNos.includes(n)));
  if (byNo) return { id: byNo.id, by: 'passport number' };
  if (!f.name) return undefined;
  const named = people.filter((x) => isNamed(f.name!, x));
  return named.length === 1 ? { id: named[0].id, by: 'name' } : undefined;
}

/** Assign read documents to people, in order (a passport read first helps the documents after it). Pure. */
export function assignAll(read: Pick<DocLike2, 'id' | 'type' | 'fields'>[], people: { id: string; name: string; isMain?: boolean; relation: string }[], saved: Pick<DocLike2, 'ownerId' | 'type' | 'fields'>[], known: Record<string, { passportNos?: string[]; legalName?: string }> = {}) {
  const fallback = (people.find((p) => p.relation === 'self') ?? people.find((p) => p.isMain) ?? people[0])?.id;
  const mine: Pick<DocLike2, 'ownerId' | 'type' | 'fields'>[] = [...saved];
  const ids = (): Identity[] => people.map((p) => identityOf(p.id, mine.filter((d) => d.ownerId === p.id), { ...known[p.id], displayName: p.name }));
  return read.map((d) => {
    const who = whoseDoc(d.fields, ids());
    const ownerId = who?.id ?? fallback;
    mine.push({ ownerId, type: d.type, fields: d.fields });
    return { id: d.id, ownerId, by: who?.by ?? ('none' as const) };
  });
}

/** How the match was made (for the warning text). */
export const matchedBy = (f: DocFields, who: Identity) => (f.passportNo && who.passportNos.includes(f.passportNo) ? 'passport number' : who.legalName && f.name && sameName(f.name, who.legalName) ? 'passport name' : 'name');
