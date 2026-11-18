// Document reading: OCR text → document type + typed fields. Runs on the phone; nothing is uploaded.
// Order matters: a USCIS notice can carry an I-94 (I-797A tear-off), a visa foil mentions the I-129S
// and "Passport Number", a green card says "Card Expires" like an EAD.
import type { DocFields, DocType } from '../model';
import { columnToken, dayFirstCountry, labelledName, mrzName, readMRZ, receiptIn, withoutAnnotations, dateAfter } from './text';
import { isPassport, readPassport } from './passport';
import { isVisaFoil, readVisa } from './visa';
import { isI94, readI94 } from './i94';
import { isTravelHistory, readTravelHistory } from './travelHistory';
import { isNotice, readNotice } from './notice';
import { isI129SForm, mentionsI129S, readI129S } from './i129s';
import { isEAD, readEAD } from './ead';
import { isGreenCard, readGreenCard } from './greenCard';
import { isI20, readI20 } from './i20';
import { isDS2019, readDS2019 } from './ds2019';
import { isAdvanceParole, isReentryPermit, readTravelDoc } from './travelDoc';
import { isNaturalization, readNaturalization } from './naturalization';
import { isLCA, readLCA } from './lca';

export type Reading = { type?: DocType; fields: DocFields; lines: number };

/** Which kind of document this text is (undefined = not recognised). */
export function classify(text: string): DocType | undefined {
  return readDocument(text).type;
}

export function readDocument(text: string): Reading {
  const T = (text || '').replace(/\r/g, '');
  const U = T.toUpperCase();
  const lines = T.split('\n').length;
  const usForm = /I-797|I-94|USCIS|DEPARTMENT OF HOMELAND/.test(U);
  const dayFirst = dayFirstCountry(U) && !usForm;
  const visaFoil = isVisaFoil(U, T);
  let type: DocType | undefined;
  let f: DocFields = {};

  const s129 = U.search(/FORM I-129S|USCIS FORM I-129S|BASED ON BLANKET L PETITION/), noa = U.search(/NOTICE OF ACTION/);
  if (!visaFoil && isI129SForm(U) && (noa < 0 || s129 < noa)) {
    type = 'i129s'; f = readI129S(T);
  } else if (isNotice(U)) {
    const { kind, ...rest } = readNotice(T);
    type = kind; f = rest;
  } else if (isTravelHistory(U)) {
    type = 'travel-history'; f = readTravelHistory(T);
  } else if (isI94(U)) {
    type = 'i94'; f = readI94(T);
  } else if (isI20(U)) {
    type = 'i20'; f = readI20(T);
  } else if (isDS2019(U)) {
    type = 'ds2019'; f = readDS2019(T);
  } else if (isGreenCard(U)) {
    type = 'green-card'; f = readGreenCard(T, false);
  } else if (isEAD(U)) {
    type = 'ead'; f = readEAD(T);
  } else if (visaFoil) {
    type = 'visa'; f = readVisa(T);
  } else if (mentionsI129S(U)) {
    type = 'i129s'; f = readI129S(T, true);
  } else if (isAdvanceParole(U)) {
    type = 'advance-parole'; f = readTravelDoc(T);
  } else if (isReentryPermit(U)) {
    type = 'reentry-permit'; f = readTravelDoc(T);
  } else if (isNaturalization(U)) {
    type = 'naturalization'; f = readNaturalization(T);
  } else if (isPassport(U, T)) {
    type = 'passport'; f = readPassport(T, dayFirst);
  } else if (isLCA(U)) {
    type = 'lca'; f = readLCA(T);
  }

  // Receipt number: on notices and cards. A visa's "P#-WAC…" is the employer's petition, not this person's case.
  if (type !== 'visa' && type !== 'passport' && type !== 'i94') f.receipt ||= receiptIn(U.replace(/\bP#\s*-?\s*[A-Z]{3}\d{10}/g, ''));
  if (type === 'visa') delete f.receipt;

  // Who it belongs to: passport number and birth date.
  if (type === 'passport' || type === 'visa' || type === 'i94' || type === 'ead' || !type) {
    const m = readMRZ(T);
    f.passportNo = m?.docNo ?? U.match(/(?:PASSPORT\s*(?:NO|NUMBER|#)|DOCUMENT\s*(?:NO|NUMBER))\.?\s*[:\-]?\s*\n?\s*([A-Z]?\d{7,9})\b/)?.[1]
      ?? (type === 'passport' ? columnToken(U, /PASSPORT\s*NO\.?|PASSPORT\s*NUMBER/, /^[A-Z]{1,2}\d{6,8}$/) : undefined);
    if (f.oldPassportNo === f.passportNo) delete f.oldPassportNo;
    f.birthDate ||= m?.birth ?? dateAfter(T, /date of birth|birth date/i, dayFirst);
  }
  // Name as printed. Visa annotations (PA:, P#, PED…) name the principal — never the holder.
  // The I-129S has preparer / interpreter name fields, so it never falls back to generic labels.
  if (!f.name && type !== 'i129s' && type !== 'travel-history') {
    const src = withoutAnnotations(T);
    const nm = mrzName(src) ?? labelledName(src);
    if (nm && nm.length >= 3 && nm.length <= 60) f.name = nm;
  }
  for (const k of Object.keys(f) as (keyof DocFields)[]) if (f[k] === undefined) delete f[k];
  return { type, fields: f, lines };
}
