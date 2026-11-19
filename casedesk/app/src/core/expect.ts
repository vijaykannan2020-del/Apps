// "What to expect" for a case: typical decision window, approval / RFE context and anonymous "Cases like mine"
// timelines. Pure (no React Native): the server answers GET /api/expect; without it the app builds the same shape
// from a built-in summary of official USCIS numbers (dated). An estimate, never a prediction for one case.
import type { CaseView } from './cases';
import { PROCESSING, PT_AS_OF, type PT } from '../content/processing';
import type { HelpTopic } from '../content/help';

// ---------- server response (casedesk/server/src/expect.mjs) ----------
export type OfficialRow = {
  period: string; start?: string; end?: string; builtAt?: string; form: string; description?: string; category: string | null;
  received: number | null; approved: number | null; denied: number | null; completed: number | null; pending: number | null;
  medianMonths: number | null; approvalRate: number | null; trend?: { period: string; medianMonths: number | null; approvalRate: number | null }[]; note?: string;
};
export type RfeStats = { classification: string; period: string | null; fy: number; completions: number; approvalRate: number | null; rfeRate: number | null; approvalAfterRfe: number | null };
export type CommunityStats =
  | { hidden: true; shared: number; minSample: number }
  | { hidden: false; scope: string; minSample: number; total: number; decided: number; approved: number; denied: number; rfe: number; pending: number; approvalRate: number; p25Days: number | null; medianDays: number | null; p75Days: number | null; histogram: { month: number; n: number }[] };
export type ExpectResult = {
  query: { form: string; office: string | null; officeName: string | null; received: string | null; premium: boolean; cls: string | null };
  processingOffice: string; officeNote: string; elapsedDays: number | null;
  window: { fromMonths: number; toMonths: number; from: string; to: string; basis: string } | null;
  official: OfficialRow | null; rfe: RfeStats | null;
  h1b: { fy: string; initialApprovalRate: number | null; continuingApprovalRate: number | null } | null;
  processing: { asOf: string; source: string; measure: string; rows: PT[]; minMonths: number; maxMonths: number; matched: 'class' | 'form' } | null;
  premium: { businessDays: number | null; decisionBy?: string | null; note: string } | null;
  community: CommunityStats; rfeEffect: string;
  sources: { name: string; period?: string | null; url?: string | null }[]; disclaimer: string;
};

export const MIN_COMMUNITY = 10;
export const DISCLAIMER = 'Estimate from public USCIS statistics and anonymous app users — not a prediction of your case and not legal advice.';

// ---------- receipts and offices ----------
export const OFFICES: Record<string, string> = {
  EAC: 'Vermont Service Center', WAC: 'California Service Center', LIN: 'Nebraska Service Center', SRC: 'Texas Service Center',
  YSC: 'Potomac Service Center', NBC: 'National Benefits Center', MSC: 'National Benefits Center', IOE: 'Filed online (USCIS ELIS)',
};
/** First 3 letters of a 13-character receipt (EAC2612345678 → EAC). Field-office receipts use other codes. */
export const officeOf = (receipt?: string) => (receipt && /^[A-Z]{3}\d{10}$/.test(receipt) ? receipt.slice(0, 3) : undefined);
export const officeName = (code?: string | null) => (code ? OFFICES[code] ?? `${code} office` : 'USCIS');
const SC_FORMS = /^(I-129|I-129F|I-129S|I-140|I-539|I-765|I-131|I-751|I-360|I-526E?|I-829|I-824|I-90)$/;
export function processingOffice(form: string, office?: string) {
  if (SC_FORMS.test(form)) return { name: 'Service Center Operations (all service centers)', note: office === 'IOE' ? 'Online (IOE) cases are assigned to any service center, so the receipt does not say who decides it.' : 'Service centers share cases, so USCIS publishes one time for all of them.' };
  if (/^(N-400|N-600|I-485)$/.test(form)) return { name: 'Your local USCIS field office', note: 'Times for this form depend on the office that interviews or decides it — usually set by your address, not the receipt prefix.' };
  return { name: officeName(office), note: '' };
}

