// Green-card applicants and holders, citizenship, address changes (R9–R15, R18, R21–R23).
import { addDays, addYears, daysBetween, daysTo, fmt, today } from '../dates';
import { isCitizen } from '../model';
import { finding, type Finding, type RuleCtx } from './types';
import { cutoff, isCurrent } from '../bulletin';
import { gcTrackOf } from '../gc';

export function addressRule(c: RuleCtx): Finding[] {
  // R9: AR-11 within 10 days of a move, for every non-citizen in the US
  const a = c.settings?.address;
  const r = c.me.rec;
  if (!a || isCitizen(r.visa) || r.location === 'Outside' || a.ar11Done.includes(c.me.person.id)) return [];
  const due = addDays(a.changedOn, 10);
  const late = (daysTo(due) ?? 0) < 0;
  return [finding('R9', late ? 'act' : 'review', 'ar11', late ? `AR-11 was due ${fmt(due)} — file it now` : `File AR-11 by ${fmt(due)}`, 'Every non-citizen must report a new address to USCIS within 10 days (online, free). Tick it off once done.', due)];
}

const tripDays = (t: { depart?: string; return?: string }) => (t.depart ? daysBetween(t.depart, t.return ?? today()) - 1 : 0);

export function residentRules(c: RuleCtx): Finding[] {
  const { rec: r, facts: s } = c.me;
  const out: Finding[] = [];
  const gc = r.greenCard;
  if (!gc) return out;
  // R10 / R11: long trips (logged or planned)
  for (const t of r.trips.filter((x) => x.depart)) {
    const n = tripDays(t);
    const permit = !!r.reentryPermit?.expires && (!t.return || r.reentryPermit.expires >= t.return);
    if (n >= 365 && !permit) out.push(finding('R11', 'act', `trip-1y-${t.depart}`, t.planned ? `Trip of ${n} days planned — file a re-entry permit (I-131) before you leave` : `Away ${n} days without a re-entry permit`,
      t.planned ? 'After a year abroad the green card no longer works for re-entry. File Form I-131 while still in the US (biometrics are needed before you go). It also breaks continuous residence for citizenship.' : 'The green card alone no longer works for re-entry after a year abroad. Talk to an attorney about the options.', t.depart));
    else if (n > 180) out.push(finding('R10', 'review', `trip-6m-${t.depart}`, `Trip of ${n} days${t.planned ? ' planned' : ''} — over 6 months`, 'Trips over 6 months can lead to questions about abandoning residence and may break continuous residence for citizenship unless you can show ties to the US.', t.depart));
  }
  // R12 / R13: conditional card and the I-751
  const i751 = r.cases.find((x) => x.form === 'I-751');
  let conditionalEnded = false;
  if (gc.conditional && gc.expires) {
    const opens = addDays(gc.expires, -90);
    const dExp = daysTo(gc.expires)!;
    if (i751) {
      if (dExp < 0 && i751.status === 'pending') out.push(finding('R13', 'info', 'i751-ext', `Card + I-751 receipt valid until ${fmt(s.cardPlusReceiptUntil)}`, 'The I-751 receipt extends the conditional card for 48 months past the card date. Carry both when you travel or start a job.', s.cardPlusReceiptUntil));
    } else if (dExp < 0) {
      conditionalEnded = true;
      out.push(finding('R12', 'act', 'i751-late', 'Card expired and no I-751 receipt — talk to an attorney now', 'Conditional residence ends if the I-751 isn’t filed. A late I-751 needs a reason (good cause). If you filed, add the receipt.', gc.expires));
    } else if ((daysTo(opens) ?? 1) <= 0) out.push(finding('R12', 'act', 'i751-now', `I-751 window is open — file by ${fmt(gc.expires)}`, `File the petition to remove conditions in the 90 days before the card expires (window opened ${fmt(opens)}).`, gc.expires));
    else out.push(finding('R12', 'info', 'i751-soon', `I-751 window opens ${fmt(opens)}`, 'File in the 90 days before the card expires — not earlier.', opens));
  }
  // R14: 10-year card renewal (quiet once an I-90 receipt is saved: card + receipt valid 36 months)
  if (!gc.conditional && gc.expires && !r.cases.some((x) => x.form === 'I-90')) {
    const d = daysTo(gc.expires)!;
    if (d < 0) out.push(finding('R14', 'review', 'i90-late', 'Green card expired — you are still a resident', 'Renew with Form I-90 so you can show a valid card for work and travel.', gc.expires));
    else if (d <= 183) out.push(finding('R14', 'review', 'i90', `Green card expires ${fmt(gc.expires)} — file I-90`, 'File the renewal up to 6 months before the card expires.', gc.expires));
  }
  // R15: earliest citizenship filing date (not once an N-400 is filed, not when conditional status ended)
  const cz = s.citizenship;
  if (cz && !conditionalEnded && !r.cases.some((x) => x.form === 'N-400')) {
    const open = (daysTo(cz.fileFrom) ?? 0) <= 0;
    const enough = cz.daysInUS === undefined || cz.daysInUS >= cz.needed || !open;
    if (enough) out.push(finding('R15', 'info', 'n400', open ? `You may be able to file for citizenship now (from ${fmt(cz.fileFrom)})` : `You can file for citizenship from ${fmt(cz.fileFrom)}`,
      `${cz.years}-year path${cz.years === 3 ? ' (married to and living with a US citizen)' : ''}, up to 90 days early — if you’ve been in the US at least ${cz.needed} days and kept continuous residence. ${cz.daysInUS !== undefined ? `So far: ${cz.daysInUS} days in the US.` : 'Import your I-94 travel history to count the days.'}`, cz.fileFrom));
  }
  return out;
}

