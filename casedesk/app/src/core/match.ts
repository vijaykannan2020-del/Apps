// v3.0 bulk2 (owner): whose document is this? Used by Add several documents at once. Pure.
//
// Each document is scored against each family member from what is printed on it:
//   - passport number: a passport, visa, I-94 or approval carrying a number one person's passports
//     have (saved, or read earlier in the same batch) belongs to that person — decisive;
//   - date of birth (passport MRZ, I-94, visa): equal to the person's known date = strong, different =
//     ruled out;
//   - name: the printed / MRZ name against the name typed in the app and the legal name from the
//     person's own passport — case, spacing, order, initials, joined or split parts (RAMA CHANDRAN /
//     RAMACHANDRAN), missing middle names and 1–2 letter typos (edit distance) all tolerated.
// A part of a name that several family members share (a family name) never decides on its own, and a
// document is filed only when one person clearly leads; otherwise the review list asks.
import type { DocFields, Relation } from './model';

export type Member = { id: string; relation: Relation; name: string; legalName?: string; passportNos: string[]; birthDate?: string };
export type Reason = 'passport number' | 'name' | 'date of birth';
export type MatchResult = {
  id?: string; // undefined = not sure: ask "Whose document is this?"
  why: Reason[];
  close?: string; // a likely person when not sure (shown first in the question)
  /** The name on a passport is a close but different spelling of the name typed in the app. */
  rename?: { id: string; to: string };
};

const tokens = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter(Boolean);

/** Levenshtein distance, stopping early above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** Typos allowed for a word of this length: none under 5 letters (Asha is not Usha), 1 up to 7, 2 from 8. */
const allowed = (n: number) => (n < 5 ? 0 : n < 8 ? 1 : 2);

type TokMatch = { w: number; exact: boolean };
/** How well one typed part matches the document's parts (1 exact … 0 none). */
function partMatch(p: string, doc: string[]): TokMatch {
  if (p.length === 1) return { w: doc.some((d) => d[0] === p) ? 0.25 : 0, exact: false }; // an initial
  let best: TokMatch = { w: 0, exact: false };
  const consider = (d: string) => {
    if (d === p) { best = { w: 1, exact: true }; return; }
    const lim = allowed(Math.min(d.length, p.length));
    if (lim && editDistance(d, p, lim) <= lim && best.w < 0.85) best = { w: 0.85, exact: false };
    else if (p.length >= 4 && d.startsWith(p) && best.w < 0.5) best = { w: 0.5, exact: false }; // a short form: Ravi for Ravichandran
  };
  doc.forEach(consider);
  for (let i = 0; i + 1 < doc.length; i++) consider(doc[i] + doc[i + 1]); // RAMA CHANDRAN typed as RAMACHANDRAN
  return best;
}

export type NameScore = { score: number; distinct: boolean; exact: boolean; matched: string[]; given: boolean };
/**
 * A typed (or legal) name against the name on a document. score: the share of the typed parts that
 * match (0–1) plus a little for covering the document's parts; distinct: a matched part is not one the
 * family shares; exact: every matched part is spelled the same.
 */
export function nameScore(typed: string | undefined, onDoc: string | undefined, shared: Set<string> = new Set()): NameScore {
  const P = tokens(typed), D0 = tokens(onDoc);
  const none = { score: 0, distinct: false, exact: false, matched: [], given: false };
  if (!P.length || !D0.length) return none;
  // a typed part may cover two document parts ("Radhakrishnan"), and vice versa
  const D = [...D0];
  const parts = P.flatMap((p, i) => (P[i + 1] && D0.includes(p + P[i + 1]) ? [] : [p]));
  let sum = 0, count = 0, exact = true, distinct = false;
  const matched: string[] = [];
  // the document's first part is the given name (names are read as Given … Surname). A typed part
  // matching it outranks one matching only a family name further on: a child whose family name is a
  // parent's given name ("Asha Ravi", daughter of "Ravi Kumar") goes to the child.
  let given = false;
  for (const p of parts) {
    const m = partMatch(p, D);
    if (p.length > 1) count++;
    sum += m.w;
    const first = partMatch(p, [D0[0]]).w;
    if (m.w >= 0.5) { matched.push(p); if (!m.exact) exact = false; if (!shared.has(p) && p.length >= 3 && m.w >= 0.85) distinct = true; }
    // a short form of the given name ("Vijay" for "Vijayakannan") counts when nobody shares it
    if (first >= 0.5 && p.length >= 4 && !shared.has(p)) { given = true; if (first < 0.85) distinct = true; }
  }
  if (!count) return none;
  const cover = D0.filter((d) => parts.some((p) => p.length > 1 && partMatch(p, [d]).w >= 0.85)).length / D0.length;
  return { score: sum / count + 0.15 * cover + (given ? 0.35 : 0), distinct, exact: exact && matched.length > 0, matched, given };
}

