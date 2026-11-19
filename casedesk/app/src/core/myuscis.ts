// myUSCIS "bring your own session" sync: pure parser, snapshot builder, diff engine, silent-update
// detection, merged timeline and notice checklist. No React, no network — tested in tests/myuscis.test.ts.
//
// The person signs in to my.uscis.gov in their OWN browser, opens the JSON links for their receipt,
// copies what the page shows and pastes (or imports) it here. Immigration Wallet never sees a
// password and never contacts USCIS. The JSON shapes are not documented by USCIS: everything below is
// defensive (wrapped `data` or flat objects, arrays, missing fields, renamed fields).
import type { Case, CaseStatus, DocType, Document } from './model';
import { decodeEvent, eventLabel, PUBLIC_KINDS, type CodeKind } from './myuscisCodes';

// ---------- links ----------
export const MYUSCIS_ACCOUNT_URL = 'https://my.uscis.gov/account';
export type PartKind = 'case' | 'receipt' | 'documents' | 'page' | 'live';
export type LinkInfo = { id: 'case' | 'notice' | 'receipt' | 'documents'; title: string; sub: string; url: string; path: string };
/** The four myUSCIS JSON links for a receipt (internal pages of myUSCIS; they need the session of the
 *  browser where the person signed in — the Safari app, not an in-app browser sheet). */
export function myuscisUrls(receipt: string): LinkInfo[] {
  const r = encodeURIComponent(receipt.trim().toUpperCase());
  const L = (id: LinkInfo['id'], title: string, sub: string, path: string): LinkInfo => ({ id, title, sub, path, url: `https://my.uscis.gov${path}` });
  return [
    L('case', 'Case status & history', 'Events, last update, flags', `/account/case-service/api/cases/${r}`),
    L('notice', 'Status notice', 'The status card myUSCIS shows', `/account/case-service/api/case_status/${r}`),
    L('receipt', 'Case location', 'Service center or field office', `/secure-messaging/api/case-service/receipt_info/${r}`),
    L('documents', 'Notices & documents', 'Receipt, approval and other notices', `/account/case-service/api/cases/${r}/documents`),
  ];
}
/** IOE = filed online: those cases live in the filer's myUSCIS account, so sync works best for them. */
export const isIOE = (receipt?: string) => /^IOE\d{10}$/.test((receipt ?? '').trim().toUpperCase());

// ---------- types ----------
/** Where a sync came from: myUSCIS JSON (Advanced), the myUSCIS case page text, or the official
 *  USCIS Case Status API through our server (Live check, opt-in). Each source is compared only with
 *  itself, so mixing them never shows made-up "new" events. */
export type Src = 'myuscis' | 'page' | 'live';
export type MyEvent = { code: string; date: string; text: string; kind: CodeKind; sure: boolean; known: boolean; src: Src };
export type MyDoc = { id?: string; title: string; type?: string; date?: string };
export type MyLocation = { office?: string; serviceCenter?: string; fieldOffice?: string; code?: string };
export type MyFlags = { cmsFailure?: boolean; closed?: boolean; acked?: boolean; actionRequired?: boolean; evidenceRequests?: number };
export type Stamp = { status?: string; actionCode?: string; updatedAt?: string; detail?: string };
export type MySnapshot = {
  receipt?: string;
  syncedAt: string; // when this sync was saved (ISO)
  parts: PartKind[]; // which payloads this sync read (the rest carried from the previous sync)
  form?: string; formName?: string; submittedAt?: string;
  updatedAt?: string; status?: string; actionCode?: string; detail?: string; // display: newest of the stamps
  stamps: Partial<Record<Src, Stamp>>;
  events: MyEvent[];
  location?: MyLocation;
  documents: MyDoc[];
  flags: MyFlags;
  concurrent?: string[];
  docsRead?: boolean; // a notices list has been read at least once (so new ones can be told apart)
};

export type ParseOk = { ok: true; kind: PartKind; receipt?: string; part: Partial<MySnapshot> };
export type FailKind = 'empty' | 'notSignedIn' | 'html' | 'malformed' | 'notMyuscis' | 'noData';
export type ParseFail = { ok: false; kind: FailKind; title: string; message: string; requestId?: string };
export type ParseResult = ParseOk | ParseFail;
export const srcOf = (k: PartKind): Src | undefined => (k === 'case' ? 'myuscis' : k === 'page' ? 'page' : k === 'live' ? 'live' : undefined);

// ---------- small helpers ----------
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' && isFinite(x) ? String(x) : undefined);
/** First non-empty string among keys (case-insensitive, also snake_case). */
function pick(o: Record<string, any>, keys: string[]): string | undefined {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase().replace(/_/g, ''), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase().replace(/_/g, ''));
    if (real === undefined) continue;
    const v = o[real];
    const s = str(v) ?? (isObj(v) ? str(v.title) ?? str(v.text) ?? str(v.name) ?? str(v.value) ?? str(v.description) : undefined);
    if (s) return s;
  }
  return undefined;
}
function pickBool(o: Record<string, any>, keys: string[]): boolean | undefined {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase().replace(/_/g, ''), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase().replace(/_/g, ''));
    if (real === undefined) continue;
    const v = o[real];
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 'Y' || v === 1) return true;
    if (v === 'false' || v === 'N' || v === 0) return false;
  }
  return undefined;
}
function pickArr(o: Record<string, any>, keys: string[]): any[] | undefined {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase().replace(/_/g, ''), k]));
  for (const k of keys) { const real = lower.get(k.toLowerCase()); if (real !== undefined && Array.isArray(o[real])) return o[real]; }
  return undefined;
}
const RECEIPT_RE = /\b([A-Z]{3}\d{10})\b/;
const normReceipt = (s?: string) => { const m = (s ?? '').toUpperCase().replace(/\s/g, '').match(RECEIPT_RE); return m?.[1]; };

