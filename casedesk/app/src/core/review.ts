// v2.9: why a person shows Review / Act now, and what to do — one short line each. Pure.
import type { Finding } from './rules/types';
import { bySeverity } from './rules/types';
import { addDays, isISO } from './dates';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Jun 2027" */
export const monthYear = (iso?: string) => (isISO(iso) ? `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');

type Todo = (d: string, m: string) => string;
const by = (d: string, words: string) => (d ? `${words} ${d}` : '');
/** What to do, by finding id (prefix match for ids with a suffix, e.g. rfe-…, trip-6m-…). */
const TODO: [string, Todo][] = [
  ['i94-missing', () => 'Add the latest I-94 from the CBP website (i94.cbp.dhs.gov).'],
  ['i94-expired', () => 'Talk to your immigration team or an attorney right away.'],
  ['i94-30', (d) => `File the extension now${by(d, ', before')}.`],
  ['i94-180', (d, m) => `Plan the extension${by(m, ' before')}. It can be filed up to 6 months ahead.`],
  ['i94-short', (d, m) => `Plan the extension${by(m, ' before')}, or ask for an I-94 to the full period at the next entry.`],
  ['i94-pending', () => 'Keep the receipt with you. The pending extension covers the stay for now.'],
  ['ext-late', (d) => `File the extension${by(d, ' before')}.`],
  ['pp-', (d, m) => `Renew the passport${by(m, ' before')} and add the new one here.`],
  ['visa-unset', () => 'Add a passport, visa stamp or I-94 so the status can be checked.'],
  ['visa-', () => 'A valid visa stamp is needed to come back. Plan stamping before you travel.'],
  ['ead-', (d, m) => `File the EAD renewal (up to 180 days before it ends${m ? `, ${m}` : ''}).`],
  ['dep-past-principal', () => 'File the dependent extension together with the principal’s.'],
  ['principal-first', (d, m) => `Plan the principal’s extension first${by(m, ', before')}; dependents file with it.`],
  ['travel-pending', () => 'Check before travelling: leaving can end a pending change or extension.'],
  ['travel-cos', () => 'Don’t travel until the change of status is decided, or ask an attorney.'],
  ['max', () => 'Plan the next step (green card, or recapture of days abroad) before the limit.'],
  ['grace', (d) => `Open the layoff plan: a new job or status is needed${by(d, ' by')}.`],
  ['dep-grace', (d) => `Open the layoff plan: the principal needs a new job or status${by(d, ' by')}.`],
  ['worksite', () => 'Ask your employer to file the amended petition before you start at the new site.'],
  ['class-mismatch', () => 'Ask CBP Deferred Inspection to correct the I-94 class.'],
  ['trip-', () => 'Check the trip length against continuous residence before you go.'],
  ['i751', (d) => `File the I-751 in the 90 days before the card ends${d ? ` (${d})` : ''}.`],
  ['i90', () => 'Renew the green card with Form I-90.'],
  ['ap-ends', (d) => `Don’t travel after ${d || 'the end date'} without a new advance parole.`],
  ['rfe-', (d) => `Answer the request for evidence${by(d, ' before')}.`],
  ['age-', (d) => `Ask your attorney about CSPA age-out protection${by(d, ' before')}.`],
  ['opt-days', () => 'Start a qualifying job before the unemployment days run out.'],
  ['stem-days', () => 'Start a qualifying job before the unemployment days run out.'],
  ['sevp', () => 'Report the change in the SEVP portal within 10 days.'],
  ['travel-sig', () => 'Get a new travel signature from your DSO before you travel.'],
  ['f1-grace', (d) => `Change status, start a new program or leave${by(d, ' by')}.`],
  ['capgap-end', (d) => `Act${by(d, ' before')}: the cap-gap period ends.`],
];

export function whatToDo(f: Finding, until?: string): string {
  const date = f.date ?? until;
  const d = isISO(date) ? fmtShort(date) : '';
  const m = isISO(date) ? monthYear(date) : '';
  const hit = TODO.find(([k]) => f.id === k || (k.endsWith('-') && f.id.startsWith(k)));
  if (hit) return hit[1](d, m);
  if (f.severity === 'act') return `Act${by(d, ' before')}. Talk to your immigration team or an attorney.`;
  return m ? `Plan ahead before ${m}.` : 'Check the details and keep the documents up to date.';
}
const fmtShort = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

export type Reason = { finding: Finding; line: string; todo: string };
/** The findings behind the person's pill (rule-tagged, Act now first), each with what to do. */
export function reviewReasons(findings: Finding[], until?: string): Reason[] {
  return findings.filter((f) => f.rule && (f.severity === 'act' || f.severity === 'review')).sort(bySeverity)
    .map((f) => ({ finding: f, line: f.title, todo: whatToDo(f, until) }));
}
/** One line for a person card: the main reason (the Review sheet lists the rest). */
export function reasonLine(findings: Finding[], until?: string): string | undefined {
  return reviewReasons(findings, until)[0]?.line;
}
