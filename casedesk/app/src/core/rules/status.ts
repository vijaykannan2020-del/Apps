// Status dates every screen shows — valid until, 240-day cover, grace period, cap-gap, max stay,
// day counters — worked out once per person (dependents after their principal) and shared by the
// rules and the screens.
import { addDays, addMonths, addYears, daysBetween, daysTo, fmt, maxDate, minDate, today } from '../dates';
import type { Person } from '../model';
import { canBeBlanket, hasPetition } from '../model';
import type { PersonRecord } from '../record';

export const MAX_YEARS: Record<string, number> = { 'H-1B': 6, 'L-1A': 7, 'L-1B': 5 };
export const F1_FIXED_I94_FROM = '2026-09-15';

export const isBlanket = (r: PersonRecord) => r.blanket && canBeBlanket(r.visa);
export const pendingKind = (r: PersonRecord) => r.pending?.kind;
/** Filed before the I-94 ended. */
export const timely = (r: PersonRecord) => !!r.pending?.filed && (!r.i94?.until || r.pending.filed <= r.i94.until);
/** 240-day rule: a same-employer extension for H-1B / L-1 / TN / E-3 / O-1, filed on time. Never for a transfer. */
export const uses240 = (r: PersonRecord) => hasPetition(r.visa) && timely(r) && pendingKind(r) === 'extension';

const F1 = ['F-1', 'F-1 OPT', 'STEM OPT'];
export const isF1 = (r: PersonRecord) => !!r.visa && F1.includes(r.visa);

/** Grace after a student program / OPT: F-1 60 days (30 if admitted on a fixed I-94 from 15 Sep 2026); J-1 30 days. */
export function studentGraceDays(r: PersonRecord) {
  if (r.visa === 'J-1' || r.visa === 'J-2') return 30;
  return r.i94 && !r.i94.ds && (r.i94.issuedOn ?? '') >= F1_FIXED_I94_FROM ? 30 : 60;
}

/** 240-day cover after the I-94 date while a timely same-employer extension is pending. */
export function coverUntil(r?: PersonRecord): string | undefined {
  if (!r || r.location === 'Outside' || !r.i94?.until || !uses240(r) || daysTo(r.i94.until)! >= 0) return undefined;
  return addDays(r.i94.until, 240);
}

/** Job ended: up to 60 days, never past the I-94 (H-1B, L-1, E-3, TN, O-1). */
export function jobGrace(r: PersonRecord | undefined, p?: Person): string | undefined {
  const ended = p?.facts?.jobEnded;
  if (!r || !ended || !hasPetition(r.visa)) return undefined;
  return minDate(addDays(ended, 60), r.i94?.until);
}

export function maxOutDate(r: PersonRecord): string | undefined {
  const n = r.visa ? MAX_YEARS[r.visa] : undefined;
  return r.statusStart && n ? addDays(addYears(r.statusStart, n), -1) : undefined;
}

/** Trips ahead (dated), or "travelling soon" ticked. */
export function plannedTrips(r: PersonRecord, p: Person) {
  const t = today();
  const dated = r.trips.filter((x) => x.planned && (!x.depart || x.depart >= t || (x.return ?? '9999') >= t));
  return { any: dated.length > 0 || !!p.facts?.travelPlanned, dated };
}

/** Days outside the US on logged trips since a date (travel days count as days in the US). */
export function daysOutside(trips: { depart?: string; return?: string; planned: boolean }[], since?: string) {
  const t = today();
  let n = 0;
  for (const x of trips) {
    if (x.planned || !x.depart) continue;
    const from = since && x.depart < since ? since : x.depart;
    const to = x.return && x.return < t ? x.return : t;
    if (to > from) n += Math.max(0, daysBetween(from, to) - 1);
  }
  return n;
}
export const tripLengths = (trips: { depart?: string; return?: string; planned: boolean }[]) =>
  trips.filter((x) => !x.planned && x.depart && x.return).sort((a, b) => a.depart!.localeCompare(b.depart!)).map((x) => daysBetween(x.depart!, x.return!) - 1);

