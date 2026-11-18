// US visa foil. Travel permission only: class (L2, H4, H1B…), blanket-L annotation, expiry.
// The annotation's P# (employer's petition receipt) and PED (petition end) are NOT this visa's data.
import type { DocFields } from '../model';
import { columnDate, dateAfter, latestDate, readMRZ } from './text';

export const isVisaFoil = (U: string, T: string) =>
  readMRZ(T)?.kind === 'V' || (/VISA TYPE|VISA\s*\/\s*CLASS|CONTROL NUMBER|ANNOTATION/.test(U) && /EXPIRATION|ISSUE DATE|ENTRIES/.test(U));

const CLASS = '(H-?1B|H-?4|L-?1|L-?2|F-?1|F-?2|J-?1|J-?2|TD|TN|O-?1|E-?3|B-?1\\/?B-?2|B-?1|B-?2)';

export function readVisa(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  const mrz = readMRZ(T);
  const noPed = T.replace(/PED\s*[-:]?\s*\S+/gi, ' ');
  const issue = /issue date/i, exp = /expiration date|expiry date/i;
  f.issueDate = columnDate(noPed, issue, [exp]);
  f.birthDate = mrz?.birth ?? dateAfter(noPed, /birth date|date of birth/i);
  const ok = (d?: string) => !!d && d !== f.issueDate && d !== f.birthDate && (!f.issueDate || d > f.issueDate);
  f.validTo = [mrz?.expiry, columnDate(noPed, exp, [issue], true), latestDate(noPed)].find(ok);
  // Class only from the MRZ, or "Visa Type / Class" followed by "R L2" (annotation code + class).
  let c = mrz?.cls;
  if (!c) {
    const lines = U.split('\n');
    const at = lines.findIndex((l) => /VISA\s*TYPE\s*\/?\s*CLASS/.test(l));
    if (at >= 0) for (const l of [lines[at].replace(/.*VISA\s*TYPE\s*\/?\s*CLASS/, ''), ...lines.slice(at + 1, at + 4)]) {
      // "R  L2" at the end of the line, or "R  F1   M   02MAY2022   01MAY2027" (class, then entries / dates)
      const k = l.match(new RegExp(`(?:^|\\s)[A-Z]\\s+${CLASS}\\s*$`)) ?? l.match(new RegExp(`^\\s*[A-Z]\\s+${CLASS}(?=\\s+(?:M|S|\\d{1,2})\\b)`));
      if (k) { c = k[1]; break; }
    }
  }
  f.classOfAdmission = c?.replace(/-/g, '').replace('/', '');
  if (/BLANKET\s*L/.test(U)) f.blanket = true;
  f.nationality = mrz?.nationality;
  return f;
}