// ---------- visa class ----------
export function normClass(cls = ''): string {
  const c = String(cls).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^H1B/.test(c)) return 'H1B';
  if (/^L1A/.test(c)) return 'L1A';
  if (/^L1B/.test(c)) return 'L1B';
  if (/^L1/.test(c)) return 'L1';
  if (/^O1|^O$/.test(c)) return 'O1';
  if (c === 'C3') return 'F1';
  if (/^L2/.test(c)) return 'L2';
  return c.slice(0, 8);
}
export const CLASS_LABEL: Record<string, string> = { H1B: 'H-1B', L1A: 'L-1A', L1B: 'L-1B', L1: 'L-1', O1: 'O-1', TN: 'TN', E3: 'E-3', H4: 'H-4', L2: 'L-2', F1: 'F-1 OPT', C9: '(c)(9)', C26: '(c)(26)' };
export const classLabel = (k?: string | null) => (k ? CLASS_LABEL[normClass(k)] ?? k : '');
/** Classes worth asking about per form (chips on the card). */
export const CLASS_CHOICES: Record<string, string[]> = { 'I-129': ['H1B', 'L1A', 'L1B', 'O1', 'TN'], 'I-539': ['H4', 'L2', 'F1'], 'I-765': ['C9', 'C26', 'F1'] };
const CLASS_WORDS: Record<string, RegExp> = { H1B: /H-?1B/i, L1A: /L-?1/i, L1B: /L-?1/i, L1: /L-?1/i, TN: /\bTN\b/i, O1: /\bO\b|O-1/i, H4: /H-4/i, L2: /L-2/i, F1: /OPT|F-1/i, C9: /\(c\)\(9\)|green card/i, C26: /\(c\)\(26\)/i };

// ---------- case facts ----------
export type Outcome = 'approved' | 'denied' | 'rfe' | 'pending';
export const outcomeOf = (c: Pick<CaseView, 'status'>): Outcome => (c.status === 'Approved' ? 'approved' : c.status === 'Denied' ? 'denied' : c.status === 'RFE' ? 'rfe' : 'pending');
export const receivedOf = (c: Pick<CaseView, 'filed' | 'history'>) => c.filed ?? [...c.history].reverse().find((h) => /received|accepted/i.test(h.text))?.date;
export function decidedOf(c: Pick<CaseView, 'status' | 'history' | 'updated'>): string | undefined {
  if (c.status !== 'Approved' && c.status !== 'Denied') return undefined;
  return c.history.find((h) => /approv|denied/i.test(h.text))?.date ?? c.updated;
}

// ---------- premium processing ----------
/** Business-day clock: 15 for I-129 and most I-140s; 45 for I-140 E13 / NIW; 30 for I-539 F/J/M and I-765 OPT. */
export function premiumClock(form: string, cls = ''): number | null {
  const c = String(cls).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (form === 'I-129') return 15;
  if (form === 'I-140') return /E13|EB1C|NIW/.test(c) ? 45 : 15;
  if (form === 'I-539') return /^(F|J|M)/.test(c) ? 30 : null;
  if (form === 'I-765') return /C3|OPT|^F1/.test(c) ? 30 : null;
  return null;
}
export function federalHolidays(year: number): Set<string> {
  const d = (m: number, day: number) => new Date(Date.UTC(year, m, day));
  const nth = (m: number, wd: number, n: number) => { const x = d(m, 1); x.setUTCDate(1 + ((wd - x.getUTCDay() + 7) % 7) + (n - 1) * 7); return x; };
  const last = (m: number, wd: number) => { const x = d(m + 1, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() - wd + 7) % 7)); return x; };
  const obs = (x: Date) => { const w = x.getUTCDay(); if (w === 6) x.setUTCDate(x.getUTCDate() - 1); if (w === 0) x.setUTCDate(x.getUTCDate() + 1); return x; };
  return new Set([obs(d(0, 1)), nth(0, 1, 3), nth(1, 1, 3), last(4, 1), obs(d(5, 19)), obs(d(6, 4)), nth(8, 1, 1), nth(9, 1, 2), obs(d(10, 11)), nth(10, 4, 4), obs(d(11, 25))].map((x) => x.toISOString().slice(0, 10)));
}
export function addBusinessDays(iso: string, n: number): string {
  const x = new Date(iso + 'T00:00:00Z');
  let left = n;
  while (left > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    const w = x.getUTCDay();
    if (w !== 0 && w !== 6 && !federalHolidays(x.getUTCFullYear()).has(x.toISOString().slice(0, 10))) left--;
  }
  return x.toISOString().slice(0, 10);
}

