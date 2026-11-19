// What Home shows first (v2.7). Pure — tested in tests/priority.test.ts.
//
// Owner's rule: a card shows the MOST IMPORTANT thing, never decoration or an arbitrary number.
//   hero      = the family's single most urgent item from the rules engine: an act-now finding, a
//               review finding, or the nearest deadline — who, what, days left, what to do next and
//               progress toward the date. Nothing urgent → "All good · next date <x>".
//   two tiles = the next two most useful facts, picked by score (not a fixed pair).
// Colour is meaning: sage = good, butter = attention / soon, blush = urgent, sky = information.
import { daysBetween, fmt } from './dates';
import type { Finding } from './rules/types';

export type Meaning = 'sage' | 'butter' | 'blush' | 'sky';
export type Target = { to: 'person' | 'case' | 'cases' | 'docs' | 'backup' | 'family'; id?: string };

export type Hero = {
  kind: 'act' | 'review' | 'deadline' | 'setup' | 'allgood';
  key: string; // what it is about (so a tile doesn't repeat it)
  tone: Meaning;
  label: string; // "Act now" · "Review" · "Next deadline" · "All good"
  chip?: string; // visa or form, e.g. "L-1A", "I-765"
  big: string; // "221 days" · "Act now" · "All good"
  who?: string;
  what: string;
  next?: string; // what to do next
  date?: string;
  days?: number;
  progress?: number; // 0…1 toward the date
  target: Target;
};
export type Tile = { key: string; score: number; tone: Meaning; icon: string; label: string; big: string; sub?: string; target: Target };

export type PriorityInput = {
  today: string;
  people: { id: string; name: string }[];
  results: Record<string, { findings: Finding[]; facts: { visaLabel?: string; statusUntil?: string; workUntil?: string; travelDocUntil?: string } } | undefined>;
  /** when each person's current stay started (for the progress bar), if known */
  starts?: Record<string, string | undefined>;
  filings: { personId: string; form: string; title: string; earliest: string; deadline?: string; filed?: unknown; kind?: string }[];
  cases: { id: string; ownerId: string; form?: string; status: string; updated?: string; keyDates: { label: string; date: string }[] }[];
  docs: { saved: number; missing: number; expiring: number };
  backup: { due: boolean; lastAt?: string };
};

/** A dated item counts down in the hero when it is this close; further out Home says "All good". */
export const HERO_HORIZON_DAYS = 270;
/** A case counts as "changed" for this many days after its last update. */
export const CASE_CHANGE_DAYS = 14;