/** A date/time string → ISO (keeps the time when there is one). Epoch millis/seconds accepted. */
export function normDate(x: unknown): string | undefined {
  if (typeof x === 'number' && isFinite(x)) { const ms = x > 1e12 ? x : x * 1000; const d = new Date(ms); return isNaN(+d) ? undefined : d.toISOString(); }
  const s = str(x);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{10,13}$/.test(s)) return normDate(Number(s));
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  if (!/\d{4}/.test(s)) return undefined;
  const d = new Date(s);
  return isNaN(+d) ? undefined : /T|\d:\d/.test(s) ? d.toISOString() : d.toISOString().slice(0, 10);
}
export const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const hasTime = (iso?: string) => !!iso && iso.length > 10;

// ---------- parsing ----------
const fail = (kind: FailKind, title: string, message: string, requestId?: string): ParseFail => ({ ok: false, kind, title, message, requestId });
export const NOT_SIGNED_IN = fail('notSignedIn', 'You’re not signed in', 'You’re not signed in — open myUSCIS first, sign in, then open the link again in the same browser and copy what it shows.');
export const NO_DATA_MESSAGE = 'myUSCIS didn’t return data for this link — this happens even for your own cases when the link is opened directly. Use Live check below or paste the status text from the myUSCIS case page.';
/** Why myUSCIS can answer {"data":null}: shown under the noData message, in plain words. */
export const NO_DATA_REASONS = [
  'The link was opened directly. myUSCIS’s own pages call these links with extra sign-in details, so a direct visit often comes back empty — even for a case you filed yourself.',
  'The case isn’t linked to the account you’re signed into. Common when an employer or attorney filed it: it lives in their account. Ask them for the receipt notice, or for a paper-filed case add it on myUSCIS with the Online Access Code.',
  'Your session expired. Open my.uscis.gov/account again, sign in, then reopen the link in the same browser.',
  'The case is very new or archived.',
];
const LOGIN_RE = /sign in|log in|login|password|two-step|verification code|okta|session (has )?expired|unauthori[sz]ed|access denied/i;