// ---------- built-in summary (offline) ----------
// Official USCIS figures checked Nov 18, 2026. Median months and approval share of decisions, service-wide, FY2026 Q3
// (Apr–Jun 2026) from "Number of Service-wide Forms by Quarter, Form Status, and Processing Time"
// (quarterly_all_forms_fy2026_q3_v1.xlsx). I-129 rates by class: FY2026 Q1–Q3 from the I-129 RFE data file
// (i129_quarterly_request_for_evidence_fy2026_q3_v1.xlsx) as published in public summaries of that file.
export const BUILTIN_AS_OF = 'Nov 18, 2026';
export const BUILTIN_PERIOD = 'FY2026 Q3';
type BuiltinRow = { form: string; category?: string; match?: RegExp; medianMonths: number | null; approved: number; denied: number };
export const BUILTIN_OFFICIAL: BuiltinRow[] = [
  { form: 'I-130', category: 'Immediate Relative', medianMonths: 13, approved: 82636, denied: 16661 },
  { form: 'I-130', category: 'All Other Relative', match: /other/i, medianMonths: 43.3, approved: 7951, denied: 8883 },
  { form: 'I-751', medianMonths: 22.6, approved: 10368, denied: 626 },
  { form: 'I-765', category: 'Adjustment of Status', match: /C9/, medianMonths: 6.4, approved: 46405, denied: 35767 },
  { form: 'I-765', category: 'All Other', medianMonths: 3.3, approved: 125656, denied: 19787 },
  { form: 'I-485', category: 'Employment', medianMonths: 6, approved: 42076, denied: 3160 },
  { form: 'I-485', category: 'Family', match: /family/i, medianMonths: 7, approved: 54678, denied: 12240 },
  { form: 'N-400', category: 'All Other', medianMonths: 9.5, approved: 54974, denied: 12591 },
];
export const BUILTIN_RFE: Record<string, { classification: string; completions: number; approvalRate: number; rfeRate: number }> = {
  H1B: { classification: 'H-1B', completions: 278650, approvalRate: 97.0, rfeRate: 8.5 },
  L1A: { classification: 'L-1A', completions: 18553, approvalRate: 91.2, rfeRate: 25.9 },
  L1B: { classification: 'L-1B', completions: 10263, approvalRate: 91.3, rfeRate: 29.4 },
  O1: { classification: 'O', completions: 23417, approvalRate: 91.0, rfeRate: 24.2 },
};

export type ExpectInput = { form: string; office?: string; received?: string; premium?: boolean; cls?: string; category?: string };
const r1 = (n: number) => Math.round(n * 10) / 10;
const addMonths = (iso: string, m: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(m * 30.44)); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function processingFor(form: string, cls?: string, data: PT[] = PROCESSING, asOf = PT_AS_OF): ExpectResult['processing'] {
  const all = data.filter((p) => p.form === form);
  const re = CLASS_WORDS[normClass(cls)];
  const hit = re ? all.filter((p) => re.test(p.category)) : [];
  const use = hit.length ? hit : all;
  if (!use.length) return null;
  const m = use.map((r) => r.months);
  return { asOf, source: 'USCIS processing times (egov.uscis.gov/processing-times)', measure: '8 in 10 cases decided within', rows: use, minMonths: Math.min(...m), maxMonths: Math.max(...m), matched: hit.length ? 'class' : 'form' };
}

