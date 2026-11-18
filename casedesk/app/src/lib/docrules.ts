// Pure document rules — no storage, no React Native. Shared by the upload flow (docflow.ts) and the
// QA scenario harness: which document replaces which, what a document changes in a person's record,
// whose document it looks like, and the waterfall of upload steps per person.
import { Profile, VisaType, PetitionKind, Approval, WorkLocation } from './profile';
import { statusUpdates, StatusUpdate, Found } from './ocr';
import { fmt } from './compliance';
import type { DocType } from './vault';
import { metroOf } from './metro';
export { METROS, metroOf, differentMetro } from './metro';

const CLASS_TO_VISA: Record<string, VisaType> = { H1B: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', TN: 'TN', H4: 'H-4', L2S: 'L-2S', L2: 'L-2', L2Y: 'L-2', TD: 'TD', F1: 'F-1', F2: 'F-2', B2: 'B-2', B1: 'B-1/B-2', B1B2: 'B-1/B-2' };
// A visa or I-94 class → the app's visa type. A plain "L2" visa foil is L-2S for a spouse (the foil never
// says L2S); on an I-94, plain "L2" for a spouse stays L-2 (C13 asks to get it corrected to L-2S).
export function visaFromClass(c?: string, relation?: string, source: DocType | 'Approval' = 'Visa stamp'): VisaType | undefined {
  if (!c) return undefined;
  const k = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (k === 'L2' && relation === 'Spouse' && source === 'Visa stamp') return 'L-2S';
  return CLASS_TO_VISA[k];
}
// "L-1B", "L1B", "l-1b" → "L1B"; dependents' L2 / L2S / L2Y are one family.
export const classKey = (c?: string) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^L2[SY]$/, 'L2').replace(/^H1B1$/, 'H1B');

// Someone has one current passport, visa, I-94, approval and EAD: a new one replaces the old.
export const SINGLE = ['Passport', 'Visa stamp', 'I-94', 'Approval (I-797A/B)', 'I-129S (blanket L)', 'EAD card'];
const DATE_FIELDS = ['eadExpiry', 'passportExpiry', 'visaStampExpiry'];
const I94_GROUP = ['i94Expiry', 'i94IssuedOn', 'i94Class'];
const PET_GROUP = ['petitionEnd', 'approvalNoticeDate'];
const EXT_GROUP = ['extFiled', 'extReceipt', 'extKind'];

// What a document will change.
// - I-94: the most recent BY ISSUE DATE (CBP entry date, or the I-797A notice date) is current, even if it
//   ends earlier. Only when an issue date is missing is the later end date kept.
// - Approval: the latest notice date is current (never backwards by notice date); with no notice dates,
//   the later end date is kept.
// - Passport, visa, EAD: the later expiry is current (an older passport is kept as superseded).
// - An approval clears a pending extension only if it is that case (same receipt) or was issued after the filing.
export function plan(p: Profile | null | undefined, ups: StatusUpdate[], ctx: { receipt?: string } = {}) {
  const q = (p || {}) as any;
  const get = (f: string) => ups.find((u) => u.field === f)?.value;
  const skipped = new Set<string>();
  for (const u of ups) if (DATE_FIELDS.includes(u.field) && u.value && q[u.field] && u.value < q[u.field]) skipped.add(u.field);
  const i94 = get('i94Expiry');
  if (i94 && q.i94Expiry) {
    const nIss = get('i94IssuedOn'), oIss = q.i94IssuedOn;
    const older = nIss && oIss ? nIss < oIss : nIss && !oIss ? false : !nIss && oIss ? true : i94 < q.i94Expiry;
    if (older) I94_GROUP.forEach((f) => skipped.add(f));
  }
  const pet = get('petitionEnd');
  if (pet && q.petitionEnd) {
    const nN = get('approvalNoticeDate'), oN = q.approvalNoticeDate;
    const older = nN && oN ? nN < oN : pet < q.petitionEnd;
    if (older) PET_GROUP.forEach((f) => skipped.add(f));
  }
  // Approval vs pending extension
  const clears = ups.some((u) => u.field === 'extFiled' && u.value === undefined);
  if (clears) {
    const nN = get('approvalNoticeDate');
    const same = !!ctx.receipt && ctx.receipt === q.extReceipt;
    const after = !skipped.has('petitionEnd') && (!nN || !q.extFiled || nN >= q.extFiled);
    if (!same && !after) EXT_GROUP.forEach((f) => skipped.add(f));
  }
  // A receipt for a case already approved is not pending.
  const rec = ups.find((u) => u.field === 'extReceipt' && u.value);
  if (rec && (q.approvals as Approval[] | undefined)?.some((a) => a.receipt === rec.value)) EXT_GROUP.forEach((f) => skipped.add(f));
  const keep = ups.filter((u) => !skipped.has(u.field) && !(u.value === undefined && q[u.field] === undefined));
  return { keep, skipped: ups.filter((u) => skipped.has(u.field)) };
}

