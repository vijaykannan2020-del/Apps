// Saving documents into a person's record — shared by the upload flow.
import { Profile, VisaType } from './profile';
import { statusUpdates, StatusUpdate, Found } from './ocr';
import { addDoc, deleteDoc, allDocs, DocType, Picked } from './vault';
import { upsertCase, read as readStore } from './store';
import { fmt } from './compliance';

const CLASS_TO_VISA: Record<string, VisaType> = { H1B: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', TN: 'TN', H4: 'H-4', L2S: 'L-2S', L2: 'L-2', TD: 'TD', F1: 'F-1', F2: 'F-2' };
// A visa or I-94 class → the app's visa type. "L2" is L-2S for a spouse (work-authorised) and L-2 for a child.
export function visaFromClass(c?: string, relation?: string): VisaType | undefined {
  if (!c) return undefined;
  if (c === 'L2') return relation === 'Spouse' ? 'L-2S' : 'L-2';
  return CLASS_TO_VISA[c];
}

// Someone has one current passport, visa, I-94, approval and EAD: a new one replaces the old.
export const SINGLE = ['Passport', 'Visa stamp', 'I-94', 'Approval (I-797A/B)', 'I-129S (blanket L)', 'EAD card'];
const DATE_FIELDS = ['i94Expiry', 'petitionEnd', 'eadExpiry', 'passportExpiry', 'visaStampExpiry'];

// What a document will change. Dates never move backwards (an older approval or I-94 doesn't overwrite a
// newer one) and only the newest approval clears a pending extension.
export function plan(p: Profile | null | undefined, ups: StatusUpdate[]) {
  const skipped = new Set<string>();
  for (const u of ups) if (DATE_FIELDS.includes(u.field) && u.value && (p as any)?.[u.field] && u.value < (p as any)[u.field]) skipped.add(u.field);
  const older = ups.some((u) => u.field === 'extFiled' && u.value === undefined) && skipped.has('petitionEnd');
  const keep = ups.filter((u) => !skipped.has(u.field) && !(older && (u.field === 'extFiled' || u.field === 'extReceipt')) && !(u.value === undefined && !(p as any)?.[u.field]));
  return { keep, skipped: ups.filter((u) => skipped.has(u.field)) };
}

export type Doc = { file: Picked; found?: Found; type: DocType; validTo: string; receipt: string; name: string };

export const updatesFor = (d: Doc) => statusUpdates({ ...(d.found || { lines: 0 }), type: d.type, validTo: d.validTo || undefined, receipt: d.receipt || undefined });

// Lines like "I-94 admit until → Jun 30, 2026" for the review.
export function describe(p: Profile | null | undefined, d: Doc) {
  const { keep, skipped } = plan(p, updatesFor(d));
  return [
    ...keep.filter((u) => u.label).map((u) => ({ ok: true, text: `${u.label}${u.value ? ` → ${fmt(u.value)}` : ''}` })),
    ...skipped.filter((u) => u.label).map((u) => ({ ok: false, text: `${u.label}: kept the newer date already saved` })),
  ];
}

// Save one person's documents into their profile (mutates and returns it) and the vault.
export async function saveFor(owner: string, relation: string, profile: Profile, docs: Doc[], label: string) {
  const cases = new Set((await readStore<{ receipt: string }[]>('cd.cases.v1', [])).map((c) => c.receipt));
  for (const d of docs) {
    if (SINGLE.includes(d.type)) for (const old of (await allDocs()).filter((x) => (x.owner || 'me') === owner && x.type === d.type)) await deleteDoc(old);
    const title = `${owner !== 'me' ? label + ' · ' : ''}${d.type}${d.validTo ? ' · ' + fmt(d.validTo) : ''}`;
    await addDoc({ title, type: d.type, expires: d.validTo || undefined, receipt: d.receipt || undefined, name: d.name || undefined, fileName: d.file.name, mime: d.file.mime, size: d.file.size, owner }, d.file);
    for (const u of plan(profile, updatesFor(d)).keep) (profile as any)[u.field] = u.value;
    const f = d.found;
    if (d.type === 'I-129S (blanket L)') profile.blanket = true;
    // Identity from the document: passport number and birth date (used to match future uploads).
    if (f?.passportNo && (d.type === 'Passport' || !profile.passportNo)) profile.passportNo = f.passportNo;
    if (d.name && (d.type === 'Passport' || !profile.legalName)) profile.legalName = d.name;
    if (f?.birthDate && !profile.birthDate && d.type !== 'Approval (I-797A/B)') profile.birthDate = f.birthDate;
    // The class on an I-94, visa stamp or status approval confirms the visa type.
    const cls = visaFromClass(f?.classOfAdmission, relation);
    const statusApproval = d.type === 'Approval (I-797A/B)' && (!f?.form || f.form === 'I-129' || f.form === 'I-539');
    if (cls && (d.type === 'I-94' || d.type === 'Visa stamp' || statusApproval)) { profile.visa = cls; profile.visaSet = true; if (f?.blanket) profile.blanket = true; }
    if (d.receipt && /^[A-Z]{3}\d{10}$/.test(d.receipt) && !cases.has(d.receipt) && d.type !== 'Visa stamp') {
      await upsertCase({ receipt: d.receipt, form: f?.form, owner, nickname: owner !== 'me' ? `${label}${f?.form ? ' · ' + f.form : ''}` : undefined, history: [] });
      cases.add(d.receipt);
    }
  }
  return profile;
}

// Does this document look like it belongs to someone else in the family? Only passport data is compared —
// never the name the family typed ("Vijay"): the passport number (on the passport, visa stamp and I-94),
// then the full passport name. Returns that person, or undefined.
const words = (n?: string) => (n || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
export function samePerson(a?: string, b?: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  // Same given (first) name and at least one more part in common, in either order (notices print SURNAME, GIVEN).
  const shared = x.filter((w) => y.includes(w)).length;
  return shared >= 2 || (x.length === 1 && y.length === 1 && x[0] === y[0]);
}
export function belongsElsewhere<P extends { id: string; passportNo?: string; legalName?: string }>(f: Found | undefined, ownerId: string, list: P[]): P | undefined {
  if (!f) return undefined;
  const owner = list.find((x) => x.id === ownerId);
  if (f.passportNo) {
    const byNo = list.find((x) => x.passportNo === f.passportNo);
    if (byNo) return byNo.id !== ownerId ? byNo : undefined;
  }
  if (!f.name || (owner?.legalName && samePerson(f.name, owner.legalName))) return undefined;
  return list.find((x) => x.id !== ownerId && x.legalName && samePerson(f.name, x.legalName));
}
