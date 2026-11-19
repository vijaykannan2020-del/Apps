// A person's status, DERIVED from their documents (+ the few facts only they can tell us).
// Pure and order-independent: the same documents always give the same record, whichever order
// they were uploaded in. Rules for "which one is current":
//   - Passport, visa stamp, EAD, green card, I-20, AP: the latest expiry.
//   - I-94: the most recent BY ISSUE DATE (CBP entry date, or the I-797A notice date for the I-94
//     printed on an approval) — even if it ends sooner. With no issue dates, the later end date.
//   - Approval: the latest notice date (the others are kept as superseded history).
//   - A pending extension (I-129 / I-539 receipt) stops being pending once an approval for it
//     (same receipt, or the same form approved on/after the filing date) is saved.

import type { Document, DocFields, PetitionKind, Person, Relation, StatusCategory, VisaType, WorkLocation } from './model';
import { canBeBlanket, isStudent } from './model';
import { daysTo } from './dates';
import { metroOf } from './metro';
import { ownName, sameName } from './identity';

export type ApprovalInfo = {
  docId: string; form?: string; kind?: PetitionKind; receipt?: string; noticeDate?: string;
  validFrom?: string; validTo?: string; employer?: string; cls?: string; workLocation?: WorkLocation;
  blanket?: boolean; superseded: boolean; upcoming?: boolean;
};
export type PendingInfo = { docId: string; receipt?: string; form?: string; filed?: string; kind: PetitionKind; employer?: string; cls?: string };
export type CaseInfo = {
  docId: string; receipt?: string; form?: string; status: 'pending' | 'approved' | 'denied'; requestedStart?: string;
  received?: string; noticeDate?: string; priorityDate?: string; category?: string; validTo?: string; cls?: string; kind?: PetitionKind;
  dueDate?: string; appointmentDate?: string; noticeKind?: DocFields['noticeKind'];
};
export type VisaSource = 'picked' | 'visa' | 'i20' | 'i94' | 'ead' | 'approval' | 'green-card' | 'naturalization';

export type PersonRecord = {
  personId: string;
  relation: Relation;
  legalName?: string;
  passportNo?: string;
  passportNos: string[]; // every number this person's passports carry (current + old)
  birthDate?: string;
  nationality?: string;
  passportExpiry?: string;
  passportNote?: string;
  visa?: VisaType; // undefined = not confirmed
  visaFrom?: VisaSource;
  visaStamp?: { expires?: string; cls?: string; blanket?: boolean };
  location: 'US' | 'Outside';
  locationKnown: boolean; // from an I-94 or the person's answer
  country?: string;
  i94?: { until?: string; ds?: boolean; issuedOn?: string; cls?: string; from: 'cbp' | 'approval'; docId: string };
  approvals: ApprovalInfo[];
  currentApproval?: ApprovalInfo;
  upcomingApproval?: ApprovalInfo; // change of status approved but not started (e.g. cap-gap Oct 1)
  petitionEnd?: string;
  approvalClass?: string;
  employer?: string;
  approvedWorkLocation?: WorkLocation;
  blanket: boolean;
  pending?: PendingInfo; // pending extension / amendment / transfer / change of status (I-129, I-539)
  ead?: { expires?: string; validFrom?: string; category?: string; comboAP?: boolean };
  i20?: { programStart?: string; programEnd?: string; optStart?: string; optEnd?: string; travelSignature?: string; school?: string; sevisId?: string; count: number };
  ds2019?: { start?: string; end?: string };
  greenCard?: { expires?: string; residentSince?: string; category?: string; conditional: boolean };
  advanceParole?: { expires?: string; from: 'document' | 'combo-card' };
  reentryPermit?: { expires?: string };
  naturalizedOn?: string;
  cases: CaseInfo[];
  i140Approved: boolean;
  trips: { depart?: string; return?: string; planned: boolean; country?: string }[];
  statusStart?: string;
  docTypes: string[];
  // v2.9 green card
  perm?: { caseNumber?: string; filed?: string; certified?: string; expires?: string; employer?: string; docId: string };
  medical?: { signed?: string; docId: string };
  gcOnEad?: boolean; // I-485 pending and the person chose to work on the EAD (C9) instead of H / L status
};

