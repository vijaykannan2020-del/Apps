// Cases: every receipt and approval read from documents, merged with what the user added or
// updated by hand (status from the Safari check, key dates). Pure.
import type { Case, Document, Person } from './model';
import type { PersonRecord } from './record';
import { fmt } from './dates';

export const FORMS: [string, string][] = [
  ['I-129', 'Work petition (H-1B, L-1, O-1)'], ['I-539', 'Extend or change stay (dependents)'], ['I-765', 'Work permit (EAD)'],
  ['I-131', 'Travel document / re-entry permit'], ['I-140', 'Immigrant petition'], ['I-485', 'Green card application'], ['I-130', 'Family petition'],
  ['I-751', 'Remove conditions'], ['I-90', 'Renew green card'], ['N-400', 'Citizenship'], ['I-824', 'Action on an approved case'], ['I-129S', 'Blanket L petition'],
];
export const formName = (f?: string) => FORMS.find((x) => x[0] === f)?.[1] ?? 'USCIS case';

export type CaseState = 'Pending' | 'Approved' | 'RFE' | 'Denied' | 'Withdrawn';
export type CaseView = {
  id: string; receipt?: string; form?: string; name: string; ownerId: string; status: CaseState;
  filed?: string; updated?: string; keyDates: { label: string; date: string }[]; history: { date: string; text: string }[];
  consular?: boolean; manual?: Case; docIds: string[];
};
export const isPendingCase = (c: CaseView) => c.status === 'Pending' || c.status === 'RFE';
const KD: Record<string, string> = { biometrics: 'Biometrics', interview: 'Interview', 'rfe-due': 'RFE response due', 'noid-due': 'NOID response due', oath: 'Oath ceremony', other: 'Date' };

export function caseViews(people: Person[], records: Record<string, PersonRecord>, docs: Document[], manual: Case[]): CaseView[] {
  const out = new Map<string, CaseView>();
  const key = (owner: string, receipt?: string, docId?: string) => (receipt ? `${owner}:${receipt}` : `${owner}:doc:${docId}`);
  for (const p of people) {
    const r = records[p.id];
    if (!r) continue;
    for (const c of r.cases) {
      const k = key(p.id, c.receipt, c.docId);
      const v = out.get(k) ?? { id: k, receipt: c.receipt, form: c.form, name: formName(c.form), ownerId: p.id, status: 'Pending' as CaseState, keyDates: [], history: [], docIds: [] };
      v.form ||= c.form; v.name = formName(v.form); v.docIds.push(c.docId);
      if (c.received) { v.filed = c.received; v.history.push({ date: c.received, text: 'Case received' }); }
      if (c.status === 'approved') { v.status = 'Approved'; if (c.noticeDate) v.history.push({ date: c.noticeDate, text: 'Approved' }); }
      if (c.status === 'denied') { v.status = 'Denied'; if (c.noticeDate) v.history.push({ date: c.noticeDate, text: 'Denied' }); }
      if (c.noticeKind === 'rfe' || c.noticeKind === 'noid') {
        if (v.status === 'Pending') v.status = 'RFE';
        if (c.noticeDate) v.history.push({ date: c.noticeDate, text: c.noticeKind === 'rfe' ? 'Request for Evidence sent' : 'Notice of Intent to Deny sent' });
        if (c.dueDate) v.keyDates.push({ label: c.noticeKind === 'rfe' ? 'RFE response due' : 'NOID response due', date: c.dueDate });
      }
      if (c.appointmentDate && c.noticeKind) v.keyDates.push({ label: KD[c.noticeKind] ?? 'Appointment', date: c.appointmentDate });
      out.set(k, v);
    }
    // Blanket L: the consulate-approved I-129S has no USCIS receipt.
    for (const a of r.approvals.filter((x) => x.form === 'I-129S' && !x.receipt)) {
      const k = key(p.id, undefined, a.docId);
      out.set(k, { id: k, form: 'I-129S', name: 'Blanket L petition', ownerId: p.id, status: 'Approved', filed: a.validFrom, updated: a.validFrom, keyDates: [], history: a.validFrom ? [{ date: a.validFrom, text: 'Approved at the US consulate' }] : [], consular: true, docIds: [a.docId] });
    }
  }
  for (const m of manual) {
    const k = key(m.ownerId, m.receipt);
    const v = out.get(k) ?? { id: k, receipt: m.receipt, form: m.form, name: formName(m.form), ownerId: m.ownerId, status: 'Pending' as CaseState, filed: m.receivedDate, keyDates: [], history: [], docIds: [] };
    v.manual = m;
    if (m.status === 'approved') v.status = 'Approved';
    else if (m.status === 'denied') v.status = 'Denied';
    else if (m.status === 'withdrawn') v.status = 'Withdrawn';
    else if (m.status === 'rfe') v.status = 'RFE';
    else if (m.status === 'pending' && v.status === 'RFE') v.status = 'RFE';
    for (const kd of m.keyDates) v.keyDates.push({ label: KD[kd.kind] ?? kd.note ?? 'Date', date: kd.date });
    for (const h of m.history) v.history.push({ date: h.date.slice(0, 10), text: h.text });
    if (m.hidden) out.delete(k); else out.set(k, v);
  }
  const views = [...out.values()];
  for (const v of views) {
    v.history.sort((a, b) => b.date.localeCompare(a.date));
    v.keyDates.sort((a, b) => a.date.localeCompare(b.date));
    v.updated = v.history[0]?.date ?? v.filed;
  }
  return views.sort((a, b) => Number(isPendingCase(b)) - Number(isPendingCase(a)) || (b.updated || '').localeCompare(a.updated || ''));
}

export const caseUpdatedText = (c: CaseView) => (c.updated ? `Updated ${fmt(c.updated)}` : 'Added by you');
export const isReceipt = (s: string) => /^[A-Z]{3}\d{10}$/.test(s);
