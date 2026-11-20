// Low-level helpers for reading phone-OCR text: dates, labelled values, table cells, the
// passport/visa machine-readable zone (MRZ) and printed names. Tolerant of common OCR slips
// (O↔0, I/l↔1, S↔5, '<' read as 'K' or '«').

import type { ISODate } from '../dates';
import { today } from '../dates';

// ---------- dates ----------
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

export function ymd(y: number, m: number, d: number): ISODate | undefined {
  if (y < 100) y += y > 60 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Every date in a piece of text, in reading order. dayFirst: the document writes DD/MM/YYYY
 * (Indian and most non-US documents); US forms write MM/DD/YYYY.
 */
export function datesIn(s: string, dayFirst = false): ISODate[] {
  const out: { i: number; v: string }[] = [];
  const add = (i: number, v?: string) => { if (v) out.push({ i, v }); };
  const T = s.toUpperCase()
    .replace(/\b(\d{1,2})\s?([A-Z0-9]{3,4})\s?(\d{2,4})\b/g, (all, d, mon, y) => {
      const fixed = mon.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');
      return MONTHS[fixed] ? `${d} ${fixed} ${y}` : all;
    })
    .replace(/(\d)\s*([\/\-.])\s*(\d)/g, '$1$2$3');
  const numeric = (i: number, a: number, b: number, y: number) => {
    const df = a > 12 || (dayFirst && b <= 12);
    add(i, df ? ymd(y, b, a) : ymd(y, a, b));
  };
  for (const m of T.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g)) numeric(m.index!, +m[1], +m[2], +m[3]);
  for (const m of T.matchAll(/(?<![\d\/])(\d{1,2})\/(\d{1,2})\/(\d{2})(?![\d\/])/g)) numeric(m.index!, +m[1], +m[2], +m[3]);
  for (const m of T.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index!, ymd(+m[1], +m[2], +m[3]));
  for (const m of T.matchAll(/\b(\d{1,2})\s?([A-Z]{3,9})\.?\s?(\d{4}|\d{2})\b/g)) if (MONTHS[m[2]]) add(m.index!, ymd(+m[3], MONTHS[m[2]], +m[1]));
  for (const m of T.matchAll(/\b([A-Z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g)) if (MONTHS[m[1]]) add(m.index!, ymd(+m[3], MONTHS[m[1]], +m[2]));
  for (const m of T.matchAll(/\b(\d{4})\s([A-Z]{3,9})\.?\s(\d{1,2})\b/g)) if (MONTHS[m[2]]) add(m.index!, ymd(+m[1], MONTHS[m[2]], +m[3]));
  return out.sort((a, b) => a.i - b.i).map((x) => x.v);
}

export const latestDate = (s: string, dayFirst = false) => datesIn(s, dayFirst).sort().pop();

/** First date after a label: on the same line, else on the next line. */
export function dateAfter(text: string, label: RegExp, dayFirst = false): ISODate | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length);
    const d = datesIn(rest, dayFirst)[0] ?? datesIn(lines[i + 1] ?? '', dayFirst)[0];
    if (d) return d;
  }
  return undefined;
}

/**
 * A date under a column label: "Date of Issue   Date of Expiry" then "06/02/2017   05/02/2027".
 * latestOnLine: the wanted date is the latest in its row (an expiry).
 */
export function columnDate(text: string, label: RegExp, others: RegExp[], latestOnLine = false, dayFirst = false): ISODate | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const at = m.index ?? 0;
    const rest = lines[i].slice(at + m[0].length);
    const cut = others.map((o) => rest.search(o)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
    const same = datesIn(cut === undefined ? rest : rest.slice(0, cut), dayFirst)[0];
    if (same) return same;
    const col = others.filter((o) => { const k = lines[i].search(o); return k >= 0 && k < at; }).length;
    for (const next of lines.slice(i + 1, i + 3)) {
      const ds = datesIn(next, dayFirst);
      if (!ds.length) continue;
      if (latestOnLine && ds.length > 1) return [...ds].sort().pop();
      if (ds.length > col) return ds[col];
      return undefined;
    }
  }
  return undefined;
}

// ---------- labelled values ----------
/**
 * A text cell in a USCIS notice table: "Petitioner: ACME INC" on the same line, or the cell in the
 * label's column on the line below ("Received Date   Priority Date   Petitioner" / "04/14/2025   ACME INC").
 */