/** Parts of names that two or more family members share (a family name): never decisive alone. */
export function sharedParts(members: Member[]): Set<string> {
  const seen = new Map<string, Set<string>>();
  for (const m of members) for (const t of new Set([...tokens(m.name), ...tokens(m.legalName)])) { if (!seen.has(t)) seen.set(t, new Set()); seen.get(t)!.add(m.id); }
  return new Set([...seen].filter(([, ids]) => ids.size > 1).map(([t]) => t));
}

/** Whose document is this. `members` carry passport numbers seen so far (the caller adds each match). */
export function matchDoc(f: DocFields | undefined, members: Member[]): MatchResult {
  if (!f || !members.length) return { why: [] };
  // 1. passport number: decisive (a visa / I-94 / approval follows the passport it was issued in)
  const nos = [f.passportNo, f.oldPassportNo].filter((x): x is string => !!x);
  const byNo = members.filter((m) => nos.some((n) => m.passportNos.includes(n)));
  if (byNo.length === 1) {
    const why: Reason[] = ['passport number'];
    if (f.name && nameScore(byNo[0].legalName ?? byNo[0].name, f.name).score >= 0.8) why.push('name');
    return { id: byNo[0].id, why, rename: renameFor(byNo[0], f) };
  }
  const shared = sharedParts(members);
  const scored = members.map((m) => {
    const typed = nameScore(m.name, f.name, shared);
    const legal = m.legalName ? nameScore(m.legalName, f.name, shared) : undefined;
    // the legal name from the person's own passport outranks a short typed name
    let s = legal && legal.score >= 0.8 ? legal : typed;
    if (legal && legal.score < 0.5 && f.name) s = { ...s, score: Math.min(s.score, 0.45), distinct: false };
    let score = s.score;
    const why: Reason[] = [];
    if (s.distinct && score >= 0.8) why.push('name');
    let dob: 'same' | 'other' | undefined;
    if (f.birthDate && m.birthDate) dob = f.birthDate === m.birthDate ? 'same' : 'other';
    if (dob === 'same') { score += 0.6; why.push('date of birth'); }
    if (dob === 'other') score = 0;
    return { m, score, why, distinct: s.distinct, decisive: dob === 'same' || (s.distinct && score >= 0.8) };
  }).sort((a, b) => b.score - a.score);
  const [top, next] = scored;
  if (top && top.decisive && top.score - (next?.score ?? 0) >= 0.3) return { id: top.m.id, why: top.why, rename: renameFor(top.m, f) };
  // not sure: offer the likeliest first, only when something of their own matched (not a family name)
  return { why: [], close: top && top.score >= 0.5 && top.distinct ? top.m.id : undefined };
}

/** A passport whose name is a close but different spelling of the typed name: offer to update the app. */
function renameFor(m: Member, f: DocFields): MatchResult['rename'] {
  if (!f.name) return undefined;
  const typed = tokens(m.name), doc = tokens(f.name);
  if (!typed.length || typed.join(' ') === doc.join(' ')) return undefined;
  // only a typo: same number of parts as typed, each typed part found, at least one spelled differently
  const s = nameScore(m.name, f.name);
  if (s.exact || s.matched.length !== typed.filter((t) => t.length > 1).length) return undefined;
  const differs = typed.some((t) => t.length > 1 && !doc.includes(t) && doc.some((d) => { const l = allowed(Math.min(d.length, t.length)); return l > 0 && editDistance(d, t, l) <= l; }));
  return differs ? { id: m.id, to: f.name } : undefined;
}

