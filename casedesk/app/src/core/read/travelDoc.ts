// Travel documents issued by USCIS: Advance Parole (I-512L / I-131 travel document) and the
// Re-entry permit (I-327) for green-card holders.
import type { DocFields } from '../model';
import { dateAfter, latestDate } from './text';

export const isAdvanceParole = (U: string) => /I-512L?\b|AUTHORI[SZ]ATION FOR PAROLE|ADVANCE PAROLE DOCUMENT/.test(U) && !/EMPLOYMENT AUTHORI[SZ]ATION CARD/.test(U);
export const isReentryPermit = (U: string) => /RE-?ENTRY PERMIT|PERMIT TO RE-?ENTER|\bI-327\b/.test(U);

export function readTravelDoc(T: string): DocFields {
  const f: DocFields = {};
  f.validFrom = dateAfter(T, /valid from|date of issue|issued on/i);
  f.validTo = dateAfter(T, /valid until|valid to|expires|expiration date|until/i) ?? latestDate(T);
  if (f.validTo && f.validFrom && f.validTo < f.validFrom) f.validTo = undefined;
  return f;
}