export function tableValue(text: string, label: RegExp): string | undefined {
  const lines = text.split('\n');
  const isCell = (x: string) => /[A-Za-z]{2}/.test(x) && !datesIn(x).length && !/^\d+\s*of\s*\d+$/i.test(x) && !/^[A-Z]{3}\d{10}$/.test(x.replace(/\s/g, ''));
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const col = m.index ?? 0;
    const rest = lines[i].slice(col + m[0].length).replace(/^[\s:\-]+/, '');
    const same = rest.split(/\s{2,}|\t/)[0]?.trim();
    if (same && isCell(same) && !/\b(date|page|beneficiary|applicant|notice|receipt|priority)\b/i.test(same)) return same;
    const next = lines.slice(i + 1, i + 3).find((l) => l.trim());
    if (!next) continue;
    const cells = [...next.matchAll(/\S+(?: \S+)*/g)].map((c) => ({ at: c.index ?? 0, v: c[0].trim() })).filter((c) => isCell(c.v));
    if (!cells.length) continue;
    const near = cells.filter((c) => Math.abs(c.at - col) <= 6);
    return (near[0] ?? cells[cells.length - 1]).v;
  }
  return undefined;
}

/** Plain text after a label on the same line, or the next non-empty line. */
export function textAfter(text: string, label: RegExp, accept: RegExp = /\S/): string | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:\-]+/, '').split(/\s{3,}/)[0].trim();
    if (rest && accept.test(rest)) return rest;
    const next = lines.slice(i + 1, i + 3).map((l) => l.trim()).find(Boolean);
    if (next && accept.test(next)) return next.split(/\s{3,}/)[0].trim();
  }
  return undefined;
}

/** A token under a column header: "USCIS#   Category   Card#" then "218-473-112   C03B   IOE…". */
export function columnToken(text: string, label: RegExp, accept: RegExp): string | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const same = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:\-]+/, '').split(/\s+/)[0];
    if (same && accept.test(same)) return same;
    const next = lines.slice(i + 1, i + 3).find((l) => l.trim());
    if (!next) continue;
    const toks = [...next.matchAll(/\S+/g)].map((t) => ({ at: t.index ?? 0, v: t[0] })).filter((t) => accept.test(t.v));
    if (!toks.length) continue;
    const col = m.index ?? 0;
    return [...toks].sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0].v;
  }
  return undefined;
}

// ---------- names ----------
export const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();

/** Edit distance ≤ 1. */
export function oneOff(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) return [...a].filter((c, i) => c !== b[i]).length === 1;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true;
  return false;
}

const NOT_NAME = /\b(NATIONALITY|SEX|DATE|BIRTH|PLACE|ISSUE|EXPIRY|PASSPORT|REPUBLIC|INDIA|UNITED|STATES|TYPE|CODE|COUNTRY|AUTHORITY|SIGNATURE|NAME|SURNAME|GIVEN)\b/;