/** Pull the JSON out of what was pasted (Safari/Firefox viewers add words around it). */
function extractJSON(text: string): string | null {
  const a = text.search(/[{[]/);
  if (a < 0) return null;
  const close = text[a] === '{' ? '}' : ']';
  const b = text.lastIndexOf(close);
  return b > a ? text.slice(a, b + 1) : null;
}

/**
 * Read one pasted or imported payload. Never throws. Tells apart: nothing pasted, a login page or
 * other HTML, broken JSON, text that isn't from USCIS, and myUSCIS's empty answer
 * ({"data":null,"error":{…,"requestId":…}}) — which is NOT a status and never a change.
 * Plain text (no JSON) is read as the myUSCIS case page (status card, case history, documents).
 */
export function parseMyuscis(raw: string | null | undefined, hint?: PartKind): ParseResult {
  const text = String(raw ?? '').replace(/^﻿/, '').trim();
  if (!text) return fail('empty', 'Nothing to read', 'The clipboard is empty. Copy everything the page shows (Select All, Copy), then try again.');
  const looksHtml = /^</.test(text) || /<(html|body|head|form|div|script)[\s>]/i.test(text) || /<!doctype/i.test(text);
  if (looksHtml) return LOGIN_RE.test(text) ? NOT_SIGNED_IN : fail('html', 'That’s web page code, not the data', 'This looks like a web page’s code. Copy the text you see on the myUSCIS case page instead, or a JSON link’s answer.');
  const startsJson = /^[\s\S]{0,80}?[{[]\s*"/.test(text) || /^[{[]/.test(text);
  const json = startsJson ? extractJSON(text) : null;
  if (startsJson && !json) return fail('malformed', 'Part of the text is missing', 'The data looks cut off. Safari sometimes copies only part of a long page — use Select All, then Copy, and paste the full text again.');
  if (!json) {
    const page = parsePageText(text);
    if (page) return page;
    return LOGIN_RE.test(text) && text.length < 2000 ? NOT_SIGNED_IN : fail('notMyuscis', 'This isn’t USCIS case data', 'We couldn’t find a USCIS status, case history or notices in this. Copy the myUSCIS case page (status and case history), or a JSON link’s answer.');
  }
  let v: any;
  try { v = JSON.parse(json); } catch {
    return fail('malformed', 'Part of the text is missing', 'The data looks cut off. Safari sometimes copies only part of a long page — use Select All, then Copy, and paste the full text again.');
  }
  return parsePayload(v, hint);
}

/** Read already-parsed JSON (tests and file import share this). */
export function parsePayload(v: any, hint?: PartKind): ParseResult {
  if (v == null || (typeof v !== 'object')) return fail('notMyuscis', 'This isn’t myUSCIS data', 'This doesn’t look like what the myUSCIS links show.');
  // myUSCIS envelope: { data, error }. data:null = nothing came back for this link (see NO_DATA_REASONS).
  if (isObj(v) && 'data' in v && (v.data === null || v.data === undefined || (Array.isArray(v.data) && !v.data.length && isObj(v.error)))) {
    const e = isObj(v.error) ? v.error : {};
    const words = [e.userMessage, e.developerMessage, e.failureCode, typeof e.details === 'string' ? e.details : ''].filter((x) => typeof x === 'string').join(' ');
    const requestId = str(e.requestId) ?? str(v.requestId);
    if (/unauthori[sz]ed|unauthenticated|not (logged|signed) in|session|\b401\b|\b403\b/i.test(words)) return { ...NOT_SIGNED_IN, requestId };
    return fail('noData', 'myUSCIS didn’t return data', NO_DATA_MESSAGE, requestId);
  }
  if (isObj(v) && isObj(v.error) && !('data' in v) && Object.keys(v).length <= 3) return fail('noData', 'myUSCIS didn’t return data', NO_DATA_MESSAGE, str(v.error.requestId));
  // Our server's Live check answer (also accepted when pasted).
  if (isObj(v) && typeof v.status === 'string' && Array.isArray(v.history) && v.history.every((h: any) => isObj(h) && 'status' in h)) return liveToPart(v);
  // Unwrap { data: … } (once or twice).
  let d: any = v;
  for (let i = 0; i < 2 && isObj(d) && 'data' in d && d.data != null && typeof d.data === 'object'; i++) d = d.data;
  if (Array.isArray(d)) {
    if (!d.length) return hint === 'documents' ? { ok: true, kind: 'documents', part: { documents: [] } } : fail('noData', 'myUSCIS sent back an empty list', 'The page showed an empty list — nothing to read yet.');
    if (d.every(isObj) && d.some(looksLikeCase) && !d.some(looksLikeDoc)) d = d.find(looksLikeCase);
    else return { ok: true, kind: 'documents', part: { documents: docsFrom(d) } };
  }
  if (!isObj(d)) return fail('notMyuscis', 'This isn’t myUSCIS data', 'This doesn’t look like what the myUSCIS links show.');
  const receipt = normReceipt(pick(d, ['receiptNumber', 'receipt', 'receiptNum', 'caseNumber', 'caseId']));
  const docsOnly = pickArr(d, ['documents', 'notices', 'items', 'results']);
  if (looksLikeCase(d)) return { ok: true, kind: 'case', receipt, part: caseFrom(d) };
  const loc = locationFrom(d);
  if (loc && (hint !== 'documents' || !docsOnly)) return { ok: true, kind: 'receipt', receipt, part: { location: loc, form: pick(d, ['formType', 'formNumber', 'form']) } };
  if (docsOnly) return { ok: true, kind: 'documents', receipt, part: { documents: docsFrom(docsOnly) } };
  if (receipt) return { ok: true, kind: hint === 'receipt' ? 'receipt' : 'case', receipt, part: hint === 'receipt' ? {} : caseFrom(d) };
  return fail('notMyuscis', 'This isn’t myUSCIS data', 'We couldn’t find a receipt, events, location or documents in this.');
}

function looksLikeCase(o: any): boolean {
  if (!isObj(o)) return false;
  const k = Object.keys(o).map((x) => x.toLowerCase());
  return ['events', 'formtype', 'submissiondate', 'updatedattimestamp', 'ackedbyadjudicatorandcms', 'cmsfailure', 'evidencerequests', 'casestatus', 'actioncode', 'statustitle', 'statustext', 'currentstatus', 'casestatustext'].some((x) => k.includes(x));
}
function looksLikeDoc(o: any): boolean {
  if (!isObj(o)) return false;
  const k = Object.keys(o).map((x) => x.toLowerCase());
  return ['documentid', 'documenttype', 'documenttitle', 'noticetype', 'dateissued', 'filename', 'documentname'].some((x) => k.includes(x));
}

function eventsFrom(list: any[] | undefined): MyEvent[] {
  const out: MyEvent[] = [];
  for (const e of list ?? []) {
    if (!isObj(e)) continue;
    const code = pick(e, ['eventCode', 'code', 'actionCode', 'eventType', 'event']) ?? '';
    const date = normDate(e.eventDateTime ?? e.eventTimestamp ?? e.eventDate ?? e.date ?? e.createdAtTimestamp ?? e.createdAt ?? e.timestamp);
    if (!code && !date) continue;
    const dec = decodeEvent(code);
    const own = pick(e, ['description', 'eventDescription', 'title', 'text']);
    out.push({ code: dec.code, date: date ?? '', text: dec.known || !own ? dec.text : own, kind: dec.kind, sure: dec.sure, known: dec.known, src: 'myuscis' });
  }
  return dedupeSort(out);
}
const evKey = (e: Pick<MyEvent, 'code' | 'text' | 'date'>) => `${e.code || e.text.toLowerCase()}|${e.code ? e.date : day(e.date)}`;
function dedupeSort(list: MyEvent[]): MyEvent[] {
  const seen = new Set<string>();
  return list.filter((e) => { const k = evKey(e); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.date.localeCompare(b.date));
}

function docsFrom(list: any[]): MyDoc[] {
  const out: MyDoc[] = [];
  for (const x of list) {
    if (typeof x === 'string' && x.trim()) { out.push({ title: x.trim() }); continue; }
    if (!isObj(x)) continue;
    const type = pick(x, ['noticeType', 'documentType', 'docType', 'type', 'category', 'formNumber', 'noticeCode']);
    const title = pick(x, ['documentTitle', 'title', 'name', 'documentName', 'noticeName', 'displayName', 'description', 'fileName']) ?? type;
    if (!title) continue;
    out.push({ id: pick(x, ['documentId', 'id', 'noticeId', 'uuid', 'documentKey']), title, type, date: normDate(x.dateIssued ?? x.issuedDate ?? x.issueDate ?? x.noticeDate ?? x.generationDate ?? x.generatedDate ?? x.mailedDate ?? x.uploadedDate ?? x.createdAt ?? x.date) });
  }
  return out;
}

function locationFrom(o: Record<string, any>, depth = 0): MyLocation | undefined {
  const loc: MyLocation = {};
  for (const [k, v] of Object.entries(o)) {
    const key = k.toLowerCase();
    if (isObj(v) && depth < 2 && /office|center|location|jurisdiction/.test(key)) {
      const name = pick(v, ['name', 'officeName', 'description', 'displayName', 'title']);
      const code = pick(v, ['code', 'officeCode', 'id']);
      if (name || code) {
        const slot: keyof MyLocation = /field/.test(key) ? 'fieldOffice' : /center/.test(key) ? 'serviceCenter' : 'office';
        loc[slot] ??= name ?? code; if (code && !loc.code) loc.code = code;
      } else { const inner = locationFrom(v, depth + 1); if (inner) for (const [ik, iv] of Object.entries(inner)) (loc as any)[ik] ??= iv; }
      continue;
    }
    const s = str(v);
    if (!s || s.length > 120) continue;
    if (/^field.?office(name)?$/.test(key)) loc.fieldOffice ??= s;
    else if (/service.?center(name)?$|^center(name)?$/.test(key)) loc.serviceCenter ??= s;
    else if (/(office|location|center).?code$/.test(key)) loc.code ??= s;
    else if (/^(office|officename|processingoffice|currentoffice|location|locationname|currentlocation|caselocation|jurisdiction|homeoffice|processinglocation)$/.test(key)) loc.office ??= s;
  }
  return loc.office || loc.serviceCenter || loc.fieldOffice || loc.code ? loc : undefined;
}

function caseFrom(d: Record<string, any>): Partial<MySnapshot> {
  const updCandidates = [d.updatedAt, d.updatedAtTimestamp, d.updatedTimestamp, d.lastUpdated, d.lastUpdatedDate, d.modifiedAt].map(normDate).filter(Boolean) as string[];
  const updatedAt = updCandidates.find(hasTime) ?? updCandidates[0];
  const docs = [...docsFrom(pickArr(d, ['documents']) ?? []), ...docsFrom(pickArr(d, ['notices']) ?? [])];
  const ev = pickArr(d, ['evidenceRequests', 'rfes']);
  const concurrent = (pickArr(d, ['concurrentCases', 'relatedCases']) ?? []).map((x: any) => normReceipt(typeof x === 'string' ? x : isObj(x) ? pick(x, ['receiptNumber', 'receipt']) : '')).filter(Boolean) as string[];
  const flags: MyFlags = {
    cmsFailure: pickBool(d, ['cmsFailure']),
    closed: pickBool(d, ['closed', 'isClosed', 'caseClosed']),
    acked: pickBool(d, ['ackedByAdjudicatorAndCms']),
    actionRequired: pickBool(d, ['actionRequired', 'isActionRequired', 'requiresAction', 'hasActionItems', 'actionNeeded']) ?? (ev && ev.length ? true : undefined),
    evidenceRequests: ev ? ev.length : undefined,
  };
  const loc = locationFrom(d);
  return {
    form: normForm(pick(d, ['formType', 'formNumber', 'form'])),
    formName: pick(d, ['formName', 'formTitle']),
    submittedAt: normDate(d.submissionDate ?? d.submissionTimestamp ?? d.receivedDate ?? d.filedDate ?? d.receiptDate),
    stamps: { myuscis: { updatedAt, status: pick(d, ['caseStatus', 'status', 'currentStatus', 'statusText', 'statusTitle', 'caseStatusText']), actionCode: pick(d, ['actionCode', 'currentActionCode', 'statusCode']) } },
    events: eventsFrom(pickArr(d, ['events', 'caseEvents', 'history', 'caseHistory'])),
    documents: docs,
    flags,
    ...(loc ? { location: loc } : {}),
    ...(concurrent.length ? { concurrent } : {}),
  };
}
const normForm = (f?: string) => f?.toUpperCase().replace(/^([A-Z])-?(\d)/, '$1-$2');

// ---------- Live check (official USCIS Case Status API via our server) ----------
/** Our server's GET /api/case/:receipt answer (server/src/uscis.mjs normalize()). */
export type LiveCase = { receipt: string; form?: string; status: string; detail?: string; submitted?: string; updated?: string; history: { date?: string; status: string }[] };
/** Kind of a public status heading (for timelines and silent-update checks). */
export function kindOfHeading(h: string): CodeKind {
  const x = h.toLowerCase();
  if (/withdraw/.test(x)) return 'withdrawn';
  if (/denied|rejected|terminated|revoked/.test(x)) return 'denied';
  if (/card (is being produced|was produced)|new card|card was (mailed|delivered|picked up)/.test(x)) return 'card';
  if (/approved|oath ceremony|welcome notice/.test(x)) return 'approved';
  if (/response to .*(request for evidence|intent)|evidence was received/.test(x)) return 'rfe-response';
  if (/request for (initial |additional )?evidence|intent to (deny|revoke)/.test(x)) return 'rfe';
  if (/interview/.test(x)) return 'interview';
  if (/fingerprint|biometric/.test(x)) return 'biometrics';
  if (/transferred|relocated|new office/.test(x)) return 'transfer';
  if (/received|receipt notice/.test(x)) return 'received';
  if (/actively review|being reviewed/.test(x)) return 'review';
  if (/notice|mailed|sent/.test(x)) return 'notice';
  return 'other';
}
const pubEvent = (date: string | undefined, text: string, src: Src): MyEvent => ({ code: '', date: date ?? '', text, kind: kindOfHeading(text), sure: true, known: true, src });
export function liveToPart(j: Partial<LiveCase> | null | undefined): ParseResult {
  if (!j || typeof j.status !== 'string' || !j.status.trim() || /status unavailable/i.test(j.status)) return fail('noData', 'USCIS didn’t return a status', 'The official case status service had no status for this receipt right now.');
  const events = dedupeSort((Array.isArray(j.history) ? j.history : []).filter((h) => h && h.status).map((h) => pubEvent(normDate(h.date), String(h.status), 'live')));
  return {
    ok: true, kind: 'live', receipt: normReceipt(j.receipt),
    part: { form: normForm(j.form), submittedAt: normDate(j.submitted), stamps: { live: { status: j.status.trim(), detail: j.detail || undefined, updatedAt: normDate(j.updated) } }, events, documents: [], flags: {} },
  };
}

// ---------- myUSCIS case page TEXT (what you see when signed in) ----------
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_RES: RegExp[] = [
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2}),? (\d{4})\b/i,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
];
function findDate(line: string): { iso: string; rest: string } | undefined {
  for (const [i, re] of DATE_RES.entries()) {
    const m = line.match(re);
    if (!m) continue;
    let iso: string;
    if (i === 0) { const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))); iso = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    else if (i === 1) iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    else iso = `${m[1]}-${m[2]}-${m[3]}`;
    const rest = line.replace(m[0], ' ').replace(/^[\s,:·•\-–—|]+|[\s,:·•\-–—|]+$/g, '').replace(/^(on|as of|date:?|updated:?)\s*$/i, '').trim();
    return { iso, rest };
  }
  return undefined;
}
const HISTORY_HEAD = /^(case history|history|case timeline|timeline|case updates|updates|activity)$/i;
const DOCS_HEAD = /^(documents|notices|case documents|my documents|notices and documents|documents and notices|correspondence|uscis notices)$/i;
const OTHER_HEAD = /^(case details|details|help|contact( us)?|messages|evidence|receipt number|form|filed|applicant|beneficiary)$/i;
const NOISE = /^(view|download|open|show (more|less)|see (all|more)|pdf|close|menu|sign out|back|next|previous|expand|collapse)$/i;
const looksStatus = (l: string) => /^(case|request|response|interview|fingerprint|biometric|card|new card|notice|decision|document|oath|we )/i.test(l) && l.length <= 120;

/** The visible text of the myUSCIS case page → status, history events and notices. Null when it isn't one. */
export function parsePageText(raw: string): ParseOk | null {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).filter((l) => !NOISE.test(l));
  if (lines.length < 2) return null;
  const receipt = raw.toUpperCase().match(RECEIPT_RE)?.[1];
  const form = normForm(raw.match(/\bForm\s+([A-Z]-?\d{2,4}[A-Z]?)\b/i)?.[1] ?? raw.match(/\b(I-\d{2,4}[A-Z]?|N-\d{3}|G-\d{3,4})\b/)?.[1]);
  let section: 'top' | 'history' | 'docs' | 'other' = 'top';
  const events: MyEvent[] = [];
  const docs: MyDoc[] = [];
  let status: string | undefined, statusDetail: string | undefined, updatedAt: string | undefined;
  let pending: string | undefined; // a text line waiting for its date (or the other way round)
  let pendingDate: string | undefined;
  const flush = () => { pending = undefined; pendingDate = undefined; };
  const addItem = (date: string, text: string) => {
    if (section === 'docs') docs.push({ title: text, date });
    else events.push(pubEvent(date, text, 'page'));
  };
  for (const l of lines) {
    if (HISTORY_HEAD.test(l)) { section = 'history'; flush(); continue; }
    if (DOCS_HEAD.test(l)) { section = 'docs'; flush(); continue; }
    if (OTHER_HEAD.test(l) && l.length < 30) { section = 'other'; flush(); continue; }
    if (/^(current )?(case )?status:?$/i.test(l)) { section = 'top'; flush(); continue; }
    const d = findDate(l);
    if (section === 'top') {
      if (!status && looksStatus(l) && !/^(on|as of) /i.test(l) && !d) { status = l.replace(/[.:]$/, ''); continue; }
      if (d && /^(on|as of) /i.test(l)) { statusDetail ??= l; if (!updatedAt) updatedAt = d.iso; continue; }
      if (d && /(updated|last updated)/i.test(l)) { updatedAt = d.iso; continue; }
      continue;
    }
    if (section === 'history' || section === 'docs') {
      if (d) {
        const text = d.rest.length >= 4 && !/^\d+$/.test(d.rest) ? d.rest : pending;
        if (text) { addItem(d.iso, text); flush(); } else pendingDate = d.iso;
      } else if (pendingDate) { addItem(pendingDate, l); flush(); }
      else pending = l;
    }
  }
  // An explanation sentence that names the date ("On May 2, 2026, we …") also counts as the latest event.
  if (status && updatedAt && !events.some((e) => day(e.date) === updatedAt && e.text === status)) events.push(pubEvent(updatedAt, status, 'page'));
  const strong = !!status && (receipt || form || events.length || /uscis/i.test(raw));
  if (!strong && events.length < 2 && !docs.length) return null;
  if (!status && !events.length && !docs.length) return null;
  return {
    ok: true, kind: 'page', receipt,
    part: { form, stamps: { page: { status, detail: statusDetail, updatedAt } }, events: dedupeSort(events), documents: docs, flags: {} },
  };
}

