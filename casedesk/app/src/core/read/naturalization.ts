// Certificate of Naturalization (N-550 / N-570): date and certificate number.
import type { DocFields } from '../model';
import { dateAfter, latestDate, textAfter, titleCase } from './text';

export const isNaturalization = (U: string) => /CERTIFICATE OF NATURALI[SZ]ATION|N-5[57]0\b/.test(U);

export function readNaturalization(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.naturalizedOn = dateAfter(T, /date of naturali[sz]ation|became a citizen[^\n]*?on|naturali[sz]ed[^\n]*?on/i) ?? latestDate(T);
  f.validFrom = f.naturalizedOn;
  f.certificateNo = U.match(/\bNO\.?\s*([A-Z]?\d{6,9})\b/)?.[1];
  const nm = T.match(/having found that\s*:?\s*([A-Z][A-Z' -]{3,60})\s*$/m)?.[1] ?? textAfter(T, /full name|name of holder/i, /^[A-Z][A-Z' ,-]{3,60}$/);
  if (nm) f.name = titleCase(nm.includes(',') ? nm.split(',').reverse().join(' ') : nm);
  return f;
}