// ---------- cap-gap ----------
export type CapGap = { until?: string; work: boolean; receipt?: string; ended?: { on?: string; how: 'denied' | 'withdrawn' } };

/** F-1 whose OPT / program ended, with a cap H-1B change-of-status petition on file (H-1B modernization rule: to Apr 1). */
export function capGapOf(r: PersonRecord, manual: { receipt: string; status?: string; history?: unknown }[] = []): CapGap | undefined {
  if (!isF1(r)) return undefined;
  const h = r.cases.find((x) => x.form === 'I-129' && (x.cls === 'H1B' || x.kind === 'change-of-status'));
  if (!h) return undefined;
  const optEnded = r.ead ? (daysTo(r.ead.expires) ?? 1) < 0 : (daysTo(r.i20?.programEnd) ?? 1) < 0;
  if (!optEnded) return undefined;
  const all = r.cases.filter((x) => x.receipt && x.receipt === h.receipt);
  const denied = all.find((x) => x.status === 'denied');
  const m = manual.find((x) => x.receipt === h.receipt && (x.status === 'denied' || x.status === 'withdrawn'));
  const filed = h.received ?? all.map((x) => x.received).find(Boolean);
  const work = !!r.ead?.expires && !!filed && filed <= r.ead.expires && (!r.ead.validFrom || filed >= r.ead.validFrom);
  if (denied || m) return { work: false, receipt: h.receipt, ended: { on: denied?.noticeDate, how: m?.status === 'withdrawn' ? 'withdrawn' : 'denied' } };
  const start = all.map((x) => x.requestedStart ?? (x.status === 'approved' ? undefined : undefined)).find(Boolean) ?? `${(filed ?? today()).slice(0, 4)}-10-01`;
  const approved = all.find((x) => x.status === 'approved');
  return { until: approved?.validTo && approved.cls === 'H1B' ? start : `${+start.slice(0, 4) + 1}-04-01`, work, receipt: h.receipt };
}

// ---------- the per-person summary ----------
export type StatusFacts = {
  visaLabel: string; // "H-1B", "F-1 (post-completion OPT)", "Conditional green card (CR6)", "Visa not confirmed"
  statusUntil?: string; // the date status runs to (I-94, OPT / program end on D/S, card date for conditional residents)
  graceUntil?: string;
  coverUntil?: string;
  capGap?: CapGap;
  unemployment?: { days: number; limit: number };
  cardPlusReceiptUntil?: string;
  workUntil?: string;
  travelDocUntil?: string;
  maxOutDate?: string;
  recaptureDays?: number;
  daysOutsideByTrip: number[];
  citizenship?: { years: 3 | 5; fileFrom: string; needed: number; daysInUS?: number };
};

/** OPT unemployment: calendar days from the first OPT start to today, inclusive, minus days employed (inclusive). */
export function unemploymentDays(r: PersonRecord, p: Person): number | undefined {
  if (p.facts?.unemploymentDays !== undefined) return p.facts.unemploymentDays;
  const jobs = p.facts?.employment;
  if (!jobs) return undefined;
  const optEad = r.ead && ['C3B', 'C3C'].includes(r.ead.category ?? '') ? r.ead.validFrom : undefined;
  const start = minDate(r.i20?.optStart, r.visa === 'F-1 OPT' ? optEad : undefined) ?? optEad;
  if (!start) return undefined;
  const t = today();
  const end = minDate(t, r.ead?.expires) ?? t;
  if (end < start) return 0;
  let employed = 0;
  // merge overlapping jobs
  const spans = jobs.map((j) => [maxDate(j.start, start)!, minDate(j.end ?? t, end)!] as const).filter(([a, b]) => b >= a).sort((a, b) => a[0].localeCompare(b[0]));
  let cur: [string, string] | undefined;
  for (const [a, b] of spans) {
    if (cur && a <= addDays(cur[1], 1)) cur[1] = maxDate(cur[1], b)!;
    else { if (cur) employed += daysBetween(cur[0], cur[1]) + 1; cur = [a, b]; }
  }
  if (cur) employed += daysBetween(cur[0], cur[1]) + 1;
  return daysBetween(start, end) + 1 - employed;
}