// filedFor = the user's answer to "What was filed?" on an I-129 / I-539 receipt (extension, amendment, transfer).
export type DocLike = { type: DocType; found?: Found; validTo: string; receipt: string; name: string; filedFor?: PetitionKind };
export const updatesFor = (d: DocLike) => {
  const ups = statusUpdates({ ...(d.found || { lines: 0 }), type: d.type, validTo: d.validTo || undefined, receipt: d.receipt || undefined });
  if (d.filedFor) for (const u of ups) if (u.field === 'extKind') u.value = d.filedFor;
  return ups;
};

// Lines like "I-94 admit until → Jun 30, 2026" for the review.
export function describe(p: Profile | null | undefined, d: DocLike) {
  const { keep, skipped } = plan(p, updatesFor(d), { receipt: d.receipt });
  const why = (f: string) => (I94_GROUP.includes(f) ? 'kept the I-94 issued later' : PET_GROUP.includes(f) ? 'kept the approval issued later' : EXT_GROUP.includes(f) ? 'the pending case stays pending' : f === 'passportExpiry' ? 'older passport — kept as superseded' : 'kept the newer date already saved');
  return [
    ...keep.filter((u) => u.label).map((u) => ({ ok: true, text: `${u.label}${u.value ? ` → ${fmt(u.value)}` : ''}` })),
    ...skipped.filter((u) => u.label).map((u) => ({ ok: false, text: `${u.label}: ${why(u.field)}` })),
  ];
}

// ---------- work location ----------
export const withMetro = (w?: WorkLocation): WorkLocation | undefined => (w ? { ...w, metro: metroOf(w.city, w.state) ?? w.metro } : undefined);
export const currentApproval = (p?: Profile | null) => p?.approvals?.find((a) => !a.superseded);

