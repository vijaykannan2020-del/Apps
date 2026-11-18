// CBP I-94 (website printout or photo). Controls the stay. Its issue date — the most recent date of
// entry — decides which I-94 is current. "D/S" = duration of status (F-1/J-1 before 15 Sep 2026).
import type { DocFields } from '../model';
import { dateAfter, labelledName, oneOff, titleCase } from './text';

export const isI94 = (U: string) => /ADMIT\s*UNT[IL1]{2}|MOST RECENT DATE OF ENTRY|I-94 RECORD NUMBER|ADMISSION \(I-94\) RECORD/.test(U) && !/TRAVEL HISTORY/.test(U.split('\n').slice(0, 6).join(' '));

export function readI94(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  if (/ADMIT\s*UNT[IL1]{2}(?:\s*DATE)?\s*[:\-]?\s*D\s*\/\s*S\b/.test(U)) f.durationOfStatus = true;
  else f.validTo = dateAfter(T, /admit\s*unt[il1]{2}(?:\s*date)?\s*[:\-]?/i);
  f.entryDate = dateAfter(T, /most recent date of entry|arrival\s*\/?\s*[il1|]ss?ued(?:\s*date)?|date of (?:most recent )?entry|entry date|admission date|[il1|]ssued date/i);
  // CBP printouts head the page "For: PRIYA ANAND KUMAR"; its words are checked against the labelled fields.
  const cbp = T.match(/^[^A-Za-z\n]{0,4}For\s*:\s*([A-Z][A-Z' -]{2,60})\s*$/m)?.[1]?.trim();
  if (cbp && cbp.split(/\s+/).length >= 2) {
    const lab = (labelledName(T) || '').toUpperCase().split(/\s+/).filter(Boolean);
    f.name = titleCase(cbp.split(/\s+/).map((w) => lab.find((x) => x === w) ?? lab.find((x) => oneOff(x, w)) ?? w).join(' '));
  }
  f.classOfAdmission = U.match(/CLASS(?: OF ADMISSION)?\s*[:\-]?\s*(H-?1B1?|H-?4|L-?1A|L-?1B|L-?2[SY]?|TN|TD|F-?1|F-?2|J-?1|J-?2|E-?3D?|O-?1|O-?3|B-?1|B-?2|WT|WB)\b/)?.[1].replace('-', '');
  f.classOfAdmission ||= U.match(/CLASS OF ADMISSION\s*[:\-]?\s*([A-Z0-9-]{2,4})\b/)?.[1].replace('-', '');
  return f;
}