export function visaLabel(r: PersonRecord, cap?: CapGap, principalCap?: CapGap): string {
  const v = r.visa;
  if (!v) return 'Visa not confirmed';
  if (v === 'F-1 OPT') return cap && !cap.ended ? 'F-1 (cap-gap)' : 'F-1 (post-completion OPT)';
  if (v === 'STEM OPT') return cap && !cap.ended ? 'F-1 (cap-gap)' : 'F-1 (STEM OPT)';
  if (v === 'F-1') return cap && !cap.ended ? 'F-1 (cap-gap)' : 'F-1';
  if (v === 'F-2' && principalCap && !principalCap.ended) return 'F-2 (cap-gap)';
  if (v === 'Green card pending') return r.gcOnEad ? 'EAD (C9) · I-485 pending' : 'Green card applicant (I-485 pending)';
  if (v === 'Green card' || v === 'Conditional green card') return r.greenCard?.category ? `${v} (${r.greenCard.category})` : v;
  return v;
}

type Who = { person: Person; rec: PersonRecord };
export function statusFacts(me: Who, principal: Who | undefined, principalFacts: StatusFacts | undefined, manualCases: { receipt: string; status?: string }[] = []): StatusFacts {
  const { person: p, rec: r } = me;
  const cap = capGapOf(r, manualCases);
  const out: StatusFacts = { visaLabel: visaLabel(r, cap, principalFacts?.capGap), daysOutsideByTrip: tripLengths(r.trips) };
  out.capGap = cap;
  const v = r.visa;
  const ds = !!r.i94?.ds;
  const graceDays = studentGraceDays(r);
  const dependentOfPrincipal = !!principal && principal.person.id !== p.id;

  // ---- status until ----
  if (v === 'US citizen' || r.location === 'Outside') out.statusUntil = undefined;
  else if (v === 'Conditional green card' && r.greenCard?.expires) {
    const i751 = r.cases.some((x) => x.form === 'I-751' && x.status === 'pending');
    out.statusUntil = i751 ? addMonths(r.greenCard.expires, 48) : r.greenCard.expires;
    if (i751) out.cardPlusReceiptUntil = out.statusUntil;
  } else if (v === 'Green card') {
    if (r.greenCard?.expires && r.cases.some((x) => x.form === 'I-90' && x.status === 'pending')) out.cardPlusReceiptUntil = addMonths(r.greenCard.expires, 36);
  } else if (v === 'Green card pending') {
    // v2.9: working on the EAD (C9) — the card date is the date that counts for work.
    out.statusUntil = r.gcOnEad ? r.ead?.expires : undefined;
  } else if (cap) {
    out.statusUntil = cap.ended ? undefined : cap.until;
  } else if (v === 'F-1 OPT' || v === 'STEM OPT') {
    out.statusUntil = ds ? r.ead?.expires : minDate(r.i94?.until, r.ead?.expires);
  } else if (v === 'F-1') {
    out.statusUntil = ds ? r.i20?.programEnd : minDate(r.i94?.until, r.i20?.programEnd) ?? r.i94?.until;
  } else if (v === 'J-1') {
    out.statusUntil = ds ? r.ds2019?.end : minDate(r.i94?.until, r.ds2019?.end) ?? r.i94?.until;
  } else if ((v === 'F-2' || v === 'J-2') && ds && dependentOfPrincipal) {
    out.statusUntil = principalFacts?.statusUntil;
  } else out.statusUntil = r.i94?.until;

  // ---- grace ----
  const jg = jobGrace(r, p);
  if (jg) out.graceUntil = jg;
  else if (dependentOfPrincipal && principalFacts?.graceUntil && ['spouse', 'child'].includes(p.relation)) {
    out.graceUntil = (v === 'F-2' || v === 'J-2') ? principalFacts.graceUntil : minDate(principalFacts.graceUntil, r.i94?.until);
  } else if (cap?.ended) out.graceUntil = cap.ended.on ? addDays(cap.ended.on, graceDays) : undefined;
  else if (!cap && (v === 'F-1 OPT' || v === 'STEM OPT' || v === 'F-1' || v === 'J-1') && out.statusUntil) out.graceUntil = addDays(out.statusUntil, graceDays);

  out.coverUntil = coverUntil(r);
  // ---- work / travel documents ----
  if (r.ead?.expires) out.workUntil = r.ead.expires;
  if (r.advanceParole?.expires) out.travelDocUntil = r.advanceParole.expires;
  // ---- counters ----
  const u = (v === 'F-1 OPT' || v === 'STEM OPT') ? unemploymentDays(r, p) : undefined;
  if (u !== undefined) out.unemployment = { days: u, limit: v === 'STEM OPT' ? 150 : 90 };
  out.maxOutDate = maxOutDate(r);
  if (v === 'H-1B') {
    const rc = daysOutside(r.trips, r.statusStart);
    if (rc > 0) out.recaptureDays = rc;
  }
  // ---- citizenship ----
  const gc = r.greenCard;
  if (gc?.residentSince && (v === 'Green card' || v === 'Conditional green card')) {
    const years = p.facts?.marriedToCitizen ? 3 : 5;
    const fileFrom = addDays(addYears(gc.residentSince, years), -90);
    const loggedHistory = r.trips.some((t) => !t.planned);
    const daysInUS = p.facts?.daysInUS ?? (loggedHistory ? daysBetween(gc.residentSince, today()) + 1 - daysOutside(r.trips, gc.residentSince) : undefined);
    out.citizenship = { years, fileFrom, needed: years === 3 ? 548 : 913, daysInUS };
  }
  void fmt;
  return out;
}