function valueAfter(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).split('/')[0].replace(/^[\s:\-()s]*/, '').trim().split(/\s{3,}/)[0];
    if (/^[A-Z][A-Z' -]{1,40}$/.test(rest) && !NOT_NAME.test(rest)) return rest;
    for (const next of lines.slice(i + 1, i + 4)) {
      const v = next.trim();
      if (!v) continue;
      if (/SURNAME|GIVEN|\bNAME/.test(v.toUpperCase())) break; // next name label: this field is blank
      if (NOT_NAME.test(v.toUpperCase())) continue;
      if (/^[A-Z][A-Z' -]{1,40}$/.test(v)) return v;
      // OCR noise after the name on a visa foil or passport ("THARA DHIYANA “Rte"): the capitalised words first
      // (short scraps with lower case or punctuation before it, "be, MAYA" or "ee _ RAVI", are OCR noise
      // from the foil's background; an all-capitals short word such as LI or WU is kept as a name)
      const pre = v.replace(/^(?:(?=\S*[^A-Z\s])\S{1,3}\s+){1,3}(?=[A-Z]{2})/, '').match(/^([A-Z][A-Z'-]+(?: [A-Z][A-Z'-]+)*)(?=\s|$)/)?.[1];
      if (pre && pre.replace(/[^A-Z]/g, '').length >= 3 && pre.split(' ').every((w) => w.length >= 2) && !NOT_NAME.test(pre)) return pre;
    }
  }
  return undefined;
}

/** "Beneficiary: KUMAR, ASHA", or Given name + Surname labels (same line or the line below). */
export function labelledName(text: string): string | undefined {
  const lines = text.split('\n');
  const who = text.match(/(?:beneficiary|applicant)\s*(?:name)?\s*[:\-]?\s*([A-Z][A-Z' -]+),\s*([A-Z][A-Z' -]+)/i);
  if (who) return titleCase(`${who[2].trim()} ${who[1].trim()}`);
  const given = valueAfter(lines, /(?:first\s*\(given\)\s*name|given\s*names?(?:\s*\(s\))?|first\s*name)/i);
  const sur = valueAfter(lines, /(?:last\s*\(surname\)(?:\s*name)?|last\s*\/\s*s[uv][rm]n?[ae]me|last\s*name|family\s*name|surname(?:\s*\/\s*primary\s*name)?)/i);
  if (given || sur) {
    const full = [given, sur].filter(Boolean).map((x) => x!.split(/\s{2,}/)[0]).join(' ');
    if (full.length >= 2) return titleCase(full);
  }
  return undefined;
}

// ---------- MRZ ----------
const DIG: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

/** ICAO 9303 check digit (weights 7-3-1). */
export function checkDigit(field: string) {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const ch = field[i];
    const v = /\d/.test(ch) ? +ch : /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : 0;
    sum += v * [7, 3, 1][i % 3];
  }
  return sum % 10;
}

export type MRZ = { kind: 'P' | 'V'; expiry?: ISODate; birth?: ISODate; cls?: string; docNo?: string; nationality?: string };

/** Passport ("P<…") or US visa ("V<…") machine-readable zone. Dates only when their check digit agrees. */
export function readMRZ(text: string): MRZ | null {
  const lines = text.toUpperCase().split('\n').map((l) => l.replace(/\s/g, '').replace(/[«‹(){}\[\]|]/g, '<')).filter((l) => /^[A-Z0-9<]{30,46}$/.test(l));
  const i = lines.findIndex((l) => /^[PV][A-Z<]/.test(l) && l.includes('<'));
  if (i < 0) return null;
  const kind = lines[i][0] as 'P' | 'V';
  const l2 = lines[i + 1];
  if (!l2) return { kind };
  const okCheck = (field: string, check?: string) => { const c = DIG[check ?? ''] ?? check; return !c || !/^\d$/.test(c) || checkDigit(field) === +c; };
  const digits = (s: string) => s.split('').map((c) => DIG[c] ?? c).join('');
  const e = digits(l2.slice(21, 27));
  const expiry = /^\d{6}$/.test(e) && okCheck(e, l2[27]) ? ymd(2000 + +e.slice(0, 2), +e.slice(2, 4), +e.slice(4, 6)) : undefined;
  const b0 = digits(l2.slice(13, 19));
  const b = okCheck(b0, l2[19]) ? b0 : '';
  const yy = +today().slice(2, 4);
  const birth = /^\d{6}$/.test(b) ? ymd((+b.slice(0, 2) > yy ? 1900 : 2000) + +b.slice(0, 2), +b.slice(2, 4), +b.slice(4, 6)) : undefined;
  const cls = kind === 'V' ? l2.slice(28, 32).match(/^(H1B|H4|L1|L2|F1|F2|J1|J2|TD|TN|O1|E3|B1|B2|R)/)?.[1] : undefined;
  const docNo = l2.slice(0, 9).replace(/<+$/, '').replace(/</g, '');
  const nat = l2.slice(10, 13).replace(/</g, '');
  return {
    kind, expiry, birth,
    cls: cls === 'R' ? undefined : cls,
    docNo: /^[A-Z0-9]{6,9}$/.test(docNo) && /\d/.test(docNo) ? docNo : undefined,
    nationality: /^[A-Z]{3}$/.test(nat) ? nat : undefined,
  };
}

function mrzLine(raw: string) {
  return raw.toUpperCase().replace(/\s/g, '').replace(/[«‹(){}\[\]|]/g, '<')
    .replace(/<[<K]{3,}/g, (m) => '<'.repeat(m.length))
    .replace(/K{2,}(?=<)/g, (m) => '<'.repeat(m.length))
    .replace(/K{5,}/g, (m) => '<'.repeat(m.length));
}

