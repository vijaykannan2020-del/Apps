// Every built-in data set, its date, official source and how far it was checked (Nov 18, 2026 audit).
// Shown in Settings → About; the same list is in STORE.md → "Data to confirm before launch".
import { BULLETIN } from './bulletin';
import { FEES_AS_OF } from './fees';
import { PT_AS_OF } from './processing';
import { WAITS_BUILT_IN } from './waits';
import { H1B_SOURCE } from './h1b';
import { LOTTERY_AS_OF } from './lottery';
import { CIVICS_SOURCE } from './civics';
import { RULES_CHECKED } from '../core/rules/catalog';
import { SOURCES, type DataSource } from './legal';

export const DATA_SOURCES: DataSource[] = [
  { id: 'bulletin', name: 'Visa Bulletin (employment)', asOf: `${BULLETIN.month} bulletin`, source: SOURCES.bulletin, status: 'partly checked',
    note: 'Final action and filing dates for EB-1/2/3 match two published summaries (cilawgroup.com, Oct 22, 2026; Newsweek). Other-workers and EB-5 filing dates, and the Mexico/Philippines filing cells left blank, are not confirmed. Replaced by the live bulletin when the server answers.' },
  { id: 'processing', name: 'USCIS processing times', asOf: PT_AS_OF, source: SOURCES.processing, status: 'unverified',
    note: 'Built-in snapshot; the live copy from egov.uscis.gov replaces it when the server answers.' },
  { id: 'fees', name: 'USCIS fees', asOf: FEES_AS_OF, source: SOURCES.fees, status: 'partly checked',
    note: 'Premium processing ($2,965 I-129/I-140, $1,780 I-765 OPT, from Mar 1, 2026) checked. Other lines follow the Apr 1, 2024 fee rule (G-1055) and are not rechecked; PL 114-113 fee on extensions not confirmed.' },
  { id: 'waits', name: 'Visa appointment waits', asOf: WAITS_BUILT_IN.updated ?? '—', source: SOURCES.waits, status: 'unverified',
    note: 'Built-in copy covers the five posts in India only; the live copy covers all posts.' },
  { id: 'wage', name: 'Prevailing wage levels', asOf: 'Live only', source: SOURCES.wage, status: 'live only',
    note: 'No built-in copy: levels come from DOL OFLC wage data on our server and show their wage year.' },
  { id: 'h1b', name: 'H-1B employer data', asOf: H1B_SOURCE.replace(/^USCIS H-1B Employer Data Hub · /, ''), source: SOURCES.h1b, status: 'unverified',
    note: 'Built-in top-employer list; search uses the server copy of the Data Hub files.' },
  { id: 'lottery', name: 'H-1B lottery facts', asOf: LOTTERY_AS_OF, source: SOURCES.lottery, status: 'unverified', note: 'Season dates and odds summarised from uscis.gov.' },
  { id: 'civics', name: 'Citizenship test questions', asOf: CIVICS_SOURCE.replace(/^USCIS /, ''), source: SOURCES.civics, status: 'checked', note: 'From the USCIS 2025 civics question list.' },
  { id: 'rules', name: 'Status rules and checks', asOf: RULES_CHECKED, source: SOURCES.guides, status: 'checked', note: 'Reviewed against USCIS, CBP and State Department guidance on this date.' },
];