// ---------- building a snapshot ----------
export type BuildResult = { ok: true; snap: MySnapshot } | { ok: false; message: string };
const latest = (parts: ParseOk[], k: PartKind) => [...parts].reverse().find((p) => p.kind === k)?.part as Partial<MySnapshot> | undefined;

/** Combine what was read in one sync with the previous snapshot. Each source replaces only its own events. */
export function buildSnapshot(parts: ParseOk[], receipt: string, prev: MySnapshot | undefined, syncedAt: string): BuildResult {
  if (!parts.length) return { ok: false, message: 'Nothing read yet.' };
  const want = normReceipt(receipt);
  const other = parts.find((p) => p.receipt && want && p.receipt !== want);
  if (other) return { ok: false, message: `That is for a different receipt (${maskReceipt(other.receipt!)}). Open this case’s page or links.` };
  const kinds = [...new Set(parts.map((p) => p.kind))];
  const base: MySnapshot = prev ? { ...prev, stamps: { ...(prev.stamps ?? {}) }, flags: { ...prev.flags }, events: [...prev.events], documents: [...prev.documents] } : { syncedAt, parts: [], stamps: {}, events: [], documents: [], flags: {} };
  const snap: MySnapshot = { ...base, receipt: want ?? receipt, syncedAt, parts: kinds };
  for (const k of ['case', 'page', 'live'] as PartKind[]) {
    const p = latest(parts, k);
    const src = srcOf(k)!;
    if (!p) continue;
    snap.events = [...snap.events.filter((e) => e.src !== src), ...(p.events ?? [])];
    snap.stamps[src] = p.stamps?.[src] ?? {};
    snap.form ??= p.form; if (p.form && k !== 'page') snap.form = p.form;
    snap.submittedAt ??= p.submittedAt;
    if (k === 'case') {
      snap.formName = p.formName ?? snap.formName;
      snap.flags = p.flags ?? {};
      snap.concurrent = p.concurrent;
      if (p.location && !latest(parts, 'receipt')) snap.location = p.location;
    }
    if (p.documents?.length) snap.documents = mergeDocs(p.documents, snap.documents);
  }
  const rec = latest(parts, 'receipt');
  if (rec) { snap.location = rec.location ?? snap.location; snap.form ??= rec.form; }
  const docs = latest(parts, 'documents');
  if (docs) snap.documents = mergeDocs(docs.documents ?? [], snap.documents);
  snap.events = dedupeSort(snap.events);
  if (kinds.some((k) => k === 'documents' || k === 'case' || k === 'page')) snap.docsRead = true;
  // display fields: live first (official), then the page text, then myUSCIS JSON
  const st = snap.stamps;
  const firstOf = <K extends keyof Stamp>(k: K) => st.live?.[k] ?? st.page?.[k] ?? st.myuscis?.[k];
  snap.status = firstOf('status'); snap.detail = firstOf('detail'); snap.actionCode = st.myuscis?.actionCode;
  snap.updatedAt = (Object.values(st).map((x) => x?.updatedAt).filter(Boolean) as string[]).sort().pop();
  return { ok: true, snap };
}
const docKey = (d: MyDoc) => (d.id ? `id:${d.id}` : `t:${d.title.toLowerCase()}|${day(d.date)}`);
function mergeDocs(a: MyDoc[], b: MyDoc[]): MyDoc[] {
  const m = new Map<string, MyDoc>();
  for (const d of [...a, ...b]) {
    const k = docKey(d);
    const twin = [...m.values()].find((x) => x.title.toLowerCase() === d.title.toLowerCase() && day(x.date) === day(d.date));
    if (!m.has(k) && !twin) m.set(k, d);
  }
  return [...m.values()];
}
/** IOE••••••0001 style — receipts are never shown in full in error messages. */
export const maskReceipt = (r: string) => (r.length === 13 ? `${r.slice(0, 3)}••••••${r.slice(-4)}` : r);

