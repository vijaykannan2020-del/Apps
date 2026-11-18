// F-1 students, OPT and STEM OPT, J-1 exchange visitors and their F-2 / J-2 families (R1–R8).
import { addDays, daysTo, fmt, today } from '../dates';
import { finding, type Finding, type RuleCtx } from './types';
import { plannedTrips } from './status';

const STUDENT = ['F-1', 'F-1 OPT', 'STEM OPT', 'J-1'];

/** SEVP reporting (R3): changes in the last 10 days — new job, job end, address. */
function sevpEvents(c: RuleCtx) {
  const f = c.me.person.facts || {};
  const ev: { kind: string; date: string }[] = [...(f.sevpPending || [])];
  for (const j of f.employment || []) {
    ev.push({ kind: 'new employer', date: j.start });
    if (j.end) ev.push({ kind: 'job end', date: j.end });
  }
  if (f.jobEnded) ev.push({ kind: 'job end', date: f.jobEnded });
  if (c.settings?.address) ev.push({ kind: 'address', date: c.settings.address.changedOn });
  const t = today();
  return ev.filter((e) => e.date <= t && addDays(e.date, 10) >= t).sort((a, b) => a.date.localeCompare(b.date));
}

export function studentRules(c: RuleCtx): Finding[] {
  const { person, rec: r, facts: s } = c.me;
  const out: Finding[] = [];
  const v = r.visa;
  const dependent = (v === 'F-2' || v === 'J-2') && c.principal;
  if (!v || (!STUDENT.includes(v) && !dependent)) return out;
  const onOpt = v === 'F-1 OPT' || v === 'STEM OPT';

  if (dependent) {
    const ps = c.principal!.facts;
    if (ps.capGap && !ps.capGap.ended) out.push(finding('R5', 'info', 'capgap-dep', `${v} continues with ${c.principal!.person.name}’s cap-gap`, `Status continues to ${fmt(ps.capGap.until)} with the principal’s cap-gap. No work.`));
    if (r.i94?.ds && ps.statusUntil) out.push(finding('R7', 'info', 'ds', `I-94 “D/S” — follows ${c.principal!.person.name}’s status, to about ${fmt(s.graceUntil ?? ps.statusUntil)}`, `A ${v}’s stay follows the ${v === 'F-2' ? 'F-1' : 'J-1'} principal.`, ps.statusUntil));
    return out;
  }

  // R1 / R2 unemployment days (OPT + STEM in total)
  const u = s.unemployment;
  if (u && v === 'F-1 OPT') {
    if (u.days >= 80) out.push(finding('R1', 'act', 'opt-days', `OPT unemployment: ${Math.min(u.days, 90)} of 90 days${u.days >= 90 ? ' — talk to your DSO today' : ` — ${90 - u.days} left`}`, 'Post-completion OPT allows 90 days of unemployment in total. Report a job in the SEVP portal or talk to your DSO now.'));
    else if (u.days >= 60) out.push(finding('R1', 'review', 'opt-days', `OPT unemployment: ${u.days} of 90 days — ${90 - u.days} left`, 'Plan with your DSO — 90 days in total is the limit on post-completion OPT.'));
  }
  if (u && v === 'STEM OPT') {
    if (u.days >= 140) out.push(finding('R2', 'act', 'stem-days', `Unemployment: ${Math.min(u.days, 150)} of 150 days${u.days >= 150 ? ' — talk to your DSO today' : ` — ${150 - u.days} left`}`, 'OPT + STEM OPT allow 150 days of unemployment in total. Talk to your DSO now.'));
    else if (u.days >= 120) out.push(finding('R2', 'review', 'stem-days', `Unemployment: ${u.days} of 150 days — ${150 - u.days} left`, 'The limit is 150 days in total across OPT and STEM OPT.'));
  }
  // R3 SEVP portal within 10 days
  if (onOpt) {
    const ev = sevpEvents(c);
    if (ev.length) {
      const due = addDays(ev[0].date, 10);
      out.push(finding('R3', 'review', 'sevp', `Report in the SEVP portal by ${fmt(due)}`, `${[...new Set(ev.map((e) => e.kind))].join(', ').replace(/^./, (x) => x.toUpperCase())}: changes must be reported within 10 days.${v === 'STEM OPT' && ev.some((e) => e.kind === 'new employer') ? ' A new employer also needs a new I-983.' : ''}`, due));
    }
  }
  // R4 STEM extension window: (c)(3)(B) OPT card ends in ≤90 days, STEM degree, nothing filed
  if (v === 'F-1 OPT' && r.ead?.category === 'C3B' && person.facts?.stemEligibleDegree) {
    const de = daysTo(r.ead.expires);
    const filed = r.cases.some((x) => x.form === 'I-765' && (x.category === 'C3C' || (!!x.received && !!r.ead?.validFrom && x.received > r.ead.validFrom)));
    if (de !== null && de >= 0 && de <= 90 && !filed) out.push(finding('R4', de <= 30 ? 'act' : 'review', 'stem-file', `File the STEM OPT extension by ${fmt(r.ead.expires)} (OPT ends in ${de} days)`, `The window opened ${fmt(addDays(r.ead.expires!, -90))}. Filed on time, the STEM I-765 keeps work authorised for up to 180 days while it is pending.`, r.ead.expires));
  }
  // R5 cap-gap
  const cap = s.capGap;
  if (cap?.ended) out.push(finding('R5', 'act', 'capgap-end', `H-1B petition ${cap.ended.how} — cap-gap ended${cap.ended.on ? ` ${fmt(cap.ended.on)}` : ''}`, `Stop work now. ${s.graceUntil ? `A grace period to ${fmt(s.graceUntil)} may apply to leave, change status or start a new program.` : ''} Talk to your DSO or an attorney.`, s.graceUntil));
  else if (cap) out.push(finding('R5', 'info', 'capgap', `Cap-gap: F-1 status${cap.work ? ' and work' : ''} continue to ${fmt(cap.until)}`,
    cap.work ? 'Your OPT card was valid when the H-1B was filed, so status and work continue until the H-1B starts (or Apr 1 at the latest). Keep the receipt with your I-20.' : 'Status continues, but work does not: the OPT card wasn’t valid when the H-1B was filed.', cap.until));
  // R6 program ended — no OPT, no new I-20, no cap-gap
  let ended = !!cap?.ended;
  if (v === 'F-1' && !cap && r.i20?.programEnd && (daysTo(r.i20.programEnd) ?? 1) < 0 && !r.cases.some((x) => x.form === 'I-765')) {
    ended = true;
    out.push(finding('R6', 'act', 'f1-grace', `Program ended ${fmt(r.i20.programEnd)} — grace period ends ${fmt(s.graceUntil)}`, 'Leave the US, transfer to a new program (new I-20) or change status before this date.', s.graceUntil));
  }
  // R7 D/S vs fixed I-94
  if (!ended) {
    const progEnd = v === 'J-1' ? r.ds2019?.end : r.i20?.programEnd;
    if (r.i94?.ds) {
      out.push(finding('R7', 'info', 'ds', s.statusUntil ? `I-94 “D/S” — valid to ${fmt(s.statusUntil)}${s.graceUntil ? `, grace to ${fmt(s.graceUntil)}` : ''}` : 'I-94 “D/S” — valid while you keep status',
        `Duration of status follows the ${v === 'J-1' ? 'DS-2019' : onOpt ? 'OPT card' : 'I-20'} end date, plus ${v === 'J-1' ? '30' : '60'} days to leave or change status.`, s.statusUntil));
    } else if (r.i94?.until && progEnd && progEnd > r.i94.until && (daysTo(r.i94.until) ?? -1) >= 0 && !cap) {
      out.push(finding('R7', 'review', 'fixed-i94', `File I-539 before the I-94 ends (${fmt(r.i94.until)})`, `Your ${v === 'J-1' ? 'DS-2019' : 'I-20'} runs to ${fmt(progEnd)}, but your I-94 ends ${fmt(r.i94.until)}. File I-539 before ${fmt(r.i94.until)}.`, r.i94.until));
    }
  }
  // R8 travel signature
  if (r.i20?.travelSignature && plannedTrips(r, person).any) {
    const age = -(daysTo(r.i20.travelSignature) ?? 0);
    const optNow = onOpt && !s.capGap;
    const limit = optNow ? 183 : 365;
    if (age > limit) out.push(finding('R8', 'review', 'travel-sig', 'Get a new travel signature before the trip', `The last I-20 signature is from ${fmt(r.i20.travelSignature)} — it must be under ${optNow ? '6' : '12'} months old to return${optNow ? ' on OPT' : ''}.`));
  }
  return out;
}