/** One line for a person card. */
export function statusLine(r: PersonRecord | undefined, s?: StatusFacts): string {
  if (!r) return 'No documents yet';
  if (r.visa === 'US citizen') return 'US citizen';
  if (r.location === 'Outside') {
    const v = r.visaStamp?.expires;
    return `Outside the US${r.country ? ` · in ${r.country}` : ''}${v ? ` · visa ${daysTo(v)! < 0 ? 'expired' : `valid until ${fmt(v)}`}` : ''}`;
  }
  if (r.greenCard) {
    const exp = r.greenCard.expires;
    const ext = s?.cardPlusReceiptUntil;
    const form = r.greenCard.conditional ? 'I-751' : 'I-90';
    if (exp && (daysTo(exp) ?? 0) < 0) {
      if (ext) return `Card expired ${fmt(exp)} · extended to ${fmt(ext)} by the ${form} receipt`;
      return r.greenCard.conditional ? `Conditional card expired ${fmt(exp)}` : `Card expired ${fmt(exp)} · still a resident`;
    }
    if (exp) return `${r.greenCard.conditional ? 'Conditional resident' : 'Permanent resident'} · card valid until ${fmt(exp)}`;
    return 'Green card holder';
  }
  if (r.visa === 'Green card pending') return s?.workUntil ? `Green card pending · work permit until ${fmt(s.workUntil)}` : 'Green card pending';
  if (s?.graceUntil && s.statusUntil && s.graceUntil < s.statusUntil) return `Grace period until ${fmt(s.graceUntil)}`;
  if (s?.coverUntil) return `Extension pending · covered until ${fmt(s.coverUntil)}`;
  const until = s?.statusUntil ?? r.i94?.until;
  if (!until) return r.i94?.ds ? 'In the US · I-94 “D/S”' : 'In the US · no I-94 yet';
  return daysTo(until)! < 0 ? `Status ended ${fmt(until)}` : `Status valid until ${fmt(until)}`;
}
