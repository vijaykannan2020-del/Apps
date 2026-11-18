// Blanket L Form I-129S (filled in by the employer, endorsed by the consulate / CBP). For blanket L
// it IS the approval: the period of employment, the L class (checked box) and the petitioner.
import type { DocFields } from '../model';
import { dateAfter, datesIn, latestDate, titleCase } from './text';

export const isI129SForm = (U: string) => /FORM I-129S|USCIS FORM I-129S|BASED ON BLANKET L PETITION/.test(U);
export const mentionsI129S = (U: string) => /I-129S|BASED ON BLANKET L PETITION|BLANKET L/.test(U);

export function readI129S(T: string, latestFallback = false): DocFields {
  const f: DocFields = {};
  f.validFrom = dateAfter(T, /2\.?\s*a\.?\s*start date(?:\s*\(mm\/dd\/yyyy\))?/i) ?? dateAfter(T, /start date(?:\s*\(mm\/dd\/yyyy\))?/i);
  f.validTo = dateAfter(T, /2\.?\s*b\.?\s*end date(?:\s*\(mm\/dd\/yyyy\))?/i) ?? dateAfter(T, /end date(?:\s*\(mm\/dd\/yyyy\))?/i);
  if (!f.validTo) {
    const m = T.match(/(?:intended employment|employment)[\s\S]{0,60}?from[\s\S]{0,30}?(\S+\s?\S*\s?\S*)[\s\S]{0,30}?to\s*[:\-]?\s*(.+)/i);
    if (m) { f.validFrom ||= datesIn(m[1])[0]; f.validTo = datesIn(m[2])[0]; }
  }
  // Never the form's edition / OMB date: else the latest date after "Dates of Proposed Employment".
  if (!f.validTo) { const k = T.search(/dates of proposed employment/i); if (k >= 0) f.validTo = datesIn(T.slice(k, k + 400)).sort().pop(); }
  if (!f.validTo && latestFallback) f.validTo = latestDate(T);
  const lines = T.split('\n');
  const nameAfter = (re: RegExp) => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      for (const v of [lines[i].slice((m.index ?? 0) + m[0].length), ...lines.slice(i + 1, i + 4)]) {
        const x = v.replace(/^\s*\((?:last|first) name\)/i, '').replace(/^[\s:|.\-\[\\]*/, '').replace(/^[a-z|\[\]]+(?=[A-Z]{2})/, '').replace(/[|\]].*$/, '').trim();
        if (/^\d|\b(?:[2-9]|1\d)\.?\s*[a-z]\./i.test(x)) break; // next numbered item: this field is blank
        if (/^[A-Za-z][A-Za-z' -]{1,40}$/.test(x) && !/name|date|number/i.test(x)) return x;
      }
    }
    return undefined;
  };
  const fam = nameAfter(/4\.?\s*a\.?\s*family name(?:\s*\(last name\))?/i), giv = nameAfter(/4\.?\s*b\.?\s*given name(?:\s*\(first name\))?/i);
  // OCR splits a boxed name ("KRISH NAN"): short all-caps pieces are joined. Half a name is worse than none.
  const join = (x?: string) => (x && /^[A-Z]{2,5}( [A-Z]{2,5})+$/.test(x) ? x.replace(/ /g, '') : x);
  if (fam && giv) f.name = titleCase(`${join(giv)} ${join(fam)}`);
  const emp = nameAfter(/name of the petitioning organi[sz]ation/i);
  if (emp) f.employer = emp.replace(/\s{2,}.*$/, '');
  const box = (re: RegExp) => { const l = lines.find((x) => re.test(x)); return l ? /\[\s*[xX✓✔]\s*\]|☒|☑|■/.test(l.slice(0, l.search(re))) : false; };
  const a = box(/manager or executive/i), b = box(/specialized knowledge/i);
  f.classOfAdmission = a && !b ? 'L1A' : b && !a ? 'L1B' : undefined;
  f.blanket = true;
  return f;
}