// ---------- diff ----------
export type Change = { kind: 'event' | 'status' | 'location' | 'document' | 'flag' | 'silent' | 'form'; text: string; date?: string; src?: Src };
export type Diff = { first: boolean; changes: Change[]; silent?: { at: string; src: Src }; any: boolean; statusChanged: boolean };
const locText = (l?: MyLocation) => (l ? [l.fieldOffice, l.serviceCenter, l.office].filter(Boolean)[0] ?? l.code ?? '' : '');
const SRC_NAME: Record<Src, string> = { myuscis: 'myUSCIS', page: 'myUSCIS page', live: 'Live check' };

/**
 * What changed since the last sync. Only sources read now are compared, each with its own previous
 * values (the first read of a source is a baseline and reports nothing). Silent update = a source's
 * last-updated date moved with no new public event and no status change.
 */
export function diffSnapshots(prev: MySnapshot | undefined, next: MySnapshot): Diff {
  if (!prev) return { first: true, changes: [], any: false, statusChanged: false };
  const ch: Change[] = [];
  let publicChange = false, statusChanged = false;
  const stamps = prev.stamps ?? {};
  for (const src of ['live', 'page', 'myuscis'] as Src[]) {
    const k: PartKind = src === 'myuscis' ? 'case' : src;
    if (!next.parts.includes(k)) continue;
    const before = stamps[src];
    if (!before) continue; // first time this source is read: baseline
    const now = next.stamps[src] ?? {};
    const had = new Set(prev.events.filter((e) => e.src === src).map(evKey));
    for (const e of next.events.filter((x) => x.src === src && !had.has(evKey(x)))) {
      ch.push({ kind: 'event', text: eventLabel(e), date: e.date, src });
      if (PUBLIC_KINDS.includes(e.kind)) publicChange = true;
    }
    const sig = (s?: Stamp) => `${(s?.status ?? '').toLowerCase()}|${s?.actionCode ?? ''}`;
    if ((now.status || now.actionCode) && (before.status || before.actionCode) && sig(before) !== sig(now)) {
      ch.push({ kind: 'status', src, text: before.status && now.status ? `Status changed from “${before.status}” to “${now.status}”` : `Status code changed (${before.actionCode ?? '—'} → ${now.actionCode ?? '—'})` });
      publicChange = true; statusChanged = true;
    }
  }
  if (next.parts.includes('case') && stamps.myuscis) {
    if (next.form && prev.form && next.form !== prev.form) ch.push({ kind: 'form', text: `Form now shows as ${next.form}` });
    const f0 = prev.flags, f1 = next.flags;
    if (f1.closed && !f0.closed) ch.push({ kind: 'flag', text: 'Case marked closed in myUSCIS' });
    if (f0.closed && f1.closed === false) ch.push({ kind: 'flag', text: 'Case reopened in myUSCIS' });
    if (f1.acked && !f0.acked) ch.push({ kind: 'flag', text: 'Acknowledged by an officer and the case system (often seen before a decision — informal reading)' });
    if (f1.cmsFailure && !f0.cmsFailure) ch.push({ kind: 'flag', text: 'Case-system sync problem flag turned on (usually clears on its own)' });
    if (f1.actionRequired && !f0.actionRequired) ch.push({ kind: 'flag', text: 'myUSCIS shows an action for you — sign in and check your account' });
    if ((f1.evidenceRequests ?? 0) > (f0.evidenceRequests ?? 0)) { ch.push({ kind: 'flag', text: 'New evidence request in myUSCIS' }); publicChange = true; }
  }
  if (!publicChange) {
    for (const src of ['live', 'myuscis', 'page'] as Src[]) {
      const k: PartKind = src === 'myuscis' ? 'case' : src;
      const a = stamps[src]?.updatedAt, b = next.stamps[src]?.updatedAt;
      if (next.parts.includes(k) && a && b && b > a && changedStamp(a, b)) {
        ch.push({ kind: 'silent', src, text: `Silent update on ${day(b)} — USCIS touched your case without a public status change`, date: b });
        break;
      }
    }
  }
  if ((next.parts.includes('receipt') || (next.parts.includes('case') && next.location)) && locText(prev.location) && locText(next.location) && locText(prev.location) !== locText(next.location)) {
    ch.push({ kind: 'location', text: `Location changed from ${locText(prev.location)} to ${locText(next.location)}` });
  }
  if (next.parts.some((k) => k === 'documents' || k === 'case' || k === 'page') && (prev.docsRead || prev.documents.length)) {
    const had = new Set(prev.documents.map(docKey));
    const hadT = new Set(prev.documents.map((d) => `${d.title.toLowerCase()}|${day(d.date)}`));
    for (const d of next.documents.filter((x) => !had.has(docKey(x)) && !hadT.has(`${x.title.toLowerCase()}|${day(x.date)}`))) ch.push({ kind: 'document', text: `New notice: ${d.title}`, date: d.date });
  }
  const silent = ch.find((c) => c.kind === 'silent');
  return { first: false, changes: ch, silent: silent ? { at: silent.date!, src: silent.src! } : undefined, any: ch.length > 0, statusChanged };
}
export const sourceName = (s: Src) => SRC_NAME[s];
/** Compare at the coarser precision (a date-only stamp vs a full timestamp of the same day is no change). */
function changedStamp(a: string, b: string): boolean {
  if (hasTime(a) && hasTime(b)) return a !== b;
  return day(a) !== day(b);
}