const days = (from: string, to: string) => daysBetween(from, to);
export const toneForDays = (n: number): Meaning => (n <= 30 ? 'blush' : n <= 180 ? 'butter' : 'sage');
export const daysText = (n: number) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`);
/** Compact time left for charts: 221d · 7m · 2.2y. */
export function shortSpan(n: number): string {
  if (n < 0) return 'Ended';
  if (n < 100) return `${n}d`;
  if (n < 730) return `${Math.round(n / 30.4)}m`;
  return `${(n / 365.25).toFixed(1).replace(/\.0$/, '')}y`;
}
const firstSentence = (s: string) => { const m = s.match(/^.*?[.!?](\s|$)/); const x = (m ? m[0] : s).trim().replace(/\.$/, ''); return x.length <= 70 ? x : undefined; };
const lower1 = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

type Dated = { personId: string; date: string; what: string; chip?: string; key: string; target: Target };

/** Every future date the family has, nearest first (ties keep the family order: principal first). */
export function upcoming(i: PriorityInput): Dated[] {
  const out: Dated[] = [];
  const idx = new Map(i.people.map((p, n) => [p.id, n]));
  for (const p of i.people) {
    const r = i.results[p.id];
    if (!r) continue;
    const f = r.facts;
    if (f.statusUntil && f.statusUntil >= i.today) out.push({ personId: p.id, date: f.statusUntil, what: 'status ends', chip: f.visaLabel, key: `status:${p.id}`, target: { to: 'person', id: p.id } });
    if (f.workUntil && f.workUntil >= i.today && f.workUntil !== f.statusUntil) out.push({ personId: p.id, date: f.workUntil, what: 'work permit ends', chip: 'EAD', key: `work:${p.id}`, target: { to: 'person', id: p.id } });
    if (f.travelDocUntil && f.travelDocUntil >= i.today && f.travelDocUntil !== f.workUntil) out.push({ personId: p.id, date: f.travelDocUntil, what: 'travel document ends', chip: 'Travel', key: `travel:${p.id}`, target: { to: 'person', id: p.id } });
  }
  for (const c of i.cases) for (const k of c.keyDates) {
    if (k.date >= i.today && idx.has(c.ownerId)) out.push({ personId: c.ownerId, date: k.date, what: lower1(k.label), chip: c.form, key: `case:${c.id}`, target: { to: 'case', id: c.id } });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (idx.get(a.personId)! - idx.get(b.personId)!));
}

function progressTo(i: PriorityInput, personId: string, date: string): number {
  const left = Math.max(0, days(i.today, date));
  const start = i.starts?.[personId];
  if (start && start < i.today && start < date) return clamp(days(start, i.today) / Math.max(1, days(start, date)));
  return clamp(1 - left / 365); // no start date known: the last year before the date
}
const clamp = (x: number) => Math.max(0.03, Math.min(1, x));

/** What to do next for a dated item: the person's filing window, when there is one. */
function nextStep(i: PriorityInput, d: Dated): string | undefined {
  if (!d.key.startsWith('status:') && !d.key.startsWith('work:')) return undefined;
  const f = i.filings.find((x) => x.personId === d.personId && !x.filed && x.kind !== 'report' && (d.key.startsWith('work:') ? x.form === 'I-765' : x.form !== 'I-765'));
  if (!f) return undefined;
  return f.earliest <= i.today ? `you can file the ${f.form} now` : `file the ${f.form} from ${fmt(f.earliest)}`;
}

export function homeHero(i: PriorityInput): Hero {
  const name = (id: string) => i.people.find((p) => p.id === id)?.name ?? '';
  const idx = new Map(i.people.map((p, n) => [p.id, n]));
  const found = (sev: 'act' | 'review') => i.people.flatMap((p) => (i.results[p.id]?.findings ?? []).filter((f) => f.severity === sev).map((f) => ({ p, f })))
    .sort((a, b) => (a.f.date || '9999').localeCompare(b.f.date || '9999') || idx.get(a.p.id)! - idx.get(b.p.id)!);
  const fromFinding = (x: { p: { id: string; name: string }; f: Finding }, kind: 'act' | 'review'): Hero => {
    const n = x.f.date ? days(i.today, x.f.date) : undefined;
    const future = n !== undefined && n >= 0;
    return {
      kind, key: `finding:${x.p.id}:${x.f.id}`, tone: kind === 'act' ? 'blush' : 'butter', label: kind === 'act' ? 'Act now' : 'Review',
      chip: i.results[x.p.id]?.facts.visaLabel, big: future ? daysText(n!) : kind === 'act' ? 'Act now' : 'Review',
      who: x.p.name, what: x.f.title, next: firstSentence(x.f.detail), date: x.f.date, days: future ? n : undefined,
      progress: future ? progressTo(i, x.p.id, x.f.date!) : undefined, target: { to: 'person', id: x.p.id },
    };
  };
  const act = found('act')[0];
  if (act) return fromFinding(act, 'act');
  // nothing saved yet: the most useful thing is the first document (the checks need it)
  if (i.docs.saved === 0 && i.docs.missing > 0) {
    return { kind: 'setup', key: 'docs', tone: 'sky', label: 'Get started', big: 'Add documents', what: 'Start with the passport', next: 'each one is read on this phone', target: { to: 'docs' } };
  }

  const dates = upcoming(i);
  const near = dates[0];
  const nearDays = near ? days(i.today, near.date) : undefined;
  const deadline = (d: Dated): Hero => {
    const n = days(i.today, d.date);
    return {
      kind: 'deadline', key: d.key, tone: toneForDays(n), label: 'Next deadline', chip: d.chip, big: daysText(n), who: name(d.personId),
      what: `${d.what} ${fmt(d.date)}`, next: nextStep(i, d), date: d.date, days: n, progress: progressTo(i, d.personId, d.date), target: d.target,
    };
  };
  if (near && nearDays! <= 30) return deadline(near);
  const review = found('review')[0];
  if (review) return fromFinding(review, 'review');
  if (near && nearDays! <= HERO_HORIZON_DAYS) return deadline(near);
  return {
    kind: 'allgood', key: 'allgood', tone: 'sage', label: i.people.length > 1 ? 'Your family' : 'Your status', big: 'All good',
    who: near ? name(near.personId) : undefined, what: near ? `Next date ${fmt(near.date)}` : 'Nothing needs attention',
    next: near ? near.what.replace(/ ends$/, '') : undefined, date: near?.date, days: nearDays, target: near ? near.target : { to: 'family' },
  };
}

/** One line under the big number: who · what · what to do next. */
export const heroLine = (h: Hero) => [h.kind === 'allgood' ? undefined : h.who, h.what, h.kind === 'allgood' && h.who && h.next ? `${h.who}’s ${h.next}` : h.next].filter(Boolean).join(' · ');

/** Every useful fact with a score; Home shows the top two that the hero isn't already about. */
export function tileCandidates(i: PriorityInput): Tile[] {
  const out: Tile[] = [];
  const name = (id: string) => i.people.find((p) => p.id === id)?.name ?? '';
  const pending = i.cases.filter((c) => c.status === 'Pending' || c.status === 'RFE');
  const rfe = pending.find((c) => c.status === 'RFE');
  if (rfe) out.push({ key: `case:${rfe.id}`, score: 95, tone: 'blush', icon: 'alert', label: 'Evidence requested', big: rfe.form ?? 'RFE', sub: name(rfe.ownerId), target: { to: 'case', id: rfe.id } });
  const total = i.docs.saved + i.docs.missing;
  if (i.docs.saved === 0 && i.docs.missing > 0) out.push({ key: 'docs', score: 92, tone: 'butter', icon: 'doc', label: 'Documents', big: 'Add first', sub: `${i.docs.missing} to add`, target: { to: 'docs' } });
  const open = i.filings.filter((f) => !f.filed && f.kind !== 'report' && f.earliest <= i.today && (!f.deadline || f.deadline >= i.today)).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))[0];
  if (open) out.push({ key: `filing:${open.personId}:${open.form}`, score: 85, tone: 'sky', icon: 'cal', label: 'Filing window open', big: open.form, sub: `${name(open.personId)} · ${open.title}`, target: { to: 'person', id: open.personId } });
  const changed = i.cases.filter((c) => c.updated && c.updated <= i.today && days(c.updated, i.today) <= CASE_CHANGE_DAYS && c.id !== rfe?.id).sort((a, b) => b.updated!.localeCompare(a.updated!))[0];
  if (changed) out.push({ key: `case:${changed.id}`, score: 80, tone: changed.status === 'Approved' ? 'sage' : changed.status === 'Denied' ? 'blush' : 'sky', icon: 'refresh', label: 'Case update', big: changed.form ?? 'Case', sub: `${changed.status} · ${fmt(changed.updated)}`, target: { to: 'case', id: changed.id } });
  if (i.docs.expiring > 0) out.push({ key: 'expiring', score: 75, tone: 'butter', icon: 'clock', label: 'Expiring soon', big: String(i.docs.expiring), sub: i.docs.expiring === 1 ? 'document' : 'documents', target: { to: 'family' } });
  if (i.docs.saved > 0 && i.docs.missing > 0) out.push({ key: 'docs', score: 70, tone: 'butter', icon: 'doc', label: 'Documents', big: `${i.docs.saved} of ${total}`, sub: `${i.docs.missing} missing`, target: { to: 'docs' } });
  if (i.backup.due) out.push({ key: 'backup', score: 60, tone: 'butter', icon: 'backup', label: 'Backup overdue', big: i.backup.lastAt ? daysText(Math.max(0, days(i.backup.lastAt.slice(0, 10), i.today))) : 'Never', sub: i.backup.lastAt ? 'since the last backup' : 'backed up', target: { to: 'backup' } });
  if (pending.length) out.push({ key: 'cases', score: 40, tone: 'sky', icon: 'case', label: 'Open cases', big: String(pending.length), sub: pending.length === 1 ? `${pending[0].form ?? 'Case'} · pending` : 'pending', target: { to: 'cases' } });
  const soon = i.filings.filter((f) => !f.filed && f.kind !== 'report' && f.earliest > i.today).sort((a, b) => a.earliest.localeCompare(b.earliest))[0];
  if (soon) out.push({ key: `filing:${soon.personId}:${soon.form}`, score: 35, tone: 'sky', icon: 'cal', label: 'Filing opens', big: fmt(soon.earliest).replace(/, \d{4}$/, ''), sub: `${soon.form} · ${name(soon.personId)}`, target: { to: 'person', id: soon.personId } });
  if (total > 0 && i.docs.missing === 0) out.push({ key: 'docs', score: 20, tone: 'sage', icon: 'doc', label: 'Documents', big: `${i.docs.saved} of ${total}`, sub: 'all added', target: { to: 'family' } });
  if (!i.cases.length) out.push({ key: 'cases', score: 12, tone: 'sky', icon: 'case', label: 'Cases', big: 'None yet', sub: 'add a receipt', target: { to: 'cases' } });
  out.push({ key: 'family', score: 10, tone: 'sky', icon: 'users', label: 'Family', big: String(i.people.length), sub: i.people.length === 1 ? 'person' : 'people', target: { to: 'family' } });
  return out.sort((a, b) => b.score - a.score);
}

export function homeTiles(i: PriorityInput, hero: Hero = homeHero(i), n = 2): Tile[] {
  const seen = new Set<string>([hero.key]);
  const out: Tile[] = [];
  for (const t of tileCandidates(i)) {
    if (seen.has(t.key)) continue;
    // the hero already counts down this person's status: its "filing window open" tile would repeat it
    if (hero.kind === 'deadline' && t.key.startsWith('filing:') && hero.target.id === t.target.id && hero.next) continue;
    seen.add(t.key); out.push(t);
    if (out.length === n) break;
  }
  return out;
}

// ---------- status view: ring (valid / expiring / expired / missing) + bars (time left) ----------
export type DocState = 'valid' | 'expiring' | 'expired';
export type DocTime = { id: string; ownerId: string; label: string; until: string; days: number; state: DocState };
/** A document "expires soon" inside this window (same 180 days the document notes use). */
export const EXPIRING_DAYS = 180;
export const docState = (n: number): DocState => (n < 0 ? 'expired' : n <= EXPIRING_DAYS ? 'expiring' : 'valid');

export type StatusSummary = { valid: number; expiring: number; expired: number; missing: number; undated: number; bars: DocTime[] };
/** Counts for the ring and the bars sorted by urgency (least time left first). Superseded copies are left out by the caller. */
export function statusSummary(docs: { id: string; ownerId: string; label: string; until?: string }[], missing: number, today: string): StatusSummary {
  const s: StatusSummary = { valid: 0, expiring: 0, expired: 0, missing, undated: 0, bars: [] };
  for (const d of docs) {
    if (!d.until || !/^\d{4}-\d{2}-\d{2}$/.test(d.until)) { s.undated++; s.valid++; continue; } // no end date (D/S I-94, receipts): nothing to expire
    const n = days(today, d.until);
    const st = docState(n);
    s[st]++;
    s.bars.push({ id: d.id, ownerId: d.ownerId, label: d.label, until: d.until, days: n, state: st });
  }
  s.bars.sort((a, b) => a.days - b.days);
  return s;
}
/** Bar height: time left, where two years or more is a full bar. */
export const barFill = (n: number) => Math.max(0.06, Math.min(1, n / 730));
export const stateTone = (s: DocState): Meaning => (s === 'valid' ? 'sage' : s === 'expiring' ? 'butter' : 'blush');

// ---------- wallet-style card at the top of a person page ----------
export type WalletFacts = { caption: string; big: string; corner?: string; word?: string; wordTone?: 'green' | 'amber' | 'red'; days?: number };
/** Name card facts: in status until when, and how many days are left. `line` is the person's one-line status. */
export function walletFacts(o: { today: string; hasDocs: boolean; citizen?: boolean; outside?: boolean; resident?: boolean; until?: string; label?: string }): WalletFacts {
  if (o.citizen) return { caption: 'Status', big: 'US citizen' };
  if (!o.hasDocs) return { caption: 'Status', big: 'Add documents' };
  if (o.outside) return { caption: 'Right now', big: 'Outside the US' };
  const corner = o.until ? `${o.until.slice(5, 7)}/${o.until.slice(2, 4)}` : undefined;
  if (!o.until) return { caption: 'Status', big: o.resident ? 'Resident' : o.label ?? 'In the US' };
  const n = days(o.today, o.until);
  if (n < 0) return { caption: o.resident ? 'Card expired' : 'Status ended', big: `${daysText(-n)} ago`, corner, word: 'expired', wordTone: 'red', days: n };
  const t = toneForDays(n);
  return { caption: o.resident ? 'Card valid for' : 'In status for', big: daysText(n), corner, word: t === 'blush' ? 'ends soon' : t === 'butter' ? 'plan ahead' : 'valid', wordTone: t === 'blush' ? 'red' : t === 'butter' ? 'amber' : 'green', days: n };
}
