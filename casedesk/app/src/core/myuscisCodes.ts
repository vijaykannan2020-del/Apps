// myUSCIS event / history codes → plain English. Pure, no React.
// USCIS does not publish these codes for applicants. The meanings below are an INFORMAL decoding put
// together from public write-ups (r/USCIS "API code timeline" threads, Lawfully and Trackitt community
// posts, and code tables that community sites derived from the NIEM benefit-status code list). They
// may be wrong or change. `sure: false` = the community disagrees or it is a guess → shown as "likely".
// Maintain: add a line here when a new code shows up; unknown codes fall back to the raw code + date.

export type CodeKind = 'received' | 'biometrics' | 'checks' | 'review' | 'interview' | 'rfe' | 'rfe-response' | 'approved' | 'denied' | 'card' | 'transfer' | 'hold' | 'notice' | 'fee' | 'withdrawn' | 'other';
export type CodeInfo = { text: string; kind: CodeKind; sure: boolean };

const c = (text: string, kind: CodeKind, sure = true): CodeInfo => ({ text, kind, sure });

export const MYUSCIS_CODES: Record<string, CodeInfo> = {
  // ---- receipt and intake ----
  H001: c('Case created in the USCIS system', 'received', false),
  IAF: c('Receipt notice emailed', 'received', false),
  IAF1: c('Case received; receipt notice sent', 'received', false),
  IAF2: c('Case received; receipt notice not sent yet', 'received', false),
  IAF4: c('Receipt letter generated', 'received', false),
  IAA: c('Receipt notice sent', 'received'),
  IAD: c('Receipt notice sent (fee paid elsewhere)', 'received'),
  IAE: c('Biometrics fee receipt notice sent', 'received'),
  AALB: c('Received at the USCIS lockbox', 'received', false),
  ABA: c('Received; fee waived', 'received'),
  SUB: c('Submission recorded (documents you filed online)', 'received', false),
  AE: c('Case resubmitted', 'received'),
  // ---- background checks ----
  FSA0: c('Background checks requested', 'checks', false),
  FTA0: c('Background or fingerprint checks done', 'checks', false),
  FTA1: c('Background checks updated', 'checks', false),
  FN: c('Fingerprint or agency checks ordered', 'checks'),
  FNC: c('Fingerprints sent to the FBI', 'checks'),
  FNG: c('Fingerprint processing complete', 'checks'),
  FNH: c('Fingerprint processing complete', 'checks'),
  QAA: c('FBI name check complete', 'checks'),
  QAB: c('FBI name check pending', 'checks'),
  IBS1: c('Security check: nothing found', 'checks', false),
  IFA: c('Internal review step (meaning unclear)', 'checks', false),
  // ---- biometrics ----
  FNA: c('Biometrics appointment notice ordered', 'biometrics'),
  IMAF: c('Biometrics appointment notice sent', 'biometrics'),
  IMAG: c('Biometrics appointment scheduled', 'biometrics', false),
  FNB: c('Fingerprints taken', 'biometrics', false),
  MA70: c('Biometrics received from the support center', 'biometrics'),
  H008: c('Biometrics reused from an earlier case', 'biometrics', false),
  // ---- review ----
  FT0: c('Officer started reviewing the case', 'review', false),
  TA: c('Pre-adjudicated; under review', 'review', false),
  PRE: c('Pre-processing / pre-adjudication review', 'review', false),
  QB1: c('Recommended for approval; sent for quality review', 'review', false),
  H019: c('Case in administrative processing', 'review', false),
  H028: c('Internal update or review', 'review', false),
  FVV: c('Waiting for a visa number', 'hold', false),
  // ---- interview ----
  FH: c('Placed in the interview queue', 'interview'),
  FHP: c('Placed in the interview queue', 'interview', false),
  FHB: c('Ready for interview scheduling', 'interview'),
  FJ: c('Interview scheduled', 'interview', false),
  IM: c('Interview notice sent', 'interview'),
  HG: c('Interview held', 'interview'),
  FKA: c('Interview cancelled by USCIS', 'interview'),
  FM: c('Interview rescheduled', 'interview'),
  // ---- evidence requests ----
  FBA: c('Request for Evidence ordered', 'rfe'),
  FBB: c('Request for additional evidence ordered', 'rfe'),
  IKA: c('Request for Evidence sent', 'rfe'),
  IK: c('Request for Evidence sent', 'rfe', false),
  IKE: c('Request for Evidence sent online', 'rfe'),
  IKP: c('Request for Evidence sent; premium clock stopped', 'rfe'),
  IK1: c('Request for Evidence cancelled', 'review', false),
  II: c('Notice of Intent to Deny sent', 'rfe'),
  FE: c('Notice of Intent to Deny ordered', 'rfe'),
  HAA: c('Your evidence response was received', 'rfe-response'),
  HAP: c('Evidence received; premium clock restarted', 'rfe-response'),
  HD: c('Correspondence received', 'notice'),
  // ---- decisions ----
  DA: c('Approved; approval notice being prepared', 'approved', false),
  DB: c('Approved', 'approved'),
  SA: c('Approved (status adjusted)', 'approved', false),
  IEA: c('Approval notice sent', 'approved'),
  IEE: c('Approval notice emailed', 'approved'),
  IEC: c('Welcome notice sent (green card approved)', 'approved'),
  IADE: c('Approval decision entered', 'approved', false),
  SB: c('Oath ceremony to be scheduled', 'approved'),
  EA: c('Denial notice ordered', 'denied'),
  ES0: c('Denied', 'denied'),
  EL: c('Denied as abandoned', 'denied'),
  IFAB: c('Denied: did not attend biometrics', 'denied'),
  AF: c('Rejected', 'denied'),
  IC: c('Rejection notice sent', 'denied'),
  EK: c('Withdrawal acknowledgment ordered', 'withdrawn'),
  IT: c('Withdrawal acknowledgment sent', 'withdrawn'),
  // ---- cards and documents ----
  LAA: c('Card ordered', 'card'),
  LBA: c('Card order received at the production facility', 'card'),
  LDA: c('Card produced', 'card'),
  LEA: c('Card mailed', 'card', false),
  LFA: c('Card returned as undeliverable', 'card'),
  MBA: c('Re-entry permit produced', 'card'),
  MBC: c('Advance parole document produced', 'card'),
  MCA: c('Naturalization certificate produced', 'card'),
  MEA: c('Document mailed to you', 'card'),
  // ---- transfers and holds ----
  BA: c('Moved to another office for processing', 'transfer'),
  BB: c('Moved to a new office (jurisdiction)', 'transfer'),
  BC: c('Moved to a field office for interview', 'transfer'),
  CA: c('Received from another office', 'transfer'),
  IP: c('Transfer notice sent', 'transfer'),
  FS: c('Adjudication hold placed', 'hold'),
  FR: c('Adjudication hold lifted', 'hold'),
  KH: c('Litigation hold placed', 'hold'),
  // ---- notices and changes ----
  IG: c('Duplicate notice sent', 'notice'),
  IH: c('Amended notice sent', 'notice'),
  KEA: c('Address changed', 'notice'),
  KE: c('Case details changed', 'notice'),
  PAA: c('Premium processing clock started', 'review'),
  PAB: c('Premium processing clock stopped', 'review'),
  ANA: c('Fee refunded', 'fee'),
  CMS: c('Case system update', 'other', false),
};

export type Decoded = { code: string; text: string; kind: CodeKind; sure: boolean; known: boolean };

/** Plain English for a code. Unknown → "USCIS update (code XYZ)" so nothing is hidden. */
export function decodeEvent(raw: string | undefined | null): Decoded {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!code) return { code: '', text: 'USCIS update', kind: 'other', sure: false, known: false };
  const hit = MYUSCIS_CODES[code];
  if (hit) return { code, ...hit, known: true };
  return { code, text: `USCIS update (code ${code})`, kind: 'other', sure: false, known: false };
}

/** "Fingerprints taken" or "Likely: Fingerprints taken" — the label shown in timelines. */
export const eventLabel = (d: Decoded) => (d.known && !d.sure ? `Likely: ${d.text}` : d.text);

/** Kinds that change what the public status page would say (used to tell silent updates apart). */
export const PUBLIC_KINDS: CodeKind[] = ['received', 'biometrics', 'interview', 'rfe', 'rfe-response', 'approved', 'denied', 'card', 'transfer', 'withdrawn'];