/** The same answer as the server, from built-in numbers only (no community timelines). */
export function localExpect(q: ExpectInput, today = new Date().toISOString().slice(0, 10), processing: PT[] = PROCESSING): ExpectResult {
  const k = normClass(q.cls);
  const rows = BUILTIN_OFFICIAL.filter((r) => r.form === q.form);
  const b = rows.find((r) => r.match && (r.match.test(k) || (q.category && r.match.test(q.category)))) ?? rows.find((r) => !r.match) ?? rows[0];
  const official: OfficialRow | null = b ? {
    period: BUILTIN_PERIOD, form: b.form, category: b.category ?? null, received: null, approved: b.approved, denied: b.denied, completed: b.approved + b.denied, pending: null,
    medianMonths: b.medianMonths, approvalRate: r1((b.approved / (b.approved + b.denied)) * 100), note: 'Service-wide, all categories of this form together.',
  } : null;
  const br = q.form === 'I-129' ? BUILTIN_RFE[k] ?? (k === 'L1' ? BUILTIN_RFE.L1A : undefined) : undefined;
  const rfe: RfeStats | null = br ? { ...br, period: 'FY2026 Q1–Q3', fy: 2026, approvalAfterRfe: null } : null;
  const pt = processingFor(q.form, q.cls, processing);
  const clock = q.premium ? premiumClock(q.form, q.cls) : null;
  let window: ExpectResult['window'] = null;
  if (q.received && !clock) {
    const lo = official?.medianMonths ?? null, hi = pt?.maxMonths ?? null;
    if (lo != null || hi != null) {
      const from = lo == null ? 0 : Math.min(lo, hi ?? lo), to = Math.max(lo ?? hi!, hi ?? lo!); // only the 8-in-10 time known → 0…that time
      window = { fromMonths: from, toMonths: to, from: addMonths(q.received, from), to: addMonths(q.received, to), basis: lo != null && hi != null ? 'USCIS median for this form to USCIS 8-in-10 time' : lo != null ? 'USCIS median for this form' : 'USCIS 8-in-10 time' };
    }
  }
  const po = processingOffice(q.form, q.office);
  return {
    query: { form: q.form, office: q.office ?? null, officeName: q.office ? officeName(q.office) : null, received: q.received ?? null, premium: !!q.premium, cls: q.cls ?? null },
    processingOffice: po.name, officeNote: po.note, elapsedDays: q.received ? Math.max(0, daysBetween(q.received, today)) : null,
    window, official, rfe, h1b: null, processing: pt,
    premium: q.premium ? (clock ? { businessDays: clock, decisionBy: q.received ? addBusinessDays(q.received, clock) : null, note: premiumNote(clock) } : { businessDays: null, note: 'Premium processing is not available for this form or category.' }) : null,
    community: { hidden: true, shared: 0, minSample: MIN_COMMUNITY },
    rfeEffect: RFE_EFFECT,
    sources: [
      { name: 'USCIS — Number of Service-wide Forms by Quarter, Form Status, and Processing Time', period: BUILTIN_PERIOD },
      ...(rfe ? [{ name: 'USCIS — I-129 petitions by case status and Request for Evidence', period: 'FY2026 Q1–Q3' }] : []),
      ...(pt ? [{ name: pt.source, period: pt.asOf }] : []),
    ],
    disclaimer: DISCLAIMER,
  };
}
export const premiumNote = (clock: number) => `USCIS must act within ${clock} business days of receiving the I-907 — an approval, denial, or a request for evidence. A request for evidence stops the clock; a new ${clock}-day clock starts when your response arrives. If premium was added later, count from the I-907 receipt date.`;
export const RFE_EFFECT = 'A request for evidence pauses the case until you answer (up to 87 days with mailing) and USCIS then needs time to review the response — expect a later decision than the window shown.';

// ---------- what the card shows ----------
const mo = (n: number) => (n < 1 ? `${Math.max(1, Math.round(n * 4.35))} weeks` : `${r1(n)} months`);
const range = (a: number, b: number) => (Math.round(a) === Math.round(b) ? `about ${mo(a)}` : a < 1 && b < 1 ? `${Math.round(a * 4.35)}–${Math.round(b * 4.35)} weeks` : `${Math.round(a)}–${Math.round(b)} months`);
const monthLabel = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export type ExpectView = {
  headline: string; sub?: string; communityLine?: string; officeLine: string;
  tiles: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }[];
  chart: ChartModel | null; rfeLine?: string; premiumLine?: string; mine?: string;
  communityHidden: boolean; communityShared: number;
  asOf: string; live: boolean; sources: string[]; disclaimer: string;
};
export type ChartModel = { maxDays: number; todayDays: number | null; window?: [number, number]; community?: [number, number]; premiumDays?: number; decidedDays?: number; ticks: { days: number; label: string }[] };