/** The record was last touched after its newest event — a silent touch we can see even on the first sync. */
export function touchedAfterLastEvent(s: MySnapshot): string | undefined {
  if (!s.updatedAt) return undefined;
  const last = s.events.map((e) => e.date).filter(Boolean).sort().pop();
  if (!last) return undefined;
  return day(s.updatedAt) > day(last) ? s.updatedAt : undefined;
}

// ---------- case status and history ----------
const DECISIVE: Partial<Record<CodeKind, CaseStatus>> = { approved: 'approved', card: 'approved', denied: 'denied', withdrawn: 'withdrawn', rfe: 'rfe', 'rfe-response': 'pending' };
/** The case status the snapshot supports: the official status first, then well-established event codes. */
export function statusFromSnapshot(s: MySnapshot): CaseStatus | undefined {
  const official = s.stamps?.live?.status ?? s.stamps?.page?.status;
  if (official) { const k = kindOfHeading(official); if (DECISIVE[k]) return DECISIVE[k]; if (['received', 'review', 'biometrics', 'interview', 'transfer'].includes(k)) return 'pending'; }
  const sure = s.events.filter((e) => e.sure && e.known && DECISIVE[e.kind]);
  const last = sure[sure.length - 1];
  return last ? DECISIVE[last.kind] : undefined;
}
export const MY_PREFIX = 'myUSCIS: ';

