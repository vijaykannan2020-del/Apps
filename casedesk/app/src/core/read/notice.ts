// USCIS Form I-797 notices: approval (I-797, I-797A with the I-94 tear-off, I-797B consular),
// receipt (I-797C), and other notices (RFE / NOID, biometrics, interview, oath).
// The form on the notice decides what it means: I-129 / I-539 set status; I-765, I-140, I-485,
// I-131, I-751, I-90, N-400, I-130… are cases.
import type { DocFields, PetitionKind } from '../model';
import { columnDate, dateAfter, datesIn, tableValue, titleCase } from './text';

export const isNotice = (U: string) =>
  /NOTICE OF ACTION|I-797[ABCDE]?\b|APPROVAL NOTICE|RECEIPT NOTICE|REQUEST FOR EVIDENCE|APPOINTMENT NOTICE/.test(U) &&
  /RECEIPT NUMBER|CASE TYPE|NOTICE TYPE|NOTICE DATE|RECEIPT #/.test(U);

export const isDenial = (U: string) => /HAS BEEN DENIED|HAVE BEEN DENIED|IS DENIED|NOTICE TYPE\s*:?\s*(?:DENIAL|DECISION)|HAS BEEN WITHDRAWN|REVOKED/.test(U) && !/HAS BEEN APPROVED/.test(U);

export type NoticeClass = 'approval' | 'receipt' | 'notice';

export function noticeClass(U: string): NoticeClass {
  if (/REQUEST FOR EVIDENCE|NOTICE OF INTENT TO DENY|\bI-797E\b|APPOINTMENT NOTICE|INTERVIEW (?:APPOINTMENT|NOTICE)|BIOMETRICS? APPOINTMENT|ASC APPOINTMENT|OATH CEREMONY/.test(U)) return 'notice';
  if (isDenial(U)) return 'notice';
  const approval = /APPROVAL NOTICE|NOTICE TYPE\s*:?\s*APPROVAL|HAS BEEN APPROVED|HAVE BEEN APPROVED|I-797A|I-797B/.test(U) && !/NOTICE TYPE\s*:?\s*RECEIPT/.test(U);
  return approval ? 'approval' : 'receipt';
}

/** What an I-129 / I-539 is for. Amendment first: an amended petition can also extend the stay. */
export function petitionKind(U: string): PetitionKind | undefined {
  const u = U.replace(/AS AMENDED/g, '');
  if (/\bAMEND|CHANGE IN PREVIOUSLY APPROVED EMPLOYMENT/.test(u)) return 'amendment';
  if (/CHANGE OF EMPLOYER|NEW CONCURRENT EMPLOYMENT/.test(u)) return 'transfer';
  if (/CHANGE OF STATUS|CHANGE OF NONIMMIGRANT (?:STATUS|CLASSIFICATION)/.test(u)) return 'change-of-status';
  if (/NEW EMPLOYMENT/.test(u)) return 'new';
  if (/EXTENSION OF STAY|CONTINUATION OF PREVIOUSLY APPROVED EMPLOYMENT|EXTEND STAY|EXTENSION/.test(u)) return 'extension';
  return undefined;
}

function workLocation(T: string): DocFields['workLocation'] {
  const lines = T.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:work\s*location|place\s*of\s*employment|worksite(?:\s*address)?|work\s*site)\s*[:\-]?\s*(.*)$/i);
    if (!m) continue;
    for (const v of [m[1], lines[i + 1] ?? '', lines[i + 2] ?? '']) {
      const c = v.match(/([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Za-z]{2})\b(?![a-z])/);
      if (c) return { city: titleCase(c[1].replace(/^.*\d+\s+[^,]*\s{2,}/, '').trim()), state: c[2].toUpperCase() };
    }
  }
  return undefined;
}

export function formOf(U: string): string | undefined {
  const m = U.match(/CASE TYPE\s*[:\-]?\s*(I-?\d{3}[A-Z]?|N-?\d{3})\b/)
    ?? U.match(/\b(I-?(?!94\b)\d{2,3}[A-Z]?|N-?\d{3})\s*-\s*(?:PETITION|APPLICATION|IMMIGRANT|NONIMMIGRANT|REQUEST)/)
    ?? U.match(/\bFORM\s*[:\-]?\s*(I-?(?!797|94\b)\d{3}[A-Z]?|N-?\d{3})\b/);
  return m ? m[1].replace(/^([IN])-?/, '$1-') : undefined;
}

