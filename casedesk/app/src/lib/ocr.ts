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
  name?: string; // person's name as printed (passport/visa MRZ, I-94, EAD, I-797 beneficiary)
  lines: number;
};

// ---------- text extraction ----------
// Phone scans are often small, tilted or low-contrast. We read the original first; if that yields
// little usable text we retry on an enlarged copy and on rotated copies, and keep the best result.
// Scanned PDFs (pictures with no text layer) are rendered page by page and read like photos.
async function ocrImage(uri: string): Promise<string> {
  const ocr = require('expo-text-extractor');
  if (!ocr.isSupported) return '';
  try { return ((await ocr.extractTextFromImage(uri)) as string[]).join('\n'); } catch { return ''; }
}
const score = (txt: string) => datesIn(txt).length * 5 + (/\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC)\d{10}\b/.test(txt.replace(/\s/g, '').toUpperCase()) ? 5 : 0) + (/[A-Z0-9<]{30,}/.test(txt.replace(/ /g, '')) ? 8 : 0) + Math.min(10, txt.split('\n').length / 4);

async function variants(uri: string, width?: number) {
  const out: string[] = [];
  try {
    const M = require('expo-image-manipulator');
    const big = await M.manipulateAsync(uri, [{ resize: { width: Math.max(2400, Math.min(3200, (width || 1200) * 2)) } }], { compress: 0.95, format: M.SaveFormat.JPEG });
    out.push(big.uri);
    for (const r of [90, 270, 180]) {
      const rot = await M.manipulateAsync(big.uri, [{ rotate: r }], { compress: 0.95, format: M.SaveFormat.JPEG });
      out.push(rot.uri);
    }
  } catch {}
  return out;
}

async function readImageBest(uri: string, width?: number): Promise<string> {
  let best = await ocrImage(uri);
  if (score(best) >= 18) return best;
  const vs = await variants(uri, width);
  for (const [i, v] of vs.entries()) {
    const txt = await ocrImage(v);
    // The enlarged copy is merged with the original (each catches different lines); rotations replace it.
    const cand = i === 0 ? `${best}\n${txt}` : txt;
    if (score(cand) > score(best)) best = cand;
    if (score(best) >= 25) break;
  }
  return best;
}

export async function readText(uri: string, mime: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf')) {
      let text = '';
      try {
        const pdf = require('expo-pdf-text-extract');
        if (pdf.isAvailable?.()) text = (await pdf.extractText(uri)) || '';
      } catch {}
      if (text.replace(/\s/g, '').length >= 40) return text;
      // No text layer: a scanned PDF. Render the first pages and read them as images.
      try {
        const Thumb = require('react-native-pdf-thumbnail').default;
        const pages: string[] = [];
        for (let pg = 0; pg < 3; pg++) {
          try {
            const r = await Thumb.generate(uri, pg, { quality: 95 });
            pages.push(await readImageBest(r.uri, r.width));
          } catch { break; }
        }
        text = pages.join('\n');
      } catch {}
      return text || null;
    }
    return await readImageBest(uri);
  } catch {
    return null;
  }
}

// Not in Expo Go (its native modules aren't bundled there) or the web preview.
export const ocrAvailable = () => {
  if (Platform.OS === 'web') return false;
  try { return require('expo-constants').default.executionEnvironment !== 'storeClient'; } catch { return true; }
};

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
  // Common OCR slips: O↔0 and I/l↔1 inside month names and digit groups, spaces around separators.
  const T = s.toUpperCase()
    .replace(/\b(\d{1,2})\s?([A-Z0-9]{3,4})\s?(\d{2,4})\b/g, (all, d, mon, y) => {
      const fixed = mon.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');
      return MONTHS[fixed] ? `${d} ${fixed} ${y}` : all;
    })
    .replace(/(\d)\s*([\/\-.])\s*(\d)/g, '$1$2$3');
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

