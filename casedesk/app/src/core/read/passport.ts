// Passport (any country). Identity: legal name, passport number, birth date, expiry (caps the I-94).
import type { DocFields } from '../model';
import { addYears, addDays, fmt, toDate } from '../dates';
import { columnDate, dateAfter, datesIn, latestDate, readMRZ } from './text';
import { placeAfter } from '../birth';

export const isPassport = (U: string, T: string) => /PASSPORT|P<[A-Z]{3}/.test(U) || readMRZ(T)?.kind === 'P';

/** Passports usually run N years less a day from the issue date (India: 10, or 5 for minors). */
const term = (issued: string, years: number) => addDays(addYears(issued, years), -1);

export function readPassport(T: string, dayFirst: boolean): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  const mrz = readMRZ(T);
  const L = { issue: /date of issue|issue date/i, expiry: /date of expiry|expiry date|expiration date|date d'expiration/i, birth: /date of birth|birth date/i };
  f.issueDate = columnDate(T, L.issue, [L.expiry, L.birth], false, dayFirst);
  const birth = mrz?.birth ?? dateAfter(T, L.birth, dayFirst);
  // The expiry: the printed label, then the MRZ (check digit verified) — never the issue or birth date.
  const ok = (d?: string) => !!d && d !== f.issueDate && d !== birth && (!f.issueDate || d > f.issueDate);
  const printed = columnDate(T, L.expiry, [L.issue, L.birth], true, dayFirst);
  f.validTo = [printed, mrz?.expiry].find(ok);
  const india = /REPUBLIC OF INDIA|P<IND/.test(U);
  if (f.validTo && india && f.validTo !== mrz?.expiry) {
    // A printed expiry that doesn't fit the usual term is KEPT, with a note to check it (never rewritten).
    const row = T.split('\n').find((l) => datesIn(l, dayFirst).includes(f.validTo!)) ?? '';
    const iss = f.issueDate ?? datesIn(row, dayFirst).filter((x) => x < f.validTo!)[0];
    if (iss && ![10, 5].some((n) => term(iss, n) === f.validTo)) {
      const near = [10, 5].map((n) => term(iss, n)).find((x) => Math.abs(toDate(x)!.getTime() - toDate(f.validTo)!.getTime()) <= 40 * 864e5);
      // One misread digit (e.g. 19/08 for 11/08) with no machine-readable zone to check it: use the
      // usual term date. Two or more differing digits = a real printed date — kept, with a note (QA bug B).
      const oneDigit = !!near && !mrz?.expiry && [...near].filter((c, i) => c !== f.validTo![i]).length === 1;
      if (oneDigit) {
        f.dateNote = `Check this date — it read as ${fmt(f.validTo)}; passports issued ${fmt(iss)} usually expire ${fmt(near)}.`;
        f.validTo = near;
      } else f.dateNote = `Check this date — passports issued ${fmt(iss)} usually expire ${fmt(near ?? term(iss, 10))}.`;
    }
  }
  if (!f.validTo && india && f.issueDate) {
    const minor = !!birth && addYears(birth, 18) > f.issueDate;
    f.validTo = term(f.issueDate, minor ? 5 : 10);
    f.dateNote = 'The expiry couldn’t be read — worked out from the issue date. Check this date.';
  }
  f.validTo ||= [latestDate(T, dayFirst)].find(ok);
  const old = U.match(/OLD PASSPORT\s*N[O0]\.?[^\n]*\n?[^\n]*?\b([A-Z]\d{7})\b/);
  if (old) f.oldPassportNo = old[1];
  f.birthDate = birth ?? datesIn(T, dayFirst).sort()[0];
  f.nationality = mrz?.nationality;
  const born = placeAfter(T, /place of birth/i);
  if (born) f.birthPlace = born;
  return f;
}
