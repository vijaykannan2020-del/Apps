// Read dates and numbers from immigration documents — entirely on the phone.
// Photos: Apple Vision (iOS) / Google ML Kit on-device (Android) via expo-text-extractor.
// PDFs:   the PDF's own text via PDFKit (iOS) / PDFBox (Android) via expo-pdf-text-extract.
// Nothing is uploaded. Not available in the web preview or Expo Go (needs the real app build).
import { Platform } from 'react-native';
import type { DocType } from './vault';

export type Found = {
  type?: DocType;
  receipt?: string;
  validFrom?: string;
  validTo?: string; // the date that matters for this document (I-94 admit until, approval end, EAD/passport/visa expiry)
  classOfAdmission?: string; // H1B, L1A, H4…
  category?: string; // EAD category, e.g. C26
  passportExpiry?: string;
  receivedDate?: string; // on receipt notices
  lines: number;
};

// ---------- text extraction ----------
export async function readText(uri: string, mime: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf')) {
      const pdf = require('expo-pdf-text-extract');
      if (!pdf.isAvailable?.()) return null;
      return await pdf.extractText(uri);
    }
    const ocr = require('expo-text-extractor');
    if (!ocr.isSupported) return null;
    const parts: string[] = await ocr.extractTextFromImage(uri);
    return parts.join('\n');
  } catch {
    return null;
  }
}

export const ocrAvailable = () => Platform.OS !== 'web';

// ---------- date parsing ----------
const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12, JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += y > 60 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// All dates in a piece of text, in order, as YYYY-MM-DD
export function datesIn(s: string): string[] {
  const out: { i: number; v: string }[] = [];
  const add = (i: number, v?: string) => { if (v) out.push({ i, v }); };
  const T = s.toUpperCase();
  for (const m of T.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g)) add(m.index!, iso(+m[3], +m[1], +m[2])); // MM/DD/YYYY (US forms)
  for (const m of T.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index!, iso(+m[1], +m[2], +m[3]));
  for (const m of T.matchAll(/\b(\d{1,2})\s?([A-Z]{3,9})\.?\s?(\d{4}|\d{2})\b/g)) if (MONTHS[m[2]]) add(m.index!, iso(+m[3], MONTHS[m[2]], +m[1])); // 12 MAR 2027, 12MAR2027
  for (const m of T.matchAll(/\b([A-Z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g)) if (MONTHS[m[1]]) add(m.index!, iso(+m[3], MONTHS[m[1]], +m[2])); // SEPTEMBER 30, 2029
  return out.sort((a, b) => a.i - b.i).map((x) => x.v);
}

// First date that appears after a label (same line or the next line)
function dateAfter(text: string, label: RegExp): string | undefined {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length);
    const d = datesIn(rest)[0] ?? datesIn(lines[i + 1] ?? '')[0];
    if (d) return d;
  }
  return undefined;
}

// Passport machine-readable zone: expiry is YYMMDD at positions 22–27 of line 2
function mrzExpiry(text: string): string | undefined {
  const lines = text.toUpperCase().replace(/ /g, '').split(/\n/).filter((l) => /^[A-Z0-9<]{40,46}$/.test(l));
  const i = lines.findIndex((l) => l.startsWith('P'));
  const l2 = i >= 0 ? lines[i + 1] : undefined;
  if (!l2) return undefined;
  const e = l2.slice(21, 27);
  return /^\d{6}$/.test(e) ? iso(2000 + +e.slice(0, 2), +e.slice(2, 4), +e.slice(4, 6)) : undefined;
}

