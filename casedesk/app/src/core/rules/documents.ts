// Passport, visa stamp, work permit (C8–C12, C19, R24) and the outside-the-US travel checks (C11).
import { addDays, daysTo, fmt } from '../dates';
import { finding, type Finding, type RuleCtx } from './types';
import { approvalEnd } from './stay';
import { timely } from './status';

const usesEAD = (v?: string) => !!v && ['H-4 EAD', 'Green card pending'].includes(v);

export function visaUnconfirmed(c: RuleCtx): Finding[] {
  return c.me.rec.visa ? [] : [finding('C19', 'review', 'visa-unset', 'Confirm the visa type', 'Immigration Wallet doesn’t assume one. Add the I-94 or visa stamp — it shows the class — or pick the status under Edit details.')];
}

export function passportRules(c: RuleCtx, inUS: boolean): Finding[] {
  const r = c.me.rec;
  const dp = daysTo(r.passportExpiry);
  if (dp === null) return [];
  if (dp < 0) return [finding('C8', 'act', 'pp-exp', 'Passport has expired', inUS ? 'Renew it with the embassy or consulate. Needed for travel, extensions and the I-9.' : 'Renew it before any travel.', r.passportExpiry)];
  if (dp <= 180) return [finding('C9', 'review', 'pp-soon', `Passport expires in ${dp} days — renew it`, inUS ? 'Renew early — on re-entry CBP usually limits the I-94 to the passport date.' : 'CBP usually limits the I-94 to the passport date — renew before travelling.', r.passportExpiry)];
  const pend = inUS ? approvalEnd(c) : undefined;
  if (pend && r.passportExpiry! < pend) {
    const own = !!r.petitionEnd;
    return [finding('C9', 'review', 'pp-before', `Passport ends before the ${own ? 'approval' : 'principal’s approval'}`, `Renew before the next trip so the I-94 can run to ${fmt(pend)}.`, r.passportExpiry)];
  }
  return [];
}

export function outsideRules(c: RuleCtx): Finding[] {
  const r = c.me.rec;
  const where = `Outside the US${r.country ? ` — in ${r.country}` : ''}`;
  const dv = daysTo(r.visaStamp?.expires);
  const out: Finding[] = [];
  if (dv === null) out.push(finding('C11', 'review', 'visa-need', `${where} · no visa stamp saved`, 'A valid visa stamp is needed to enter the US. Add it once issued.'));
  else if (dv < 0) out.push(finding('C11', 'act', 'visa-exp-out', 'Visa stamping needed to travel', `The visa stamp expired ${fmt(r.visaStamp?.expires)}. Book a consular appointment early — interviews are now required for most people and waits in India run months.`, r.visaStamp?.expires));
  else out.push(finding(undefined, 'good', 'visa-ok', `${where} · visa valid until ${fmt(r.visaStamp?.expires)}`, 'Ready to travel while the passport and the principal’s status are valid.'));
  out.push(...passportRules(c, false));
  return out;
}

export function visaInUS(c: RuleCtx): Finding[] {
  const dv = daysTo(c.me.rec.visaStamp?.expires);
  return dv !== null && dv < 0 ? [finding('C10', 'info', 'visa-exp', 'Visa stamp expired — fine while in the US', 'A new stamp is needed only to travel back in.')] : [];
}

export function eadRules(c: RuleCtx): Finding[] {
  const r = c.me.rec;
  const out: Finding[] = [];
  if (!(usesEAD(r.visa) || r.ead) || r.visa === 'L-2S') return out;
  const optCard = r.visa === 'F-1 OPT' || r.visa === 'STEM OPT' || r.visa === 'F-1';
  const exp = r.ead?.expires;
  const de = daysTo(exp);
  const stemPending = r.visa === 'STEM OPT' && (timely(r) || r.cases.some((x) => x.form === 'I-765' && x.status === 'pending' && (!x.received || !exp || x.received <= exp)));
  if (de === null) { if (!optCard) out.push(finding(undefined, 'info', 'ead-missing', 'Add the EAD card', 'The work permit end date drives I-9 reverification.')); }
  else if (de < 0 && stemPending) out.push(finding('C12', 'review', 'ead-stem', `STEM OPT pending — work allowed up to ${fmt(addDays(exp!, 180))}`, 'A STEM OPT extension filed on time keeps a 180-day automatic extension.'));
  else if (optCard) { /* OPT cards aren't renewed: R4 / grace rules cover the end */ }
  else if (de < 0) out.push(finding('C12', 'act', 'ead-exp', 'EAD ended — stop work until the new card arrives', 'EAD renewals filed on or after Oct 30, 2025 get no automatic extension (all categories).', exp));
  else if (de <= 180) out.push(finding('C12', 'review', 'ead-soon', `EAD ends in ${de} days, no automatic extension`,
    r.visa === 'STEM OPT' || r.visa === 'F-1 OPT' ? 'File the STEM extension up to 90 days before the card ends.' : 'File the renewal as early as allowed — renewals filed since Oct 30, 2025 don’t auto-extend, so work stops on the card’s end date if it isn’t approved.', exp));
  // R24: an H-4 / L-2 EAD only works while that person's H-4 / L-2 status lasts.
  if (r.visa && ['H-4', 'H-4 EAD', 'L-2', 'L-2S'].includes(r.visa) && !/^c0?9$/i.test((r.ead?.category ?? '').replace(/[^a-z0-9]/gi, '')) && exp && r.i94?.until && exp > r.i94.until && (daysTo(exp) ?? -1) >= 0) {
    out.push(finding('R24', 'review', 'ead-past-i94', `EAD runs past the I-94 (${fmt(r.i94.until)})`, `The card says ${fmt(exp)}, but an ${r.visa.startsWith('H') ? 'H-4' : 'L-2'} EAD is valid only while the ${r.visa.startsWith('H') ? 'H-4' : 'L-2'} status is. Plan the extension before ${fmt(r.i94.until)}.`, r.i94.until));
  }
  return out;
}