/** Save a sync into the case: new events as history lines (public statuses as they read on uscis.gov,
 *  myUSCIS events prefixed), the silent update, form, received date, status, last checked. */
export function applySync(c: Case, s: MySnapshot, diff: Diff): Case {
  const lines = [...c.history];
  const has = (text: string, date: string) => lines.some((h) => h.text.toLowerCase() === text.toLowerCase() && day(h.date) === day(date));
  for (const e of s.events) {
    if (!e.date) continue;
    const text = e.src === 'live' ? e.text : `${MY_PREFIX}${eventLabel(e)}`;
    if (!has(text, e.date) && !(e.src !== 'live' && has(e.text, e.date))) lines.push({ date: day(e.date), text });
  }
  if (diff.silent) { const text = `${MY_PREFIX}Silent update (no public status change)`; if (!has(text, diff.silent.at)) lines.push({ date: day(diff.silent.at), text }); }
  lines.sort((a, b) => b.date.localeCompare(a.date));
  const st = statusFromSnapshot(s);
  const live = s.parts.includes('live');
  return { ...c, form: c.form ?? s.form, receivedDate: c.receivedDate ?? (s.submittedAt ? day(s.submittedAt) : undefined), status: st ?? c.status, history: lines, ...(live ? { checkedAt: s.syncedAt } : {}) };
}

