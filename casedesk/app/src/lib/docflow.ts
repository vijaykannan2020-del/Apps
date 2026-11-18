// Saving documents into a person's record — shared by the upload flow. The rules themselves (what a
// document changes, which one is current, whose it looks like) live in docrules.ts, which has no storage.
import { Profile, PetitionKind } from './profile';
import type { Found } from './ocr';
import { addDoc, deleteDoc, allDocs, DocType, Picked } from './vault';
import { upsertCase, read as readStore } from './store';
import { fmt } from './compliance';
import { SINGLE, applyDoc, plan, updatesFor } from './docrules';

const MAIN = ['i94Expiry', 'petitionEnd', 'eadExpiry', 'passportExpiry', 'visaStampExpiry'];
const HISTORY = ['Passport', 'Approval (I-797A/B)', 'I-129S (blanket L)'];

export { visaFromClass, SINGLE, plan, describe, updatesFor, samePerson, belongsElsewhere, identityOf, stepsFor, stepOf, missingDocs, METROS, metroOf, differentMetro, currentApproval, sameEmployer, withMetro, applyDoc } from './docrules';
export type { Step, StepKey, Ident } from './docrules';

export type Doc = { file: Picked; found?: Found; type: DocType; validTo: string; receipt: string; name: string; filedFor?: PetitionKind };

// Save one person's documents into their profile (mutates and returns it) and the vault.
export async function saveFor(owner: string, relation: string, profile: Profile, docs: Doc[], label: string) {
  const cases = new Set((await readStore<{ receipt: string }[]>('cd.cases.v1', [])).map((c) => c.receipt));
  for (const d of docs) {
    // A new one replaces the saved one — unless it's older (an earlier approval or I-94), then both are kept.
    const older = plan(profile, updatesFor(d), { receipt: d.receipt }).skipped.some((u) => MAIN.includes(u.field));
    // Passports and approvals keep their history (older ones are shown as superseded) — only an exact
    // re-upload (same receipt or same date) replaces one.
    const history = HISTORY.includes(d.type);
    const same = (x: { type: string; receipt?: string; expires?: string }) => x.type === d.type && (!history || (d.receipt ? x.receipt === d.receipt : x.expires === (d.validTo || undefined)));
    if (SINGLE.includes(d.type) && (!older || history)) for (const old of (await allDocs()).filter((x) => (x.owner || 'me') === owner && same(x))) await deleteDoc(old);
    const title = `${owner !== 'me' ? label + ' · ' : ''}${d.type}${d.validTo ? ' · ' + fmt(d.validTo) : ''}`;
    await addDoc({ title, type: d.type, expires: d.validTo || undefined, receipt: d.receipt || undefined, name: d.name || undefined, fileName: d.file.name, mime: d.file.mime, size: d.file.size, owner }, d.file);
    applyDoc(profile, d, relation);
    const f = d.found;
    if (d.receipt && /^[A-Z]{3}\d{10}$/.test(d.receipt) && !cases.has(d.receipt) && d.type !== 'Visa stamp') {
      await upsertCase({ receipt: d.receipt, form: f?.form, owner, nickname: owner !== 'me' ? `${label}${f?.form ? ' · ' + f.form : ''}` : undefined, history: [] });
      cases.add(d.receipt);
    }
  }
  return profile;
}
