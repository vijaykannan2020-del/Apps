// How a document is shown: the fields read from it (editable), a one-line note, and which saved
// documents are superseded by newer ones. Pure — screens only render what these return.
import { daysTo, fmt, isISO } from './dates';
import { datesIn } from './read/text';
import type { DocFields, DocType, Document } from './model';
import { DOC_LABEL } from './model';
import type { PersonRecord } from './record';
import { sameName } from './identity';

export type FieldSpec = { label: string; key: keyof DocFields; kind: 'text' | 'date' };
const T = (label: string, key: keyof DocFields): FieldSpec => ({ label, key, kind: 'text' });
const D = (label: string, key: keyof DocFields): FieldSpec => ({ label, key, kind: 'date' });

export const FIELDS: Record<DocType, FieldSpec[]> = {
  passport: [T('Legal name', 'name'), T('Passport no.', 'passportNo'), D('Date of birth', 'birthDate'), D('Issued', 'issueDate'), D('Expires', 'validTo')],
  visa: [T('Name on visa', 'name'), T('Class', 'classOfAdmission'), T('Passport no.', 'passportNo'), D('Issued', 'issueDate'), D('Expires', 'validTo')],
  i94: [T('Name', 'name'), T('Class', 'classOfAdmission'), D('Admit until', 'validTo'), D('Most recent entry', 'entryDate'), T('Passport no.', 'passportNo')],
  approval: [T('Receipt no.', 'receipt'), T('Form', 'form'), T('Class', 'classOfAdmission'), T('Employer', 'employer'), D('Notice date', 'noticeDate'), D('Valid from', 'validFrom'), D('Valid to', 'validTo'), D('Priority date', 'priorityDate'), T('Category', 'preferenceCategory')],
  receipt: [T('Receipt no.', 'receipt'), T('Form', 'form'), D('Received', 'receivedDate'), D('Priority date', 'priorityDate'), T('Employer', 'employer'), T('Category', 'preferenceCategory')],
  notice: [T('Receipt no.', 'receipt'), T('Form', 'form'), D('Notice date', 'noticeDate'), D('Response due', 'dueDate'), D('Appointment', 'appointmentDate')],
  i129s: [T('Name', 'name'), T('Employer', 'employer'), T('Class', 'classOfAdmission'), D('Valid from', 'validFrom'), D('Valid to', 'validTo')],
  ead: [T('Name', 'name'), T('Category', 'category'), T('Card no.', 'receipt'), D('Valid from', 'validFrom'), D('Valid to', 'validTo')],
  i20: [T('Name', 'name'), T('SEVIS ID', 'sevisId'), T('School', 'school'), D('Program end', 'programEnd'), D('OPT start', 'optStart'), D('OPT end', 'optEnd'), D('Travel signature', 'travelSignature')],
  ds2019: [T('Name', 'name'), T('SEVIS ID', 'sevisId'), T('Sponsor', 'school'), D('From', 'validFrom'), D('To', 'validTo')],
  'green-card': [T('Name', 'name'), T('Category', 'category'), D('Resident since', 'residentSince'), D('Card expires', 'validTo'), T('USCIS no.', 'uscisNumber')],
  'advance-parole': [T('Name', 'name'), D('Issued', 'validFrom'), D('Valid until', 'validTo')],
  'reentry-permit': [T('Name', 'name'), D('Issued', 'validFrom'), D('Valid until', 'validTo')],
  naturalization: [T('Name', 'name'), T('Certificate no.', 'certificateNo'), D('Naturalized on', 'naturalizedOn')],
  'travel-history': [],
  lca: [D('Valid from', 'validFrom'), D('Valid to', 'validTo')],
  perm: [T('Case no.', 'caseNumber'), T('Employer', 'employer'), D('Filed (priority date)', 'priorityDate'), D('Certified', 'noticeDate'), D('File the I-140 by', 'dueDate')],
  medical: [T('Name', 'name'), D('Civil surgeon signed', 'signedDate')],
  other: [T('Name', 'name'), D('Date', 'validTo')],
};

