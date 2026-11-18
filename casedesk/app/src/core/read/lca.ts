// Labor Condition Application (ETA-9035): employment period.
import type { DocFields } from '../model';
import { datesIn } from './text';

export const isLCA = (U: string) => /LABOR CONDITION APPLICATION|ETA[- ]9035/.test(U);

export function readLCA(T: string): DocFields {
  const f: DocFields = {};
  const m = T.match(/(?:period of employment|begin date)[\s\S]{0,80}?(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,60}?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m) { f.validFrom = datesIn(m[1])[0]; f.validTo = datesIn(m[2])[0]; }
  return f;
}