// ---------- document understanding ----------
export function parseDocument(text: string): Found {
  const T = text.replace(/\r/g, '');
  const U = T.toUpperCase();
  const found: Found = { lines: T.split('\n').length };

  found.receipt = U.match(/\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)\s?-?(\d{10})\b/)?.slice(1, 3).join('');
  const cls = U.match(/CLASS(?: OF ADMISSION)?\s*[:\-]?\s*(H-?1B1?|H-?4|L-?1A|L-?1B|L-?2S?|TN|TD|F-?1|E-?3|O-?1)\b/);
  if (cls) found.classOfAdmission = cls[1].replace('-', '');
  const cat = U.match(/CATEGORY\s*[:\-]?\s*([AC]\s?\d{1,2}\s?[A-Z]?)\b/);
  if (cat) found.category = cat[1].replace(/\s/g, '');

  if (/ADMIT UNTIL|MOST RECENT DATE OF ENTRY|I-94 RECORD NUMBER|ADMISSION \(I-94\) RECORD/.test(U)) {
    found.type = 'I-94';
    found.validTo = dateAfter(T, /admit until(?: date)?\s*[:\-]?/i);
  } else if (/EMPLOYMENT AUTHORI[SZ]ATION|CARD EXPIRES|I-766/.test(U) && !/I-797/.test(U)) {
    found.type = 'EAD card';
    found.validFrom = dateAfter(T, /valid from\s*[:\-]?/i);
    found.validTo = dateAfter(T, /card expires\s*[:\-]?|expires\s*[:\-]?/i);
  } else if (/I-797|NOTICE OF ACTION|APPROVAL NOTICE|RECEIPT NOTICE/.test(U)) {
    const approval = /APPROVAL NOTICE|VALID FROM|I-797A|I-797B|HAS BEEN APPROVED/.test(U);
    found.type = approval ? 'Approval (I-797A/B)' : 'Receipt (I-797C)';
    found.receivedDate = dateAfter(T, /received date|receipt date/i);
    if (approval) {
      const m = T.match(/valid from\s*[:\-]?\s*(.+?)\s+to\s+(.+?)(?:\n|$)/i);
      if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
      found.validTo ||= dateAfter(T, /until\s*[:\-]?/i);
    }
  } else if (/PASSPORT|P<[A-Z]{3}/.test(U)) {
    found.type = 'Passport';
    found.validTo = mrzExpiry(T) ?? dateAfter(T, /date of expiry|expiry date|date d'expiration/i);
    found.passportExpiry = found.validTo;
  } else if (/VISA TYPE|VISA\/CLASS|CONTROL NUMBER|ENTRIES/.test(U) && /EXPIRATION|EXPIRY/.test(U)) {
    found.type = 'Visa stamp';
    found.validTo = dateAfter(T, /expiration date|expiry date/i);
    const v = U.match(/(?:VISA TYPE\/CLASS|VISA TYPE|CLASS)\s*[:\-]?\s*([A-Z]\s?-?\s?\d[A-Z0-9]?)/);
    if (v) found.classOfAdmission ||= v[1].replace(/[\s-]/g, '');
  } else if (/LABOR CONDITION APPLICATION|ETA[- ]9035/.test(U)) {
    found.type = 'LCA';
    const m = T.match(/(?:period of employment|begin date)[\s\S]{0,80}?((?:\d{1,2}\/\d{1,2}\/\d{4}))[\s\S]{0,60}?((?:\d{1,2}\/\d{1,2}\/\d{4}))/i);
    if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
  }
  return found;
}

// Which "My Status" fields this document can fill
export function statusUpdates(f: Found): { field: 'i94Expiry' | 'petitionEnd' | 'eadExpiry' | 'passportExpiry' | 'visaStampExpiry' | 'extReceipt' | 'extFiled'; label: string; value: string }[] {
  const u: ReturnType<typeof statusUpdates> = [];
  if (f.type === 'I-94' && f.validTo) u.push({ field: 'i94Expiry', label: 'I-94 admit until', value: f.validTo });
  if (f.type === 'Approval (I-797A/B)' && f.validTo) u.push({ field: 'petitionEnd', label: 'Approval valid to', value: f.validTo });
  if (f.type === 'EAD card' && f.validTo) u.push({ field: 'eadExpiry', label: 'EAD valid to', value: f.validTo });
  if (f.type === 'Passport' && f.validTo) u.push({ field: 'passportExpiry', label: 'Passport expires', value: f.validTo });
  if (f.type === 'Visa stamp' && f.validTo) u.push({ field: 'visaStampExpiry', label: 'Visa stamp expires', value: f.validTo });
  if (f.type === 'Receipt (I-797C)' && f.receipt) u.push({ field: 'extReceipt', label: 'Extension receipt', value: f.receipt });
  if (f.type === 'Receipt (I-797C)' && f.receivedDate) u.push({ field: 'extFiled', label: 'Extension filed', value: f.receivedDate });
  return u;
}
