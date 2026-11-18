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
  form?: string; // form on a USCIS notice, e.g. I-129, I-539, I-765
  passportNo?: string; // passport number — on the passport, the visa stamp and the I-94; links documents to a person
  birthDate?: string; // passports/visas: tells a child's document from a parent's
  i94Until?: string; // I-94 printed at the bottom of an I-797A approval (extension / change of status)
  blanket?: boolean; // visa annotated "BLANKET L…": admitted under a blanket L petition
  name?: string; // person's name as printed (passport/visa MRZ, I-94, EAD, I-797 beneficiary)
  noticeDate?: string; // I-797 "Notice Date" — also the issue date of an I-94 printed on an I-797A
  entryDate?: string; // CBP I-94 "Most Recent Date of Entry" — the issue date of that I-94
  petitionKind?: 'new' | 'extension' | 'amendment' | 'transfer'; // what an I-129 / I-539 notice is for
  employer?: string; // petitioner on an I-797
  workLocation?: { city?: string; state?: string }; // "Work location" / "Place of employment" on a notice
  issueDate?: string; // passport / visa issue date (never the expiry)
  oldPassportNo?: string; // new Indian passports print "Old Passport No." — links the old passport to the same person
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
      // A good text layer (e-filed notices) is enough. Scanner apps (Adobe Scan, CamScanner) add their own,
      // often poor, OCR layer — if it doesn't give us the type, a date and (for IDs) a name, read the page images too.
      if (text.replace(/\s/g, '').length >= 40) {
        const f = parseDocument(text);
        // IDs (passport, visa, EAD) are always read from the image too: a scanner's text layer misreads
        // names ("NAYA" for "MAYA"), and the name matters most on these.
        const idDoc = f.type === 'Passport' || f.type === 'Visa stamp' || f.type === 'EAD card' || /P<[A-Z]{3}|REPUBLIC OF|PASSPORT/i.test(text);
        if (f.type && f.validTo && !idDoc) return text;
      }
      // Scanned PDF: render the first pages and read them as images (on-device text recognition).
      try {
        const Thumb = require('react-native-pdf-thumbnail').default;
        const pages: string[] = [];
        for (let pg = 0; pg < 3; pg++) {
          try {
            const r = await Thumb.generate(uri, pg, { quality: 95 });
            pages.push(await readImageBest(r.uri, r.width));
          } catch { break; }
        }
        const img = pages.join('\n');
        // Image text first (it wins where both have a value), then the PDF's own layer for anything it missed.
        text = img.replace(/\s/g, '').length >= 20 ? `${img}\n${text}` : text;
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

// Indian and most non-US documents write DD/MM/YYYY; US forms write MM/DD/YYYY. parseDocument sets this per document.
let DAY_FIRST = false;
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
  for (const m of T.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g)) {
    const a = +m[1], b = +m[2];
    const dayFirst = a > 12 || (DAY_FIRST && b <= 12);
    add(m.index!, dayFirst ? iso(+m[3], b, a) : iso(+m[3], a, b)); // DD/MM/YYYY or MM/DD/YYYY (US forms)
  }
  // Two-digit years (EAD cards: "Card Expires: 01/31/27")
  for (const m of T.matchAll(/(?<![\d\/])(\d{1,2})\/(\d{1,2})\/(\d{2})(?![\d\/])/g)) {
    const a = +m[1], b = +m[2];
    const dayFirst = a > 12 || (DAY_FIRST && b <= 12);
    add(m.index!, dayFirst ? iso(+m[3], b, a) : iso(+m[3], a, b));
  }
  for (const m of T.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index!, iso(+m[1], +m[2], +m[3]));
  for (const m of T.matchAll(/\b(\d{1,2})\s?([A-Z]{3,9})\.?\s?(\d{4}|\d{2})\b/g)) if (MONTHS[m[2]]) add(m.index!, iso(+m[3], MONTHS[m[2]], +m[1])); // 12 MAR 2027, 12MAR2027
  for (const m of T.matchAll(/\b([A-Z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g)) if (MONTHS[m[1]]) add(m.index!, iso(+m[3], MONTHS[m[1]], +m[2])); // SEPTEMBER 30, 2029
  for (const m of T.matchAll(/\b(\d{4})\s([A-Z]{3,9})\.?\s(\d{1,2})\b/g)) if (MONTHS[m[2]]) add(m.index!, iso(+m[1], MONTHS[m[2]], +m[3])); // 2027 JULY 21 (CBP I-94 site)
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
function mrz(text: string): { kind: 'P' | 'V'; expiry?: string; birth?: string; cls?: string; docNo?: string } | null {
  const lines = text.toUpperCase().split(/\n/).map((l) => l.replace(/\s/g, '').replace(/[«‹(){}\[\]|]/g, '<')).filter((l) => /^[A-Z0-9<]{30,46}$/.test(l));
  const i = lines.findIndex((l) => /^[PV][A-Z<]/.test(l) && l.includes('<'));
  if (i < 0) return null;
  const kind = lines[i][0] as 'P' | 'V';
  const l2 = lines[i + 1];
  if (!l2) return { kind };
  const e = l2.slice(21, 27).split('').map((c) => DIG[c] ?? c).join('');
  const expiry = /^\d{6}$/.test(e) ? iso(2000 + +e.slice(0, 2), +e.slice(2, 4), +e.slice(4, 6)) : undefined;
  const b = l2.slice(13, 19).split('').map((c) => DIG[c] ?? c).join('');
  const yy = new Date().getFullYear() % 100;
  const birth = /^\d{6}$/.test(b) ? iso((+b.slice(0, 2) > yy ? 1900 : 2000) + +b.slice(0, 2), +b.slice(2, 4), +b.slice(4, 6)) : undefined;
  // US visa MRZ: the visa class follows the expiry check digit ("…F2706188L2MDR…" → L2).
  const cls = kind === 'V' ? l2.slice(28, 32).match(/^(H1B|H4|L1|L2|F1|F2|J1|J2|TD|TN|O1|E3|B1|B2|R)/)?.[1] : undefined;
  // Document number: the passport number on a passport; on a US visa, the holder's passport number.
  const docNo = l2.slice(0, 9).replace(/<+$/, '').replace(/</g, '');
  return { kind, expiry, birth, cls: cls === 'R' ? undefined : cls, docNo: /^[A-Z0-9]{6,9}$/.test(docNo) && /\d/.test(docNo) ? docNo : undefined };
}
const latest = (text: string) => datesIn(text).sort().pop();

const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
// Name from the MRZ line 1: P<INDKUMAR<<ASHA<DEVI<<< or VNUSAKUMAR<<ASHA<<<.
// Tolerates OCR slips («, (, {, K for <) and passports with no surname (P<IND<<ASHA<DEVI<<<).
function mrzLine(raw: string) {
  // A run of fillers read as K's: "<K<K<" or "KKK<" after a name. A single K right before '<' stays (KARTHIK<<).
  return raw.toUpperCase().replace(/\s/g, '').replace(/[«‹(){}\[\]|]/g, '<')
    .replace(/<[<K]{3,}/g, (m) => '<'.repeat(m.length))
    .replace(/K{2,}(?=<)/g, (m) => '<'.repeat(m.length))
    .replace(/K{5,}/g, (m) => '<'.repeat(m.length));
}
// Edit distance ≤ 1 (one letter changed, added or dropped).
const oneOff = (a: string, b: string) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) return [...a].filter((c, i) => c !== b[i]).length === 1;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
};
function mrzName(text: string): string | undefined {
  const lines = text.split(/\n/).map(mrzLine);
  const l = lines.find((x) => /^[PV][A-Z<0]?[A-Z]{3}[A-Z<]{6,}$/.test(x.replace(/<+$/, '')) && x.length >= 20 && x.includes('<'));
  if (!l) return undefined;
  // OCR often reads the '<' filler as 'K': "RAJAN<K<MEERA<KTARA". A lone K between fillers is a
  // filler; a K glued to the front of a name is too when no name starts that way (KT, KM…) or when the
  // name without it is printed elsewhere on the page (the visual zone above the MRZ).
  const words = new Set(text.toUpperCase().split('\n').filter((x) => !x.includes('<')).join(' ').split(/[^A-Z]+/).filter((w) => w.length >= 2));
  const visual = [...words];
  const body = l.slice(5).replace(/[^A-Z<]/g, '').replace(/<K(?=<)/g, '<<')
    .replace(/(^|<)K([A-Z]+)/g, (all, pre, rest) => (/^[^AEIOUHRYLWS]/.test(rest) || (words.has(rest) && !words.has('K' + rest)) ? `${pre}<${rest}` : all));
  let sur = '', giv = '';
  const cut = body.indexOf('<<');
  if (cut >= 0) { sur = body.slice(0, cut); giv = body.slice(cut + 2); } else giv = body;
  // A name word the MRZ misread by one letter ("NAYA") is corrected from the printed name above it ("MAYA").
  // A name word as the printed (visual) zone shows it: exactly; as two printed words run together
  // ("RAMKUMAR" for "RAM KUMAR"); with filler letters glued on ("PRIYASS"); or one letter off
  // (a same-length slip takes the printed spelling, "NAYA" → "MAYA"; a dropped/added letter keeps the MRZ's).
  const exactish = (w: string) => {
    if (words.has(w)) return w;
    for (let i = 0; i + 1 < visual.length; i++) if (visual[i] + visual[i + 1] === w && visual[i].length >= 2 && visual[i + 1].length >= 3) return `${visual[i]} ${visual[i + 1]}`;
    return undefined;
  };
  const near = (w: string): string | undefined => {
    const e = exactish(w) ?? (w.length > 4 && /[KSXC]$/.test(w) ? exactish(w.replace(/[KSXC]{1,3}$/, '')) : undefined);
    if (e) return e;
    const same = visual.filter((x) => x.length === w.length && x.length >= 3 && oneOff(x, w));
    if (same.length === 1) return same[0];
    if (visual.some((x) => x.length >= 3 && oneOff(x, w))) return w;
    return undefined;
  };
  const all = (giv + '<' + sur).replace(/<+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 3);
  // The printed (visual) zone counts when it shows at least half of the MRZ name words: then MRZ words it
  // doesn't show (filler junk like "KCKCKCE") are dropped. Single letters are always filler (K, X, C, S).
  const hasVisual = all.length > 0 && all.filter((w) => near(w)).length * 2 >= all.length;
  const junk = (w: string) => /^[KCXSE]+[A-Z]{0,3}$/.test(w) && /[KCX].*[KCX]/.test(w);
  const clean = (x: string) => x.replace(/<+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 2)
    .map((w) => (junk(w) ? undefined : hasVisual ? near(w) : near(w) ?? w)).filter(Boolean).join(' ');
  const given = clean(giv), surname = clean(sur);
  const full = [given, surname].filter(Boolean).join(' ');
  if (full.length < 2 || full.split(' ').some((w) => w.length > 20)) return undefined; // OCR noise, not a name
  return title(full);
}
// Labelled names. Value on the same line ("Given Name(s): THARA") or on the next line, as on Indian and US
// passports ("Given Name(s) / दिए गए नाम" then "ASHA DEVI"). Also "Beneficiary: KUMAR, ASHA".
const NOT_NAME = /\b(NATIONALITY|SEX|DATE|BIRTH|PLACE|ISSUE|EXPIRY|PASSPORT|REPUBLIC|INDIA|UNITED|STATES|TYPE|CODE|COUNTRY|AUTHORITY|SIGNATURE|NAME|SURNAME|GIVEN)\b/;
function valueAfter(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).split('/')[0].replace(/^[\s:\-()s]*/, '').trim();
    if (/^[A-Z][A-Z' -]{1,40}$/.test(rest) && !NOT_NAME.test(rest)) return rest;
    for (const next of lines.slice(i + 1, i + 4)) {
      const v = next.trim();
      if (!v) continue;
      if (/SURNAME|GIVEN|\bNAME/.test(v.toUpperCase())) break; // the next name label — this field is blank (e.g. no surname)
      if (NOT_NAME.test(v.toUpperCase())) continue; // another label in between (e.g. "Visa Type / Class")
      if (/^[A-Z][A-Z' -]{1,40}$/.test(v)) return v;
    }
  }
  return undefined;
}
function labelledName(text: string): string | undefined {
  const lines = text.split(/\n/);
  // USCIS notices: "Beneficiary KUMAR, RAJAN" / "Applicant KUMAR, PRIYA" (surname first).
  const who = text.match(/(?:beneficiary|applicant)\s*(?:name)?\s*[:\-]?\s*([A-Z][A-Z' -]+),\s*([A-Z][A-Z' -]+)/i);
  if (who) return title(`${who[2].trim()} ${who[1].trim()}`);
  const given = valueAfter(lines, /(?:first\s*\(given\)\s*name|given\s*names?(?:\s*\(s\))?|first\s*name)/i);
  const sur = valueAfter(lines, /(?:last\s*\(surname\)(?:\s*name)?|last\s*\/\s*surname|last\s*name|family\s*name|surname)/i);
  if (given || sur) {
    const full = [given, sur].filter(Boolean).map((x) => x!.split(/\s{2,}/)[0]).join(' ');
    if (full.length >= 2) return title(full);
  }
  const ben = text.match(/beneficiary\s*[:\-]?\s*([A-Z][A-Z' -]+),\s*([A-Z][A-Z' -]+)/i);
  if (ben) return title(`${ben[2]} ${ben[1]}`);
  return undefined;
}

// What an I-129 / I-539 notice is for. Amendment first: an amended petition can also extend the stay.
function petitionKind(U: string): Found['petitionKind'] {
  // ("…Act, as amended" is boilerplate, not an amended petition.)
  if (/\bAMEND|CHANGE IN PREVIOUSLY APPROVED EMPLOYMENT/.test(U.replace(/AS AMENDED/g, ''))) return 'amendment';
  if (/CHANGE OF EMPLOYER|NEW CONCURRENT EMPLOYMENT/.test(U)) return 'transfer';
  if (/NEW EMPLOYMENT/.test(U)) return 'new';
  if (/EXTENSION OF STAY|CONTINUATION OF PREVIOUSLY APPROVED EMPLOYMENT|EXTEND STAY|EXTENSION/.test(U)) return 'extension';
  return undefined;
}
// "Work location: Frisco, TX" / "Place of employment" (same line or the next).
function workLocation(text: string): Found['workLocation'] {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:work\s*location|place\s*of\s*employment|worksite(?:\s*address)?|work\s*site)\s*[:\-]?\s*(.*)$/i);
    if (!m) continue;
    for (const v of [m[1], lines[i + 1] ?? '', lines[i + 2] ?? '']) {
      const c = v.match(/([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Za-z]{2})\b(?![a-z])/);
      if (c) return { city: title(c[1].replace(/^.*\d+\s+[^,]*\s{2,}/, '').trim()), state: c[2].toUpperCase() };
    }
  }
  return undefined;
}