// ---------- saving one document into a person's record (pure) ----------
const norm = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(INC|LLC|LTD|CORP|CORPORATION|LIMITED)$/, '');
export const sameEmployer = (a?: string, b?: string) => !a || !b || norm(a) === norm(b);
const STATUS_FORMS = [undefined, 'I-129', 'I-539', 'I-129S'];
const RANK = { 'Visa stamp': 1, 'I-94': 2, Approval: 3 } as const;
// Mutates and returns the profile. Everything saveFor() does except the vault and case list.
export function applyDoc(profile: Profile, d: DocLike, relation: string) {
  const f = d.found;
  const ups = updatesFor(d);
  const { keep, skipped } = plan(profile, ups, { receipt: d.receipt });
  const prevPassport = profile.passportNo;
  for (const u of keep) {
    if (u.value === undefined) delete (profile as any)[u.field];
    else (profile as any)[u.field] = u.value;
  }
  const isSkipped = (field: string) => skipped.some((u) => u.field === field);
  if (d.type === 'I-129S (blanket L)') profile.blanket = true;
  // Identity: a passport that is current (latest expiry) sets the passport number and legal name; an older
  // one is kept as superseded. New Indian passports print the old number ("Old Passport No.").
  const addOld = (n?: string) => { if (n && n !== profile.passportNo && !(profile.oldPassportNos || []).includes(n)) profile.oldPassportNos = [...(profile.oldPassportNos || []), n]; };
  if (d.type === 'Passport') {
    if (!isSkipped('passportExpiry')) {
      if (f?.passportNo) { if (prevPassport && prevPassport !== f.passportNo) addOld(prevPassport); profile.passportNo = f.passportNo; }
      if (d.name) profile.legalName = d.name;
    } else addOld(f?.passportNo);
    addOld(f?.oldPassportNo);
  } else {
    if (f?.passportNo && !profile.passportNo) profile.passportNo = f.passportNo;
    if (d.name && !profile.legalName && d.type !== 'I-129S (blanket L)') profile.legalName = d.name;
  }
  if (f?.birthDate && !profile.birthDate && d.type !== 'Approval (I-797A/B)') profile.birthDate = f.birthDate;
  // The class on a status document confirms the visa type: approval / I-129S > current I-94 > visa stamp.
  const statusApproval = d.type === 'Approval (I-797A/B)' && STATUS_FORMS.includes(f?.form);
  const isApproval = statusApproval || d.type === 'I-129S (blanket L)';
  const source = isApproval ? 'Approval' : d.type === 'I-94' ? 'I-94' : d.type === 'Visa stamp' ? 'Visa stamp' : undefined;
  const current = !(d.type === 'I-94' && isSkipped('i94Expiry')) && !(isApproval && isSkipped('petitionEnd')) && !(d.type === 'Visa stamp' && isSkipped('visaStampExpiry'));
  const cls = visaFromClass(f?.classOfAdmission, relation, source === 'Approval' ? 'Approval' : d.type);
  if (cls && source && current && RANK[source] >= (profile.visaFrom ? RANK[profile.visaFrom] : 0)) {
    profile.visa = cls; profile.visaSet = true; profile.visaFrom = source;
  }
  if (f?.blanket && source) profile.blanket = true;
  // An I-94 means they're in the US.
  if (d.type === 'I-94') { profile.location = 'US'; delete profile.country; }
  // Approvals history: newest notice is current, the rest superseded.
  if (isApproval && (d.validTo || f?.validTo)) {
    const a: Approval = { kind: d.type === 'I-129S (blanket L)' ? 'new' : f?.petitionKind, form: d.type === 'I-129S (blanket L)' ? 'I-129S' : f?.form, receipt: d.receipt || undefined, noticeDate: f?.noticeDate, validFrom: f?.validFrom, validTo: d.validTo || f?.validTo, employer: f?.employer, cls: f?.classOfAdmission, workLocation: withMetro(f?.workLocation) };
    const list = (profile.approvals || []).filter((x) => !(a.receipt && x.receipt === a.receipt) && !(x.validTo === a.validTo && x.noticeDate === a.noticeDate && x.form === a.form));
    list.push(a);
    list.sort((x, y) => (y.noticeDate || '').localeCompare(x.noticeDate || '') || (y.validTo || '').localeCompare(x.validTo || ''));
    // Without notice dates, the one petitionEnd came from is current.
    const cur = list.findIndex((x) => x.noticeDate) >= 0 ? 0 : Math.max(0, list.findIndex((x) => x.validTo === profile.petitionEnd));
    profile.approvals = list.map((x, i) => ({ ...x, superseded: i !== cur }));
    const c = profile.approvals[cur];
    if (c.employer) profile.employer = c.employer;
    if (c.cls) profile.approvalClass = c.cls; else delete profile.approvalClass;
    if (c.workLocation && !profile.approvedWorkLocation) profile.approvedWorkLocation = c.workLocation;
  }
  // A receipt from a different employer than the current approval is a transfer (portability).
  if (d.type === 'Receipt (I-797C)' && profile.extReceipt && profile.extReceipt === (d.receipt || profile.extReceipt) && f?.employer) {
    const cur = currentApproval(profile);
    if (cur?.employer && !sameEmployer(cur.employer, f.employer)) profile.extKind = 'transfer';
  }
  return profile;
}