// ---------- a batch (Add several documents at once) ----------
export type BulkDoc = { id: string; type: string; fields: DocFields };
export type BulkEntry = {
  id: string;
  ownerId?: string; // undefined = waiting for "Whose document is this?"
  state: 'filed' | 'ask' | 'duplicate';
  why: Reason[];
  name?: string; // the name read from the document (shown as Name on document)
  close?: string; // ask: the likeliest person, offered first
  dupOf?: string; // duplicate: who already has it
  rename?: { id: string; to: string }; // passport: the typed name is a close misspelling
};

/** Same document twice: a passport by its number; others by type + number / receipt + dates. */
export function dupKey(d: { type: string; fields: DocFields }): string | undefined {
  const f = d.fields;
  if (d.type === 'passport') return f.passportNo ? `passport|${f.passportNo}` : undefined;
  const parts = [f.passportNo, f.receipt, f.validTo, f.entryDate, f.validFrom].map((x) => x ?? '');
  if (!f.validTo && !f.receipt) return undefined;
  return [d.type, ...parts].join('|');
}

/**
 * File each read document: by passport number, birth date and name (matchDoc), in order, so a passport
 * read first lets that person's visa and I-94 follow it. Passport numbers and legal names learnt from
 * each filed passport are used for the documents after it.
 */
export function planBulk(read: BulkDoc[], members0: Member[], saved: { ownerId: string; type: string; fields: DocFields }[] = [], opts: { fallback?: string } = {}): BulkEntry[] {
  const members = members0.map((m) => ({ ...m, passportNos: [...m.passportNos] }));
  const seen = new Map<string, string>();
  for (const d of saved) { const k = dupKey(d); if (k) seen.set(k, d.ownerId); }
  const learn = (id: string, d: BulkDoc) => {
    const m = members.find((x) => x.id === id);
    if (!m) return;
    for (const n of [d.fields.passportNo, d.fields.oldPassportNo]) if (n && !m.passportNos.includes(n)) m.passportNos.push(n);
    if (d.type === 'passport' && d.fields.name && !m.legalName) m.legalName = d.fields.name;
    if (d.fields.birthDate && !m.birthDate && (d.type === 'passport' || d.type === 'i94' || d.type === 'visa')) m.birthDate = d.fields.birthDate;
  };
  // passports first (they teach numbers, legal names and birth dates), then the rest; results in the picked order
  const order = [...read].sort((a, b) => Number(b.type === 'passport') - Number(a.type === 'passport'));
  const out = new Map<string, BulkEntry>();
  for (const d of order) {
    const name = d.fields.name;
    const k = dupKey(d);
    if (k && seen.has(k)) { out.set(d.id, { id: d.id, state: 'duplicate', why: [], name, dupOf: seen.get(k) }); continue; }
    const r = matchDoc(d.fields, members);
    if (r.id) {
      learn(r.id, d);
      if (k) seen.set(k, r.id);
      out.set(d.id, { id: d.id, ownerId: r.id, state: 'filed', why: r.why, name, rename: d.type === 'passport' ? r.rename : undefined });
    } else if (opts.fallback) {
      out.set(d.id, { id: d.id, ownerId: opts.fallback, state: 'filed', why: [], name, close: r.close });
    } else out.set(d.id, { id: d.id, state: 'ask', why: [], name, close: r.close });
  }
  return read.map((d) => out.get(d.id)!);
}

/** "Matched by passport number and name" for the review list. */
export function whyText(why: Reason[]): string {
  if (!why.length) return '';
  const list = why.length === 1 ? why[0] : `${why.slice(0, -1).join(', ')} and ${why[why.length - 1]}`;
  return `Matched by ${list}`;
}
