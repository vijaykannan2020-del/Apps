// Permanent resident card (Form I-551). Category code (CR1 = 2-year conditional), resident since, expiry.
import type { DocFields } from '../model';
import { columnToken, dateAfter, textAfter } from './text';

export const isGreenCard = (U: string) =>
  /PERMANENT RESIDENT|RESIDENT ALIEN|\bI-551\b|C1USA|C<USA/.test(U) && /RESIDENT SINCE|CARD EXPIRES|CATEGORY|USCIS\s*#|C1USA/.test(U) && !/EMPLOYMENT AUTHORI[SZ]ATION/.test(U) && !/NOTICE OF ACTION/.test(U);

/** Conditional (2-year) categories: marriage CR/CF, investor C5/T5/R5/I5. */
export const isConditionalCategory = (c?: string) => !!c && /^(CR|CF|C5|T5|R5|I5)\d/.test(c);

export function readGreenCard(T: string, dayFirst: boolean): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.validTo = dateAfter(T, /card expires|expires|exp(?:iration)? date/i, dayFirst);
  f.residentSince = dateAfter(T, /resident since/i, dayFirst);
  f.birthDate = dateAfter(T, /date of birth|birth date/i, dayFirst);
  f.category = U.match(/CATEGORY\s*[:\-]?\s*([A-Z]{1,2}\d{1,2})\b/)?.[1] ?? columnToken(U, /CATEGORY/, /^[A-Z]{1,2}\d{1,2}$/);
  f.conditional = isConditionalCategory(f.category);
  const num = columnToken(T, /uscis\s*#|alien number/i, /^\d{3}-?\d{3}-?\d{3}$/) ?? textAfter(T, /uscis\s*#|alien number/i, /\d{3}-?\d{3}-?\d{3}/);
  if (num) f.uscisNumber = num.match(/\d{3}-?\d{3}-?\d{3}/)?.[0].replace(/-/g, '');
  return f;
}
