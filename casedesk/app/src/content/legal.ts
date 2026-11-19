// App Store launch: independence disclaimer (Welcome, About, every data screen) and the official
// source behind each government-data screen.
export const DISCLAIMER = 'Immigration Wallet is not affiliated with USCIS, DHS, DOL, the State Department or any government agency. Information comes from official public sources linked in the app. Not legal advice.';
export const DISCLAIMER_SHORT = 'Not affiliated with USCIS or any government agency · not legal advice';

export type Source = { label: string; url: string };
export const SOURCES: Record<string, Source> = {
  bulletin: { label: 'travel.state.gov — Visa Bulletin', url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html' },
  bulletinChart: { label: 'uscis.gov — which chart USCIS uses', url: 'https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates/adjustment-of-status-filing-charts-from-the-visa-bulletin' },
  processing: { label: 'egov.uscis.gov — Case processing times', url: 'https://egov.uscis.gov/processing-times/' },
  fees: { label: 'uscis.gov — Fee schedule (G-1055)', url: 'https://www.uscis.gov/g-1055' },
  premium: { label: 'uscis.gov — Premium processing', url: 'https://www.uscis.gov/forms/all-forms/how-do-i-request-premium-processing' },
  wage: { label: 'flag.dol.gov — Wage search', url: 'https://flag.dol.gov/wage-data/wage-search' },
  waits: { label: 'travel.state.gov — Visa appointment wait times', url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/global-visa-wait-times.html' },
  lca: { label: 'flag.dol.gov — Case status search', url: 'https://flag.dol.gov/case-status-search' },
  h1b: { label: 'uscis.gov — H-1B Employer Data Hub', url: 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub' },
  lottery: { label: 'uscis.gov — H-1B cap season', url: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations/h-1b-electronic-registration-process' },
  civics: { label: 'uscis.gov — Civics test', url: 'https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test' },
  i9: { label: 'uscis.gov — I-9 Central', url: 'https://www.uscis.gov/i-9-central' },
  caseStatus: { label: 'egov.uscis.gov — Case Status Online', url: 'https://egov.uscis.gov/' },
  travel: { label: 'travel.state.gov · cbp.gov', url: 'https://travel.state.gov/content/travel/en/us-visas.html' },
  guides: { label: 'uscis.gov — Working in the US', url: 'https://www.uscis.gov/working-in-the-united-states' },
};

/** Wallet wording must never suggest an official ID (shown wherever documents are shown or shared). */
export const NOT_OFFICIAL_ID = 'Copies for your reference — not an official ID.';
