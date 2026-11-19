// Green-card track rules (v2.9): G1 EAD (C9) renewal, G2 advance parole before travel, G3 priority
// date and the final action date while the I-485 is pending, G4 keeping H / L status (or the EAD)
// with the I-485 pending, G5 interview, G6 PERM → I-140 within 180 days. R21 (priority date current
// to file) lives in greenCard.ts and now uses the same track, so dependents see it too.
// Steady-state notes carry the source but no rule tag, so they never turn "All good" into a pill.
import { daysTo, fmt } from '../dates';
import { cellText, gcTrackOf, workBasis } from '../gc';
import { finding, type Finding, type RuleCtx, type Severity } from './types';

/** A finding with the rule's source but no tag (does not change the pill or "All good"). */
const note = (rule: string, sev: Severity, id: string, title: string, detail: string, date?: string): Finding => ({ ...finding(rule, sev, id, title, detail, date), rule: undefined });

export function gcRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  const t = gcTrackOf(c.me, c.members, c.bulletin);
  if (!t || t.stage === 'approved') return out;
  const wb = workBasis(c.me);
  const name = person.relation === 'self' ? 'you' : person.name;

  // G1: EAD (C9) — renew up to 180 days before it ends; no automatic extension since Oct 30, 2025.
  const c9 = r.ead && (r.ead.category === 'C9' || r.ead.comboAP) ? r.ead : undefined;
  if (c9?.expires && wb.pending485) {
    const d = daysTo(c9.expires)!;
    const renewal = r.cases.find((x) => x.form === 'I-765' && x.status === 'pending' && (!x.received || !c9.validFrom || x.received >= c9.validFrom));
    const onStatus = wb.workOn === 'status' && wb.hlValid;
    if (renewal) {
      if (d >= 0 && d <= 60) out.push(finding('G1', onStatus ? 'info' : 'review', 'gc-ead-wait', `EAD renewal filed ${fmt(renewal.received)} — card ends ${fmt(c9.expires)}`,
        `Renewals filed since Oct 30, 2025 are not extended automatically. If the new card hasn’t arrived by ${fmt(c9.expires)}, stop working on the EAD${onStatus ? ' — your H / L status still lets you work for your employer' : ''}.`, c9.expires));
      else if (d < 0) out.push(finding('G1', onStatus ? 'info' : 'act', 'gc-ead-gap', onStatus ? 'EAD ended — renewal pending; keep working on H / L status' : 'EAD ended — stop work until the new card arrives',
        'The pending renewal does not extend the card (8 CFR 274a.13(e)). The I-485 itself keeps you in the US.', c9.expires));
    } else if (d < 0) out.push(finding('G1', onStatus ? 'info' : 'act', 'gc-ead-exp', onStatus ? `EAD (C9) ended ${fmt(c9.expires)} — renew it` : 'EAD (C9) ended — stop work and file the renewal now',
      onStatus ? 'You are working on H / L status, so nothing stops today. Renew the EAD so you can switch to it later.' : 'Work on the EAD stops on the card date. File Form I-765 (C9) now; the pending I-485 still lets you stay.', c9.expires));
    else if (d <= 180) out.push(finding('G1', onStatus ? 'info' : 'review', 'gc-ead-renew', `EAD (C9) ends ${fmt(c9.expires)} — file the renewal now`,
      `USCIS accepts the I-765 renewal up to 180 days before the card ends. It is not extended automatically, so file early${onStatus ? '' : ' — work on the EAD stops on the card date if the new one isn’t here'}.`, c9.expires));
  }

  // G2: advance parole before travel (no H / L status to return on).
  if (wb.pending485 && !(wb.workOn === 'status' && wb.hlValid)) {
    const ap = r.advanceParole?.expires;
    const dap = daysTo(ap);
    const apCase = r.cases.find((x) => x.form === 'I-131' && x.status === 'pending');
    if (dap !== null && dap >= 0 && dap <= 180 && !apCase) out.push(finding('G2', 'review', 'gc-ap-renew', `Advance parole ends ${fmt(ap)} — renew before any trip`,
      'Leaving the US with the I-485 pending and no valid advance parole abandons the application. File Form I-131 well ahead of travel; it takes months.', ap));
    else if ((dap === null || dap < 0) && apCase) out.push(note('G2', 'info', 'gc-ap-pending', 'Advance parole pending — stay in the US until it is approved',
      'Leaving before it is approved abandons the I-131 and, without H / L status, the I-485.'));
    else if (dap === null && !apCase && !r.ead?.comboAP) out.push(note('G2', 'info', 'gc-ap-none', `No advance parole saved — ${name === 'you' ? 'don’t' : 'they shouldn’t'} travel without one`,
      'Add the I-512L or the combo card. Without it, leaving the US abandons the pending I-485.'));
  }

  // G3: priority date vs the final action date while the I-485 is pending.
  if (wb.pending485 && t.bulletin && t.priorityDate) {
    const b = t.bulletin;
    if (b.canApprove) out.push(note('G3', 'good', 'gc-final', `Final action date is current (${cellText(b.final)}) — the I-485 can be approved`,
      `Priority date ${fmt(t.priorityDate)} is before the ${t.category} cut-off in the ${b.month} Visa Bulletin. USCIS decides once biometrics, the medical and any interview are done.`));
    else out.push(finding('G3', 'info', b.movedBack ? 'gc-retro' : 'gc-not-final', b.movedBack ? 'Your priority date is no longer current — the I-485 waits' : `I-485 waits for the final action date (${cellText(b.final)})`,
      `It can be approved only once the ${t.category} final action date passes ${fmt(t.priorityDate)}. Keep the EAD and advance parole renewed meanwhile.`));
  }

  // G4: I-485 pending — keep H / L status, or work on the EAD.
  if (wb.pending485) {
    const cls = wb.hlClass ? wb.hlClass.replace(/^H1B$/, 'H-1B').replace(/^L1([AB]?)$/, 'L-1$1').replace(/^H4$/, 'H-4').replace(/^L2S?$/, 'L-2') : undefined;
    if (wb.workOn === 'status' && wb.hlValid) {
      const d = daysTo(wb.i94Until)!;
      if (d <= 180) out.push(finding('G4', 'review', 'gc-hl-ends', `${cls} I-94 ends ${fmt(wb.i94Until)} — extend it or switch to the EAD`,
        `With the I-485 pending you can keep ${cls} status (extend before the I-94 ends) or work on the EAD (C9). Keeping ${cls} lets you travel on the visa without advance parole and protects you if the I-485 is denied.`, wb.i94Until));
      else out.push(note('G4', 'info', 'gc-hl-keep', `Keeping ${cls} status while the I-485 is pending`,
        `Valid until ${fmt(wb.i94Until)}. You may travel and return on a valid ${cls} visa to the same employer without advance parole. Switching to the EAD ends ${cls} status.`));
    } else if (wb.workOn === 'ead' && wb.hlValid) {
      out.push(note('G4', 'info', 'gc-on-ead', `Working on the EAD — ${cls} status no longer counts`,
        'Your stay now rests on the pending I-485. Travel only with advance parole, and renew the EAD on time. If the I-485 were denied, there is no H / L status to fall back on.'));
    }
  }
  // G4 (dependent): the principal works on the EAD, so an H-4 / L-2 that follows them ends.
  // (the stay principal no longer matches once they are on the EAD, so fall back to the main person)
  const p = c.principal ?? (person.relation === 'spouse' || person.relation === 'child' ? c.members.find((m) => m.person.relation === 'self' && m.person.id !== person.id) : undefined);
  if (p && p.rec.gcOnEad && r.i94?.cls && /^(H4|L2S?)$/.test(r.i94.cls.toUpperCase().replace(/[^A-Z0-9]/g, '')) && !r.gcOnEad) {
    const own485 = wb.pending485;
    out.push(finding('G4', own485 ? 'review' : 'act', 'gc-dep-hl', `${p.person.name} works on the EAD — ${person.relation === 'self' ? 'your' : `${person.name}’s`} ${r.i94.cls.toUpperCase().startsWith('H') ? 'H-4' : 'L-2'} depends on their H / L status`,
      own485 ? 'Your own pending I-485 lets you stay. Rely on your own EAD and advance parole, not the dependent status.' : 'Without your own I-485 on file, the dependent status ends with the principal’s. Talk to an attorney now.'));
  }

  // G5: interview.
  if (t.interview && (t.stage === 'interview' || t.stage === 'i485')) {
    const d = daysTo(t.interview)!;
    if (d >= 0 && d <= 60) out.push(finding('G5', 'review', 'gc-interview', `Green card interview ${fmt(t.interview)} — ${d === 0 ? 'today' : `in ${d} days`}`,
      'Open Interview prep for the checklist of originals to bring for each person, and the usual questions.', t.interview));
    else if (d > 60) out.push(note('G5', 'info', 'gc-interview-later', `Green card interview ${fmt(t.interview)}`, 'We’ll remind you before. Interview prep has the checklist.', t.interview));
  }

  // G6: PERM certified → the I-140 within 180 days.
  if (!t.derivative && t.perm?.expires && !t.i140) {
    const d = daysTo(t.perm.expires)!;
    if (d < 0) out.push(finding('G6', 'review', 'gc-perm-exp', `PERM certification expired ${fmt(t.perm.expires)}`, 'If the I-140 was filed before then, add its receipt. If not, the labor certification can’t be used — ask the employer’s attorney.', t.perm.expires));
    else if (d <= 60) out.push(finding('G6', 'review', 'gc-perm-140', `File the I-140 by ${fmt(t.perm.expires)}`, 'A PERM certification expires 180 days after it is granted unless the I-140 is filed with it.', t.perm.expires));
    else out.push(note('G6', 'info', 'gc-perm-140-later', `I-140 due by ${fmt(t.perm.expires)}`, 'The employer files the I-140 within 180 days of PERM certification.', t.perm.expires));
  }
  return out;
}