// Machine-readable zone (passport "P<…" or US visa "V<…"/"VN…"): expiry is YYMMDD at positions 22–27
// of line 2 (same place on passports and visa foils). OCR often reads 0 as O, 1 as I, 5 as S, 8 as B.
const DIG: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
function mrz(text: string): { kind: 'P' | 'V'; expiry?: string } | null {
  const lines = text.toUpperCase().replace(/ /g, '').replace(/«/g, '<').split(/\n/).filter((l) => /^[A-Z0-9<]{30,46}$/.test(l) && l.includes('<'));
  const i = lines.findIndex((l) => /^[PV][A-Z<]/.test(l));
  if (i < 0) return null;
  const kind = lines[i][0] as 'P' | 'V';
  const l2 = lines[i + 1];
  if (!l2) return { kind };
  const e = l2.slice(21, 27).split('').map((c) => DIG[c] ?? c).join('');
  const expiry = /^\d{6}$/.test(e) ? iso(2000 + +e.slice(0, 2), +e.slice(2, 4), +e.slice(4, 6)) : undefined;
  return { kind, expiry };
}
const latest = (text: string) => datesIn(text).sort().pop();

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
// Name from the MRZ line 1: P<INDKRISHNAN<<THARA<DHIYANA<<< or VNUSAKRISHNAN<<THARA<<<
function mrzName(text: string): string | undefined {
  const l = text.toUpperCase().replace(/ /g, '').replace(/«/g, '<').split(/\n/).find((x) => /^[PV][A-Z<][A-Z<]{3}[A-Z<]+<<[A-Z<]+$/.test(x) && x.length >= 30);
  if (!l) return undefined;
  const body = l.slice(5);
  const [sur, giv] = body.split('<<');
  const given = (giv || '').replace(/<+/g, ' ').trim(), surname = sur.replace(/<+/g, ' ').trim();
  if (!surname) return undefined;
  return title(`${given} ${surname}`);
}
// Labelled names: "First (Given) Name: THARA" / "Given Name(s)" / "Surname" / "Beneficiary: KRISHNAN, THARA"
function labelledName(text: string): string | undefined {
  const get = (re: RegExp) => { const m = text.match(re); return m ? m[1].replace(/[^A-Za-z' -]/g, '').trim() : undefined; };
  const given = get(/(?:first\s*\(given\)\s*name|given\s*names?)\s*[:\-]?\s*([A-Za-z][A-Za-z' -]{1,40})/i);
  const sur = get(/(?:last\s*\(surname\)(?:\s*name)?|last\s*name|surname)\s*[:\-]?\s*([A-Za-z][A-Za-z' -]{1,40})/i);
  if (given && sur) return title(`${given.split(/\s{2,}/)[0]} ${sur.split(/\s{2,}/)[0]}`);
  const ben = text.match(/beneficiary\s*[:\-]?\s*([A-Z][A-Z' -]+),\s*([A-Z][A-Z' -]+)/i);
  if (ben) return title(`${ben[2]} ${ben[1]}`);
  return undefined;
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

  if (/ADMIT\s*UNT[IL1]{2}|MOST RECENT DATE OF ENTRY|I-94 RECORD NUMBER|ADMISSION \(I-94\) RECORD/.test(U)) {
    found.type = 'I-94';
    found.validTo = dateAfter(T, /admit\s*unt[il1]{2}(?:\s*date)?\s*[:\-]?/i);
  } else if (/EMPLOYMENT AUTHORI[SZ]ATION|CARD EXPIRES|I-766/.test(U) && !/I-797/.test(U)) {
    found.type = 'EAD card';
    found.validFrom = dateAfter(T, /valid from\s*[:\-]?/i);
    found.validTo = dateAfter(T, /card expires\s*[:\-]?|expires\s*[:\-]?/i);
  } else if (/I-129S|BASED ON BLANKET L PETITION|BLANKET L/.test(U)) {
    // Blanket L: the I-129S (endorsed by the consulate/CBP) sets the period — there's no individual I-797.
    found.type = 'I-129S (blanket L)';
    const m = T.match(/(?:intended employment|employment)[\s\S]{0,60}?from[\s\S]{0,30}?(\S+\s?\S*\s?\S*)[\s\S]{0,30}?to\s*[:\-]?\s*(.+)/i);
    if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
    found.validTo ||= latest(T);
  } else if (/I-797|NOTICE OF ACTION|APPROVAL NOTICE|RECEIPT NOTICE/.test(U)) {
    const approval = /APPROVAL NOTICE|VALID FROM|I-797A|I-797B|HAS BEEN APPROVED/.test(U);
    found.type = approval ? 'Approval (I-797A/B)' : 'Receipt (I-797C)';
    found.receivedDate = dateAfter(T, /received date|receipt date/i);
    if (approval) {
      const m = T.match(/valid from\s*[:\-]?\s*(.+?)\s+to\s+(.+?)(?:\n|$)/i);
      if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
      found.validTo ||= dateAfter(T, /until\s*[:\-]?/i);
    }
  } else if (mrz(T)?.kind === 'V' || (/VISA TYPE|VISA\/CLASS|CONTROL NUMBER|ANNOTATION|ENTRIES/.test(U) && /EXPIRATION|EXPIRY|ISSUE DATE/.test(U))) {
    // US visa foil. It also says "Passport Number", so it must be checked before passports.
    found.type = 'Visa stamp';
    const m = mrz(T);
    // Labels sit above the dates ("Issue Date   Expiration Date" / "16OCT2024   15OCT2027"),
    // so the latest date on the foil is the expiration.
    found.validTo = m?.expiry ?? latest(T);
    const v = U.match(/(?:VISA TYPE\/CLASS|VISA TYPE|CLASS)\s*[:\-]?\s*(?:[A-Z]\s+)?([A-Z]-?\d[A-Z0-9]?)\b/);
    if (v) found.classOfAdmission ||= v[1].replace(/[\s-]/g, '');
  } else if (/PASSPORT|P<[A-Z]{3}/.test(U) || mrz(T)?.kind === 'P') {
    found.type = 'Passport';
    // MRZ first; otherwise the latest date (birth and issue dates are always earlier than expiry).
    found.validTo = mrz(T)?.expiry ?? dateAfter(T, /date of expiry|expiry date|date d'expiration/i) ?? latest(T);
    found.passportExpiry = found.validTo;
  } else if (/LABOR CONDITION APPLICATION|ETA[- ]9035/.test(U)) {
    found.type = 'LCA';
    const m = T.match(/(?:period of employment|begin date)[\s\S]{0,80}?((?:\d{1,2}\/\d{1,2}\/\d{4}))[\s\S]{0,60}?((?:\d{1,2}\/\d{1,2}\/\d{4}))/i);
    if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
  }
  const nm = mrzName(T) ?? labelledName(T);
  if (nm && nm.length >= 3 && nm.length <= 60) found.name = nm;
  return found;
}

// Which "My Status" fields this document can fill
export function statusUpdates(f: Found): { field: 'i94Expiry' | 'petitionEnd' | 'eadExpiry' | 'passportExpiry' | 'visaStampExpiry' | 'extReceipt' | 'extFiled'; label: string; value: string }[] {
  const u: ReturnType<typeof statusUpdates> = [];
  if (f.type === 'I-94' && f.validTo) u.push({ field: 'i94Expiry', label: 'I-94 admit until', value: f.validTo });
  if (f.type === 'Approval (I-797A/B)' && f.validTo) u.push({ field: 'petitionEnd', label: 'Approval valid to', value: f.validTo });
  if (f.type === 'I-129S (blanket L)' && f.validTo) u.push({ field: 'petitionEnd', label: 'I-129S period ends', value: f.validTo });
  if (f.type === 'EAD card' && f.validTo) u.push({ field: 'eadExpiry', label: 'EAD valid to', value: f.validTo });
  if (f.type === 'Passport' && f.validTo) u.push({ field: 'passportExpiry', label: 'Passport expires', value: f.validTo });
  if (f.type === 'Visa stamp' && f.validTo) u.push({ field: 'visaStampExpiry', label: 'Visa stamp expires', value: f.validTo });
  if (f.type === 'Receipt (I-797C)' && f.receipt) u.push({ field: 'extReceipt', label: 'Extension receipt', value: f.receipt });
  if (f.type === 'Receipt (I-797C)' && f.receivedDate) u.push({ field: 'extFiled', label: 'Extension filed', value: f.receivedDate });
  return u;
}