// ---------- class → visa type ----------
const CLASS_TO_VISA: Record<string, VisaType> = {
  H1B: 'H-1B', H1B1: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', TN: 'TN', TD: 'TD', E3: 'E-3', E3D: 'E-3D', O1: 'O-1', O3: 'O-3',
  H4: 'H-4', L2S: 'L-2S', L2: 'L-2', L2Y: 'L-2', F1: 'F-1', F2: 'F-2', J1: 'J-1', J2: 'J-2', B2: 'B-2', B1: 'B-1/B-2', B1B2: 'B-1/B-2',
};
/** A class on a document → visa type. A plain "L2" visa FOIL is L-2S for a spouse (foils never say L2S); on an I-94 it stays L-2. */
export function visaFromClass(c: string | undefined, relation: Relation, source: VisaSource): VisaType | undefined {
  if (!c) return undefined;
  const k = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (k === 'L2' && relation === 'spouse' && source === 'visa') return 'L-2S';
  return CLASS_TO_VISA[k];
}
/** "L-1B" / "L1B" → "L1B"; dependents' L2 / L2S / L2Y are one family. */
export const classKey = (c?: string) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^L2[SY]$/, 'L2').replace(/^H1B1$/, 'H1B');
export const classLabel = (c?: string) => (c || '').toUpperCase().replace(/^([A-Z])-?(\d)/, '$1-$2');

const PICKED: Partial<Record<StatusCategory, (r: Relation) => VisaType | undefined>> = {
  'H-1B': () => 'H-1B', 'L-1A': () => 'L-1A', 'L-1B': () => 'L-1B', TN: () => 'TN', 'F-1 OPT': () => 'F-1 OPT', 'STEM OPT': () => 'STEM OPT',
  'conditional-green-card': () => 'Conditional green card', 'citizenship-applicant': () => 'Green card', 'E-3': () => 'E-3', 'O-1': () => 'O-1', 'F-1': () => 'F-1', 'J-1': () => 'J-1',
  'H-4': () => 'H-4', 'L-2': (r) => (r === 'spouse' ? 'L-2S' : 'L-2'), 'F-2': () => 'F-2', 'J-2': () => 'J-2',
  'green-card': () => 'Green card', citizen: () => 'US citizen', 'B-2': () => 'B-1/B-2',
};

const RANK: Record<VisaSource, number> = { picked: 0, visa: 1, i20: 1.5, i94: 2, ead: 2.5, approval: 3, 'green-card': 4, naturalization: 5 };
const STATUS_FORMS = [undefined, 'I-129', 'I-539', 'I-129S'];
export const isStatusForm = (form?: string) => STATUS_FORMS.includes(form);

const STEP_RANK: Partial<Record<string, number>> = { passport: 0, visa: 1, i94: 3, approval: 4, i129s: 4, receipt: 5, ead: 6 };
/** Documents in waterfall order (passport → visa → I-94 → approval → receipt → EAD), then upload order. */
export function inStepOrder(docs: Document[]) {
  const seq = (d: Document) => d.seq ?? Date.parse(d.addedAt) ?? 0;
  return [...docs].sort((a, b) => (STEP_RANK[a.type] ?? 9) - (STEP_RANK[b.type] ?? 9) || seq(a) - seq(b));
}

const norm = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(INC|LLC|LTD|CORP|CORPORATION|LIMITED)$/, '');
export const sameEmployer = (a?: string, b?: string) => !a || !b || norm(a) === norm(b);
const withMetro = (w?: WorkLocation): WorkLocation | undefined => (w ? { ...w, metro: metroOf(w.city, w.state) ?? w.metro } : undefined);
const latestBy = <T>(xs: T[], key: (x: T) => string | undefined) => [...xs].sort((a, b) => (key(b) || '').localeCompare(key(a) || ''))[0];