export function applicantRules(c: RuleCtx): Finding[] {
  const { person, rec: r } = c.me;
  const out: Finding[] = [];
  const f = person.facts || {};
  const i485 = r.cases.find((x) => x.form === 'I-485' && x.status === 'pending');
  // R18: job change with I-485 pending (AC21)
  if (i485 && (f.jobEnded || f.jobChangedOn)) {
    const since = i485.received ? -(daysTo(i485.received) ?? 0) : 0;
    const i140 = r.i140Approved || c.members.some((m) => m.rec.i140Approved);
    if (since >= 180 && i140) out.push(finding('R18', 'info', 'ac21', `I-485 pending ${since} days with an approved I-140 — your case may be portable`, 'Under AC21 you may move to a same or similar job; USCIS may ask for Supplement J. Confirm with your attorney.'));
    else out.push(finding('R18', 'review', 'ac21-early', `Job change with the I-485 pending ${since} days`, 'Portability (AC21) needs the I-485 pending 180 days and an approved I-140. Talk to your attorney before changing jobs.'));
  }
  // R21: priority date vs this month's Visa Bulletin (the chart USCIS names), or moved back since last month
  // v2.9: the family follows the principal's I-140 (or a typed priority date), so dependents see it too.
  const t = gcTrackOf(c.me, c.members, c.bulletin);
  const pd = t && t.priorityDate && t.category && t.pdFrom !== 'perm' ? { priorityDate: t.priorityDate } : undefined;
  const pending485 = r.cases.some((x) => x.form === 'I-485');
  const b = c.bulletin;
  const cat = t?.category;
  if (pd && b && cat && !pending485 && t && t.stage !== 'approved') {
    const country = t.country;
    const now = cutoff(b.rows, cat, country, b.uscisChart);
    const before = b.previous ? cutoff(b.previous.rows, cat, country, b.uscisChart) : undefined;
    const chart = b.uscisChart === 'filing' ? 'dates for filing' : 'final action dates';
    const withWho = t.derivative ? ` with ${c.members.find((m) => m.person.id === t.ownerId)?.person.name ?? 'the principal'}` : '';
    // A dependent sees the same news as a note (source kept, no tag): the principal's finding is the one that counts.
    const tag = (x: Finding): Finding => (t.derivative ? { ...x, rule: undefined } : x);
    if (isCurrent(pd.priorityDate!, now)) out.push(tag(finding('R21', 'info', 'pd-current', `Priority date ${fmt(pd.priorityDate)} is current — you may be able to file the I-485${withWho}`, `It is before the ${cat} cut-off (${now === 'C' ? 'current' : fmt(now ?? '')}) in the ${b.month} Visa Bulletin, ${chart} — the chart USCIS uses this month. Check with your attorney.`)));
    else if (isCurrent(pd.priorityDate!, before)) out.push(tag(finding('R21', 'info', 'pd-back', 'Your priority date moved back this month', `The ${cat} cut-off went from ${fmt(before ?? '')} to ${now && now !== 'U' ? fmt(now) : 'unavailable'} in the ${b.month} Visa Bulletin (${chart}). It can move forward again.`)));
  }
  // R22: child may age out of a green-card case
  if (person.relation === 'child' && r.birthDate) {
    const inCase = c.members.some((m) => m.rec.cases.some((x) => ['I-140', 'I-485', 'I-130'].includes(x.form ?? ''))) || (c.cases || []).some((x) => ['I-140', 'I-485', 'I-130'].includes(x.form ?? ''));
    const at21 = addYears(r.birthDate, 21);
    const d21 = daysTo(at21)!;
    if (inCase && d21 >= 0 && d21 <= 365) out.push(finding('R22', 'review', 'cspa', `Turns 21 on ${fmt(at21)} — check the CSPA age`, 'A child in a green-card case may “age out” at 21. The Child Status Protection Act can lower the age used — talk to an attorney about the CSPA age.', at21));
  }
  // R23: no dual intent
  if (r.visa && ['TN', 'E-3', 'F-1', 'F-1 OPT', 'STEM OPT', 'B-2', 'B-1/B-2'].includes(r.visa)) {
    const own = r.cases.some((x) => ['I-140', 'I-485', 'I-130'].includes(x.form ?? '')) || (c.cases || []).some((x) => x.ownerId === person.id && ['I-140', 'I-485', 'ETA-9089'].includes(x.form ?? '')) || !!f.greenCardStarted;
    if (own) out.push(finding('R23', 'review', 'dual-intent', `${r.visa} has no “dual intent”`, 'With a green-card case on file, border entry and renewals on this status can be refused. Plan trips and renewals with your attorney.'));
  }
  return out;
}