/** Fields a typed-in draft starts with (from its step), which say nothing about the document. */
const DRAFT_KEYS: (keyof DocFields)[] = ['form', 'noticeKind', 'category'];
/** v3.0 fix8: the document holds something — a kept file, or a value someone read or typed. An empty
 *  "Type it in" draft (tapped, then left) is not a document and never counts as added. */
export function docHasData(d: Pick<Document, 'fields' | 'files'>): boolean {
  if (d.files?.length) return true;
  return Object.entries(d.fields ?? {}).some(([k, v]) => !DRAFT_KEYS.includes(k as keyof DocFields) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));
}

export type ChecklistRow = { state: 'missing' | 'added' | 'earlier'; line: string; dated: boolean };
/** v3.0 fix8: what a setup checklist row says about a saved document — its real key date
 *  ("Expires May 1, 2033"), and "Added earlier" when it was saved before this setup began. */
export function checklistRow(d: Pick<Document, 'fields' | 'files' | 'addedAt'> | undefined, key: { label: string; field: keyof DocFields }, spec: FieldSpec | undefined, setupSince?: string): ChecklistRow {
  if (!d || !docHasData(d)) return { state: 'missing', line: '', dated: false };
  const val = spec ? showField(d.fields, spec) : '';
  const earlier = !!setupSince && !!d.addedAt && d.addedAt < setupSince;
  const date = val ? `${key.label} ${val}` : `${key.label} date not added yet`;
  return { state: earlier ? 'earlier' : 'added', line: earlier ? `Added earlier · ${date}` : date, dated: !!val };
}

/** Field value as shown ("Sep 30, 2028", "D/S", "C26"). */
export function showField(f: DocFields, spec: FieldSpec): string {
  if (spec.key === 'validTo' && f.durationOfStatus) return 'D/S';
  const v = f[spec.key];
  if (v === undefined || v === null || v === '') return '';
  if (spec.kind === 'date') return isISO(String(v)) ? fmt(String(v)) : String(v);
  if (spec.key === 'category' && typeof v === 'string') return v.replace(/^([AC])(\d+)([A-Z]?)$/, (_, a, n, x) => `${a}${String(n).padStart(2, '0')}${x}`);
  return String(v);
}

/** A typed correction → the stored value (dates parsed, "D/S" kept). */
export function parseField(spec: FieldSpec, text: string): Partial<DocFields> {
  const t = text.trim();
  if (spec.kind === 'date') {
    if (spec.key === 'validTo' && /^d\s*\/\s*s$/i.test(t)) return { validTo: undefined, durationOfStatus: true };
    const d = isISO(t) ? t : datesIn(t)[0];
    return { [spec.key]: t ? d ?? t : undefined, ...(spec.key === 'validTo' ? { durationOfStatus: undefined } : {}) } as Partial<DocFields>;
  }
  return { [spec.key]: t || undefined } as Partial<DocFields>;
}

/** Rows to show for a document (only fields that have a value, plus the key field). */
export function fieldRows(d: { type: DocType; fields: DocFields }, typedIn = false) {
  return FIELDS[d.type].filter((s) => typedIn || showField(d.fields, s) !== '' || s.key === 'validTo').map((s) => ({ spec: s, value: showField(d.fields, s) }));
}

export type Tone = 'red' | 'amber' | 'green' | 'blue';
export type Note = { tone: Tone; text: string };

