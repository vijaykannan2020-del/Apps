// Employment Authorization Document (Form I-766), incl. the EAD/AP combo card.
// The category decides the rules: C3C OPT, C3B STEM OPT, C9 adjustment, C26 H-4, A17/A18 L-2S/E…
import type { DocFields } from '../model';
import { columnToken, dateAfter } from './text';

export const isEAD = (U: string) => /EMPLOYMENT AUTHORI[SZ]ATION|CARD EXPIRES|I-766/.test(U) && !/I-797/.test(U);

/** "C09" / "c(3)(C)" / "C 26" → "C9", "C3C", "C26". */
export function normCategory(raw?: string) {
  if (!raw) return undefined;
  const m = raw.toUpperCase().replace(/[()\s]/g, '').match(/^([AC])0*(\d{1,2})([A-Z])?$/);
  return m ? `${m[1]}${+m[2]}${m[3] ?? ''}` : undefined;
}

export function readEAD(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.validFrom = dateAfter(T, /valid from\s*[:\-]?/i);
  f.validTo = dateAfter(T, /card expires\s*[:\-]?|expires\s*[:\-]?/i);
  f.category = normCategory(U.match(/CATEGORY\s*[:\-]?\s*([AC]\s?\(?\d{1,2}\)?\s?\(?[A-Z]?\)?)(?![A-Z0-9#])/)?.[1])
    ?? normCategory(columnToken(U, /CATEGORY/, /^[AC]\(?\d{1,2}\)?(?:\(?[A-Z]\)?)?$/));
  if (/I-512|ADVANCE PAROLE|SERVES AS I-512/.test(U)) f.comboAP = true;
  return f;
}
