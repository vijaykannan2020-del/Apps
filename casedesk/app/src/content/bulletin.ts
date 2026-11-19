// Employment-based Visa Bulletin (Department of State). Built-in copy; the server refreshes it monthly.
// November 2026 values checked Nov 18, 2026 against two published summaries of the bulletin
// (travel.state.gov blocks automated reads): cilawgroup.com (Oct 22, 2026) and f1jobs.io. Mexico /
// Philippines filing dates that equal "All Chargeability" in the bulletin are filled in; cells the
// summaries didn't give stay null (shown as —) and are listed in STORE.md → Data to confirm.
// India EB-1/2/3 final action and dates for filing: confirmed by the owner against travel.state.gov, Nov 19, 2026.
import type { BulletinCountry, VisaBulletin } from '../core/bulletin';
export type Country = BulletinCountry;
export const COUNTRIES: { value: Country; label: string }[] = [
  { value: 'india', label: 'India' },
  { value: 'china', label: 'China' },
  { value: 'all', label: 'All others' },
  { value: 'mexico', label: 'Mexico' },
  { value: 'philippines', label: 'Philippines' },
];

type Cell = string | null;
export type Bulletin = VisaBulletin;

export const BULLETIN: Bulletin = {
  month: 'November 2026',
  uscisChart: 'filing',
  source: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-november-2026.html',
  rows: [
    {
      cat: 'EB-1', label: 'Priority workers',
      final: { all: 'C', china: '2023-08-01', india: '2023-02-01', mexico: 'C', philippines: 'C' },
      filing: { all: 'C', china: '2024-07-01', india: '2024-07-01', mexico: 'C', philippines: 'C' },
    },
    {
      cat: 'EB-2', label: 'Advanced degree',
      final: { all: '2025-04-01', china: '2021-10-01', india: '2013-11-01', mexico: '2025-04-01', philippines: '2025-04-01' },
      filing: { all: '2026-03-15', china: '2023-01-01', india: '2015-01-15', mexico: '2026-03-15', philippines: '2026-03-15' },
    },
    {
      cat: 'EB-3', label: 'Skilled workers & professionals',
      final: { all: '2024-06-15', china: '2022-01-22', india: '2014-01-22', mexico: '2024-06-15', philippines: '2023-08-15' },
      filing: { all: '2024-08-01', china: '2024-04-01', india: '2015-01-15', mexico: null, philippines: '2024-01-01' },
    },
    {
      cat: 'EB-3 OW', label: 'Other workers',
      final: { all: '2022-06-01', china: '2019-10-01', india: '2014-01-22', mexico: '2022-06-01', philippines: '2022-01-01' },
      filing: { all: '2022-07-01', china: '2020-10-01', india: '2015-01-15', mexico: null, philippines: null },
    },
    {
      cat: 'EB-5', label: 'Investors (unreserved)',
      final: { all: 'C', china: '2016-12-01', india: '2023-12-01', mexico: 'C', philippines: 'C' },
      filing: { all: 'C', china: '2021-03-01', india: '2024-05-01', mexico: null, philippines: null },
    },
  ],
};

export const fmtCell = (c: Cell) =>
  c === 'C' ? 'Current' : c === 'U' ? 'Unavailable' : c ? new Date(c + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// Is a priority date "current" against a cell? (PD must be earlier than the cutoff)
export { isCurrent } from '../core/bulletin';
