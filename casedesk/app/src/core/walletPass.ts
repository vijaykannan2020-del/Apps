// Apple Wallet "Immigration status card" (v2.5): the card fields the app sends once to the server to
// sign a pass. Pure. For personal reference only — NOT an official document; the disclaimer is on the
// front and back. Never passport, receipt, A-numbers, USCIS account or SEVIS numbers — passFields()
// refuses to return a card that contains any of them (assertNoForbidden).
import type { Person } from './model';
import { isCitizen, isDependentVisa, isResident, isStudent, isWorkVisa } from './model';
import type { PersonRecord } from './record';
import type { PersonResult } from './rules/engine';
import type { CaseView } from './cases';
import { fmt, isISO, today as todayFn } from './dates';
import { clean, firstName, initials, looksSensitive, personDeadlines, statusText, validUntil } from './widgets';

export type NameStyle = 'full' | 'first' | 'initials';
export type PassColour = 'blue' | 'teal' | 'indigo' | 'green' | 'navy' | 'grey';

export const PASS_FRONT_DISCLAIMER = 'For personal reference — not an official document';
export const PASS_BACK_DISCLAIMER =
  'This card is a personal reminder made by the Immigration Wallet app from documents saved on your own phone. It is NOT an official document, ID or proof of status, and it is not issued, endorsed or checked by USCIS, CBP, DHS, the Department of State or any government agency. Always rely on your original documents (I-94, approval notice, visa, passport, green card). Dates can be wrong if a document was read wrongly or is out of date. Not legal advice.';
export const PASS_SOURCES = [
  'I-94: i94.cbp.dhs.gov (your most recent I-94 record)',
  'Visa stamp and passport dates: as printed on your documents',
  'Status rules: uscis.gov and travel.state.gov, linked in the app',
];

export type PassCard = {
  serial: string; // opaque, stable per person (re-adding replaces the old card in Wallet)
  name: string;
  status: string;
  validUntil?: string; // ISO
  validLabel?: string; // 'I-94' | 'Card' | 'Status'
  visaUntil?: string;
  passportUntil?: string;
  nextDeadline?: { what: string; date: string };
  colour: PassColour;
  relevantDate?: string; // ISO date — Wallet surfaces the card before it
  updated: string; // ISO date
  disclaimer: string;
  backDisclaimer: string;
  sources: string[];
};

/** Name as the user chose it. Full uses the passport name when one was read, else what the family calls them. */
export function passName(p: Person, rec: PersonRecord | undefined, style: NameStyle): string {
  const full = (rec?.legalName || p.name || '').trim();
  if (style === 'initials') return initials(full);
  if (style === 'first') return firstName(p.name || full);
  return full.replace(/\s+/g, ' ').slice(0, 40);
}

/** Card colour by status type (a pass doesn't change colour as days pass, so urgency isn't used). */
export function passColour(rec?: PersonRecord): PassColour {
  const v = rec?.visa;
  if (!v) return 'grey';
  if (isCitizen(v)) return 'navy';
  if (isResident(v) || v === 'Green card pending') return 'green';
  if (isDependentVisa(v)) return 'teal';
  if (isStudent(v) || v === 'J-1') return 'indigo';
  if (isWorkVisa(v)) return 'blue';
  return 'grey';
}

/** "L-2S dependent", "H-1B", "Green card holder"… */
export function passStatus(p: Person, rec?: PersonRecord, res?: PersonResult): string {
  const s = statusText(p, rec, res);
  return rec?.visa && isDependentVisa(rec.visa) && !/dependent/i.test(s) ? `${s} dependent` : s;
}

