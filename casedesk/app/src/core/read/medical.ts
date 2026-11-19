// Form I-693, Report of Immigration Medical Examination and Vaccination Record (civil surgeon).
// It goes with the I-485 in the sealed envelope; only the signature date is kept.
import type { DocFields } from '../model';
import { dateAfter, latestDate } from './text';

export const isMedical = (U: string) => /\bI-693\b|REPORT OF IMMIGRATION MEDICAL EXAMINATION|CIVIL SURGEON/.test(U) && !/NOTICE OF ACTION/.test(U);

export function readMedical(T: string): DocFields {
  const f: DocFields = {};
  f.signedDate = dateAfter(T, /civil surgeon[^\n]{0,60}date|date of (?:civil surgeon'?s )?signature|signature date|date signed/i) ?? latestDate(T);
  return f;
}