// ---------- whose document is it ----------
// Only passport data is compared — never the name the family typed ("Vijay"): the passport number
// (on the passport, visa stamp and I-94), then the full passport name (2+ name parts in common).
const words = (n?: string) => (n || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
export function samePerson(a?: string, b?: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const shared = x.filter((w) => y.includes(w)).length;
  return shared >= 2 || (x.length === 1 && y.length === 1 && x[0] === y[0]);
}
export type Ident = { id: string; passportNo?: string; passportNos?: string[]; legalName?: string };
// Who someone is, from their saved record plus the documents in their steps: the passport number seen most
// often there (a misfiled document is the odd one out), old numbers printed on their passports, and the
// legal name from their current passport.
export function identityOf(id: string, profile: Profile | null | undefined, docs: { type: DocType; found?: Found; name?: string }[]): Ident {
  const count = new Map<string, number>();
  for (const d of docs) if (d.found?.passportNo) count.set(d.found.passportNo, (count.get(d.found.passportNo) || 0) + (d.type === 'Passport' ? 1.5 : 1));
  const top = Math.max(0, ...count.values());
  const nos = new Set<string>([...(profile?.passportNo ? [profile.passportNo] : []), ...(profile?.oldPassportNos || [])]);
  for (const [n, c] of count) if (c === top) nos.add(n);
  for (const d of docs) if (d.type === 'Passport' && d.found?.oldPassportNo && d.found.passportNo && nos.has(d.found.passportNo)) nos.add(d.found.oldPassportNo);
  const pass = docs.filter((d) => d.type === 'Passport' && d.found && (!d.found.passportNo || nos.has(d.found.passportNo))).sort((a, b) => (b.found?.validTo || '').localeCompare(a.found?.validTo || ''))[0];
  return { id, passportNo: profile?.passportNo, passportNos: [...nos], legalName: pass?.name || pass?.found?.name || profile?.legalName };
}
const nosOf = (x: Ident) => [...(x.passportNos || []), ...(x.passportNo ? [x.passportNo] : [])];
// Does this document look like someone else's? Warn only when it does NOT match its own step's person and
// its passport number, or its full passport name, matches another person. Returns that person.
export function belongsElsewhere<P extends Ident>(f: Found | undefined, ownerId: string, list: P[]): P | undefined {
  if (!f) return undefined;
  const owner = list.find((x) => x.id === ownerId);
  if (f.passportNo) {
    if (owner && nosOf(owner).includes(f.passportNo)) return undefined;
    const byNo = list.find((x) => x.id !== ownerId && nosOf(x).includes(f.passportNo!));
    if (byNo) return byNo;
    if (owner && f.oldPassportNo && nosOf(owner).includes(f.oldPassportNo)) return undefined;
  }
  if (!f.name || (owner?.legalName && samePerson(f.name, owner.legalName))) return undefined;
  return list.find((x) => x.id !== ownerId && x.legalName && samePerson(f.name, x.legalName));
}

// ---------- the waterfall: one step per document ----------
export type StepKey = 'passport' | 'visa' | 'where' | 'i94' | 'approval' | 'receipt' | 'ead';
export type Step = { key: StepKey; title: string; type?: DocType; why: string; optional?: boolean };
const STEP_OF: Partial<Record<DocType, StepKey>> = { Passport: 'passport', 'Visa stamp': 'visa', 'I-94': 'i94', 'Approval (I-797A/B)': 'approval', 'I-129S (blanket L)': 'approval', 'Receipt (I-797C)': 'receipt', 'EAD card': 'ead' };
export const stepOf = (t?: DocType): StepKey | undefined => (t ? STEP_OF[t] : undefined);
const isMe = (relation: string) => ['You', 'Me', 'me'].includes(relation);
// EAD step: a spouse on H-4 / H-4 EAD / L-2 (optional for L-2S — the I-94 allows work), or the employee on F-1 OPT / STEM OPT.
export const eadStep = (p: Profile | null | undefined, relation: string) => {
  const v = p?.visaSet === false ? undefined : p?.visa;
  if (relation === 'Spouse') return !v || ['H-4', 'H-4 EAD', 'L-2S', 'L-2'].includes(v);
  return isMe(relation) ? v === 'F-1 OPT' || v === 'STEM OPT' : false;
};
// present = doc types already uploaded for them in this flow (their steps always show).
export function stepsFor(p: Profile | null | undefined, relation: string, present: DocType[] = []): Step[] {
  const you = isMe(relation);
  const has = (k: StepKey) => present.some((t) => stepOf(t) === k);
  const s: Step[] = [
    { key: 'passport', title: 'Passport', type: 'Passport', why: `Proves who ${you ? 'you are' : 'they are'} — legal name, passport number. Its expiry caps the I-94.` },
    { key: 'visa', title: 'Visa stamp', type: 'Visa stamp', why: 'Needed to travel back in. It doesn’t control the stay.' },
    { key: 'where', title: you ? 'Where are you now?' : 'Where are they now?', why: 'This decides which checks apply.' },
  ];
  if (p?.location !== 'Outside' || has('i94')) s.push({ key: 'i94', title: 'I-94', type: 'I-94', why: `Controls how long ${you ? 'you' : 'they'} can stay. The newest one counts, even if it ends sooner.` });
  if (relation !== 'Parent' || has('approval')) {
    const blanket = !!p?.blanket && ['L-1A', 'L-1B', 'L-2S', 'L-2'].includes(p.visa);
    s.push({ key: 'approval', title: 'Approval notice', type: blanket && you ? 'I-129S (blanket L)' : 'Approval (I-797A/B)', optional: !you, why: you ? 'I-797A/B, or I-129S for blanket L. Shows the petition dates.' : 'I-797A for their own I-539 extension, if they have one.' });
  }
  s.push({ key: 'receipt', title: 'Pending receipt', type: 'Receipt (I-797C)', optional: true, why: 'An I-797C for a case still pending. Skip if nothing is pending.' });
  if (eadStep(p, relation) || has('ead')) {
    const opt = relation === 'Spouse' && p?.visa !== 'H-4 EAD';
    s.push({ key: 'ead', title: opt ? 'Work permit (EAD) · optional' : 'Work permit (EAD)', type: 'EAD card', optional: opt, why: p?.visa === 'L-2S' ? 'Optional. On L-2S the I-94 already allows work.' : relation === 'Spouse' ? 'Lets them work on H-4. Renewals don’t auto-extend.' : 'The work permit end date drives I-9 reverification.' });
  }
  return s;
}

// Documents they should have that aren't saved: passport and visa for everyone, an I-94 for anyone in the
// US, and an approval for the employee in the US. (Receipts, EADs and dependents' I-539 approvals are optional.)
export function missingDocs(p: Profile | null | undefined, relation: string, have: string[]): string[] {
  const out: string[] = [];
  const inUS = p?.location !== 'Outside';
  if (!have.includes('Passport') && !p?.passportExpiry) out.push('Passport');
  if (!have.includes('Visa stamp') && !p?.visaStampExpiry) out.push('Visa stamp');
  if (inUS && !have.includes('I-94') && !p?.i94Expiry) out.push('I-94');
  if (inUS && isMe(relation) && !have.includes('Approval (I-797A/B)') && !have.includes('I-129S (blanket L)') && !p?.petitionEnd) out.push(p?.blanket ? 'I-129S (blanket L)' : 'Approval');
  return out;
}
