// Form I-20 (F-1 student): SEVIS ID, school, program dates, OPT dates, last travel signature.
import type { DocFields } from '../model';
import { columnDate, dateAfter, datesIn, textAfter } from './text';

export const isI20 = (U: string) => /\bI-20\b|NONIMMIGRANT STUDENT STATUS/.test(U) && /SEVIS|PROGRAM|SCHOOL/.test(U) && !/EXCHANGE VISITOR/.test(U);

export function readI20(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.sevisId = U.match(/\bN\d{10}\b/)?.[0];
  const start = /program start date/i, end = /program end date/i;
  f.programStart = columnDate(T, start, [end]) ?? dateAfter(T, start);
  f.programEnd = columnDate(T, end, [start]) ?? dateAfter(T, end);
  f.validFrom = f.programStart;
  f.validTo = f.programEnd;
  const school = textAfter(T, /school name/i, /[A-Za-z]{3}/);
  if (school) f.school = school.replace(/\s{2,}.*/, '');
  // OPT block: "POST-COMPLETION OPT … START DATE 06/01/2026 END DATE 05/31/2027" (or STEM OPT)
  // Employment rows: "POST-COMPLETION OPT  FULL TIME  07/01/2026  06/30/2027", "STEM OPT EXTENSION …".
  const rows = T.split('\n').filter((l) => /^\s*(?:POST[- ]COMPLETION\s*(?:OPT|OPTIONAL)|STEM\s*OPT|OPT\b.{0,30}(?:FULL|PART)\s*TIME)/i.test(l) && datesIn(l).length >= 1);
  const post = rows.find((l) => /POST/i.test(l)) ?? rows[0];
  const stem = rows.find((l) => /STEM/i.test(l));
  if (post) { const d = datesIn(post); f.optStart = d[0]; f.optEnd = d[1]; }
  if (stem && stem !== post) { const d = datesIn(stem); f.optEnd = d[1] ?? f.optEnd; f.optStart ??= d[0]; }
  // Travel endorsement (page 2): the latest date in that section.
  const tr = U.search(/TRAVEL ENDORSEMENT|TRAVEL SIGNATURE|FOR REENTRY OF STUDENT/);
  if (tr >= 0) f.travelSignature = datesIn(T.slice(tr)).sort().pop();
  return f;
}
