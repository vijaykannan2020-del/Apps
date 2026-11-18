// Calendar dates as plain 'YYYY-MM-DD' strings. All maths at local noon so DST never shifts a day.
// "Today" comes from the clock unless a test or the demo family pins it with setToday().

export type ISODate = string;

const DAY_MS = 864e5;
let pinned: ISODate | undefined;

/** Pin "today" (tests, demo mode). Pass undefined to go back to the clock. */
export function setToday(d?: ISODate) {
  pinned = d;
}

export const isISO = (s?: string): s is ISODate => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function toDate(s?: string): Date | null {
  return isISO(s) ? new Date(s + 'T12:00:00') : null;
}

export function iso(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function today(): ISODate {
  if (pinned) return pinned;
  return iso(new Date());
}

/** Whole days from today to the date (negative = in the past). null when there is no date. */
export function daysTo(s?: string, from: ISODate = today()): number | null {
  const d = toDate(s), f = toDate(from);
  return d && f ? Math.round((d.getTime() - f.getTime()) / DAY_MS) : null;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b)!.getTime() - toDate(a)!.getTime()) / DAY_MS);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = toDate(s)!;
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = toDate(s)!;
  d.setMonth(d.getMonth() + n);
  return iso(d);
}

export function addYears(s: ISODate, n: number): ISODate {
  const d = toDate(s)!;
  d.setFullYear(d.getFullYear() + n);
  return iso(d);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep 30, 2028" (no Intl dependency, same output on every platform). */
export function fmt(s?: string): string {
  if (!isISO(s)) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${MON[m - 1]} ${d}, ${y}`;
}

export const maxDate = (...ds: (string | undefined)[]) => ds.filter(isISO).sort().pop();
export const minDate = (...ds: (string | undefined)[]) => ds.filter(isISO).sort()[0];