/** A short opaque serial from the person id (FNV-1a) — no personal data. */
export function passSerial(personId: string): string {
  let h = 0x811c9dc5;
  for (const ch of `cd-pass:${personId}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `iw-${h.toString(16).padStart(8, '0')}`;
}

/** Every number on this person's documents that must never appear on the card. */
export function forbiddenNumbers(rec: PersonRecord | undefined, cases: CaseView[] = [], extra: (string | undefined)[] = []): string[] {
  const out = [rec?.passportNo, ...(rec?.passportNos ?? []), rec?.i20?.sevisId, ...(rec?.cases ?? []).map((c) => c.receipt), ...cases.map((c) => c.receipt), ...extra];
  return [...new Set(out.filter((x): x is string => !!x && x.length >= 5).map((x) => x.toUpperCase()))];
}

export class ForbiddenOnPass extends Error {}

/** Throws if any text on the card carries a document number or looks like one. */
export function assertNoForbidden(card: PassCard, numbers: string[]) {
  const texts = [card.name, card.status, card.validLabel, card.nextDeadline?.what].filter((x): x is string => !!x);
  for (const t of texts) {
    const up = t.toUpperCase().replace(/[\s-]/g, '');
    if (looksSensitive(t) || numbers.some((n) => up.includes(n.replace(/[\s-]/g, '')))) throw new ForbiddenOnPass('A document number can’t go on the Wallet card.');
  }
}

export function passFields(o: { person: Person; rec?: PersonRecord; res?: PersonResult; cases?: CaseView[]; style: NameStyle; today?: string }): PassCard {
  const t = o.today ?? todayFn();
  const { person: p, rec, res } = o;
  const v = validUntil(rec, res);
  const next = personDeadlines(p, rec, res, o.cases ?? [], t)[0];
  const rawName = passName(p, rec, o.style);
  const nums = forbiddenNumbers(rec, o.cases);
  // Refuse (rather than silently mask) a name or status that carries a document number.
  assertNoForbidden({ name: rawName, status: passStatus(p, rec, res) } as PassCard, nums);
  const card: PassCard = {
    serial: passSerial(p.id),
    name: clean(rawName) || '?',
    status: clean(passStatus(p, rec, res)).slice(0, 40),
    ...(v.until ? { validUntil: v.until, validLabel: v.label } : {}),
    ...(isISO(rec?.visaStamp?.expires) ? { visaUntil: rec!.visaStamp!.expires } : {}),
    ...(isISO(rec?.passportExpiry) ? { passportUntil: rec!.passportExpiry } : {}),
    ...(next ? { nextDeadline: { what: clean(next.what).slice(0, 40), date: next.date } } : {}),
    colour: passColour(rec),
    ...(v.until && v.until >= t ? { relevantDate: v.until } : {}),
    updated: t,
    disclaimer: PASS_FRONT_DISCLAIMER,
    backDisclaimer: PASS_BACK_DISCLAIMER,
    sources: PASS_SOURCES,
  };
  assertNoForbidden(card, nums);
  return card;
}

/** Rows for the in-app preview (same order as the pass front). */
export function previewRows(c: PassCard): { label: string; value: string }[] {
  return [
    { label: 'Status', value: c.status },
    { label: c.validLabel === 'Card' ? 'Card valid until' : c.validLabel === 'I-94' ? 'Valid until (I-94)' : 'Valid until', value: c.validUntil ? fmt(c.validUntil) : '—' },
    { label: 'Visa stamp until', value: c.visaUntil ? fmt(c.visaUntil) : '—' },
    { label: 'Passport until', value: c.passportUntil ? fmt(c.passportUntil) : '—' },
    { label: c.nextDeadline ? `Next: ${c.nextDeadline.what}` : 'Next deadline', value: c.nextDeadline ? fmt(c.nextDeadline.date) : 'None coming up' },
  ];
}

/** Card backgrounds (white text). The server uses the same table (casedesk/server/src/wallet.mjs). */
export const PASS_BG: Record<PassColour, string> = { blue: '#1F4FA8', teal: '#0F6E6E', indigo: '#3B3A98', green: '#1E6B3A', navy: '#1B2A4A', grey: '#3A3D44' };
