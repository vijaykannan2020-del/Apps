// The stay itself: I-94 dates, extensions on file, the 240-day rule (C1–C7, C5, C25, X1, X2).
import { addDays, daysTo, fmt } from '../dates';
import { hasPetition } from '../model';
import { classKey, classLabel } from '../record';
import { finding, type Finding, type RuleCtx } from './types';
import { isBlanket, pendingKind, timely, uses240 } from './status';

/** The approval end that limits them: their own, else (a dependent) the principal's. */
export function approvalEnd(c: RuleCtx): string | undefined {
  const r = c.me.rec;
  if (r.petitionEnd) return r.petitionEnd;
  // A dependent without their own approval is compared with the principal's — but only while that
  // approval still counts (no job end) and when their own I-94 ends within 180 days (it's actionable).
  const p = c.dependent ? c.principal : undefined;
  if (!p?.rec.petitionEnd || p.person.facts?.jobEnded) return undefined;
  const d = daysTo(r.i94?.until);
  return d !== null && d <= 180 ? p.rec.petitionEnd : undefined;
}

export function stayRules(c: RuleCtx): Finding[] {
  const r = c.me.rec;
  const out: Finding[] = [];
  const work = hasPetition(r.visa);
  const kind = pendingKind(r);
  const onTime = timely(r);
  const blanket = isBlanket(r);
  const until = r.i94?.until;
  const d94 = daysTo(until);
  const pend = approvalEnd(c);
  const own = !!r.petitionEnd;
  const approvalWord = blanket ? 'I-129S period' : 'approval';

  if (r.i94?.ds) {
    // F-1 / J-1 "D/S": handled by the student rules (R7) — no I-94 date to count down.
  } else if (d94 === null) {
    out.push(finding('C1', 'review', 'i94-missing', 'I-94 missing — add the most recent one', 'The I-94 — not the visa stamp — decides how long they can stay. Get it from the CBP I-94 website.'));
  } else if (r.pending?.filed && !onTime) {
    out.push(finding('C7', 'act', 'ext-late', `Filed after the I-94 ended (${fmt(until)})`, 'A late filing doesn’t keep status. Talk to your immigration team or an attorney now.'));
  } else if (onTime) {
    if (d94 < 0 && uses240(r)) {
      const end = addDays(until!, 240);
      const left = daysTo(end)!;
      out.push(finding('C6', left < 0 ? 'act' : 'review', 'i94-240', left < 0 ? `240-day period ended ${fmt(end)}` : `Extension pending — 240-day cover until ${fmt(end)}`,
        'Filed before the I-94 ended, so work for the same employer can continue up to 240 days while USCIS decides. It ends on a denial; travel abroad ends it too.', end));
    } else if (d94 < 0 && kind === 'transfer') {
      out.push(finding('X2', 'review', 'transfer-past', 'I-94 ended — transfer pending', 'The 240-day rule doesn’t apply to a change of employer. The stay is tied to the pending petition — check with your immigration team.'));
    } else if (d94 < 0 && !work && !r.ead) {
      out.push(finding(undefined, 'info', 'i94-pending', 'I-94 ended — extension pending (authorized stay)', 'A timely extension lets them stay while USCIS decides. Don’t travel until it’s decided.'));
    } else if (d94 < 0) {
      out.push(finding('X1', 'review', 'i94-pending', 'I-94 ended — extension pending', 'A timely extension lets them stay while it’s pending, but it gives no work permission. Don’t travel until it’s decided.'));
    } else {
      const what = kind === 'amendment' ? 'Amendment' : kind === 'transfer' ? 'Transfer' : kind === 'change-of-status' ? 'Change of status' : 'Extension';
      out.push(finding(undefined, 'good', 'i94-filed', `Status valid until ${fmt(until)} — ${what.toLowerCase()} filed`, `${what} filed ${fmt(r.pending?.filed)}${r.pending?.receipt ? ` (${r.pending.receipt})` : ''}, before the I-94 ends. Track it in Cases.`, until));
    }
  } else if (d94 < 0) {
    out.push(finding('C2', 'act', 'i94-expired', `I-94 ended ${-d94} days ago — nothing filed`, 'If nothing was filed in time they may be out of status. Talk to your immigration team or an attorney right away.', until));
  } else if (d94 <= 30) {
    out.push(finding('C3', 'act', 'i94-30', `I-94 ends in ${d94} days — file the extension now`, `The stay ends ${fmt(until)}. The extension must reach USCIS before that date.`, until));
  } else if (d94 <= 180) {
    out.push(finding('C4', 'review', 'i94-180', `I-94 ends in ${d94} days — plan the extension`,
      blanket ? 'Blanket L: to stay longer the employer files an individual I-129 with USCIS (up to 6 months before).' : work ? 'H-1B, L-1 and TN extensions can be filed up to 6 months before the end date.' : 'File with the principal’s petition so they’re decided together.', until));
  } else {
    out.push(finding(undefined, 'good', 'i94-ok', `Status valid until ${fmt(until)}`, `${d94} days left on the I-94.`, until));
  }

  // C5: I-94 shorter than the approval (a dependent without their own: the principal's).
  if (until && pend && until < addDays(pend, -1)) {
    out.push(finding('C5', 'review', 'i94-short', `I-94 ends before the ${own ? approvalWord : 'principal’s approval'}`,
      `${own ? (blanket ? 'The I-129S period' : 'The approval') : 'The principal’s approval'} runs to ${fmt(pend)} but the I-94 ends ${fmt(until)} (often the passport date, or a shorter I-94 from the last entry). The I-94 date is the one that counts.`));
  }
  // C25: I-94 class differs from the approval / I-129S class (e.g. L1A vs L-1B).
  if (r.i94?.cls && r.approvalClass && classKey(r.i94.cls) !== classKey(r.approvalClass)) {
    out.push(finding('C25', 'review', 'class-mismatch', `I-94 class ${classKey(r.i94.cls)} doesn't match your petition (${classLabel(r.approvalClass)}) — ask CBP about a correction`,
      'A wrong class on the I-94 can cause trouble with I-9, extensions and travel. CBP Deferred Inspection can correct it.'));
  }
  if (blanket && c.dependent) out.push(finding(undefined, 'info', 'blanket', `On a blanket L via ${c.principal?.person.name || 'the employee'} — travel with a copy of their endorsed I-129S`, 'A dependent on a blanket L shows the principal’s I-129S (with the visa and I-94) at the border and for extensions.'));
  else if (blanket) out.push(finding(undefined, 'good', 'blanket', 'Blanket L — carry the endorsed I-129S', 'Keep it with the passport — it’s the proof of status with the I-94. Staying past the I-129S needs an individual I-129 filed with USCIS.'));
  return out;
}
