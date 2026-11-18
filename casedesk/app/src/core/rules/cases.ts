// Case deadlines and notes: RFE / NOID due dates (R27), adjudication-hold note.
import { daysTo, fmt } from '../dates';
import { finding, type Finding, type RuleCtx } from './types';
import { HOLD_COUNTRIES } from './catalog';

export function caseRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  const dues: { receipt?: string; form?: string; due: string; kind: string }[] = [];
  for (const x of r.cases) if (x.dueDate && (x.noticeKind === 'rfe' || x.noticeKind === 'noid')) dues.push({ receipt: x.receipt, form: x.form, due: x.dueDate, kind: x.noticeKind === 'noid' ? 'NOID' : 'RFE' });
  for (const x of c.cases || []) if (x.ownerId === person.id) for (const k of x.keyDates) if (k.kind === 'rfe-due' || k.kind === 'noid-due') dues.push({ receipt: x.receipt, form: x.form, due: k.date, kind: k.kind === 'noid-due' ? 'NOID' : 'RFE' });
  const seen = new Set<string>();
  for (const d of dues) {
    const key = `${d.receipt}-${d.due}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const left = daysTo(d.due)!;
    const what = `${d.kind}${d.form ? ` on ${d.form}` : ''}`;
    if (left < 0) out.push(finding('R27', 'act', `rfe-${key}`, `${what} response was due ${fmt(d.due)}`, 'Make sure the response reached USCIS. A missed deadline usually means a denial — talk to your attorney.', d.due));
    else out.push(finding('R27', left <= 14 ? 'act' : 'review', `rfe-${key}`, `${what}: ${left} days left to respond (due ${fmt(d.due)})`, 'USCIS must RECEIVE the response by the due date. Send it with tracking, well ahead.', d.due));
  }
  const hold = c.holdCountries ?? HOLD_COUNTRIES;
  if (r.nationality && hold.includes(r.nationality) && r.cases.some((x) => x.status === 'pending')) {
    out.push(finding('HOLD', 'info', 'hold', 'USCIS hold may apply to pending cases', 'USCIS has paused decisions on many cases for nationals of listed countries. Processing may take longer than the posted times.'));
  }
  return out;
}