/**
 * Name from MRZ line 1, cross-checked with the printed (visual) zone: a word misread by one
 * letter takes the printed spelling, filler read as K is dropped, run-together words are split.
 */
export function mrzName(text: string): string | undefined {
  const lines = text.split('\n').map(mrzLine);
  const l = lines.find((x) => /^[PV][A-Z<0]?[A-Z]{3}[A-Z<]{6,}$/.test(x.replace(/<+$/, '')) && x.length >= 20 && x.includes('<'));
  if (!l) return undefined;
  const plain = text.toUpperCase().split('\n').filter((x) => !x.includes('<')).join(' ');
  const words = new Set(plain.split(/[^A-Z]+/).filter((w) => w.length >= 2));
  const visual = [...words];
  const body = l.slice(5).replace(/[^A-Z<]/g, '').replace(/<K(?=<)/g, '<<')
    .replace(/(^|<)K([A-Z]+)/g, (all, pre, rest) => (/^[^AEIOUHRYLWS]/.test(rest) || (words.has(rest) && !words.has('K' + rest)) ? `${pre}<${rest}` : all));
  const cut = body.indexOf('<<');
  const sur = cut >= 0 ? body.slice(0, cut) : '';
  const giv = cut >= 0 ? body.slice(cut + 2) : body;
  const exactish = (w: string) => {
    if (words.has(w)) return w;
    for (let i = 0; i + 1 < visual.length; i++) if (visual[i] + visual[i + 1] === w && visual[i].length >= 2 && visual[i + 1].length >= 3) return `${visual[i]} ${visual[i + 1]}`;
    return undefined;
  };
  const mFix = (w: string) => (/^N/.test(w) && new RegExp(`(?:^|[^A-Z])(?:11|1I|I1|IL|LI|IJ|1J)\\.?${w.slice(1)}\\b`).test(plain) ? 'M' + w.slice(1) : undefined);
  const near = (w: string): string | undefined => {
    const fixed = mFix(w);
    if (fixed) return fixed;
    const e = exactish(w) ?? (w.length > 4 && /[KSXC]$/.test(w) ? exactish(w.replace(/[KSXC]{1,3}$/, '')) : undefined);
    if (e) return e;
    const same = visual.filter((x) => x.length === w.length && x.length >= 3 && oneOff(x, w));
    if (same.length === 1) return same[0];
    if (visual.some((x) => x.length >= 3 && oneOff(x, w))) return w;
    return undefined;
  };
  const all = (giv + '<' + sur).replace(/<+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 3);
  const hasVisual = all.length > 0 && all.filter((w) => near(w)).length * 2 >= all.length;
  const junk = (w: string) => /^[KCXSE]+[A-Z]{0,3}$/.test(w) && /[KCX].*[KCX]/.test(w);
  const clean = (x: string) => x.replace(/<+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 2)
    .map((w) => (junk(w) ? undefined : hasVisual ? near(w) : near(w) ?? w)).filter(Boolean).join(' ');
  const full = [clean(giv), clean(sur)].filter(Boolean).join(' ');
  if (full.length < 2 || full.split(' ').some((w) => w.length > 20)) return undefined;
  return titleCase(full);
}

/** Visa annotations name the principal / petition, never the holder: strip them before reading names. */
export const withoutAnnotations = (t: string) =>
  t.split('\n').filter((l) => !/^\s*(?:PA\s*:|P#|PED|PN\s*-|PETITIONER\s*:|BLANKET)/i.test(l) && !/\bPA\s*:/i.test(l)).join('\n');

export const RECEIPT_RE = /\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)\s?-?(\d{10})\b/;
export const receiptIn = (U: string) => U.match(RECEIPT_RE)?.slice(1, 3).join('');

/** Countries whose documents write dates day-first. */
export const dayFirstCountry = (U: string) => /REPUBLIC OF INDIA|P<IND|<IND|BHARAT|GOVERNMENT OF INDIA|UNITED KINGDOM|CANADA|MEXICO|PHILIPPINES|NEPAL|SRI LANKA|AUSTRALIA/.test(U);