export function deriveRecord(person: Person, allDocs: Document[]): PersonRecord {
  const relation = person.relation;
  const docs = inStepOrder(allDocs.filter((d) => d.ownerId === person.id));
  const of = (t: string) => docs.filter((d) => d.type === t);
  const facts = person.facts || {};
  const r: PersonRecord = {
    personId: person.id, relation, passportNos: [], approvals: [], blanket: false, cases: [], i140Approved: false, trips: [],
    location: 'US', locationKnown: false, docTypes: [...new Set(docs.map((d) => d.type))],
  };

  // ---- identity ----
  // v2.9: only this person's own passports count (a spouse's passport saved here by mistake never
  // becomes the current one, and never gives this person its legal name or number).
  const own = ownName(person.name, of('passport').map((d) => d.fields.name).concat(docs.filter((d) => ['i94', 'visa', 'ead', 'green-card'].includes(d.type)).map((d) => d.fields.name)));
  const passports = of('passport').filter((d) => !own || !d.fields.name || sameName(d.fields.name, own));
  const curPass = latestBy(passports.filter((d) => d.fields.validTo), (d) => d.fields.validTo) ?? passports[0];
  for (const d of passports) {
    if (d.fields.passportNo && !r.passportNos.includes(d.fields.passportNo)) r.passportNos.push(d.fields.passportNo);
    if (d.fields.oldPassportNo && !r.passportNos.includes(d.fields.oldPassportNo)) r.passportNos.push(d.fields.oldPassportNo);
  }
  if (curPass) {
    r.passportNo = curPass.fields.passportNo;
    r.legalName = curPass.fields.name;
    r.passportExpiry = curPass.fields.validTo;
    r.passportNote = curPass.fields.dateNote;
    r.nationality = curPass.fields.nationality;
  }
  for (const d of docs) {
    if (!r.passportNo && d.fields.passportNo && ['visa', 'i94', 'ead'].includes(d.type)) r.passportNo = d.fields.passportNo;
    if (!r.legalName && d.fields.name && d.type !== 'i129s' && (!own || sameName(d.fields.name, own))) r.legalName = d.fields.name;
    if (!r.birthDate && d.fields.birthDate && d.type !== 'approval') r.birthDate = d.fields.birthDate;
    if (!r.nationality && d.fields.nationality) r.nationality = d.fields.nationality;
  }
  if (r.passportNo && !r.passportNos.includes(r.passportNo)) r.passportNos.unshift(r.passportNo);
  if (!r.birthDate && facts.birthDate) r.birthDate = facts.birthDate; // typed in Edit details

  // ---- visa type (strongest current source wins) ----
  let visaRank = -1;
  const offer = (v: VisaType | undefined, src: VisaSource) => {
    if (v && RANK[src] >= visaRank) { r.visa = v; r.visaFrom = src; visaRank = RANK[src]; }
  };
  const picked = person.status ? PICKED[person.status]?.(relation) : undefined;
  offer(picked, 'picked');

  const visas = of('visa');
  const curVisa = latestBy(visas, (d) => d.fields.validTo);
  if (curVisa) {
    r.visaStamp = { expires: curVisa.fields.validTo, cls: curVisa.fields.classOfAdmission, blanket: curVisa.fields.blanket };
    offer(visaFromClass(curVisa.fields.classOfAdmission, relation, 'visa'), 'visa');
  }
  if (visas.some((d) => d.fields.blanket)) r.blanket = true;

  // ---- student / exchange ----
  const i20s = of('i20');
  const curI20 = latestBy(i20s, (d) => d.fields.programEnd ?? d.fields.validTo);
  if (curI20) {
    const f = curI20.fields;
    r.i20 = { programStart: f.programStart, programEnd: f.programEnd, optStart: f.optStart, optEnd: f.optEnd, school: f.school, sevisId: f.sevisId, count: i20s.length,
      travelSignature: i20s.map((d) => d.fields.travelSignature).filter(Boolean).sort().pop() };
    offer('F-1', 'i20');
  }
  const ds = latestBy(of('ds2019'), (d) => d.fields.validTo);
  if (ds) { r.ds2019 = { start: ds.fields.validFrom, end: ds.fields.validTo }; offer('J-1', 'i20'); }

  // ---- approvals ----
  const statusApprovals = [...of('approval').filter((d) => isStatusForm(d.fields.form)), ...of('i129s')];
  const baseCls = () => classKey(latestBy(of('i94'), (d) => d.fields.entryDate)?.fields.classOfAdmission ?? curVisa?.fields.classOfAdmission);
  const list: ApprovalInfo[] = [];
  for (const d of statusApprovals) {
    const f = d.fields;
    const validTo = f.validTo;
    if (!validTo) continue;
    const a: ApprovalInfo = {
      docId: d.id, form: d.type === 'i129s' ? 'I-129S' : f.form, kind: d.type === 'i129s' ? 'new' : f.petitionKind, receipt: f.receipt,
      noticeDate: f.noticeDate, validFrom: f.validFrom, validTo, employer: f.employer, cls: f.classOfAdmission,
      workLocation: withMetro(f.workLocation), blanket: d.type === 'i129s', superseded: true,
    };
    // A change of status that hasn't started yet (validFrom in the future, different class): upcoming.
    if (a.validFrom && (daysTo(a.validFrom) ?? 0) > 0 && a.cls && baseCls() && classKey(a.cls) !== baseCls()) a.upcoming = true;
    if (list.some((x) => (a.receipt && x.receipt === a.receipt) || (x.validTo === a.validTo && x.noticeDate === a.noticeDate && x.form === a.form))) continue;
    list.push(a);
  }
  list.sort((x, y) => (y.noticeDate || '').localeCompare(x.noticeDate || '') || (y.validTo || '').localeCompare(x.validTo || ''));
  const active = list.filter((a) => !a.upcoming);
  const cur = active.some((a) => a.noticeDate) ? active[0] : latestBy(active, (a) => a.validTo);
  for (const a of list) a.superseded = a !== cur;
  r.approvals = list;
  r.upcomingApproval = list.find((a) => a.upcoming);
  if (cur) {
    r.currentApproval = cur;
    r.petitionEnd = cur.validTo;
    r.approvalClass = cur.cls;
    r.employer = cur.employer;
    if (cur.blanket) r.blanket = true;
    offer(visaFromClass(cur.cls, relation, 'approval'), 'approval');
  }
  if (of('i129s').length) r.blanket = true;
  if (!r.employer && facts.employer) r.employer = facts.employer; // typed in Edit details
  r.approvedWorkLocation = withMetro(facts.approvedWorkLocation) ?? list.find((a) => !a.superseded && a.workLocation)?.workLocation ?? list.find((a) => a.workLocation)?.workLocation;
  r.statusStart = facts.statusStart ?? list.map((a) => a.validFrom).filter(Boolean).sort()[0];

  // ---- I-94: newest by issue date ----
  type I94C = NonNullable<PersonRecord['i94']>;
  const cands: I94C[] = [];
  for (const d of of('i94')) {
    if (d.fields.validTo || d.fields.durationOfStatus) cands.push({ until: d.fields.validTo, ds: d.fields.durationOfStatus, issuedOn: d.fields.entryDate, cls: d.fields.classOfAdmission, from: 'cbp', docId: d.id });
  }
  for (const a of list) {
    const d = statusApprovals.find((x) => x.id === a.docId);
    if (d?.fields.i94Until && !a.upcoming) cands.push({ until: d.fields.i94Until, issuedOn: d.fields.noticeDate, cls: d.fields.classOfAdmission, from: 'approval', docId: d.id });
  }
  cands.sort((a, b) => {
    if (a.issuedOn && b.issuedOn && a.issuedOn !== b.issuedOn) return b.issuedOn.localeCompare(a.issuedOn);
    if (!!a.issuedOn !== !!b.issuedOn) return a.issuedOn ? -1 : 1;
    return (b.until || '9999').localeCompare(a.until || '9999');
  });
  if (cands[0]) {
    r.i94 = cands[0];
    if (cands[0].from === 'cbp') offer(visaFromClass(cands[0].cls, relation, 'i94'), 'i94');
  }
  // Rank order: an approval outranks an I-94 even when applied first.
  if (cur) offer(visaFromClass(cur.cls, relation, 'approval'), 'approval');

  // ---- EAD ----
  const eadDocs = [...of('ead'), ...of('approval').filter((d) => d.fields.form === 'I-765')];
  const curEad = latestBy(eadDocs.filter((d) => d.fields.validTo), (d) => d.fields.validTo);
  if (curEad) {
    r.ead = { expires: curEad.fields.validTo, validFrom: curEad.fields.validFrom, category: curEad.fields.category ?? of('ead').find((d) => d.fields.category)?.fields.category, comboAP: curEad.fields.comboAP };
    const cat = r.ead.category;
    const studentBase = !r.visa || isStudent(r.visa);
    // (c)(3)(B) = post-completion OPT, (c)(3)(C) = STEM OPT extension.
    if (studentBase && cat === 'C3B') offer('F-1 OPT', 'ead');
    else if (studentBase && cat === 'C3C') offer('STEM OPT', 'ead');
    else if (!r.visa && cat === 'C9') offer('Green card pending', 'ead');
  }

  // ---- green card / citizenship / travel documents ----
  const gc = latestBy(of('green-card'), (d) => d.fields.validTo);
  if (gc) {
    r.greenCard = { expires: gc.fields.validTo, residentSince: gc.fields.residentSince, category: gc.fields.category, conditional: !!gc.fields.conditional };
    offer(gc.fields.conditional ? 'Conditional green card' : 'Green card', 'green-card');
  }
  const nat = of('naturalization')[0];
  if (nat) { r.naturalizedOn = nat.fields.naturalizedOn; offer('US citizen', 'naturalization'); }
  const ap = latestBy(of('advance-parole'), (d) => d.fields.validTo);
  if (ap) r.advanceParole = { expires: ap.fields.validTo, from: 'document' };
  if (r.ead?.comboAP && (!r.advanceParole || (r.ead.expires || '') > (r.advanceParole.expires || ''))) r.advanceParole = { expires: r.ead.expires, from: 'combo-card' };
  const rp = latestBy(of('reentry-permit'), (d) => d.fields.validTo);
  if (rp) r.reentryPermit = { expires: rp.fields.validTo };

  // ---- cases (every USCIS notice) ----
  for (const d of docs.filter((x) => x.type === 'approval' || x.type === 'receipt' || x.type === 'notice')) {
    const f = d.fields;
    r.cases.push({
      docId: d.id, receipt: f.receipt, form: f.form, status: d.type === 'approval' ? 'approved' : f.noticeKind === 'denial' ? 'denied' : 'pending', received: f.receivedDate, requestedStart: f.requestedStart,
      noticeDate: f.noticeDate, priorityDate: f.priorityDate, category: f.preferenceCategory ?? f.category, validTo: f.validTo, cls: f.classOfAdmission,
      kind: d.filedFor ?? f.petitionKind, dueDate: f.dueDate, appointmentDate: f.appointmentDate, noticeKind: f.noticeKind,
    });
  }
  // A receipt whose case has an approval saved is no longer pending.
  for (const c of r.cases) {
    if (c.status !== 'pending' || !c.receipt) continue;
    const decided = r.cases.find((x) => x !== c && x.receipt === c.receipt && x.status !== 'pending');
    if (decided) c.status = decided.status;
  }
  r.i140Approved = r.cases.some((c) => c.form === 'I-140' && c.status === 'approved');

  // ---- pending extension / amendment / transfer ----
  const pend: PendingInfo[] = [];
  for (const d of of('receipt').filter((x) => isStatusForm(x.fields.form))) {
    const f = d.fields;
    if (f.receipt && list.some((a) => a.receipt === f.receipt)) continue;
    if (f.receipt && r.cases.some((x) => x.receipt === f.receipt && x.status === 'denied')) continue;
    const cleared = f.receivedDate && list.some((a) => !a.upcoming && a.noticeDate && a.noticeDate >= f.receivedDate! && (!a.form || !f.form || a.form === f.form || a.form === 'I-129S'));
    if (cleared) continue;
    let kind: PetitionKind = d.filedFor ?? f.petitionKind ?? 'extension';
    if (!d.filedFor && cur?.employer && f.employer && !sameEmployer(cur.employer, f.employer)) kind = 'transfer';
    pend.push({ docId: d.id, receipt: f.receipt, form: f.form, filed: f.receivedDate, kind, employer: f.employer, cls: f.classOfAdmission });
  }
  r.pending = latestBy(pend, (p) => p.filed);

  // ---- where they are ----
  // An answer given in Edit details (dated) wins over an I-94 saved before it (they left after that entry).
  const lastEntry = of('i94').map((d) => d.fields.entryDate ?? d.addedAt?.slice(0, 10) ?? '').sort().pop() ?? '';
  if (facts.location && facts.locationOn && facts.locationOn >= lastEntry) { r.location = facts.location; r.locationKnown = true; if (facts.location === 'Outside') r.country = facts.country ?? 'India'; }
  else if (of('i94').length) { r.location = 'US'; r.locationKnown = true; }
  else if (facts.location) { r.location = facts.location; r.locationKnown = true; if (facts.location === 'Outside') r.country = facts.country ?? 'India'; }

  // ---- trips: travel history + typed trips ----
  const hist = latestBy(of('travel-history'), (d) => d.addedAt);
  for (const t of hist?.fields.trips || []) r.trips.push({ ...t, planned: false });
  for (const t of facts.trips || []) r.trips.push({ depart: t.depart, return: t.return, planned: t.planned, country: t.country });
  if (!canBeBlanket(r.visa)) r.blanket = false;

  // ---- green card documents (v2.9) ----
  const perm = latestBy(of('perm'), (d) => d.fields.noticeDate ?? d.fields.priorityDate);
  if (perm) r.perm = { caseNumber: perm.fields.caseNumber, filed: perm.fields.priorityDate, certified: perm.fields.noticeDate, expires: perm.fields.dueDate, employer: perm.fields.employer, docId: perm.id };
  const med = latestBy(of('medical'), (d) => d.fields.signedDate ?? d.addedAt);
  if (med) r.medical = { signed: med.fields.signedDate, docId: med.id };

  // I-485 pending and no nonimmigrant status still running (no valid I-94): a green-card applicant.
  // v2.9: also when the person chose to work on the EAD (C9) — the I-94 then no longer decides the stay.
  const i485 = r.cases.some((x) => x.form === 'I-485' && x.status === 'pending');
  const i94Valid = !!r.i94?.ds || (daysTo(r.i94?.until) ?? -1) >= 0;
  const notResident = r.visa !== 'US citizen' && r.visa !== 'Green card' && r.visa !== 'Conditional green card';
  if (i485 && notResident && facts.gc?.workOn === 'ead') { r.visa = 'Green card pending'; r.visaFrom = 'ead'; r.gcOnEad = true; }
  else if (i485 && !i94Valid && notResident) { r.visa = 'Green card pending'; r.visaFrom = 'ead'; }
  return r;
}

/** The record as it would be without one document (for "what this document changes"). */
export function deriveWithout(person: Person, docs: Document[], docId: string) {
  return deriveRecord(person, docs.filter((d) => d.id !== docId));
}

