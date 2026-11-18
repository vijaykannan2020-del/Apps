// USCIS case status, the way a person does it (ported from the first app's uscisSafari.ts): the
// receipt number is copied, Case Status Online opens in Safari, the person copies what the page says
// and pastes it back. parseCaseText reads the status heading, date and form; applyCaseText turns it
// into the case's status, history and key dates. CaseDesk never logs in to USCIS or reads the site.
import type { Case, CaseStatus, KeyDate } from './model';

export const USCIS_CASE_URL = 'https://egov.uscis.gov/';

export type Parsed = { status: string; detail: string; form?: string; date?: string };

// Status headings USCIS uses, matched from the explanation when only that was copied.
const FROM_DETAIL: [RegExp, string][] = [
  [/we (have )?approved/i, 'Case Was Approved'],
  [/we denied/i, 'Case Was Denied'],
  [/rejected/i, 'Case Rejected'],
  [/received your response to our request for evidence/i, 'Response To USCIS Request For Evidence Was Received'],
  [/request for (initial )?evidence|sent you a request for/i, 'Request for Evidence Was Sent'],
  [/(new )?card (was )?(produced|is being produced)|ordered your new card/i, 'New Card Is Being Produced'],
  [/card (was )?mailed|mailed your new card/i, 'Card Was Mailed To Me'],
  [/delivered your new card|card was delivered/i, 'Card Was Delivered To Me By The Post Office'],
  [/fingerprint/i, 'Case Was Updated To Show Fingerprints Were Taken'],
  [/scheduled an interview|interview (was )?scheduled/i, 'Interview Was Scheduled'],
  [/transferred your case/i, 'Case Was Transferred And A New Office Has Jurisdiction'],
  [/actively review/i, 'Case Is Being Actively Reviewed By USCIS'],
  [/received your (form|case)|we received/i, 'Case Was Received'],
];

const MONTH = /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (m: RegExpMatchArray) => `${m[3]}-${String(MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
const looksLikeHeading = (l: string) => l.length >= 8 && l.length <= 90 && !/[.:]$/.test(l) && /^[A-Z]/.test(l) && !/^on [A-Z][a-z]+ \d/i.test(l);

export function parseCaseText(raw: string, receipt?: string): Parsed | null {
  if (!raw) return null;
  const text = raw.replace(/\r/g, '').trim();
  if (text.length < 15) return null;
  if (receipt && text.replace(/\s/g, '').toUpperCase() === receipt) return null; // still the receipt we copied
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(case status online|check case status|enter a receipt number|receipt number:?)$/i.test(l));
  if (!lines.length) return null;
  // The explanation: the longest sentence-like line (usually starts "On <date>, we …").
  const detailLine = lines.filter((l) => l.length > 40).sort((a, b) => (/^on [A-Z][a-z]+ \d/i.test(b) ? 1 : 0) - (/^on [A-Z][a-z]+ \d/i.test(a) ? 1 : 0) || b.length - a.length)[0];
  if (!detailLine) return null;
  const idx = lines.indexOf(detailLine);
  const heading = lines.slice(0, idx).reverse().find(looksLikeHeading);
  const status = heading || FROM_DETAIL.find(([re]) => re.test(detailLine))?.[1];
  if (!status) return null;
  const form = detailLine.match(/Form\s+([A-Z]-?\d{2,4}[A-Z]?)/)?.[1]?.replace(/^([A-Z])(\d)/, '$1-$2');
  const d = detailLine.match(new RegExp(`^(?:On|As of)\\s+${MONTH.source}`, 'i'));
  const date = d ? iso(d) : undefined;
  return { status, detail: detailLine, form, date };
}

/** CaseDesk's status for a USCIS heading. */
export function statusOf(heading: string): CaseStatus {
  const h = heading.toLowerCase();
  if (/denied|rejected|terminated/.test(h)) return 'denied';
  if (/withdraw/.test(h)) return 'withdrawn';
  if (/approved|card (is being produced|was produced|was mailed|was delivered|was picked up)|new card|oath ceremony/.test(h)) return 'approved';
  if (/request for (initial )?evidence was sent|intent to deny/.test(h)) return 'rfe';
  return 'pending';
}

/** Interview / biometrics / oath appointment date mentioned in the explanation (future ones only). */
function appointment(p: Parsed, todayIso: string): KeyDate | undefined {
  const h = `${p.status} ${p.detail}`.toLowerCase();
  const kind: KeyDate['kind'] | undefined = /interview/.test(h) ? 'interview' : /biometric|fingerprint appointment/.test(h) ? 'biometrics' : /oath/.test(h) ? 'oath' : undefined;
  if (!kind) return undefined;
  const all = [...p.detail.matchAll(new RegExp(MONTH.source, 'g'))].map((m) => iso(m));
  const next = all.filter((d) => d > todayIso).sort()[0];
  return next ? { kind, date: next } : undefined;
}

/** Update a case from what USCIS said: status, a history line (no duplicates), form if unknown, key date. */
export function applyCaseText(c: Case, p: Parsed, todayIso: string): Case {
  const date = p.date ?? todayIso;
  const text = p.status;
  const dup = c.history.some((h) => h.text === text && h.date.slice(0, 10) === date);
  const kd = appointment(p, todayIso);
  const hasKd = kd && c.keyDates.some((k) => k.kind === kd.kind && k.date === kd.date);
  return {
    ...c,
    form: c.form ?? p.form,
    status: statusOf(p.status),
    history: dup ? c.history : [{ date, text }, ...c.history],
    keyDates: kd && !hasKd ? [...c.keyDates, kd] : c.keyDates,
  };
}
