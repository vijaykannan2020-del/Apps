// "Can I travel?" — checks a planned international trip against the person's saved status dates.
import { Profile } from './profile';

export type Verdict = 'ok' | 'risky' | 'no';
export type Reason = { tone: Verdict; title: string; detail: string };
export type Trip = { leave: string; back: string; canadian?: boolean; apOnHand?: boolean; i20Signed?: boolean; jobOffer?: boolean; capGap?: boolean };


export function checkTrip(p: Profile, trip: Trip): { verdict: Verdict; reasons: Reason[] } {
  const r: Reason[] = [];
  const back = trip.back;
  const v = p.visa;
  const work = ['H-1B', 'L-1A', 'L-1B', 'TN'].includes(v);
  const dependent = ['H-4', 'H-4 EAD', 'L-2S'].includes(v);
  const student = v === 'F-1 OPT' || v === 'STEM OPT';
  const pendingExt = !!p.extFiled;
  const today = new Date().toISOString().slice(0, 10);
  const in240 = pendingExt && p.i94Expiry && p.i94Expiry < today;

  if (in240) r.push({ tone: 'no', title: 'You’re working on a pending extension (240-day rule)', detail: 'Your I-94 has ended and you rely on the timely-filed extension. Leaving the US ends that — you’d need the approval and a valid visa stamp to come back.' });

  // Petition / approval valid on return
  if ((work || dependent) && p.petitionEnd) {
    if (p.petitionEnd < back) r.push({ tone: pendingExt ? 'risky' : 'no', title: `Your approval ends ${p.petitionEnd} — before you return`, detail: pendingExt ? 'Travel only once the extension is approved, and carry the new I-797. Re-entering on a pending case can shorten your I-94.' : 'You need a new approval notice before re-entering in this status.' });
    else r.push({ tone: 'ok', title: 'Approval notice covers your return', detail: `Valid to ${p.petitionEnd}. Carry the original I-797.` });
  }

  // Visa stamp
  if (!(v === 'TN' && trip.canadian)) {
    if (!p.visaStampExpiry) r.push({ tone: 'risky', title: 'Add your visa stamp date', detail: 'You need a valid visa stamp in your current category to re-enter.' });
    else if (p.visaStampExpiry < back) r.push({ tone: 'risky', title: 'Your visa stamp will be expired when you return', detail: 'You must get a new stamp at a US consulate abroad — interviews are now required for most applicants. Check wait times before booking flights.' });
    else r.push({ tone: 'ok', title: 'Visa stamp valid for re-entry', detail: `Expires ${p.visaStampExpiry}.` });
  } else r.push({ tone: 'ok', title: 'Canadian TN — no visa stamp needed', detail: 'Bring your TN approval or a new TN application to the port of entry.' });

  // Passport
  if (p.passportExpiry) {
    if (p.passportExpiry < back) r.push({ tone: 'no', title: 'Passport expires before you return', detail: 'Renew it first.' });
    else {
      const six = new Date(back + 'T12:00:00'); six.setMonth(six.getMonth() + 6);
      if (p.passportExpiry < six.toISOString().slice(0, 10)) r.push({ tone: 'risky', title: 'Passport valid less than 6 months after return', detail: 'Your new I-94 is usually cut to the passport date, and some countries need 6 months’ validity. Renew before travel if you can.' });
      else r.push({ tone: 'ok', title: 'Passport valid', detail: `Expires ${p.passportExpiry}.` });
    }
  }

  // Green card pending
  if (v === 'Green card pending') {
    if (trip.apOnHand) r.push({ tone: 'ok', title: 'Advance parole in hand', detail: 'Carry the AP / combo card. Leaving without it would abandon your I-485.' });
    else r.push({ tone: 'no', title: 'No advance parole', detail: 'Leaving the US with a pending I-485 and no advance parole abandons the application — unless you are maintaining H-1B / L-1 (or H-4 / L-2) status and re-enter with a valid visa. Check with your attorney.' });
  }

  // Students
  if (student) {
    if (trip.capGap) r.push({ tone: 'no', title: 'Cap-gap ends if you travel', detail: 'Leaving while on cap-gap generally means you can’t return until the H-1B starts (and you need an H-1B visa stamp).' });
    if (!trip.i20Signed) r.push({ tone: 'risky', title: 'Get a travel signature on your I-20', detail: 'On OPT it must be signed within the last 6 months.' });
    if (!trip.jobOffer) r.push({ tone: 'risky', title: 'Carry proof of employment', detail: 'Bring an employment letter and recent pay stubs along with your EAD.' });
    if (p.eadExpiry && p.eadExpiry < back) r.push({ tone: 'no', title: 'EAD expires before you return', detail: 'Re-entry on OPT needs a valid EAD (STEM extensions pending: talk to your DSO).' });
  }

  // Pending extension (not in 240-day) — informational
  if (pendingExt && !in240 && (work || dependent)) r.push({ tone: 'risky', title: 'Extension or change pending', detail: dependent ? 'Dependents: travel abandons a pending change of status (e.g. to H-4); a pending extension usually continues, but your I-94 on return follows your old approval.' : 'Travel is usually fine on a pending extension with the same employer, but your new I-94 will follow the old approval until the new one is granted.' });

  const order: Record<Verdict, number> = { no: 0, risky: 1, ok: 2 };
  r.sort((a, b) => order[a.tone] - order[b.tone]);
  const verdict: Verdict = r.some((x) => x.tone === 'no') ? 'no' : r.some((x) => x.tone === 'risky') ? 'risky' : 'ok';
  return { verdict, reasons: r };
}
