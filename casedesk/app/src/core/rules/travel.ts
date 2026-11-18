// Trips: what goes wrong at re-entry (C16, R16, R17, R25, R26). Warnings use the trip's dates when
// known (T1), else "travelling soon".
import { daysBetween, daysTo, fmt, today } from '../dates';
import { isNonimmigrant } from '../model';
import { classKey } from '../record';
import { finding, type Finding, type RuleCtx } from './types';
import { plannedTrips } from './status';

const VISA_CLASS: Record<string, string> = { 'H-1B': 'H1B', 'H-4': 'H4', 'H-4 EAD': 'H4', 'L-1A': 'L1', 'L-1B': 'L1', 'L-2S': 'L2', 'L-2': 'L2', TN: 'TN', TD: 'TD', 'E-3': 'E3', 'O-1': 'O1', 'F-1': 'F1', 'F-1 OPT': 'F1', 'STEM OPT': 'F1', 'J-1': 'J1', 'F-2': 'F2', 'J-2': 'J2', 'B-2': 'B', 'B-1/B-2': 'B' };
const stampFits = (stamp: string, visa: string) => {
  const want = VISA_CLASS[visa];
  if (!want) return true;
  const k = classKey(stamp).replace(/^L1[AB]$/, 'L1').replace(/^B[12]?B?[12]?$/, 'B');
  return k.startsWith(want);
};

export function travelRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  if (r.location === 'Outside') return out;
  const trips = plannedTrips(r, person);
  if (!trips.any) return out;
  const next = [...trips.dated].sort((a, b) => (a.depart || '').localeCompare(b.depart || ''))[0];
  const ret = next?.return;
  const when = next?.depart ? ` (leaving ${fmt(next.depart)})` : '';

  // R25: H-1B change of status pending inside the US (replaces C16)
  const cos = r.cases.find((x) => x.status === 'pending' && x.form === 'I-129' && (x.kind === 'change-of-status' || (classKey(x.cls) === 'H1B' && r.visa !== 'H-1B')));
  if (cos && r.visa !== 'H-1B') out.push(finding('R25', 'act', 'travel-cos', `Don’t travel${when} — your H-1B change of status is pending`, 'Leaving the US abandons the change of status. The H-1B would then need a visa abroad and may need the $100,000 payment for new petitions for people outside the US. Talk to your attorney before booking.'));
  // C16: travel while a status case is pending
  else if (r.pending) out.push(finding('C16', 'review', 'travel-pending', 'Travel while a case is pending', 'Leaving the US can abandon a pending change of status and ends 240-day cover. Plan with your immigration team.'));

  // R16 / R17: I-485 pending — travel only with Advance Parole (or valid H/L status)
  const i485 = r.cases.find((x) => x.form === 'I-485' && x.status === 'pending');
  if (i485) {
    const ap = r.advanceParole?.expires;
    const apOk = !!ap && (daysTo(ap) ?? -1) >= 0 && (!ret || ap >= ret);
    const hl = !!r.visa && ['H-1B', 'L-1A', 'L-1B', 'H-4', 'H-4 EAD', 'L-2', 'L-2S'].includes(r.visa) && (daysTo(r.i94?.until) ?? -1) >= 0;
    if (!ap) out.push(finding('R16', hl ? 'review' : 'act', 'travel-i485', hl ? 'Travel with the I-485 pending — re-enter in H/L status' : `Don’t travel${when} without Advance Parole`,
      hl ? 'You may re-enter on a valid H-1B / L-1 (or H-4 / L-2) visa and keep the I-485. Carry the approval and the I-485 receipt.' : 'Leaving the US with an I-485 pending and no Advance Parole (or combo card) abandons the application.'));
    else if (!apOk) out.push(finding('R17', 'act', 'ap-ends', `Advance Parole ends ${fmt(ap)}${ret ? ` — before the return on ${fmt(ret)}` : ''}`, 'Re-entering after the travel document ends can abandon the I-485. Renew the Advance Parole or shorten the trip.', ap));
  }

  // R26: visa stamping needed for the trip
  const visaExempt = ['CAN', 'BMU'].includes(r.nationality ?? '');
  // Automatic visa revalidation: trips under 30 days to Canada / Mexico (adjacent islands) with a valid I-94.
  const revalidation = !!next && /^(canada|mexico)$/i.test(next.country ?? '') && !!next.depart && !!next.return && daysBetween(next.depart, next.return) < 30 && (r.i94?.until ?? '') >= next.return && !r.pending;
  if (isNonimmigrant(r.visa) && r.visa && r.visa !== 'Green card pending' && !visaExempt && revalidation) {
    out.push(finding(undefined, 'info', 'revalidation', 'Short trip to Canada / Mexico — automatic visa revalidation may apply', 'Trips under 30 days to Canada or Mexico can allow re-entry on an expired visa with a valid I-94 (not after applying for a new visa there). Check the rules for your nationality.'));
  } else if (isNonimmigrant(r.visa) && r.visa && r.visa !== 'Green card pending' && !visaExempt) {
    const exp = r.visaStamp?.expires;
    const back = ret ?? today();
    const expired = !exp || exp < back;
    const mismatch = !!r.visaStamp?.cls && !stampFits(r.visaStamp.cls, r.visa);
    if (expired || mismatch) {
      const soon = next?.depart ? (daysTo(next.depart) ?? 999) <= 60 : false;
      out.push(finding('R26', soon ? 'act' : 'review', 'stamping', mismatch ? `Visa stamp is ${r.visaStamp?.cls}, not ${r.visa} — stamping needed to return` : exp ? `Visa expires ${fmt(exp)} — stamping needed to return` : 'No visa stamp saved — stamping needed to return',
        'Interview in your country of nationality or residence; most people can’t use the dropbox since Sep 2025; H-1B / H-4 / F / J applicants get an online-presence review — book early. See the stamping checklist.'));
    }
  }
  return out;
}
