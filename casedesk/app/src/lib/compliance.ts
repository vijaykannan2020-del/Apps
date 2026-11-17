// Personal status checks, computed on the phone from the dates the user enters.
import { Profile, usesEAD, hasPetition } from './profile';

export type Check = { id: string; tone: 'red' | 'amber' | 'green' | 'neutral'; title: string; detail: string; icon: string };

const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : null);
export const daysTo = (s?: string) => { const d = parse(s); return d ? Math.round((d.getTime() - today().getTime()) / DAY) : null; };
const addDays = (s: string, n: number) => new Date(parse(s)!.getTime() + n * DAY).toISOString().slice(0, 10);
const addYears = (s: string, n: number) => { const d = parse(s)!; d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
export const fmt = (s?: string) => { const d = parse(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };

const MAX_YEARS: Record<string, number> = { 'H-1B': 6, 'L-1A': 7, 'L-1B': 5 };

export function runChecks(p: Profile): Check[] {
  const out: Check[] = [];
  const work = hasPetition(p.visa);
  const filedOnTime = !!p.extFiled && (!p.i94Expiry || p.extFiled <= p.i94Expiry);

  // 1. I-94 / status end
  const d94 = daysTo(p.i94Expiry);
  if (d94 === null) {
    out.push({ id: 'i94-missing', tone: 'amber', icon: 'document-outline', title: 'Add your I-94 “Admit Until” date', detail: 'Your I-94 — not your visa stamp — decides how long you can stay. Get the latest one from the CBP I-94 website.' });
  } else if (filedOnTime) {
    if (d94 < 0 && work) {
      out.push({ id: 'i94-240', tone: 'amber', icon: 'hourglass-outline', title: `Extension pending — 240-day rule until ${fmt(addDays(p.i94Expiry!, 240))}`, detail: 'Because the extension was filed before your I-94 expired, you may keep working for the same employer for up to 240 days while USCIS decides.' });
    } else if (d94 < 0) {
      out.push({ id: 'i94-pending', tone: 'amber', icon: 'hourglass-outline', title: 'Extension pending — stay covered while it is decided', detail: 'A timely-filed extension keeps your stay authorized while pending. Work on an EAD still stops on the card’s end date.' });
    } else {
      out.push({ id: 'i94-filed', tone: 'green', icon: 'checkmark-circle', title: `Extension filed on time${p.extReceipt ? ` (${p.extReceipt})` : ''}`, detail: `Filed ${fmt(p.extFiled)}, before your I-94 ends on ${fmt(p.i94Expiry)}. Track it in Cases.` });
    }
  } else if (d94 < 0) {
    out.push({ id: 'i94-expired', tone: 'red', icon: 'alert-circle', title: `I-94 ended ${-d94} days ago — no extension recorded`, detail: 'If nothing was filed in time you may be out of status. Talk to your employer’s immigration team or an attorney right away.' });
  } else if (d94 <= 30) {
    out.push({ id: 'i94-30', tone: 'red', icon: 'alert-circle', title: `I-94 ends in ${d94} days — file the extension now`, detail: `Your stay ends ${fmt(p.i94Expiry)}. The extension must be filed (received by USCIS) before that date.` });
  } else if (d94 <= 180) {
    out.push({ id: 'i94-180', tone: 'amber', icon: 'time-outline', title: `I-94 ends in ${d94} days — extension window is open`, detail: work ? 'H-1B, L-1 and TN extensions can be filed up to 6 months before the end date. Start now with your employer.' : 'Plan your extension with the principal’s petition so they are filed together.' });
  } else {
    out.push({ id: 'i94-ok', tone: 'green', icon: 'checkmark-circle', title: `Status valid until ${fmt(p.i94Expiry)}`, detail: `${d94} days left on your I-94.` });
  }

  // 2. I-94 shorter than the approval
  if (p.i94Expiry && p.petitionEnd && p.i94Expiry < addDays(p.petitionEnd, -1)) {
    out.push({ id: 'i94-short', tone: 'amber', icon: 'git-compare-outline', title: 'I-94 ends before your approval notice', detail: `Approval runs to ${fmt(p.petitionEnd)} but your I-94 ends ${fmt(p.i94Expiry)} — often because the passport expired sooner. You must leave or extend by the I-94 date; ask CBP about a correction if it is wrong.` });
  }

  // 3. Passport
  const dp = daysTo(p.passportExpiry);
  if (dp !== null) {
    if (dp < 0) out.push({ id: 'pp-exp', tone: 'red', icon: 'airplane-outline', title: 'Passport has expired', detail: 'Renew it with your country’s embassy or consulate. Needed for travel, extensions and your I-9.' });
    else if (dp <= 180) out.push({ id: 'pp-soon', tone: 'amber', icon: 'airplane-outline', title: `Passport expires in ${dp} days`, detail: 'Renew early — on re-entry CBP usually limits your I-94 to the passport date.' });
    else if (p.petitionEnd && p.passportExpiry! < p.petitionEnd) out.push({ id: 'pp-before', tone: 'neutral', icon: 'airplane-outline', title: 'Passport ends before your approval', detail: `Renew before your next trip so your I-94 can run to ${fmt(p.petitionEnd)}.` });
  }

  // 4. Visa stamp
  const dv = daysTo(p.visaStampExpiry);
  if (dv !== null && dv < 0) out.push({ id: 'visa-exp', tone: 'neutral', icon: 'card-outline', title: 'Visa stamp has expired', detail: 'That’s fine while you stay in the US. You need a new stamp before you travel back in.' });

  // 5. EAD
  if (usesEAD(p.visa)) {
    const de = daysTo(p.eadExpiry);
    if (de === null) out.push({ id: 'ead-missing', tone: 'amber', icon: 'id-card-outline', title: 'Add your EAD card end date', detail: 'Your work permit end date drives your I-9 reverification.' });
    else if (de < 0 && p.visa === 'STEM OPT' && filedOnTime) out.push({ id: 'ead-stem', tone: 'amber', icon: 'id-card-outline', title: `STEM OPT pending — work allowed up to ${fmt(addDays(p.eadExpiry!, 180))}`, detail: 'Timely-filed STEM OPT keeps a 180-day automatic extension.' });
    else if (de < 0) out.push({ id: 'ead-exp', tone: 'red', icon: 'id-card-outline', title: 'EAD has expired — stop work until the new card arrives', detail: 'Renewals filed on or after Oct 30, 2025 get no automatic extension (STEM OPT excepted).' });
    else if (de <= 180) out.push({ id: 'ead-soon', tone: 'amber', icon: 'id-card-outline', title: `EAD ends in ${de} days`, detail: p.visa === 'STEM OPT' || p.visa === 'F-1 OPT' ? 'File the STEM extension up to 90 days before the card ends.' : 'No automatic extension — file the renewal as early as allowed (with the H-1B / H-4 extension if you can).' });
  }

  // 6. Max stay
  const max = MAX_YEARS[p.visa];
  if (max && p.statusStart) {
    const end = addYears(p.statusStart, max);
    const dm = daysTo(end)!;
    if (p.visa === 'H-1B' && p.i140Approved) out.push({ id: 'max-i140', tone: 'green', icon: 'infinite-outline', title: 'Can extend past 6 years', detail: 'An approved I-140 allows 3-year H-1B extensions beyond the 6-year limit.' });
    else out.push({ id: 'max', tone: dm <= 365 ? 'amber' : 'neutral', icon: 'calendar-outline', title: `${max}-year limit reached ${fmt(end)}`, detail: `Time spent outside the US can be added back (recapture). ${p.visa === 'H-1B' ? 'A PERM or I-140 filed 365+ days earlier allows 1-year extensions.' : ''}`.trim() });
  }

  const order = { red: 0, amber: 1, neutral: 2, green: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
