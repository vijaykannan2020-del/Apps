// USCIS published processing times ("8 in 10 cases done within"), Service Center Operations.
// Built-in snapshot; the server pulls live numbers from egov.uscis.gov/processing-times.
export const PT_AS_OF = 'Oct 19, 2026';

export type PT = { form: string; category: string; months: number };

export const PROCESSING: PT[] = [
  { form: 'I-129', category: 'H-1B — change of status in the US', months: 11.5 },
  { form: 'I-129', category: 'H-1B — extension of stay', months: 12.5 },
  { form: 'I-129', category: 'H-1B — visa abroad (consular)', months: 13 },
  { form: 'I-129', category: 'L-1 individual and blanket L', months: 10.5 },
  { form: 'I-129', category: 'TN — USMCA professional', months: 7 },
  { form: 'I-539', category: 'H-4 extension (with I-765)', months: 9 },
  { form: 'I-539', category: 'H-4 extension', months: 13.5 },
  { form: 'I-539', category: 'Change to H-4 (with I-765)', months: 9.5 },
  { form: 'I-539', category: 'L-2 extension', months: 12 },
  { form: 'I-539', category: 'Change to L-2', months: 16 },
  { form: 'I-765', category: 'F-1 student — OPT / STEM OPT (c)(3)', months: 6.5 },
  { form: 'I-765', category: 'H-4 EAD filed with I-539 (c)(26)', months: 10 },
  { form: 'I-765', category: 'H-4 EAD standalone (c)(26)', months: 19 },
  { form: 'I-765', category: 'Pending green card (c)(9)', months: 16 },
  { form: 'I-140', category: 'EB-2 advanced degree', months: 6.5 },
  { form: 'I-140', category: 'EB-3 skilled / professional', months: 8 },
  { form: 'I-140', category: 'EB-1C multinational manager', months: 30 },
  { form: 'I-140', category: 'EB-2 National Interest Waiver', months: 36 },
  { form: 'I-485', category: 'Employment-based green card', months: 48 },
  { form: 'I-131', category: 'Advance parole', months: 36 },
];

export const fmtMonths = (m: number) => (m >= 24 ? `${+(m / 12).toFixed(1)} years` : m < 1 ? `${Math.round(m * 4)} weeks` : `${m} months`);

// Form type from a case → best-matching rows
export const timesForForm = (form?: string) => PROCESSING.filter((p) => p.form === form);