export type TimelineItem = { date: string; text: string; source: 'myuscis' | 'uscis' | 'you' };
/** One history: public statuses (uscis.gov / Live check), pasted text and myUSCIS events, newest first, no duplicates. */
export function mergedTimeline(history: { date: string; text: string }[], snap?: MySnapshot): TimelineItem[] {
  const out: TimelineItem[] = [];
  const seen = new Set<string>();
  const add = (date: string, text: string, source: TimelineItem['source']) => { const k = `${day(date)}|${text.toLowerCase()}`; if (seen.has(k)) return; seen.add(k); out.push({ date: day(date), text, source }); };
  for (const h of history) {
    if (h.text.startsWith(MY_PREFIX)) add(h.date, h.text.slice(MY_PREFIX.length), 'myuscis');
    else add(h.date, h.text, /^(Added in|Checked ·)/.test(h.text) ? 'you' : 'uscis');
  }
  for (const e of snap?.events ?? []) if (e.date) add(e.date, eventLabel(e), e.src === 'live' ? 'uscis' : 'myuscis');
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- notice checklist ----------
export type ChecklistItem = { key: string; title: string; date?: string; docType: Extract<DocType, 'receipt' | 'approval' | 'notice'>; step: 'receipt' | 'approval'; attached: boolean };
export function noticeType(d: Pick<MyDoc, 'title' | 'type'>): ChecklistItem['docType'] {
  const t = `${d.title} ${d.type ?? ''}`.toLowerCase();
  if (/approv|797a|797b|welcome/.test(t)) return 'approval';
  if (/receipt|797c|acceptance/.test(t) && !/evidence|interview|biometric|appointment|transfer|intent/.test(t)) return 'receipt';
  return 'notice';
}
const LABEL: Record<ChecklistItem['docType'], string> = { receipt: 'Receipt notice', approval: 'Approval notice', notice: 'Notice' };
/** One checklist entry per notice USCIS lists. Attached = the wallet holds that kind of notice for this receipt. */
export function noticeChecklist(s: MySnapshot | undefined, receipt: string, walletDocs: Pick<Document, 'type' | 'fields'>[], dismissed: string[] = []): ChecklistItem[] {
  if (!s) return [];
  const mine = walletDocs.filter((d) => (d.fields.receipt ?? '').toUpperCase() === receipt.toUpperCase());
  return s.documents.map((d) => {
    const docType = noticeType(d);
    return { key: docKey(d), title: `${docType === 'notice' ? d.title : LABEL[docType]} — attach PDF`, date: d.date, docType, step: docType === 'approval' ? 'approval' as const : 'receipt' as const, attached: mine.some((w) => w.type === docType) };
  }).filter((x) => !dismissed.includes(x.key));
}

// ---------- reminders, auto-check and alerts ----------
const DAY = 86400000;
/** Open IOE cases not synced for 7+ days (weekly reminder). */
export function syncDue(cases: { id: string; receipt?: string; status: string }[], lastSync: Record<string, string | undefined>, nowIso: string, days = 7): string[] {
  const cutoff = new Date(new Date(nowIso).getTime() - days * DAY).toISOString();
  return cases.filter((c) => isIOE(c.receipt) && (c.status === 'Pending' || c.status === 'RFE') && (!lastSync[c.id] || lastSync[c.id]! < cutoff)).map((c) => c.id);
}
/** When the next weekly reminder fires: 7 days after the oldest last sync among open IOE cases (at least 1 h from now). */
export function nextSyncReminder(openIoe: string[], lastSync: Record<string, string | undefined>, nowIso: string): string | undefined {
  if (!openIoe.length) return undefined;
  const base = openIoe.map((id) => lastSync[id] ?? nowIso).sort()[0];
  const at = new Date(new Date(base).getTime() + 7 * DAY);
  const min = new Date(new Date(nowIso).getTime() + 3600000);
  return (at < min ? min : at).toISOString();
}
/** Live check is due for a case: open, has a receipt, last live check older than `hours` (server caches 3 h). */
export function liveDue(c: { receipt?: string; status: string }, lastLive: string | undefined, nowIso: string, hours = 3): boolean {
  if (!c.receipt || !/^[A-Z]{3}\d{10}$/.test(c.receipt)) return false;
  if (!(c.status === 'Pending' || c.status === 'RFE')) return false;
  return !lastLive || new Date(nowIso).getTime() - new Date(lastLive).getTime() >= hours * 3600000;
}

/** Short notification text for a sync that found changes. */
export function changeAlert(diff: Diff, form?: string): { title: string; body: string } | null {
  if (!diff.any) return null;
  const n = diff.changes.length;
  const head = diff.changes.find((c) => c.kind === 'status') ?? diff.changes.find((c) => c.kind !== 'silent') ?? diff.changes[0];
  const title = diff.statusChanged ? `${form ?? 'Case'}: status changed` : diff.silent && n === 1 ? `${form ?? 'Case'}: silent update` : `${form ?? 'Case'}: ${n} change${n === 1 ? '' : 's'}`;
  return { title, body: head.text };
}
