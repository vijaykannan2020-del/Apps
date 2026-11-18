// Form DS-2019 (J-1 exchange visitor): program number and the period the form covers.
import type { DocFields } from '../model';
import { datesIn, textAfter } from './text';

export const isDS2019 = (U: string) => /DS-?2019|EXCHANGE VISITOR \(J-1\)|EXCHANGE VISITOR STATUS/.test(U);

export function readDS2019(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.sevisId = U.match(/\bN\d{10}\b/)?.[0];
  const k = U.search(/FORM COVERS PERIOD|COVERS PERIOD|PROGRAM (?:BEGIN|START)/);
  const d = k >= 0 ? datesIn(T.slice(k, k + 200)) : [];
  f.validFrom = d[0];
  f.validTo = d[1];
  f.programStart = f.validFrom;
  f.programEnd = f.validTo;
  const sponsor = textAfter(T, /program sponsor|sponsor(?:'s)? name/i, /[A-Za-z]{3}/);
  if (sponsor) f.school = sponsor.replace(/\s{2,}.*/, '');
  return f;
}