export function describe(r: ExpectResult, opts: { live: boolean; asOf?: string; outcome?: Outcome; decided?: string } = { live: false }): ExpectView {
  const q = r.query;
  const who = `${q.form}${q.cls ? ` ${classLabel(q.cls)}` : ''}`;
  const c = r.community;
  const tiles: ExpectView['tiles'] = [];
  let headline: string;
  if (r.premium?.businessDays) headline = `Premium processing: USCIS must act within ${r.premium.businessDays} business days${r.premium.decisionBy ? ` — by ${fmtDate(r.premium.decisionBy)}` : ''}`;
  else if (r.window && r.window.fromMonths === 0) headline = `USCIS decides 8 in 10 ${who} cases within ${mo(r.window.toMonths)}${q.received ? ` — for you, by ${fmtDate(r.window.to)}` : ''}`;
  else if (r.window) headline = `Typical decision window for ${who}: ${range(r.window.fromMonths, r.window.toMonths)} after USCIS receives it`;
  else if (r.processing) headline = `USCIS decides 8 in 10 ${who} cases within ${mo(r.processing.maxMonths)}`;
  else headline = `No published timing for ${who} yet`;
  const parts = [r.official?.medianMonths != null ? `half of all ${q.form} cases USCIS finished in ${r.official.period} took under ${mo(r.official.medianMonths)}` : '', r.processing ? `8 in 10 ${r.processing.matched === 'class' && q.cls ? `${classLabel(q.cls)} ` : ''}cases are done within ${mo(r.processing.maxMonths)}` : ''].filter(Boolean);
  const sub = r.window && r.window.fromMonths > 0 ? `For you: ${fmtDate(r.window.from)} – ${fmtDate(r.window.to)}. ${parts.join('; ').replace(/^./, (x) => x.toUpperCase())}.` : undefined;
  let communityLine: string | undefined;
  if (!c.hidden && c.p25Days != null && c.p75Days != null) {
    const where = c.scope.startsWith('same office') && q.office ? ` at ${q.office}` : '';
    const when = c.scope.includes('same month') && q.received ? ` filed in ${monthLabel(q.received)}` : c.scope.includes('within a month') && q.received ? ` filed around ${monthLabel(q.received)}` : '';
    communityLine = `Most ${who} cases${where}${when} shared in the app were decided in ${range(c.p25Days / 30.44, c.p75Days / 30.44)} (middle half of ${c.decided} decided)`;
  }
  if (r.official?.approvalRate != null) tiles.push({ label: `approved · USCIS ${r.official.period}`, value: `${Math.round(r.official.approvalRate)}%`, tone: 'green' });
  if (r.rfe?.approvalRate != null) tiles.push({ label: `${r.rfe.classification} approved · ${r.rfe.period ?? `FY${r.rfe.fy}`}`, value: `${Math.round(r.rfe.approvalRate)}%`, tone: 'green' });
  if (r.rfe?.rfeRate != null) tiles.push({ label: `${r.rfe.classification} got an RFE`, value: `${Math.round(r.rfe.rfeRate)}%`, tone: 'amber' });
  if (r.official?.medianMonths != null) tiles.push({ label: 'median, all USCIS', value: mo(r.official.medianMonths) });
  if (!c.hidden) {
    const tot = c.approved + c.denied + c.rfe;
    if (tot) tiles.push({ label: `app users approved (${c.decided} decided)`, value: `${c.approvalRate}%`, tone: 'green' });
    if (c.rfe) tiles.push({ label: 'app users now in RFE', value: `${Math.round((c.rfe / c.total) * 100)}%`, tone: 'amber' });
  }
  if (r.h1b?.continuingApprovalRate != null) tiles.push({ label: `H-1B extensions approved · Data Hub FY${r.h1b.fy}`, value: `${Math.round(r.h1b.continuingApprovalRate)}%`, tone: 'green' });

  // Chart, in days from receipt
  let chart: ChartModel | null = null;
  if (q.received) {
    const win: [number, number] | undefined = r.window ? [Math.round(r.window.fromMonths * 30.44), Math.round(r.window.toMonths * 30.44)] : undefined;
    const com: [number, number] | undefined = !c.hidden && c.p25Days != null && c.p75Days != null ? [c.p25Days, c.p75Days] : undefined;
    const prem = r.premium?.decisionBy ? daysBetween(q.received, r.premium.decisionBy) : undefined;
    const decidedDays = opts.decided ? daysBetween(q.received, opts.decided) : undefined;
    const today = r.elapsedDays;
    const maxDays = Math.max(30, win?.[1] ?? 0, com?.[1] ?? 0, prem ?? 0, decidedDays ?? 0, today ?? 0) * 1.08;
    const step = maxDays > 540 ? 180 : maxDays > 200 ? 90 : maxDays > 70 ? 30 : 7;
    const ticks = [] as ChartModel['ticks'];
    for (let d = 0; d <= maxDays; d += step) ticks.push({ days: d, label: d === 0 ? 'Filed' : step === 7 ? `${d / 7}w` : `${Math.round(d / 30.44)}m` });
    chart = { maxDays: Math.round(maxDays), todayDays: opts.outcome === 'approved' || opts.outcome === 'denied' ? null : today, window: win, community: com, premiumDays: prem, decidedDays, ticks };
  }
  let mine: string | undefined;
  if (opts.decided && q.received) {
    const d = daysBetween(q.received, opts.decided);
    mine = `Your case took ${mo(d / 30.44)}${r.window ? (d / 30.44 < r.window.fromMonths ? ' — faster than most.' : d / 30.44 > r.window.toMonths ? ' — longer than most.' : ' — within the usual range.') : '.'}`;
  } else if (r.elapsedDays != null && r.window && opts.outcome !== 'approved' && opts.outcome !== 'denied') {
    const m = r.elapsedDays / 30.44;
    mine = m < r.window.fromMonths ? `${mo(m)} so far — still early.` : m <= r.window.toMonths ? `${mo(m)} so far — inside the usual window.` : `${mo(m)} so far — longer than 8 in 10 cases. You can ask USCIS about a case outside normal processing time.`;
  }
  const rfeLine = r.rfe?.approvalAfterRfe != null ? `${r.rfe.classification}: ${Math.round(r.rfe.approvalAfterRfe)}% of petitions that got an RFE were approved after the response. ${r.rfeEffect}` : opts.outcome === 'rfe' ? r.rfeEffect : undefined;
  return {
    headline, sub, communityLine,
    officeLine: `${q.office ? `${q.office} · ${officeName(q.office)}. ` : ''}Decided by: ${r.processingOffice}. ${r.officeNote}`.trim(),
    tiles: tiles.slice(0, 4), chart, rfeLine, premiumLine: r.premium?.note, mine,
    communityHidden: c.hidden, communityShared: c.hidden ? c.shared : c.total,
    asOf: opts.asOf ?? (r.official?.period ? `USCIS ${r.official.period}` : BUILTIN_AS_OF), live: opts.live,
    sources: r.sources.map((s) => `${s.name}${s.period ? ` · ${s.period}` : ''}`), disclaimer: r.disclaimer || DISCLAIMER,
  };
}

