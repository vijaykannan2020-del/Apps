// "What this document changes" — the lines on each upload card and in Review. Computed as the
// difference between the record without the document and with it, so the card can never disagree
// with what is saved.
import { fmt } from './dates';
import type { Document, Person } from './model';
import { deriveRecord, type PersonRecord } from './record';

const FIELDS: { key: string; label: string; get: (r: PersonRecord) => string | undefined; date?: boolean }[] = [
  { key: 'legalName', label: 'Legal name', get: (r) => r.legalName },
  { key: 'passportNo', label: 'Passport no.', get: (r) => r.passportNo },
  { key: 'passportExpiry', label: 'Passport expires', get: (r) => r.passportExpiry, date: true },
  { key: 'visa', label: 'Visa type', get: (r) => r.visa },
  { key: 'visaStamp', label: 'Visa stamp expires', get: (r) => r.visaStamp?.expires, date: true },
  { key: 'i94', label: 'I-94 admit until', get: (r) => (r.i94?.ds ? 'D/S' : r.i94?.until), date: true },
  { key: 'petitionEnd', label: 'Approval valid to', get: (r) => r.petitionEnd, date: true },
  { key: 'pending', label: 'Pending case', get: (r) => (r.pending ? `${r.pending.kind} ${r.pending.receipt ?? ''}`.trim() : undefined) },
  { key: 'ead', label: 'EAD valid to', get: (r) => r.ead?.expires, date: true },
  { key: 'i20', label: 'Program ends', get: (r) => r.i20?.programEnd, date: true },
  { key: 'greenCard', label: 'Green card expires', get: (r) => r.greenCard?.expires, date: true },
  { key: 'ap', label: 'Travel document until', get: (r) => r.advanceParole?.expires, date: true },
];

export type Change = { key: string; text: string; ok: boolean };

export function describeChange(person: Person, docs: Document[], doc: Document): Change[] {
  const others = docs.filter((d) => d.id !== doc.id);
  const before = deriveRecord(person, others);
  const after = deriveRecord(person, [...others, doc]);
  const out: Change[] = [];
  for (const f of FIELDS) {
    const a = f.get(before), b = f.get(after);
    if (a === b) continue;
    out.push({ key: f.key, ok: true, text: b === undefined ? `${f.label} cleared` : `${f.label} → ${f.date && b !== 'D/S' ? fmt(b) : b}` });
  }
  if (!out.length) out.push({ key: 'none', ok: false, text: 'Kept as history — a newer document is already current' });
  return out;
}