export function readNotice(T: string): DocFields & { kind: NoticeClass } {
  const U = T.toUpperCase();
  const kind = noticeClass(U);
  const f: DocFields & { kind: NoticeClass } = { kind };
  // Table layout: "Received Date   Priority Date   Petitioner" / "04/03/2026   (blank)   ACME" — read by column.
  const RD = /received date|receipt date/i, PD = /priority date/i, ND = /notice date/i, PG = /\bpage\b/i;
  f.receivedDate = columnDate(T, RD, [PD, /petitioner/i]) ?? dateAfter(T, RD);
  f.priorityDate = columnDate(T, PD, [RD, /petitioner/i]);
  f.noticeDate = columnDate(T, ND, [PG]) ?? dateAfter(T, ND);
  f.requestedStart = dateAfter(T, /requested start date|start date requested/i);
  f.petitionKind = petitionKind(U);
  f.form = formOf(U);
  const pet = tableValue(T, /\bpetitioner(?:'s)?(?:\s*name)?\b(?!')/i);
  if (pet && !/^(name|beneficiary|page)\b/i.test(pet)) f.employer = pet;
  f.workLocation = workLocation(T);
  const cls = U.match(/CLASS(?:IFICATION| REQUESTED)?\s*[:\-]?\s*(H-?1B1?|H-?4|L-?1A|L-?1B|L-?2S?|TN|TD|F-?1|E-?3|O-?1)\b/);
  if (cls) f.classOfAdmission = cls[1].replace('-', '');
  const sec = U.match(/203\s*\(\s*B\s*\)\s*\(\s*([123])\s*\)/);
  const pref = U.match(/\b(E1[123]|E21|EB-?[123]|E3[12]|EW3|NIW)\b/);
  if (sec) f.preferenceCategory = `EB${sec[1]}`;
  else if (pref) f.preferenceCategory = pref[1].replace('-', '').replace(/^E1\d$/, 'EB1').replace(/^E21|NIW$/, 'EB2').replace(/^E3\d|EW3$/, 'EB3');
  const cat = U.match(/(?:CATEGORY|ELIGIBILITY CATEGORY|CLASS)\s*[:\-]?\s*\(?([AC])\)?\s*\(?(\d{1,2})\)?\s*\(?([A-Z])?\)?\b/);
  if (cat && f.form === 'I-765') f.category = `${cat[1]}${+cat[2]}${cat[3] ?? ''}`;
  if (kind === 'approval') {
    const vf = U.search(/VALID FROM/);
    if (vf >= 0) { const d = datesIn(T.slice(vf, vf + 120)); f.validFrom = d[0]; f.validTo = d[1]; }
    f.validTo ||= dateAfter(T, /valid to|valid until|until/i);
    // The I-94 at the foot of an extension / change-of-status approval (never on a consular I-797B).
    const tear = U.search(/DEPARTURE RECORD|ARRIVAL[-\s\/]*DEPARTURE|DEPARTURE NUMBER|ADMISSION NUMBER|I-94 NUMBER|I-94 BELOW/);
    if (tear >= 0 && !/CONSULAR NOTIFICATION|I-797B/.test(U)) {
      const own = dateAfter(T.slice(tear), /valid until|admit until|until|valid to/i);
      f.i94Until = own && (!f.validFrom || own >= f.validFrom) ? own : f.validTo;
    }
  }
  if (kind === 'notice') {
    if (isDenial(U) && !/REQUEST FOR EVIDENCE|INTENT TO DENY/.test(U)) f.noticeKind = 'denial';
    else if (/NOTICE OF INTENT TO DENY/.test(U)) f.noticeKind = 'noid';
    else if (/REQUEST FOR EVIDENCE|I-797E/.test(U)) f.noticeKind = 'rfe';
    else if (/OATH CEREMONY/.test(U)) f.noticeKind = 'oath';
    else if (/INTERVIEW/.test(U)) f.noticeKind = 'interview';
    else if (/BIOMETRIC|ASC APPOINTMENT|APPLICATION SUPPORT CENTER/.test(U)) f.noticeKind = 'biometrics';
    else f.noticeKind = 'other';
    if (f.noticeKind === 'rfe' || f.noticeKind === 'noid') f.dueDate = dateAfter(T, /received in this office (?:by|no later than)|must be received (?:by|no later than)|response (?:is )?due|due date|respond by|submit[^\n]*? by/i);
    else if (f.noticeKind !== 'denial') f.appointmentDate = dateAfter(T, /(?:appointment|interview|ceremony)\s*(?:date|on)?|date and time|date\s*:/i);
  }
  return f;
}