/** Query string for /api/expect — only the form, office code, received date, premium and class. Never the receipt. */
export const expectQuery = (q: ExpectInput) => `/api/expect?${[['form', q.form], ['office', q.office], ['received', q.received], ['premium', q.premium ? '1' : '0'], ['cls', q.cls], ['category', q.category]].filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;

/** What one shared "Cases like mine" entry contains (shown to the user before they opt in). */
export function sharePayload(id: string, c: CaseView, cls?: string, premium?: boolean) {
  const office = officeOf(c.receipt), received = receivedOf(c);
  if (!c.form || !office || !received) return null;
  const outcome = outcomeOf(c);
  return { id, form: c.form, office, received, decided: decidedOf(c) ?? null, outcome, premium: !!premium, ...(cls ? { cls: normClass(cls) } : {}) };
}
export const randomId = (rnd: () => number = Math.random) => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');

export const EXPECT_HELP: HelpTopic = {
  id: 'expect', title: 'How expected timing works', sub: 'What to expect on each case, and Cases like mine',
  body: [
    'Each case shows a typical decision window: from the USCIS median for that form (half of the cases USCIS finished last quarter took longer) to the USCIS published time in which 8 in 10 cases are done. It is counted from the date USCIS received your case.',
    'Official numbers come first: USCIS quarterly statistics for every form (received, approved, denied, median months), I-129 approval and Request for Evidence rates by visa class, the H-1B Employer Data Hub and USCIS processing times. Each shows its quarter or date.',
    'The receipt prefix (EAC, WAC, LIN, SRC, IOE …) shows where the case was received, not who decides it. Service centers share work, so USCIS publishes one time for I-129, I-140, I-539 and I-765 across all of them. Online (IOE) cases can go to any center.',
    'Premium processing is a clock, not an estimate: USCIS must approve, deny or send a Request for Evidence within 15 business days (45 for some I-140s, 30 for some I-539s and OPT work permits). An RFE stops the clock; a new one starts when your response arrives.',
    'Cases like mine: timelines that app users shared anonymously — only the form, the 3-letter office code, the received and decided dates, the outcome, premium yes/no and the visa class. Never the receipt number, a name or the device. You can stop sharing any time and the entry is deleted. Numbers appear only once at least 10 similar cases are decided.',
    'Without a connection the card shows the built-in summary and its date. All of this is an estimate from public numbers — not a prediction of your case and not legal advice.',
  ],
  steps: ['Cases → open a case → What to expect', 'Tap Premium or a visa class if they apply', 'Turn on “Add my case anonymously” to help others'],
};
