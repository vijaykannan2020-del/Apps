// "Your next filing": for each person, the next USCIS form their status needs, the earliest date it
// can be filed, the last safe day, and — with the published processing time — when a decision is
// likely if they file on that earliest date. General information, not legal advice.
//
// Filing windows (sources: uscis.gov form instructions, checked Nov 18 2026):
//  • I-129 extension (H-1B, L-1, TN, E-3, O-1): up to 6 months before the current stay ends.
//  • I-539 (H-4, L-2) and the H-4 EAD (I-765 c26): same 6-month window; usually filed with the I-129.
//  • OPT (I-765 c3B): 90 days before to 60 days after the program end date.
//  • STEM OPT (I-765 c3C): up to 90 days before the OPT EAD ends — and before it ends.
//  • EAD/AP combo renewal (I-765 c9 + I-131): up to 180 days before the card ends.
//  • I-751 (conditional green card): in the 90 days before the card ends.
//  • N-400: 90 days before the 5-year (or 3-year) anniversary. I-90: within 6 months of expiry.
import type { Person } from './model';
import type { PersonRecord } from './record';
import type { StatusFacts } from './rules/status';
import { addDays, addMonths, minDate } from './dates';

export type Filing = {
  personId: string;
  form: string; // I-129, I-539, I-765…
  title: string; // "H-1B extension"
  earliest: string; // ISO date
  deadline?: string; // file before this date
  why: string;
  pt?: { form: string; category: string }; // row in the processing-times table
  premium?: string; // "15 business days" when premium processing exists
};

const WORK: Record<string, { title: string; category?: string }> = {
  'H-1B': { title: 'H-1B extension', category: 'H-1B — extension of stay' },
  'L-1A': { title: 'L-1A extension', category: 'L-1 individual and blanket L' },
  'L-1B': { title: 'L-1B extension', category: 'L-1 individual and blanket L' },
  TN: { title: 'TN extension', category: 'TN — USMCA professional' },
  'E-3': { title: 'E-3 extension' },
  'O-1': { title: 'O-1 extension' },
};

export function nextFilings(p: Person, rec: PersonRecord | undefined, facts: StatusFacts | undefined): Filing[] {
  if (!rec) return [];
  const v = rec.visa ?? (p.status as string | undefined);
  const out: Filing[] = [];
  const stayEnd = minDate(rec.petitionEnd, facts?.statusUntil ?? rec.i94?.until) ?? facts?.statusUntil ?? rec.i94?.until;
  const six = (d: string) => addMonths(d, -6);
  if (v && WORK[v] && stayEnd && rec.location !== 'Outside') {
    const w = WORK[v];
    out.push({ personId: p.id, form: 'I-129', title: w.title, earliest: six(stayEnd), deadline: stayEnd, why: 'Your employer can file up to 6 months before your current stay ends.', pt: w.category ? { form: 'I-129', category: w.category } : undefined, premium: '15 business days' });
  }
  if ((v === 'H-4' || v === 'H-4 EAD') && stayEnd && rec.location !== 'Outside') {
    const ead = v === 'H-4 EAD' || rec.ead?.category === 'C26';
    out.push({ personId: p.id, form: 'I-539', title: 'H-4 extension', earliest: six(stayEnd), deadline: stayEnd, why: 'Usually filed together with the H-1B extension, up to 6 months before the stay ends.', pt: { form: 'I-539', category: ead ? 'H-4 extension (with I-765)' : 'H-4 extension' } });
    if (ead && rec.ead?.expires) out.push({ personId: p.id, form: 'I-765', title: 'H-4 EAD renewal', earliest: addMonths(rec.ead.expires, -6), deadline: rec.ead.expires, why: 'Up to 6 months before the card ends. Renewals don’t extend automatically — work stops if the card ends first.', pt: { form: 'I-765', category: 'H-4 EAD filed with I-539 (c)(26)' } });
  }
  if ((v === 'L-2' || v === 'L-2S') && stayEnd && rec.location !== 'Outside') {
    out.push({ personId: p.id, form: 'I-539', title: 'L-2 extension', earliest: six(stayEnd), deadline: stayEnd, why: 'Usually filed together with the L-1 extension, up to 6 months before the stay ends.', pt: { form: 'I-539', category: 'L-2 extension' } });
  }
  if (v === 'F-1' && rec.i20?.programEnd) {
    out.push({ personId: p.id, form: 'I-765', title: 'OPT work permit', earliest: addDays(rec.i20.programEnd, -90), deadline: addDays(rec.i20.programEnd, 60), why: 'From 90 days before to 60 days after the program end date, after your DSO recommends OPT.', pt: { form: 'I-765', category: 'F-1 student — OPT / STEM OPT (c)(3)' }, premium: '30 days' });
  }
  if (v === 'F-1 OPT' && rec.ead?.expires) {
    out.push({ personId: p.id, form: 'I-765', title: 'STEM OPT extension', earliest: addDays(rec.ead.expires, -90), deadline: rec.ead.expires, why: 'Only with a STEM degree and an E-Verify employer. File in the 90 days before the OPT card ends.', pt: { form: 'I-765', category: 'F-1 student — OPT / STEM OPT (c)(3)' }, premium: '30 days' });
  }
  if (v === 'Green card pending' && rec.ead?.expires) {
    out.push({ personId: p.id, form: 'I-765', title: 'Combo card renewal (EAD + travel)', earliest: addMonths(rec.ead.expires, -6), deadline: rec.ead.expires, why: 'Up to 6 months before the card ends. File the I-765 and I-131 together.', pt: { form: 'I-765', category: 'Pending green card (c)(9)' } });
  }
  if (v === 'Conditional green card' && rec.greenCard?.expires) {
    out.push({ personId: p.id, form: 'I-751', title: 'Remove conditions (I-751)', earliest: addDays(rec.greenCard.expires, -90), deadline: rec.greenCard.expires, why: 'File in the 90 days before the 2-year card ends. Filing late can end resident status.' });
  }
  if (v === 'Green card') {
    if (facts?.citizenship?.fileFrom) out.push({ personId: p.id, form: 'N-400', title: 'Citizenship', earliest: facts.citizenship.fileFrom, why: `You can file 90 days before your ${facts.citizenship.years}-year anniversary as a resident.` });
    if (rec.greenCard?.expires) out.push({ personId: p.id, form: 'I-90', title: 'Green card renewal', earliest: addMonths(rec.greenCard.expires, -6), deadline: rec.greenCard.expires, why: 'Within 6 months of the card’s expiry date.' });
  }
  return out.sort((a, b) => a.earliest.localeCompare(b.earliest));
}

/** If filed on `filed`, when is a decision likely? 8 in 10 cases are decided within `months`. */
export function decisionWindow(filed: string, months: number): { from: string; to: string } {
  return { from: addDays(filed, Math.round(months * 30.4 * 0.5)), to: addDays(filed, Math.round(months * 30.4)) };
}

/** The date to plan with: the earliest filing date, or today if that has passed (and the deadline hasn't). */
export const planDate = (f: Filing, todayIso: string) => (f.earliest > todayIso ? f.earliest : todayIso);