const inDays = (n: number) => (n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** One plain line about a document: is it fine, ending, superseded? */
export function docNote(d: Document | { type: DocType; fields: DocFields }, ctx: { inUS?: boolean; superseded?: boolean; travelling?: boolean } = {}): Note | undefined {
  const f = d.fields;
  if (ctx.superseded) return { tone: 'blue', text: 'Superseded by a newer one — kept as history.' };
  const n = daysTo(f.validTo);
  switch (d.type) {
    case 'passport':
      if (n === null) return undefined;
      if (n < 0) return { tone: 'red', text: `Expired ${fmt(f.validTo)}. Renew it now.` };
      if (n <= 180) return { tone: 'amber', text: `Expires ${fmt(f.validTo)} — ${inDays(n)}. Renew it before you travel.` };
      return { tone: 'green', text: `Valid until ${fmt(f.validTo)}.` };
    case 'visa':
      if (n === null) return undefined;
      if (n < 0) return ctx.inUS === false ? { tone: 'amber', text: 'Expired. A new visa stamp is needed to enter the US.' } : { tone: 'blue', text: 'Expired. Fine while in the US — needed only to travel back in.' };
      return { tone: 'green', text: `Good for travel until ${fmt(f.validTo)}.` };
    case 'i94':
      if (f.durationOfStatus) return { tone: 'blue', text: '“D/S” — valid while in status (program or OPT dates, plus the grace period).' };
      if (n === null) return undefined;
      if (n < 0) return { tone: 'red', text: `Ended ${fmt(f.validTo)}.` };
      if (n <= 180) return { tone: 'amber', text: `Ends ${fmt(f.validTo)} — ${inDays(n)}.` };
      return { tone: 'green', text: `Valid until ${fmt(f.validTo)}.` };
    case 'approval':
      if (f.form && !['I-129', 'I-539'].includes(f.form)) return { tone: 'blue', text: `${f.form} approved${f.priorityDate ? ` · priority date ${fmt(f.priorityDate)}` : ''}. Saved as a case.` };
      return n === null ? undefined : n < 0 ? { tone: 'amber', text: `Approval ended ${fmt(f.validTo)}.` } : { tone: 'green', text: `Approval valid until ${fmt(f.validTo)}.` };
    case 'i129s':
      return n === null ? undefined : { tone: n < 0 ? 'amber' : 'green', text: `Blanket L period ${n < 0 ? 'ended' : 'to'} ${fmt(f.validTo)}. Carry it with the passport.` };
    case 'receipt':
      if (!f.form || ['I-129', 'I-539'].includes(f.form)) return { tone: 'blue', text: `Pending since ${fmt(f.receivedDate)}. Saved as a case.` };
      if (f.form === 'I-485') return { tone: 'blue', text: `I-485 pending since ${fmt(f.receivedDate)}. Keep this receipt: it shows the green card application is on file (180 days pending matters for a job change).` };
      if (f.form === 'I-140') return { tone: 'blue', text: `I-140 filed${f.priorityDate ? ` · priority date ${fmt(f.priorityDate)}` : ''}. Saved as a case.` };
      return { tone: 'blue', text: `${f.form}: just a case. It doesn’t extend the stay.` };
    case 'notice':
      if (f.noticeKind === 'rfe' || f.noticeKind === 'noid') return { tone: 'amber', text: `Response due ${fmt(f.dueDate)}. Missing it can lead to denial.` };
      if (f.noticeKind === 'denial') return { tone: 'red', text: 'Denied. Talk to an attorney about options now.' };
      if (f.noticeKind === 'interview' && f.appointmentDate) return { tone: (daysTo(f.appointmentDate) ?? -1) >= 0 ? 'amber' : 'blue', text: `Interview ${fmt(f.appointmentDate)}. See Interview prep for what to bring.` };
      if (f.noticeKind === 'biometrics' && f.appointmentDate) return { tone: 'blue', text: `Biometrics ${fmt(f.appointmentDate)}. Bring this notice and your passport or ID.` };
      return f.appointmentDate ? { tone: 'blue', text: `Appointment ${fmt(f.appointmentDate)}.` } : undefined;
    case 'ead': case 'green-card': case 'advance-parole': case 'reentry-permit':
      if (n === null) return undefined;
      if (n < 0) return { tone: d.type === 'green-card' && !f.conditional ? 'amber' : 'red', text: `Ended ${fmt(f.validTo)}.${d.type === 'ead' ? ' Stop work until a new card arrives.' : ''}` };
      if (n <= 180) return { tone: 'amber', text: `Ends ${fmt(f.validTo)} — ${inDays(n)}.` };
      if (f.comboAP) return { tone: 'green', text: 'Work permit and travel permission (Advance Parole) in one card.' };
      return { tone: 'green', text: `Valid until ${fmt(f.validTo)}.` };
    case 'i20':
      return f.programEnd ? { tone: 'green', text: `Program ends ${fmt(f.programEnd)}.${f.travelSignature ? ` Travel signature ${fmt(f.travelSignature)}.` : ''}` } : undefined;
    case 'travel-history':
      return { tone: 'blue', text: `${f.trips?.length ?? 0} trips read. Days outside the US are counted on the person page.` };
    case 'perm': {
      const n = daysTo(f.dueDate);
      if (n === null) return f.noticeDate ? { tone: 'blue', text: `Certified ${fmt(f.noticeDate)}. The I-140 must be filed within 180 days of certification.` } : undefined;
      if (n < 0) return { tone: 'blue', text: `Certification was valid to ${fmt(f.dueDate)} — fine once the I-140 was filed before then.` };
      return { tone: 'amber', text: `File the I-140 by ${fmt(f.dueDate)} (180 days after certification).` };
    }
    case 'medical':
      return { tone: 'blue', text: `${f.signedDate ? `Signed ${fmt(f.signedDate)}. ` : ''}Filed with the I-485 in its sealed envelope; it counts only for that I-485.` };
    default:
      return undefined;
  }
}

/** Saved documents that a newer one has replaced (older passport, earlier approval, older I-94…). */
export function supersededIds(rec: PersonRecord, docs: Document[]): Set<string> {
  const mine = docs.filter((d) => d.ownerId === rec.personId);
  const out = new Set<string>();
  // v2.9: a document only supersedes another one for the same person — when the names on both match
  // (a spouse's passport saved here by mistake leaves this person's own passport current).
  const same = (a?: string, b?: string) => !a || !b || sameName(a, b);
  const latest = (t: DocType, key: (d: Document) => string | undefined) => {
    const list = mine.filter((d) => d.type === t);
    const own = t === 'passport' && rec.legalName ? list.filter((d) => same(d.fields.name, rec.legalName)) : list;
    const best = [...(own.length ? own : list)].sort((a, b) => (key(b) || '').localeCompare(key(a) || ''))[0];
    for (const d of list) if (d !== best && same(d.fields.name, best?.fields.name)) out.add(d.id);
  };
  latest('passport', (d) => d.fields.validTo);
  latest('visa', (d) => d.fields.validTo);
  latest('ead', (d) => d.fields.validTo);
  latest('green-card', (d) => d.fields.validTo);
  latest('i20', (d) => d.fields.programEnd);
  latest('medical', (d) => d.fields.signedDate ?? d.addedAt);
  for (const d of mine.filter((x) => x.type === 'i94')) if (rec.i94 && rec.i94.docId !== d.id) out.add(d.id);
  for (const a of rec.approvals) if (a.superseded && !a.upcoming) out.add(a.docId);
  return out;
}

/** The dated badges shown at the top of a document. A combo card (EAD that serves as Advance
 *  Parole) gets two: one for work, one for travel. */
export function docBadges(d: { type: DocType; fields: DocFields }): { label: string; value: string }[] {
  if (d.type === 'ead' && d.fields.comboAP) {
    const v = d.fields.validTo ? fmt(d.fields.validTo) : '—';
    return [{ label: 'Work permit until', value: v }, { label: 'Travel document until', value: v }];
  }
  const spec = FIELDS[d.type].find((s) => s.key === 'validTo') ?? (d.type === 'medical' ? FIELDS.medical[1] : d.type === 'perm' ? FIELDS.perm[4] : FIELDS[d.type][0]);
  return spec ? [{ label: spec.label, value: showField(d.fields, spec) || '—' }] : [];
}

export const docTitle = (d: { type: DocType; fields: DocFields }) => {
  if (d.type === 'ead' && d.fields.comboAP) return 'Combo card (EAD + travel)';
  if ((d.type === 'receipt' || d.type === 'approval' || d.type === 'notice') && d.fields.form) {
    const kind = d.type === 'receipt' ? 'receipt' : d.type === 'approval' ? 'approval' : d.fields.noticeKind === 'rfe' ? 'RFE' : d.fields.noticeKind === 'denial' ? 'decision' : d.fields.noticeKind === 'interview' ? 'interview notice' : d.fields.noticeKind === 'biometrics' ? 'biometrics notice' : 'notice';
    return `${d.fields.form} ${kind}`;
  }
  return DOC_LABEL[d.type];
};
