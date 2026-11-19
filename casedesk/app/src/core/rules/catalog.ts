// Every rule the app can show, with its official source and the date the team last checked it (TR1).
// Rules data travels with the JS bundle, so an over-the-air update refreshes it (TR2): bump
// RULES_CHECKED and the entries' `checked` when the immigration lead re-verifies them.

export const RULES_CHECKED = '2026-11-18';

export type Source = { label: string; url: string };
export type RuleInfo = { id: string; name: string; source: Source; checked: string };

const S = {
  i94: { label: 'CBP — I-94 website', url: 'https://i94.cbp.dhs.gov/' },
  deferred: { label: 'CBP — Deferred Inspection (I-94 corrections)', url: 'https://www.cbp.gov/contact/deferred-inspection' },
  h1b: { label: 'USCIS — H-1B specialty occupations', url: 'https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations' },
  l1a: { label: 'USCIS — L-1A intracompany transferee', url: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager' },
  extend: { label: 'USCIS — Extend your stay', url: 'https://www.uscis.gov/visit-the-united-states/extend-your-stay' },
  cfr274a: { label: '8 CFR 274a.12 (240-day rule)', url: 'https://www.ecfr.gov/current/title-8/section-274a.12' },
  cfr214: { label: '8 CFR 214.1 (grace periods)', url: 'https://www.ecfr.gov/current/title-8/section-214.1' },
  passport: { label: 'State Dept — U.S. visas', url: 'https://travel.state.gov/content/travel/en/us-visas.html' },
  visaNews: { label: 'State Dept — Visa news', url: 'https://travel.state.gov/content/travel/en/News/visas-news.html' },
  ead: { label: 'USCIS — Form I-765', url: 'https://www.uscis.gov/i-765' },
  i539: { label: 'USCIS — Form I-539', url: 'https://www.uscis.gov/i-539' },
  opt: { label: 'DHS Study in the States — OPT', url: 'https://studyinthestates.dhs.gov/students/train/learn-about-opt' },
  stem: { label: 'DHS Study in the States — STEM OPT', url: 'https://studyinthestates.dhs.gov/stem-opt-hub' },
  sevp: { label: 'DHS — SEVP Portal', url: 'https://studyinthestates.dhs.gov/sevp-portal-help' },
  capgap: { label: 'USCIS — Cap-gap extension', url: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students' },
  f1: { label: 'DHS Study in the States — Students', url: 'https://studyinthestates.dhs.gov/students' },
  ar11: { label: 'USCIS — Change of address (AR-11)', url: 'https://www.uscis.gov/ar-11' },
  gcTravel: { label: 'USCIS — Travel as a permanent resident', url: 'https://www.uscis.gov/green-card/after-we-grant-your-green-card/international-travel-as-a-permanent-resident' },
  i751: { label: 'USCIS — Form I-751', url: 'https://www.uscis.gov/i-751' },
  i90: { label: 'USCIS — Form I-90', url: 'https://www.uscis.gov/i-90' },
  n400: { label: 'USCIS — Early filing calculator (N-400)', url: 'https://www.uscis.gov/citizenship/apply-for-citizenship/early-filing-calculator' },
  i131: { label: 'USCIS — Form I-131 (travel documents)', url: 'https://www.uscis.gov/i-131' },
  ac21: { label: 'USCIS — Supplement J (job portability)', url: 'https://www.uscis.gov/i-485supj' },
  bulletin: { label: 'State Dept — Visa Bulletin', url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html' },
  cspa: { label: 'USCIS — Child Status Protection Act', url: 'https://www.uscis.gov/green-card/green-card-processes-and-procedures/child-status-protection-act-cspa' },
  rfe: { label: 'USCIS Policy Manual — Evidence (RFEs, NOIDs)', url: 'https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6' },
  caseStatus: { label: 'USCIS — Case status online', url: 'https://egov.uscis.gov/' },
  // v2.9 green card (checked 2026-11-19)
  eadRenew: { label: '8 CFR 274a.13 (EAD renewals, no automatic extension from Oct 30, 2025)', url: 'https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-274a/subpart-B/section-274a.13' },
  abandon: { label: '8 CFR 245.2(a)(4)(ii) (travel with an I-485 pending)', url: 'https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-245/section-245.2' },
  aosCharts: { label: 'USCIS — Adjustment of status filing charts', url: 'https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates/adjustment-of-status-filing-charts-from-the-visa-bulletin' },
  interview: { label: 'USCIS Policy Manual — Adjustment interview guidelines', url: 'https://www.uscis.gov/policy-manual/volume-7-part-a-chapter-5' },
  perm: { label: '20 CFR 656.30 (PERM valid 180 days for the I-140)', url: 'https://www.ecfr.gov/current/title-20/chapter-V/part-656/subpart-C/section-656.30' },
} satisfies Record<string, Source>;

const R = (id: string, name: string, source: Source, checked = RULES_CHECKED): RuleInfo => ({ id, name, source, checked });
/** v2.9 green-card rules: sources checked by the immigration lead on this date. */
export const GC_RULES_CHECKED = '2026-11-19';

export const RULES: Record<string, RuleInfo> = Object.fromEntries([
  R('C1', 'In the US, no I-94', S.i94),
  R('C2', 'I-94 ended, nothing filed', S.extend),
  R('C3', 'I-94 ends within 30 days', S.extend),
  R('C4', 'I-94 ends within 180 days', S.extend),
  R('C5', 'I-94 ends before the approval', S.deferred),
  R('C6', '240-day rule while an extension is pending', S.cfr274a),
  R('C7', 'Extension filed after the I-94 ended', S.extend),
  R('C8', 'Passport expired', S.passport),
  R('C9', 'Passport expires soon / before the approval', S.passport),
  R('C10', 'Visa stamp expired (in the US)', S.passport),
  R('C11', 'Outside the US: visa expired or missing', S.visaNews),
  R('C12', 'Work permit (EAD) ending or ended', S.ead),
  R('C13', 'L-2 spouse I-94 shows plain L-2', S.l1a),
  R('C14', 'Dependent I-94 runs past the principal’s approval', S.deferred),
  R('C15', 'Principal’s I-94 ends first', S.extend),
  R('C16', 'Travel while a case is pending', S.extend),
  R('C17', 'Near the 6 / 7 / 5-year limit', S.h1b),
  R('C18', 'Job ended — grace period', S.cfr214),
  R('C19', 'Visa type not confirmed', S.i94),
  R('C20', 'All good', S.i94),
  R('C21', 'H-1B work location in another metro', S.h1b),
  R('C22', 'Amendment pending', S.h1b),
  R('C23', 'More than one approval saved', S.h1b),
  R('C24', 'Transfer filed (portability)', S.h1b),
  R('C25', 'I-94 class differs from the approval', S.deferred),
  R('X1', 'I-94 ended, extension pending (no 240-day cover)', S.i539),
  R('X2', 'I-94 ended, transfer pending', S.h1b),
  R('X3', 'Child turning 21', S.extend),
  R('R1', 'OPT unemployment days', S.opt),
  R('R2', 'STEM OPT unemployment days', S.stem),
  R('R3', 'Report OPT changes in the SEVP portal', S.sevp),
  R('R4', 'File the STEM OPT extension', S.stem),
  R('R5', 'Cap-gap', S.capgap),
  R('R6', 'F-1 program ended — grace period', S.f1),
  R('R7', 'F-1 / J-1 I-94 “D/S” or fixed date', S.f1),
  R('R8', 'I-20 travel signature', S.f1),
  R('R9', 'AR-11 change of address', S.ar11),
  R('R10', 'Green card: trip over 6 months', S.gcTravel),
  R('R11', 'Green card: trip of a year or more', S.gcTravel),
  R('R12', 'Conditional green card: I-751 window', S.i751),
  R('R13', 'I-751 pending: card + receipt valid 48 months', S.i751),
  R('R14', 'Green card renewal (I-90)', S.i90),
  R('R15', 'Citizenship: earliest filing date', S.n400),
  R('R16', 'Travel with I-485 pending', S.i131),
  R('R17', 'Advance Parole ends before return', S.i131),
  R('R18', 'Job change with I-485 pending (AC21)', S.ac21),
  R('R19', 'H-1B time outside the US (recapture)', S.h1b),
  R('R20', 'H-1B year 5+: PERM / I-140 timing', S.h1b),
  R('R21', 'Priority date current', S.aosCharts, GC_RULES_CHECKED),
  R('R22', 'Child may age out of a green-card case', S.cspa),
  R('R23', 'No dual intent', S.passport),
  R('R24', 'EAD outlasts the I-94', S.ead),
  R('R25', 'Travel with an H-1B change of status pending', S.h1b),
  R('R26', 'Visa stamping needed for a trip', S.visaNews),
  R('R27', 'RFE / NOID response due', S.rfe),
  R('HOLD', 'USCIS hold for listed nationalities', S.caseStatus),
  R('G1', 'EAD (C9): renew up to 180 days before it ends', S.eadRenew, GC_RULES_CHECKED),
  R('G2', 'Advance parole before travel with the I-485 pending', S.abandon, GC_RULES_CHECKED),
  R('G3', 'Priority date vs the final action date (I-485 pending)', S.bulletin, GC_RULES_CHECKED),
  R('G4', 'I-485 pending: keep H / L status or work on the EAD', S.abandon, GC_RULES_CHECKED),
  R('G5', 'Green card interview scheduled', S.interview, GC_RULES_CHECKED),
  R('G6', 'PERM: file the I-140 within 180 days', S.perm, GC_RULES_CHECKED),
].map((r) => [r.id, r]));

/**
 * Nationalities (ISO-3, as on the passport MRZ) under the USCIS adjudication hold. Kept from the
 * official memo by the immigration lead and shipped over the air. Empty until they confirm the list.
 */
export const HOLD_COUNTRIES: string[] = [];
