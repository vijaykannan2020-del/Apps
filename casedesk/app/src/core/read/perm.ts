// PERM labor certification (Department of Labor, Form ETA-9089): the certified application the
// employer files with the I-140. Its filing date becomes the priority date; a certification
// expires 180 days after it is granted unless the I-140 is filed (20 CFR 656.30(b)(1)).
import type { DocFields } from '../model';
import { addDays } from '../dates';
import { dateAfter, tableValue } from './text';

export const isPerm = (U: string) =>
  /ETA[\s-]*(?:FORM\s*)?9089|APPLICATION FOR PERMANENT EMPLOYMENT CERTIFICATION|PERMANENT LABOR CERTIFICATION|FINAL DETERMINATION/.test(U) && !/NOTICE OF ACTION|I-797/.test(U);

export function readPerm(T: string): DocFields {
  const U = T.toUpperCase();
  const f: DocFields = {};
  f.caseNumber = U.match(/\b([AG]-\d{3}-\d{5}-\d{6})\b/)?.[1];
  f.priorityDate = dateAfter(T, /(?:filing|filed|received|submitted)\s*date|date\s*(?:of\s*)?(?:filing|filed|received)/i);
  f.noticeDate = dateAfter(T, /(?:certification|certified|determination|decision)\s*date|date\s*certified/i);
  f.validTo = dateAfter(T, /expiration\s*date|expires?(?:\s*on)?|valid\s*(?:until|through|to)/i) ?? (f.noticeDate ? addDays(f.noticeDate, 180) : undefined);
  const emp = tableValue(T, /employer(?:'s)?\s*(?:name|legal business name)?/i);
  if (emp && !/^(name|address|information)\b/i.test(emp)) f.employer = emp;
  return f;
}
