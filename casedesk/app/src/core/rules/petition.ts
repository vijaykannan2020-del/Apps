// The worker's petition: max stay, work location, amendments, several approvals, transfers,
// recapture and PERM timing (C17, C21–C24, R19, R20).
import { addDays, addYears, daysTo, fmt } from '../dates';
import type { WorkLocation } from '../model';
import { differentMetro } from '../metro';
import { finding, type Finding, type RuleCtx } from './types';
import { MAX_YEARS, maxOutDate, pendingKind } from './status';

const at = (w: WorkLocation) => [w.city, w.state].filter(Boolean).join(', ') || w.metro || '';


export function petitionRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  const kind = pendingKind(r);

  // C17: max stay (not for an H-1B with an approved I-140)
  const end = maxOutDate(r);
  if (end && !(r.visa === 'H-1B' && r.i140Approved)) {
    const dm = daysTo(end)!;
    if (dm <= 540) out.push(finding('C17', 'review', 'max', `${MAX_YEARS[r.visa!]}-year limit reached ${fmt(end)}`,
      `Time spent outside the US can be added back (recapture).${r.visa === 'H-1B' ? ' A PERM or I-140 filed 365+ days earlier allows 1-year extensions.' : ''}`, end));
  }

  // C21: H-1B work location in another metro, no amendment pending
  const approved = r.approvedWorkLocation ?? r.currentApproval?.workLocation;
  const now = person.facts?.workLocation;
  if (r.visa === 'H-1B' && now && approved && differentMetro(now, approved) && kind !== 'amendment') {
    out.push(finding('C21', 'act', 'worksite', `Amendment needed before working in ${at(now)}`,
      `The approval is for ${at(approved)}${approved.metro ? ` (${approved.metro})` : ''}. A move to another metro — remote work too — needs a new LCA and an amended H-1B filed before working there.`));
  }
  if (kind === 'amendment') out.push(finding('C22', 'info', 'amend-pending', 'Amendment pending', `Filed ${fmt(r.pending?.filed)}${r.pending?.receipt ? ` (${r.pending.receipt})` : ''}. The approval may or may not change the end date.`));
  const cur = r.currentApproval;
  if (r.approvals.length > 1 && cur) out.push(finding('C23', 'info', 'approvals', `${r.approvals.length} approvals saved — current: ${cur.receipt ?? cur.kind ?? 'latest'} to ${fmt(cur.validTo)}`, 'The latest notice is the current one; the others are kept as history (superseded).'));
  if (kind === 'transfer') out.push(finding('C24', 'info', 'transfer', 'Transfer filed — work for the new employer allowed', 'H-1B portability: work can start from the filing date. The 240-day rule doesn’t apply to a change of employer.'));

  if (r.visa === 'H-1B') {
    // R19: recapture — days outside the US since the H-1B started
    const out19 = c.me.facts.recaptureDays ?? 0;
    if (out19 > 0) out.push(finding('R19', 'info', 'recapture', `${out19} days outside the US can be added back to your 6-year limit`, 'Full days spent outside the US in H-1B (or H-4 / L) status can be “recaptured”. Keep the travel record — your employer files for it with the extension.'));
    // R20: year 5+ with no PERM / I-140 → filing deadline for extensions past 6 years
    const gc = person.facts?.greenCardStarted || c.members.some((m) => m.person.id === person.id && m.rec.cases.some((x) => ['I-140', 'I-485'].includes(x.form ?? ''))) || (c.cases || []).some((x) => x.ownerId === person.id && ['I-140', 'I-485', 'ETA-9089'].includes(x.form ?? ''));
    if (r.statusStart && !gc && person.facts?.statusStart) {
      const year5 = addYears(r.statusStart, 4);
      const sixEnd = addDays(addYears(r.statusStart, 6), -1);
      if ((daysTo(year5) ?? 1) <= 0 && (daysTo(sixEnd) ?? -1) >= 0) {
        const by = addDays(sixEnd, -365);
        const rc = c.me.facts.recaptureDays;
        out.push(finding('R20', 'review', 'perm-timing', `File PERM or the I-140 by ${fmt(by)} to extend past 6 years`,
          `H-1B extensions beyond 6 years need a PERM or I-140 filed at least 365 days before the 6-year end.${rc ? ` With the ${rc} recaptured days: by ${fmt(addDays(by, rc))}.` : ''} Ask your employer about the green-card process.`, by));
      }
    }
  }
  return out;
}
