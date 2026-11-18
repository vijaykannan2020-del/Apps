// The employment-based Visa Bulletin, one shape for the app (built-in copy + server) and the tests.
// Cells: ISO date (cut-off), 'C' = current, 'U' = unavailable, null = not published.
export type BulletinCountry = 'all' | 'china' | 'india' | 'mexico' | 'philippines';
export type BulletinCell = string | null;
export type BulletinRow = { cat: string; label: string; final: Record<BulletinCountry, BulletinCell>; filing: Record<BulletinCountry, BulletinCell> };
export type VisaBulletin = {
  month: string; // 'November 2026'
  uscisChart: 'final' | 'filing'; // the chart USCIS says to use for I-485 this month
  source: string;
  rows: BulletinRow[];
  previous?: { month: string; rows: BulletinRow[] };
};

/** ISO-3 nationality (passport MRZ) → chargeability column. */
export const countryOf = (nat?: string): BulletinCountry =>
  nat === 'IND' ? 'india' : nat === 'CHN' ? 'china' : nat === 'MEX' ? 'mexico' : nat === 'PHL' ? 'philippines' : 'all';

/** I-140 preference (EB2, E21, EB-3…) → bulletin category label ("EB-2"). */
export const categoryOf = (c?: string) => {
  const k = (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(EB1|E1\d)$/.test(k)) return 'EB-1';
  if (/^(EB2|E21|NIW)$/.test(k)) return 'EB-2';
  if (/^(EB3|E3\d|EW3)$/.test(k)) return 'EB-3';
  if (/^(EB5|C5\d|T5\d|R5\d|I5\d)$/.test(k)) return 'EB-5';
  return undefined;
};

export function cutoff(rows: BulletinRow[] | undefined, cat: string, country: BulletinCountry, chart: 'final' | 'filing'): BulletinCell | undefined {
  const r = rows?.find((x) => x.cat === cat);
  if (!r) return undefined;
  return r[chart][country] ?? r[chart].all ?? r.final[country] ?? r.final.all;
}
export const isCurrent = (pd: string, c?: BulletinCell) => (c === 'C' ? true : !c || c === 'U' ? false : pd < c);
