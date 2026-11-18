// Personal status checks, computed on the phone from the dates saved for each person.
import { Profile, usesEAD, hasPetition, isBlanket, WorkLocation, Approval } from './profile';
import { differentMetro } from './metro';

// rule = the brief's rule (C1–C25, X1–X3). tone: red = act now, amber = review, neutral = info, green = all good.
export type Check = { id: string; rule?: string; tone: 'red' | 'amber' | 'green' | 'neutral'; title: string; detail: string; icon: string };
// Who a person is in the family, for rules that depend on it (dependents follow the principal's approval).
export type Ctx = { relation?: string; principal?: Profile | null };

const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : null);
export const daysTo = (s?: string) => { const d = parse(s); return d ? Math.round((d.getTime() - today().getTime()) / DAY) : null; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s: string, n: number) => { const d = parse(s)!; d.setDate(d.getDate() + n); return iso(d); };
const addYears = (s: string, n: number) => { const d = parse(s)!; d.setFullYear(d.getFullYear() + n); return iso(d); };
export const fmt = (s?: string) => { const d = parse(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
// "L1B" → "L-1B", "H4" → "H-4" (how classes are written for people).
export const classLabel = (c?: string) => (c || '').toUpperCase().replace(/^([A-Z])-?(\d)/, '$1-$2');
const classKey = (c?: string) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^L2[SY]$/, 'L2').replace(/^H1B1$/, 'H1B');

const MAX_YEARS: Record<string, number> = { 'H-1B': 6, 'L-1A': 7, 'L-1B': 5 };

const ORDER = { red: 0, amber: 1, neutral: 2, green: 3 };
const sorted = (c: Check[]) => c.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
export const WORST = { red: 'act now', amber: 'review', neutral: 'info', green: 'ok' } as const;
export const worst = (c: Check[]) => (c.length ? WORST[[...c].sort((a, b) => ORDER[a.tone] - ORDER[b.tone])[0].tone] : 'ok');

const isDependent = (ctx: Ctx) => ctx.relation === 'Spouse' || ctx.relation === 'Child';
const pendingKind = (p: Profile) => (p.extFiled || p.extReceipt ? p.extKind ?? 'extension' : undefined);
const timely = (p: Profile) => !!p.extFiled && (!p.i94Expiry || p.extFiled <= p.i94Expiry);
// 240-day rule: same-employer H-1B / L-1 (and TN) extension, filed before the I-94 ended. Not transfers.
const uses240 = (p: Profile) => hasPetition(p.visa) && timely(p) && pendingKind(p) === 'extension';
// The approval end that limits them: their own, or (a dependent with none of their own) the principal's.
const approvalEnd = (p: Profile, ctx: Ctx) => p.petitionEnd ?? (isDependent(ctx) ? ctx.principal?.petitionEnd ?? undefined : undefined);
// First day of H-1B / L-1 time: entered, or the earliest approval's start.
export const statusStartOf = (p: Profile) => p.statusStart ?? (p.approvals || []).map((a: Approval) => a.validFrom).filter(Boolean).sort()[0];
export const maxOutDate = (p: Profile) => { const s = statusStartOf(p), n = MAX_YEARS[p.visa]; return s && n ? addDays(addYears(s, n), -1) : undefined; };

// In the US: the I-94 date (the date that controls the stay). Outside: none.
export function statusUntil(p?: Profile | null): string | undefined {
  if (!p || p.location === 'Outside' || !p.i94Expiry) return undefined;
  return p.i94Expiry;
}
// 240-day cover after the I-94 date while a timely same-employer extension is pending.
export function coverUntil(p?: Profile | null): string | undefined {
  if (!p || p.location === 'Outside' || !p.i94Expiry || !uses240(p) || daysTo(p.i94Expiry)! >= 0) return undefined;
  return addDays(p.i94Expiry, 240);
}
// Job ended: 60 days, never past the I-94.
export function graceUntil(p?: Profile | null): string | undefined {
  if (!p?.jobEnded || !hasPetition(p.visa)) return undefined;
  const g = addDays(p.jobEnded, 60);
  return p.i94Expiry && p.i94Expiry < g ? p.i94Expiry : g;
}
// One line for a person card: where they are and until when.
export function statusLine(p?: Profile | null, principal?: Profile | null): string {
  if (!p) return 'No documents yet';
  if (p.location === 'Outside') return `Outside the US${p.country ? ` · in ${p.country}` : ''}${p.visaStampExpiry ? ` · visa ${daysTo(p.visaStampExpiry)! < 0 ? 'expired' : `valid until ${fmt(p.visaStampExpiry)}`}` : ''}`;
  if (!p.i94Expiry) return 'In the US · no I-94 yet';
  const g = graceUntil(p) ?? (principal && principal !== p ? graceUntil(principal) : undefined);
  if (g) return `Grace period until ${fmt(g)}`;
  const c = coverUntil(p);
  if (c) return `Extension pending · covered until ${fmt(c)}`;
  return daysTo(p.i94Expiry)! < 0 ? `I-94 ended ${fmt(p.i94Expiry)}` : `Status valid until ${fmt(p.i94Expiry)}`;
}

// C20 "all good" is named only when nothing needs action or review (info items may remain).
function finalize(out: Check[]) {
  const ok = out.find((c) => c.id === 'i94-ok' || c.id === 'i94-filed');
  if (ok) ok.rule = out.some((c) => c.tone === 'red' || c.tone === 'amber') ? undefined : 'C20';
  return sorted(out);
}

export function runChecks(p: Profile, ctx: Ctx = {}): Check[] {
  const out: Check[] = [];
  if (p.visaSet === false) out.push({ id: 'visa-unset', rule: 'C19', tone: 'amber', icon: 'help-circle-outline', title: 'Confirm the visa type', detail: 'CaseDesk doesn’t assume one. Upload the I-94 or visa stamp — it shows the class — or pick it under Edit.' });
  const work = hasPetition(p.visa);
  const kind = pendingKind(p);
  const filedOnTime = timely(p);
  const blanket = isBlanket(p);
  const approval = blanket ? 'I-129S period' : 'approval';
  const pend = approvalEnd(p, ctx);
  const own = !!p.petitionEnd;

  // Outside the US: no stay to protect — only what they need to travel in (passport + visa).
  if (p.location === 'Outside') {
    const where = `Outside the US${p.country ? ` — in ${p.country}` : ''}`;
    const dv0 = daysTo(p.visaStampExpiry);
    if (dv0 === null) out.push({ id: 'visa-need', rule: 'C11', tone: 'amber', icon: 'card-outline', title: `${where} · no visa stamp saved`, detail: 'A valid visa stamp is needed to enter the US. Upload it once issued.' });
    else if (dv0 < 0) out.push({ id: 'visa-exp-out', rule: 'C11', tone: 'red', icon: 'card-outline', title: 'Visa stamping needed to travel', detail: `The visa stamp expired ${fmt(p.visaStampExpiry)}. Book a consular appointment — H-1B has no dropbox since Oct 2025 and slots can be far out.` });
    else out.push({ id: 'visa-ok', tone: 'green', icon: 'airplane-outline', title: `${where} · visa valid until ${fmt(p.visaStampExpiry)}`, detail: 'Ready to travel while the passport and the principal’s status are valid.' });
    const dpo = daysTo(p.passportExpiry);
    if (dpo !== null && dpo < 0) out.push({ id: 'pp-exp', rule: 'C8', tone: 'red', icon: 'book-outline', title: 'Passport has expired', detail: 'Renew it before any travel.' });
    else if (dpo !== null && dpo <= 180) out.push({ id: 'pp-soon', rule: 'C9', tone: 'amber', icon: 'book-outline', title: `Passport expires in ${dpo} days`, detail: 'CBP usually limits the I-94 to the passport date — renew before travelling.' });
    return sorted(out);
  }

  // C18 job ended: 60-day grace (or the I-94 end if sooner)
  if (p.jobEnded && work) {
    out.push({ id: 'grace', rule: 'C18', tone: 'red', icon: 'briefcase-outline', title: `Job ended — grace period ends ${fmt(graceUntil(p))}`, detail: 'Up to 60 days (never past the I-94) to file a new employer’s petition, change status or leave. Dependents’ status ends with it.' });
  }

  // I-94 / status end
  const d94 = daysTo(p.i94Expiry);
  if (d94 === null) {
    out.push({ id: 'i94-missing', rule: 'C1', tone: 'amber', icon: 'document-outline', title: 'I-94 missing — add the most recent one', detail: 'The I-94 — not the visa stamp — decides how long they can stay. Get it from the CBP I-94 website.' });
  } else if (p.extFiled && !filedOnTime) {
    out.push({ id: 'ext-late', rule: 'C7', tone: 'red', icon: 'alert-circle', title: `Filed after the I-94 ended (${fmt(p.i94Expiry)})`, detail: 'A late filing doesn’t keep status. Talk to your immigration team or an attorney now.' });
  } else if (filedOnTime) {
    if (d94 < 0 && uses240(p)) {
      const until = addDays(p.i94Expiry!, 240);
      const left = daysTo(until)!;
      out.push({ id: 'i94-240', rule: 'C6', tone: left < 0 ? 'red' : 'amber', icon: 'hourglass-outline', title: left < 0 ? `240-day period ended ${fmt(until)}` : `Extension pending – 240-day cover until ${fmt(until)}`, detail: 'Filed before the I-94 ended, so work for the same employer can continue up to 240 days while USCIS decides. Ends on a denial; travel abroad ends it too.' });
    } else if (d94 < 0 && kind === 'transfer') {
      out.push({ id: 'transfer-past', rule: 'X2', tone: 'amber', icon: 'swap-horizontal', title: 'I-94 ended — transfer pending', detail: 'The 240-day rule doesn’t apply to a change of employer. Stay is tied to the pending petition — confirm with your immigration team.' });
    } else if (d94 < 0) {
      out.push({ id: 'i94-pending', rule: 'X1', tone: 'amber', icon: 'hourglass-outline', title: 'I-94 ended — extension pending', detail: 'A timely-filed extension lets them stay while it’s pending, but it gives no work permission. Don’t travel until it’s decided.' });
    } else {
      const what = kind === 'amendment' ? 'Amendment' : kind === 'transfer' ? 'Transfer' : 'Extension';
      out.push({ id: 'i94-filed', tone: 'green', icon: 'checkmark-circle', title: `Status valid until ${fmt(p.i94Expiry)} — ${what.toLowerCase()} filed`, detail: `${what} filed ${fmt(p.extFiled)}${p.extReceipt ? ` (${p.extReceipt})` : ''}, before the I-94 ends. Track it in Cases.` });
    }
  } else if (d94 < 0) {
    out.push({ id: 'i94-expired', rule: 'C2', tone: 'red', icon: 'alert-circle', title: `I-94 ended ${-d94} days ago — nothing filed`, detail: 'If nothing was filed in time they may be out of status. Talk to your immigration team or an attorney right away.' });
  } else if (d94 <= 30) {
    out.push({ id: 'i94-30', rule: 'C3', tone: 'red', icon: 'alert-circle', title: `I-94 ends in ${d94} days — file the extension now`, detail: `The stay ends ${fmt(p.i94Expiry)}. The extension must reach USCIS before that date.` });
  } else if (d94 <= 180) {
    out.push({ id: 'i94-180', rule: 'C4', tone: 'amber', icon: 'time-outline', title: `I-94 ends in ${d94} days — plan the extension`, detail: blanket ? 'Blanket L: to stay longer the employer files an individual I-129 with USCIS (up to 6 months before).' : work ? 'H-1B, L-1 and TN extensions can be filed up to 6 months before the end date.' : 'File with the principal’s petition so they’re decided together.' });
  } else {
    out.push({ id: 'i94-ok', tone: 'green', icon: 'checkmark-circle', title: `Status valid until ${fmt(p.i94Expiry)}`, detail: `${d94} days left on the I-94.` });
  }

  // C5 I-94 shorter than the approval (a dependent without their own approval: the principal's)
  if (p.i94Expiry && pend && p.i94Expiry < addDays(pend, -1)) {
    out.push({ id: 'i94-short', rule: 'C5', tone: 'amber', icon: 'git-compare-outline', title: `I-94 ends before the ${own ? approval : 'principal’s approval'}`, detail: `${own ? (blanket ? 'The I-129S period' : 'The approval') : 'The principal’s approval'} runs to ${fmt(pend)} but the I-94 ends ${fmt(p.i94Expiry)} (often the passport date, or a shorter I-94 from the last entry). The I-94 date is the one that counts.` });
  }

  // C25 I-94 class differs from the approval / I-129S class (e.g. L1A vs L-1B) — possible CBP error
  if (p.i94Class && p.approvalClass && classKey(p.i94Class) !== classKey(p.approvalClass)) {
    out.push({ id: 'class-mismatch', rule: 'C25', tone: 'amber', icon: 'git-compare-outline', title: `I-94 class ${classKey(p.i94Class)} doesn't match your petition (${classLabel(p.approvalClass)}) — ask CBP about a correction`, detail: 'A wrong class on the I-94 can cause trouble with I-9, extensions and travel. CBP Deferred Inspection can correct it.' });
  }

  if (blanket) out.push({ id: 'blanket', tone: 'green', icon: 'layers-outline', title: 'Blanket L — carry the endorsed I-129S', detail: 'Keep it with the passport — it’s the proof of status with the I-94. Staying past the I-129S needs an individual I-129 filed with USCIS.' });

  // C8 / C9 passport
  const dp = daysTo(p.passportExpiry);
  if (dp !== null) {
    if (dp < 0) out.push({ id: 'pp-exp', rule: 'C8', tone: 'red', icon: 'book-outline', title: 'Passport has expired', detail: 'Renew it with the embassy or consulate. Needed for travel, extensions and the I-9.' });
    else if (dp <= 180) out.push({ id: 'pp-soon', rule: 'C9', tone: 'amber', icon: 'book-outline', title: `Passport expires in ${dp} days — renew it`, detail: 'Renew early — on re-entry CBP usually limits the I-94 to the passport date.' });
    else if (pend && p.passportExpiry! < pend) out.push({ id: 'pp-before', rule: 'C9', tone: 'amber', icon: 'book-outline', title: `Passport ends before the ${own ? approval : 'principal’s approval'}`, detail: `Renew before the next trip so the I-94 can run to ${fmt(pend)}.` });
  }

  // C10 visa stamp (fine while in the US)
  const dv = daysTo(p.visaStampExpiry);
  if (dv !== null && dv < 0) out.push({ id: 'visa-exp', rule: 'C10', tone: 'neutral', icon: 'card-outline', title: 'Visa stamp expired — fine while in the US', detail: 'A new stamp is needed only to travel back in.' });

  // C12 EAD (not for L-2S: the I-94 itself allows work)
  if ((usesEAD(p.visa) || p.eadExpiry) && p.visa !== 'L-2S') {
    const de = daysTo(p.eadExpiry);
    if (de === null) out.push({ id: 'ead-missing', tone: 'neutral', icon: 'id-card-outline', title: 'Add the EAD card', detail: 'The work permit end date drives I-9 reverification.' });
    else if (de < 0 && p.visa === 'STEM OPT' && filedOnTime) out.push({ id: 'ead-stem', rule: 'C12', tone: 'amber', icon: 'id-card-outline', title: `STEM OPT pending — work allowed up to ${fmt(addDays(p.eadExpiry!, 180))}`, detail: 'Timely-filed STEM OPT keeps a 180-day automatic extension.' });
    else if (de < 0) out.push({ id: 'ead-exp', rule: 'C12', tone: 'red', icon: 'id-card-outline', title: 'EAD ended — stop work until the new card arrives', detail: 'H-4 EAD renewals filed on or after Oct 30, 2025 get no automatic extension.' });
    else if (de <= 180) out.push({ id: 'ead-soon', rule: 'C12', tone: 'amber', icon: 'id-card-outline', title: `EAD ends in ${de} days, no automatic extension`, detail: p.visa === 'STEM OPT' || p.visa === 'F-1 OPT' ? 'File the STEM extension up to 90 days before the card ends.' : 'File the renewal as early as allowed — work stops on the card’s end date if it isn’t approved.' });
  }

  // C13 L-2 spouse whose I-94 shows plain L2
  if ((ctx.relation === 'Spouse' || p.visa === 'L-2S') && (p.i94Class || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'L2') out.push({ id: 'l2-plain', rule: 'C13', tone: 'neutral', icon: 'information-circle-outline', title: 'I-94 shows L-2, not L-2S — get it fixed', detail: 'A spouse’s I-94 should say L-2S to prove work permission for the I-9. Ask CBP Deferred Inspection to correct it.' });

  // C17 max stay (not for H-1B with an approved I-140)
  const end = maxOutDate(p);
  if (end && !(p.visa === 'H-1B' && p.i140Approved)) {
    const dm = daysTo(end)!;
    if (dm <= 365) out.push({ id: 'max', rule: 'C17', tone: 'amber', icon: 'calendar-outline', title: `${MAX_YEARS[p.visa]}-year limit reached ${fmt(end)}`, detail: `Time spent outside the US can be added back (recapture).${p.visa === 'H-1B' ? ' A PERM or I-140 filed 365+ days earlier allows 1-year extensions.' : ''}` });
  }

  // X3 child turning 21 (ages out of H-4 / L-2)
  if (ctx.relation === 'Child' && p.birthDate) {
    const at21 = addYears(p.birthDate, 21);
    const d21 = daysTo(at21)!;
    if (d21 < 0) out.push({ id: 'age-out', rule: 'X3', tone: 'red', icon: 'school-outline', title: `Turned 21 on ${fmt(at21)} — no longer a dependent`, detail: 'H-4 / L-2 ends at 21. A change of status (e.g. F-1) must be filed before the 21st birthday.' });
    else if (d21 <= 365) out.push({ id: 'age-soon', rule: 'X3', tone: 'amber', icon: 'school-outline', title: `Turns 21 on ${fmt(at21)}`, detail: 'H-4 / L-2 ends at 21. Plan a change of status (e.g. F-1) before then.' });
  }

  // C21–C24 work location, amendments, approvals, transfers
  const approvals = p.approvals || [];
  const current = approvals.find((a) => !a.superseded);
  const approved = p.approvedWorkLocation ?? current?.workLocation;
  if (p.visa === 'H-1B' && p.workLocation && approved && differentMetro(p.workLocation, approved) && kind !== 'amendment') {
    const at = (w: WorkLocation) => [w.city, w.state].filter(Boolean).join(', ') || w.metro || '';
    out.push({ id: 'worksite', rule: 'C21', tone: 'red', icon: 'location-outline', title: `Amendment needed before working in ${at(p.workLocation)}`, detail: `The approval is for ${at(approved)}${approved.metro ? ` (${approved.metro})` : ''}. A move to another metro — remote work too — needs a new LCA and an amended H-1B filed before working there.` });
  }
  if (kind === 'amendment') out.push({ id: 'amend-pending', rule: 'C22', tone: 'neutral', icon: 'git-pull-request-outline', title: 'Amendment pending', detail: `Filed ${fmt(p.extFiled)}${p.extReceipt ? ` (${p.extReceipt})` : ''}. The approval may or may not change the end date.` });
  if (approvals.length > 1 && current) out.push({ id: 'approvals', rule: 'C23', tone: 'neutral', icon: 'documents-outline', title: `${approvals.length} approvals saved — current: ${current.receipt ?? current.kind ?? 'latest'} to ${fmt(current.validTo)}`, detail: 'The latest notice is the current one; the others are kept as history (superseded).' });
  if (kind === 'transfer') out.push({ id: 'transfer', rule: 'C24', tone: 'neutral', icon: 'swap-horizontal', title: 'Transfer filed — work for the new employer allowed', detail: 'H-1B portability: work can start from the filing date. The 240-day rule doesn’t apply to a change of employer.' });

  return finalize(out);
}

// Family-level checks (C14–C16, and C18 for dependents), keyed by person id.
type Who = { id: string; profile: Profile | null | undefined; relation?: string };
export function runFamilyChecks(principal: Who, dependents: Who[]): Record<string, Check[]> {
  const res: Record<string, Check[]> = {};
  const add = (id: string, c: Check) => { (res[id] ||= []).push(c); };
  const pp = principal.profile;
  for (const d of dependents) {
    const q = d.profile;
    if (!q || q.location === 'Outside' || !pp) continue;
    const g = graceUntil(pp);
    if (g && pp.location !== 'Outside' && d.relation !== 'Parent') add(d.id, { id: 'dep-grace', rule: 'C18', tone: 'red', icon: 'briefcase-outline', title: `Principal’s job ended — status ends ${fmt(g)}`, detail: 'A dependent’s status follows the principal’s grace period. Plan the change of status or departure together.' });
    if (!q.i94Expiry || d.relation === 'Parent') continue;
    // C14: CBP may add up to 10 days after an H-1B petition end on H-1B / H-4 I-94s.
    const slack = pp.visa === 'H-1B' ? 10 : 0;
    if (pp.petitionEnd && q.i94Expiry > addDays(pp.petitionEnd, slack)) add(d.id, { id: 'dep-past-principal', rule: 'C14', tone: 'amber', icon: 'people-outline', title: 'I-94 runs past the principal’s approval', detail: `Their I-94 ends ${fmt(q.i94Expiry)}, after the principal’s approval (${fmt(pp.petitionEnd)}). A dependent’s stay can’t outlast it — ask CBP Deferred Inspection to correct it.` });
    if (pp.location !== 'Outside' && pp.i94Expiry && pp.i94Expiry < q.i94Expiry && (coverUntil(pp) ?? pp.i94Expiry) < q.i94Expiry) add(d.id, { id: 'principal-first', rule: 'C15', tone: 'amber', icon: 'people-outline', title: `Principal’s I-94 ends first (${fmt(pp.i94Expiry)})`, detail: 'A dependent’s status follows the principal’s — plan the principal’s extension first.' });
  }
  for (const w of [principal, ...dependents]) {
    const q = w.profile;
    if (q && q.travelPlanned && q.location !== 'Outside' && (q.extFiled || q.extReceipt)) add(w.id, { id: 'travel-pending', rule: 'C16', tone: 'amber', icon: 'airplane-outline', title: 'Travel while a case is pending', detail: 'Leaving the US can abandon a pending change of status and ends 240-day cover. Plan with your immigration team.' });
  }
  for (const k of Object.keys(res)) sorted(res[k]);
  return res;
}

// Everyone's checks in one go: single-person rules (dependents compared with the principal's approval)
// plus the family rules, with "all good" (C20) only for those with nothing to act on or review.
export function familyChecks(principal: Who, dependents: Who[]): Record<string, Check[]> {
  const fam = runFamilyChecks(principal, dependents);
  const res: Record<string, Check[]> = {};
  for (const w of [principal, ...dependents]) {
    if (!w.profile) { res[w.id] = []; continue; }
    const own = runChecks(w.profile, { relation: w === principal ? 'You' : w.relation, principal: principal.profile });
    res[w.id] = w.profile.location === 'Outside' ? own : finalize([...own, ...(fam[w.id] || [])]);
  }
  return res;
}
