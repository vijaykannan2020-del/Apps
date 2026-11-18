// Dependents and the family: L-2 spouse class, child turning 21, a dependent's I-94 vs the
// principal's approval and I-94, the principal's grace period (C13, X3, C14, C15, C18).
import { addDays, addYears, daysTo, fmt } from '../dates';
import { finding, type Finding, type RuleCtx } from './types';
import { coverUntil, jobGrace } from './status';
import { isDependentVisa } from '../model';

export function dependentRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  // C13: L-2 spouse whose I-94 shows plain L2 (should be L-2S to prove work permission)
  if ((person.relation === 'spouse' || r.visa === 'L-2S') && (r.i94?.cls || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'L2') {
    out.push(finding('C13', 'info', 'l2-plain', 'I-94 shows L-2, not L-2S — get it fixed', 'A spouse’s I-94 should say L-2S to prove work permission for the I-9. Ask CBP Deferred Inspection to correct it.'));
  }
  // X3: child turning 21 ages out of H-4 / L-2
  if (person.relation === 'child' && r.birthDate && (!r.visa || isDependentVisa(r.visa))) {
    const at21 = addYears(r.birthDate, 21);
    const d21 = daysTo(at21)!;
    if (d21 < 0) out.push(finding('X3', 'act', 'age-out', `Turned 21 on ${fmt(at21)} — no longer a dependent`, 'H-4 / L-2 ends at 21. A change of status (e.g. F-1) must be filed before the 21st birthday.', at21));
    else if (d21 <= 365) out.push(finding('X3', 'review', 'age-soon', `Turns 21 on ${fmt(at21)}`, 'H-4 / L-2 ends at 21. Plan a change of status (e.g. F-1) before then.', at21));
  }
  return out;
}

/** Rules comparing a dependent with their principal. */
export function familyRules(c: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const { person, rec: q } = c.me;
  const p = c.principal;
  if (!p || !c.dependent || q.location === 'Outside') return out;
  const pp = p.rec;
  const g = jobGrace(pp, p.person) ? c.me.facts.graceUntil : undefined;
  if (g && pp.location !== 'Outside') out.push(finding('C18', 'act', 'dep-grace', `${p.person.name ? p.person.name + '’s' : 'Principal’s'} job ended — status ends ${fmt(g)}`, 'A dependent’s status follows the principal’s grace period. Plan the change of status or departure together.', g));
  const until = q.i94?.until;
  if (!until) return out;
  // C14: CBP may add up to 10 days after an H-1B petition end on H-1B / H-4 I-94s.
  const slack = pp.visa === 'H-1B' ? 10 : 0;
  if (pp.petitionEnd && until > addDays(pp.petitionEnd, slack)) {
    out.push(finding('C14', 'review', 'dep-past-principal', 'I-94 runs past the principal’s approval', `Their I-94 ends ${fmt(until)}, after the principal’s approval (${fmt(pp.petitionEnd)}). A dependent’s stay can’t outlast it — ask CBP Deferred Inspection to correct it.`));
  }
  if (pp.location !== 'Outside' && pp.i94?.until && pp.i94.until < until && (coverUntil(pp) ?? pp.i94.until) < until) {
    out.push(finding('C15', 'review', 'principal-first', `${p.person.name ? p.person.name + '’s' : 'Principal’s'} I-94 ends first (${fmt(pp.i94.until)})`, 'A dependent’s status follows the principal’s — plan the principal’s extension first.', pp.i94.until));
  }
  void person;
  return out;
}

export function graceRule(c: RuleCtx): Finding[] {
  const g = jobGrace(c.me.rec, c.me.person);
  return g ? [finding('C18', 'act', 'grace', `Job ended — grace period ends ${fmt(g)}`, 'Up to 60 days (never past the I-94) to file a new employer’s petition, change status or leave. Dependents’ status ends with it.', g)] : [];
}