// A date under a column label: "Date of Issue   Date of Expiry" with "06/02/2017   05/02/2027" on the next
// line. The value is on the same line after the label, or in the matching column on the next lines.
function columnDate(text: string, label: RegExp, others: RegExp[], latestOnLine = false): string | undefined {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const at = m.index ?? 0;
    const rest = lines[i].slice(at + m[0].length);
    // same line, before the next label
    const cut = others.map((o) => rest.search(o)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
    const same = datesIn(cut === undefined ? rest : rest.slice(0, cut))[0];
    if (same) return same;
    // column: how many other date labels come before this one on the label line
    const col = others.filter((o) => { const k = lines[i].search(o); return k >= 0 && k < at; }).length;
    const more = others.some((o) => { const k = lines[i].search(o); return k > at; });
    for (const next of lines.slice(i + 1, i + 3)) {
      const ds = datesIn(next);
      if (!ds.length) continue;
      // An expiry is always the latest of the dates in its row (issue and birth dates come first).
      if (latestOnLine && ds.length > 1) return [...ds].sort().pop();
      if (ds.length > col) return ds[col];
      if (!col || more) return undefined; // the one date there belongs to another column
      return undefined;
    }
  }
  return undefined;
}
// Blanket L Form I-129S (filled by the employer, endorsed by the consulate) — not a USCIS notice.
function readI129S(T: string, found: Found) {
  found.type = 'I-129S (blanket L)';
  found.validFrom = dateAfter(T, /2\.?\s*a\.?\s*start date(?:\s*\(mm\/dd\/yyyy\))?/i) ?? dateAfter(T, /start date(?:\s*\(mm\/dd\/yyyy\))?/i);
  found.validTo = dateAfter(T, /2\.?\s*b\.?\s*end date(?:\s*\(mm\/dd\/yyyy\))?/i) ?? dateAfter(T, /end date(?:\s*\(mm\/dd\/yyyy\))?/i);
  if (!found.validTo) {
    const m = T.match(/(?:intended employment|employment)[\s\S]{0,60}?from[\s\S]{0,30}?(\S+\s?\S*\s?\S*)[\s\S]{0,30}?to\s*[:\-]?\s*(.+)/i);
    if (m) { found.validFrom ||= datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
  }
  // Never the form's own edition / OMB expiry: fall back to the latest date after "Dates of Proposed Employment".
  if (!found.validTo) { const k = T.search(/dates of proposed employment/i); if (k >= 0) found.validTo = datesIn(T.slice(k, k + 400)).sort().pop(); }
  const nameAfter = (re: RegExp) => {
    const lines = T.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      for (const v of [lines[i].slice((m.index ?? 0) + m[0].length), ...lines.slice(i + 1, i + 4)]) {
        const x = v.replace(/^\s*\((?:last|first) name\)/i, '').replace(/^[\s:|.\-\[\\]*/, '').replace(/^[a-z|\[\]]+(?=[A-Z]{2})/, '').replace(/[|\]].*$/, '').trim();
        if (/^\d|\b(?:[2-9]|1\d)\.?\s*[a-z]\./i.test(x)) break; // the next numbered item — this field is blank
        if (/^[A-Za-z][A-Za-z' -]{1,40}$/.test(x) && !/name|date|number/i.test(x)) return x;
      }
    }
    return undefined;
  };
  const fam = nameAfter(/4\.?\s*a\.?\s*family name(?:\s*\(last name\))?/i), giv = nameAfter(/4\.?\s*b\.?\s*given name(?:\s*\(first name\))?/i);
  if (fam || giv) found.name = title([giv, fam].filter(Boolean).join(' '));
  const emp = nameAfter(/name of the petitioning organi[sz]ation/i);
  if (emp) found.employer = emp.replace(/\s{2,}.*$/, '');
  // L class: the checked box ("[X] Specialized Knowledge Professional (L-1B)").
  const box = (re: RegExp) => { const l = T.split('\n').find((x) => re.test(x)); return l ? /\[\s*[xX✓✔]\s*\]|☒|☑|■/.test(l.slice(0, l.search(re))) : false; };
  const a = box(/manager or executive/i), b = box(/specialized knowledge/i);
  found.classOfAdmission = a && !b ? 'L1A' : b && !a ? 'L1B' : undefined;
}

// ---------- document understanding ----------
export function parseDocument(text: string): Found {
  const T = text.replace(/\r/g, '');
  const U = T.toUpperCase();
  const found: Found = { lines: T.split('\n').length };
  DAY_FIRST = /REPUBLIC OF INDIA|P<IND|<IND|BHARAT|GOVERNMENT OF INDIA|UNITED KINGDOM|CANADA|MEXICO|PHILIPPINES|NEPAL|SRI LANKA/.test(U) && !/I-797|I-94|USCIS|DEPARTMENT OF HOMELAND/.test(U);

  found.receipt = U.match(/\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)\s?-?(\d{10})\b/)?.slice(1, 3).join('');
  const cls = U.match(/CLASS(?: OF ADMISSION)?\s*[:\-]?\s*(H-?1B1?|H-?4|L-?1A|L-?1B|L-?2S?|TN|TD|F-?1|E-?3|O-?1)\b/);
  if (cls) found.classOfAdmission = cls[1].replace('-', '');
  const cat = U.match(/CATEGORY\s*[:\-]?\s*([AC]\s?\d{1,2}\s?[A-Z]?)\b/);
  if (cat) found.category = cat[1].replace(/\s/g, '');

  // A visa foil can mention the I-129S in its annotation ("MUST PRESENT I-129S AT POE") — it's still a visa.
  const visaFoil = mrz(T)?.kind === 'V' || (/VISA TYPE|VISA\s*\/\s*CLASS|CONTROL NUMBER|ANNOTATION/.test(U) && /EXPIRATION|ISSUE DATE|ENTRIES/.test(U));
  // The I-129S form (not a notice): checked before the notices. A scanned packet may carry the I-797 after it.
  const s129 = U.search(/FORM I-129S|USCIS FORM I-129S|BASED ON BLANKET L PETITION/), noa = U.search(/NOTICE OF ACTION/);
  if (!visaFoil && s129 >= 0 && (noa < 0 || s129 < noa)) {
    readI129S(T, found);
  // USCIS notices (I-797 / I-797A / I-797B / I-797C) come first: an I-797A has an I-94 printed on it, so
  // it would otherwise look like an I-94.
  } else if (/NOTICE OF ACTION|I-797[ABC]?\b|APPROVAL NOTICE|RECEIPT NOTICE/.test(U) && /RECEIPT NUMBER|CASE TYPE|NOTICE TYPE|NOTICE DATE|RECEIPT #/.test(U)) {
    const approval = /APPROVAL NOTICE|NOTICE TYPE\s*:?\s*APPROVAL|HAS BEEN APPROVED|HAVE BEEN APPROVED|I-797A|I-797B/.test(U) && !/NOTICE TYPE\s*:?\s*RECEIPT/.test(U);
    found.type = approval ? 'Approval (I-797A/B)' : 'Receipt (I-797C)';
    found.receivedDate = dateAfter(T, /received date|receipt date/i);
    found.noticeDate = dateAfter(T, /notice date/i);
    found.petitionKind = petitionKind(U);
    const pet = T.match(/petitioner\s*(?:name)?\s*[:\-]?[ \t]*([A-Za-z0-9][A-Za-z0-9&.,' -]{2,60})/i)?.[1]?.trim();
    if (pet && !/^(name|beneficiary)\b/i.test(pet)) found.employer = pet.replace(/\s{2,}.*$/, '');
    found.workLocation = workLocation(T);
    const form = U.match(/CASE TYPE\s*[:\-]?\s*(I-?\d{3}[A-Z]?|N-?\d{3})\b/) ?? U.match(/\b(I-?\d{3}[A-Z]?)\s*-\s*(?:PETITION|APPLICATION|IMMIGRANT|NONIMMIGRANT)/) ?? U.match(/\bFORM\s*[:\-]?\s*(I-?\d{3}[A-Z]?)\b/);
    if (form) found.form = form[1].replace(/^([IN])-?/, '$1-');
    if (approval) {
      // "Valid from 07/01/2023 to 06/30/2026" — on one line or spread over several.
      const vf = U.search(/VALID FROM/);
      if (vf >= 0) { const d = datesIn(T.slice(vf, vf + 120)); found.validFrom = d[0]; found.validTo = d[1]; }
      found.validTo ||= dateAfter(T, /valid to|until/i);
      // The I-94 at the bottom of an extension / change-of-status approval (not on consular I-797B).
      const tear = U.search(/DEPARTURE RECORD|ARRIVAL[-\s\/]*DEPARTURE|DEPARTURE NUMBER|ADMISSION NUMBER|I-94 NUMBER|I-94 BELOW/);
      if (tear >= 0 && !/CONSULAR NOTIFICATION|I-797B/.test(U)) {
        const part = T.slice(tear);
        // Its own "until" date if printed (it can end earlier than the petition, e.g. passport expiry);
        // otherwise the I-94 runs to the approval's end date. Birth dates on it are ignored.
        const own = dateAfter(part, /valid until|admit until|until|valid to/i);
        found.i94Until = own && (!found.validFrom || own >= found.validFrom) ? own : found.validTo;
      }
    }
  } else if (/ADMIT\s*UNT[IL1]{2}|MOST RECENT DATE OF ENTRY|I-94 RECORD NUMBER|ADMISSION \(I-94\) RECORD/.test(U)) {
    found.type = 'I-94';
    found.validTo = dateAfter(T, /admit\s*unt[il1]{2}(?:\s*date)?\s*[:\-]?/i);
    // The issue date of this I-94: the CBP printout's most recent entry (decides which I-94 is current).
    found.entryDate = dateAfter(T, /most recent date of entry|arrival\s*\/\s*issued date|date of (?:most recent )?entry|entry date|admission date|issued date/i);
    found.classOfAdmission ||= U.match(/CLASS OF ADMISSION\s*[:\-]?\s*([A-Z0-9-]{2,4})\b/)?.[1].replace('-', '');
  } else if (/EMPLOYMENT AUTHORI[SZ]ATION|CARD EXPIRES|I-766/.test(U) && !/I-797/.test(U)) {
    found.type = 'EAD card';
    found.validFrom = dateAfter(T, /valid from\s*[:\-]?/i);
    found.validTo = dateAfter(T, /card expires\s*[:\-]?|expires\s*[:\-]?/i);
  } else if (visaFoil) {
    // US visa foil — checked before passports (it says "Passport Number") and before the blanket-L
    // check (its annotation can say "BLANKET L2").
    found.type = 'Visa stamp';
    const m = mrz(T);
    // Expiry: the MRZ, then the "Expiration Date" label, then the latest date that isn't the petition
    // expiry ("PED-21JUL2027" in the annotation is the employer's petition, not the visa).
    const noPed = T.replace(/PED\s*[-:]?\s*\S+/gi, ' ');
    const VL = [/issue date/i, /expiration date|expiry date/i];
    found.issueDate = columnDate(noPed, VL[0], [VL[1]]);
    found.birthDate = m?.birth ?? dateAfter(noPed, /birth date|date of birth/i);
    const ok = (d?: string) => !!d && d !== found.issueDate && d !== found.birthDate && (!found.issueDate || d > found.issueDate);
    found.validTo = [m?.expiry, columnDate(noPed, VL[1], [VL[0]], true), latest(noPed)].find(ok);
    // Class only from the MRZ, or "Visa Type / Class" followed by "R L2" (annotation code + class).
    const CL = '(H-?1B|H-?4|L-?1|L-?2|F-?1|F-?2|J-?1|J-?2|TD|TN|O-?1|E-?3|B-?1\\/?B-?2|B-?1|B-?2)';
    let c = m?.cls;
    if (!c) {
      const lines = U.split('\n');
      const at = lines.findIndex((l) => /VISA\s*TYPE\s*\/?\s*CLASS/.test(l));
      if (at >= 0) for (const l of [lines[at].replace(/.*VISA\s*TYPE\s*\/?\s*CLASS/, ''), ...lines.slice(at + 1, at + 4)]) {
        const k = l.match(new RegExp(`(?:^|\\s)[A-Z]\\s+${CL}\\s*$`));
        if (k) { c = k[1]; break; }
      }
    }
    found.classOfAdmission = c?.replace(/-/g, '').replace('/', '');
    if (/BLANKET\s*L/.test(U)) found.blanket = true;
    // "P#-WAC…" on a visa is the employer's petition receipt — not this person's case.
    found.receipt = undefined;
  } else if (/I-129S|BASED ON BLANKET L PETITION|BLANKET L/.test(U)) {
    // Blanket L: the I-129S (endorsed by the consulate/CBP) sets the period — there's no individual I-797.
    readI129S(T, found);
    found.validTo ||= latest(T);
  } else if (/PASSPORT|P<[A-Z]{3}/.test(U) || mrz(T)?.kind === 'P') {
    found.type = 'Passport';
    // The "Date of Expiry" label first, then the MRZ, then the latest date — never the issue date.
    const PL = [/date of issue|issue date/i, /date of expiry|expiry date|date d'expiration/i, /date of birth|birth date/i];
    found.issueDate = columnDate(T, PL[0], [PL[1], PL[2]]);
    const birth = mrz(T)?.birth ?? dateAfter(T, /date of birth|birth date/i);
    const cands = [columnDate(T, PL[1], [PL[0], PL[2]], true), mrz(T)?.expiry, latest(T)];
    found.validTo = cands.find((d) => d && d !== found.issueDate && d !== birth && (!found.issueDate || d > found.issueDate));
    found.passportExpiry = found.validTo;
    const old = U.match(/OLD PASSPORT\s*N[O0]\.?[^\n]*\n?[^\n]*?\b([A-Z]\d{7})\b/);
    if (old) found.oldPassportNo = old[1];
    // Birth date: MRZ, a "Date of Birth" label, or the earliest date on the page.
    found.birthDate = mrz(T)?.birth ?? dateAfter(T, /date of birth|birth date/i) ?? datesIn(T).sort()[0];
  } else if (/LABOR CONDITION APPLICATION|ETA[- ]9035/.test(U)) {
    found.type = 'LCA';
    const m = T.match(/(?:period of employment|begin date)[\s\S]{0,80}?((?:\d{1,2}\/\d{1,2}\/\d{4}))[\s\S]{0,60}?((?:\d{1,2}\/\d{1,2}\/\d{4}))/i);
    if (m) { found.validFrom = datesIn(m[1])[0]; found.validTo = datesIn(m[2])[0]; }
  }
  const form = U.match(/(?:CASE TYPE|FORM)\s*[:\-]?\s*(I-?\d{3}[A-Z]?|N-?\d{3})\b/);
  if (form && /I-797|NOTICE|RECEIPT|APPROVAL/.test(U)) found.form = form[1].replace(/^([IN])-?/, '$1-');
  // Who it belongs to: passport number and birth date (MRZ, or labels on I-94 printouts and EAD cards).
  if (found.type === 'Passport' || found.type === 'Visa stamp' || found.type === 'I-94' || found.type === 'EAD card' || !found.type) {
    const m = mrz(T);
    found.passportNo = m?.docNo ?? U.match(/(?:PASSPORT\s*(?:NO|NUMBER|#)|DOCUMENT\s*(?:NO|NUMBER))\.?\s*[:\-]?\s*\n?\s*([A-Z]?\d{7,9})\b/)?.[1];
    if (found.oldPassportNo === found.passportNo) found.oldPassportNo = undefined;
    found.birthDate ||= m?.birth ?? dateAfter(T, /date of birth|birth date/i);
  }
  // Visa annotations ("PA:KUMAR, RAJAN", "P#-…", "PED-…", "PN-…") name the principal / petition — not this person.
  const forName = T.split('\n').filter((l) => !/^\s*(?:PA\s*:|P#|PED|PN\s*-|PETITIONER\s*:|BLANKET)/i.test(l) && !/\bPA\s*:/i.test(l)).join('\n');
  // (The I-129S has many other name fields — preparer, interpreter — so it never falls back to labels.)
  const nm = found.name ?? (found.type === 'I-129S (blanket L)' ? undefined : mrzName(forName) ?? labelledName(forName));
  if (nm && nm.length >= 3 && nm.length <= 60) found.name = nm;
  return found;
}

// Which "My Status" fields this document can fill
export type StatusUpdate = { field: 'i94Expiry' | 'i94IssuedOn' | 'i94Class' | 'petitionEnd' | 'approvalNoticeDate' | 'eadExpiry' | 'passportExpiry' | 'visaStampExpiry' | 'extReceipt' | 'extFiled' | 'extKind'; label: string; value: string | undefined };
// What a document changes in its person's record. A value of undefined clears the field (an approved
// extension is no longer pending).
export function statusUpdates(f: Found): StatusUpdate[] {
  const u: StatusUpdate[] = [];
  const statusForm = !f.form || f.form === 'I-129' || f.form === 'I-539' || f.form === 'I-129S';
  // An I-94 comes with its issue date and class (label '' = not shown on its own).
  if (f.type === 'I-94' && f.validTo) {
    u.push({ field: 'i94Expiry', label: 'I-94 admit until', value: f.validTo });
    u.push({ field: 'i94IssuedOn', label: '', value: f.entryDate });
    u.push({ field: 'i94Class', label: '', value: f.classOfAdmission });
  }
  if (f.type === 'Approval (I-797A/B)') {
    if (statusForm && f.validTo) { u.push({ field: 'petitionEnd', label: 'Approval valid to', value: f.validTo }); u.push({ field: 'approvalNoticeDate', label: '', value: f.noticeDate }); }
    if (statusForm && f.i94Until) {
      u.push({ field: 'i94Expiry', label: 'I-94 admit until', value: f.i94Until });
      u.push({ field: 'i94IssuedOn', label: '', value: f.noticeDate });
      u.push({ field: 'i94Class', label: '', value: f.classOfAdmission });
    }
    if (f.form === 'I-765' && f.validTo) u.push({ field: 'eadExpiry', label: 'EAD valid to', value: f.validTo });
    // An approved extension / change of status is no longer pending.
    if (statusForm && f.validTo) { u.push({ field: 'extFiled', label: 'Pending extension cleared', value: undefined }); u.push({ field: 'extReceipt', label: '', value: undefined }); u.push({ field: 'extKind', label: '', value: undefined }); }
  }
  if (f.type === 'I-129S (blanket L)' && f.validTo) u.push({ field: 'petitionEnd', label: 'I-129S period ends', value: f.validTo });
  if (f.type === 'EAD card' && f.validTo) u.push({ field: 'eadExpiry', label: 'EAD valid to', value: f.validTo });
  if (f.type === 'Passport' && f.validTo) u.push({ field: 'passportExpiry', label: 'Passport expires', value: f.validTo });
  if (f.type === 'Visa stamp' && f.validTo) u.push({ field: 'visaStampExpiry', label: 'Visa stamp expires', value: f.validTo });
  // Only an extension / change of status (I-129, I-539) is a pending stay; I-765, I-140, I-485… are tracked as cases.
  if (f.type === 'Receipt (I-797C)' && statusForm) {
    if (f.receipt) u.push({ field: 'extReceipt', label: 'Extension receipt', value: f.receipt });
    if (f.receivedDate) u.push({ field: 'extFiled', label: f.petitionKind === 'amendment' ? 'Amendment filed' : f.petitionKind === 'transfer' ? 'Transfer filed' : 'Extension filed', value: f.receivedDate });
    u.push({ field: 'extKind', label: '', value: f.petitionKind ?? 'extension' });
  }
  return u;
}
