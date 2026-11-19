// "What to expect" for one case: GET /api/expect?form=I-129&office=EAC&received=2026-08-14&premium=0&cls=L1A
// Combines, in this order:
//  1) official USCIS statistics (data/form-stats.json, built weekly by scripts/update-data.mjs → ingest-form-stats.mjs):
//     service-wide approvals/denials and median processing time for the form; I-129 RFE and approval rates by class;
//     H-1B Employer Data Hub national approval rates
//  2) USCIS published processing times ("8 in 10 cases done within", data/content/processing.json or the built-in copy)
//  3) anonymous "Cases like mine" timelines (community.mjs), shown only when at least 10 similar cases are decided
// It is an estimate from public numbers, never a prediction for one case. No receipt numbers are sent or stored.
import fs from 'node:fs';
import path from 'node:path';
import { cohort } from './community.mjs';

export const MIN_COMMUNITY = 10;
const DISCLAIMER = 'Estimate from public USCIS statistics and anonymous app users — not a prediction of your case and not legal advice.';

// Receipt prefixes (first 3 letters) → where the case was received. The receipt tells intake, not who decides it:
// service centers share work, so I-129/I-140/I-539/I-765 times are published for Service Center Operations as one.
export const OFFICES = {
  EAC: 'Vermont Service Center', VSC: 'Vermont Service Center',
  WAC: 'California Service Center', CSC: 'California Service Center',
  LIN: 'Nebraska Service Center', NSC: 'Nebraska Service Center',
  SRC: 'Texas Service Center', TSC: 'Texas Service Center',
  YSC: 'Potomac Service Center',
  NBC: 'National Benefits Center', MSC: 'National Benefits Center',
  IOE: 'Filed online (USCIS ELIS)',
};
const SC_FORMS = /^(I-129|I-129F|I-129S|I-140|I-539|I-765|I-131|I-751|I-360|I-526E?|I-829|I-824|I-907|I-90)$/;
const FIELD_FORMS = /^(N-400|N-600|I-485|I-130)$/;
export function processingOffice(form, office) {
  if (SC_FORMS.test(form)) return { name: 'Service Center Operations (all service centers)', note: office === 'IOE' ? 'Online (IOE) cases are assigned to any service center, so the receipt does not say who decides it.' : 'Service centers share cases, so USCIS publishes one time for all of them.' };
  if (FIELD_FORMS.test(form)) return { name: form === 'I-130' ? 'Service centers / National Benefits Center' : 'Your local USCIS field office', note: 'Times for this form depend on the office that interviews or decides it — usually set by your address, not the receipt prefix.' };
  return { name: OFFICES[office] || 'USCIS', note: '' };
}

// Premium processing clocks (business days, set by the 2024 fee rule). The clock starts when USCIS receives the I-907
// (later than the case receipt date if premium was added later). An RFE or NOID stops it; a new full clock starts when
// USCIS receives the response. USCIS meets the clock by approving, denying, or issuing an RFE/NOID.
export function premiumClock(form, cls = '') {
  const c = String(cls).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (form === 'I-129') return 15;
  if (form === 'I-140') return /E13|EB1C|E21NIW|NIW/.test(c) ? 45 : 15;
  if (form === 'I-539') return /^(F|J|M)/.test(c) ? 30 : null;
  if (form === 'I-765') return /C3|OPT/.test(c) ? 30 : null;
  return null;
}
// US federal holidays (observed) for business-day counting.
export function federalHolidays(year) {
  const d = (m, day) => new Date(Date.UTC(year, m, day));
  const nth = (m, wd, n) => { const x = d(m, 1); x.setUTCDate(1 + ((wd - x.getUTCDay() + 7) % 7) + (n - 1) * 7); return x; };
  const last = (m, wd) => { const x = d(m + 1, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() - wd + 7) % 7)); return x; };
  const obs = (x) => { const w = x.getUTCDay(); if (w === 6) x.setUTCDate(x.getUTCDate() - 1); if (w === 0) x.setUTCDate(x.getUTCDate() + 1); return x; };
  return new Set([obs(d(0, 1)), nth(0, 1, 3), nth(1, 1, 3), last(4, 1), obs(d(5, 19)), obs(d(6, 4)), nth(8, 1, 1), nth(9, 1, 2), obs(d(10, 11)), nth(10, 4, 4), obs(d(11, 25))].map((x) => x.toISOString().slice(0, 10)));
}
export function addBusinessDays(iso, n) {
  const x = new Date(iso + 'T00:00:00Z');
  let left = n;
  while (left > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    const w = x.getUTCDay(), s = x.toISOString().slice(0, 10);
    if (w !== 0 && w !== 6 && !federalHolidays(x.getUTCFullYear()).has(s)) left--;
  }
  return x.toISOString().slice(0, 10);
}

// Built-in copy of USCIS published processing times (8 in 10 cases done within), used when the server has no
// data/content/processing.json. Same snapshot as the app (casedesk/app/src/content/processing.ts).
const PT_DEFAULT = {
  asOf: 'Oct 19, 2026',
  items: [
    { form: 'I-129', category: 'H-1B — change of status in the US', months: 11.5 }, { form: 'I-129', category: 'H-1B — extension of stay', months: 12.5 },
    { form: 'I-129', category: 'H-1B — visa abroad (consular)', months: 13 }, { form: 'I-129', category: 'L-1 individual and blanket L', months: 10.5 },
    { form: 'I-129', category: 'TN — USMCA professional', months: 7 }, { form: 'I-129', category: 'O — extraordinary ability', months: 17.5 },
    { form: 'I-539', category: 'H-4 extension (with I-765)', months: 9 }, { form: 'I-539', category: 'H-4 extension', months: 13.5 },
    { form: 'I-539', category: 'Change to H-4 (with I-765)', months: 9.5 }, { form: 'I-539', category: 'L-2 extension', months: 12 }, { form: 'I-539', category: 'Change to L-2', months: 16 },
    { form: 'I-765', category: 'F-1 student — OPT / STEM OPT (c)(3)', months: 6.5 }, { form: 'I-765', category: 'H-4 EAD filed with I-539 (c)(26)', months: 10 },
    { form: 'I-765', category: 'H-4 EAD standalone (c)(26)', months: 19 }, { form: 'I-765', category: 'Pending green card (c)(9)', months: 16 },
    { form: 'I-140', category: 'EB-2 advanced degree', months: 6.5 }, { form: 'I-140', category: 'EB-3 skilled / professional', months: 8 },
    { form: 'I-140', category: 'EB-1C multinational manager', months: 30 }, { form: 'I-140', category: 'EB-2 National Interest Waiver', months: 36 },
    { form: 'I-485', category: 'Employment-based green card', months: 48 }, { form: 'I-131', category: 'Advance parole', months: 36 },
  ],
};

const cache = {};
function readJson(file) {
  const f = path.resolve(file);
  if (!fs.existsSync(f)) return null;
  const m = fs.statSync(f).mtimeMs;
  if (cache[f]?.m !== m) { try { cache[f] = { m, v: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return null; } }
  return cache[f].v;
}
const processingData = () => { const p = readJson('data/content/processing.json'); return p && Array.isArray(p.items) && p.items.length ? p : PT_DEFAULT; };

// Class tag → words to look for in processing-time categories and in official rows
const CLASS_WORDS = { H1B: /H-?1B/i, L1A: /L-?1/i, L1B: /L-?1/i, L1: /L-?1/i, TN: /\bTN\b/i, O1: /\bO\b|O-1/i, H4: /H-4/i, L2: /L-2/i, F1: /OPT|F-1/i, C9: /\(c\)\(9\)|green card/i, C26: /\(c\)\(26\)|H-4/i };
export function normClass(cls = '') {
  const c = String(cls).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^H1B/.test(c)) return 'H1B';
  if (/^L1A/.test(c)) return 'L1A';
  if (/^L1B/.test(c)) return 'L1B';
  if (/^L1|^LBLANKET/.test(c)) return 'L1';
  if (/^O1|^O$/.test(c)) return 'O1';
  if (/^(TN|E3|E1|E2|H4|L2|F1|C9|C26|C3)$/.test(c)) return c === 'C3' ? 'F1' : c;
  if (/^L2S?$/.test(c)) return 'L2';
  return c.slice(0, 8);
}

function processingRange(form, cls) {
  const p = processingData();
  const all = p.items.filter((i) => i.form === form);
  const re = CLASS_WORDS[normClass(cls)];
  const rows = re ? all.filter((i) => re.test(i.category)) : [];
  const use = rows.length ? rows : all;
  if (!use.length) return null;
  const months = use.map((r) => r.months);
  return { asOf: p.asOf, source: 'USCIS processing times (egov.uscis.gov/processing-times)', measure: '8 in 10 cases decided within', rows: use, minMonths: Math.min(...months), maxMonths: Math.max(...months), matched: rows.length ? 'class' : 'form' };
}

// Official row for a form (+ category when the form is split, e.g. I-485 Employment vs Family)
const CATEGORY_HINT = { 'I-485': { default: /employment/i }, 'I-765': { C9: /adjustment/i, default: /all other/i }, 'I-130': { default: /immediate/i }, 'N-400': { default: /all other/i } };
function officialRow(stats, form, cls, category) {
  const rows = (stats?.allForms?.rows || []).filter((r) => r.form === form);
  if (rows.length <= 1) return rows[0] || null;
  const want = category ? new RegExp(category.replace(/[^A-Za-z ]/g, '').trim() || '.', 'i') : (CATEGORY_HINT[form]?.[normClass(cls)] || CATEGORY_HINT[form]?.default);
  return (want && rows.find((r) => want.test(`${r.category} ${r.description}`))) || rows[0];
}
function rfeFor(stats, cls) {
  const classes = stats?.rfe?.classes || {};
  const k = normClass(cls);
  const hit = classes[k] || (k === 'L1' ? classes.L1A : null) || (k === 'O1' ? classes.O || classes.O1A : null) || null;
  return hit ? { classification: hit.label, period: stats.rfe.label || null, ...hit.latest, previous: hit.previous } : null;
}

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const quant = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)); };
const monthShift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** Community cohort: narrowest group with ≥ MIN_COMMUNITY decided cases. */
export function communityFor({ form, office, received, premium, cls }, rows = cohort(() => true)) {
  const ym = received ? received.slice(0, 7) : null;
  const k = normClass(cls);
  const sameCls = (r) => !k || !r.cls || normClass(r.cls) === k;
  const near = (r, w) => !ym || (r.received.slice(0, 7) >= monthShift(ym, -w) && r.received.slice(0, 7) <= monthShift(ym, w));
  const base = rows.filter((r) => r.form === form && !!r.premium === !!premium && sameCls(r));
  const levels = [
    { scope: 'same office, filed the same month', f: (r) => r.office === office && near(r, 0) },
    { scope: 'same office, filed within a month of yours', f: (r) => r.office === office && near(r, 1) },
    { scope: 'any office, filed within a month of yours', f: (r) => near(r, 1) },
    { scope: 'same office, filed in the last year', f: (r) => r.office === office && near(r, 6) },
    { scope: 'any office, filed in the last year', f: (r) => near(r, 6) },
  ];
  let pick = null;
  for (const l of levels) {
    const all = base.filter(l.f);
    const decided = all.filter((r) => r.decided && (r.outcome === 'approved' || r.outcome === 'denied'));
    if (decided.length >= MIN_COMMUNITY) { pick = { ...l, all, decided }; break; }
  }
  if (!pick) return { hidden: true, shared: base.length, minSample: MIN_COMMUNITY };
  const durs = pick.decided.map((r) => days(r.received, r.decided)).filter((d) => d >= 0).sort((a, b) => a - b);
  const count = (o) => pick.all.filter((r) => r.outcome === o).length;
  const byMonths = {};
  for (const d of durs) { const m = Math.floor(d / 30.44); byMonths[m] = (byMonths[m] || 0) + 1; }
  return {
    hidden: false, scope: pick.scope, minSample: MIN_COMMUNITY,
    total: pick.all.length, decided: pick.decided.length,
    approved: count('approved'), denied: count('denied'), rfe: count('rfe'), pending: count('pending'),
    approvalRate: Math.round((count('approved') / pick.decided.length) * 100),
    p25Days: quant(durs, 0.25), medianDays: quant(durs, 0.5), p75Days: quant(durs, 0.75),
    histogram: Object.entries(byMonths).map(([m, n]) => ({ month: +m, n })).sort((a, b) => a.month - b.month),
  };
}

const err = (status, message) => Object.assign(new Error(message), { status });
export function expectFor(q, { stats = readJson('data/form-stats.json'), rows, today = new Date().toISOString().slice(0, 10) } = {}) {
  const get = (k) => (typeof q.get === 'function' ? q.get(k) : q[k]) || '';
  const form = get('form').toUpperCase().replace(/^I(\d)/, 'I-$1').replace(/^N(\d)/, 'N-$1');
  const office = get('office').toUpperCase().slice(0, 3);
  const received = /^\d{4}-\d{2}-\d{2}$/.test(get('received')) ? get('received') : '';
  const premium = get('premium') === '1' || get('premium') === 'true';
  const cls = get('cls'), category = get('category');
  if (!/^(I|N)-\d{2,4}[A-Z]?$/.test(form)) throw err(400, 'Missing form');
  if (office && !/^[A-Z]{3}$/.test(office)) throw err(400, 'Bad office');

  const row = officialRow(stats, form, cls, category);
  const official = row ? {
    period: stats.allForms.label, start: stats.allForms.start, end: stats.allForms.end, builtAt: stats.builtAt,
    form: row.form, description: row.description, category: row.category || null,
    received: row.received, approved: row.approved, denied: row.denied, completed: row.completed, pending: row.pending,
    medianMonths: row.medianMonths, approvalRate: row.approvalRate, fytd: row.fytd || null, trend: row.trend || [],
    note: 'Service-wide, all categories of this form together, premium and regular. Median = half of cases completed that quarter took longer.',
  } : null;
  const rfe = form === 'I-129' ? rfeFor(stats, cls) : null;
  const hubYears = Object.keys(stats?.h1bHub || {}).sort();
  const h1b = form === 'I-129' && normClass(cls) === 'H1B' && hubYears.length ? { fy: hubYears.at(-1), ...stats.h1bHub[hubYears.at(-1)] } : null;
  const processing = processingRange(form, cls);
  const clock = premium ? premiumClock(form, cls) : null;
  const premiumInfo = premium ? (clock ? {
    businessDays: clock, decisionBy: received ? addBusinessDays(received, clock) : null,
    note: `USCIS must act within ${clock} business days of receiving the I-907 — an approval, denial, or a request for evidence. A request for evidence stops the clock; a new ${clock}-day clock starts when your response arrives. If premium was added later, count from the I-907 receipt date.`,
  } : { businessDays: null, note: 'Premium processing is not available for this form or category.' }) : null;

  // Expected decision window from the received date: official median → published 8-in-10 time (regular processing)
  let window = null;
  if (received && !premiumInfo?.businessDays) {
    const lo = official?.medianMonths ?? null, hi = processing?.maxMonths ?? null;
    if (lo != null || hi != null) {
      const addM = (m) => { const d = new Date(received + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(m * 30.44)); return d.toISOString().slice(0, 10); };
      const from = lo != null && hi != null ? Math.min(lo, hi) : lo ?? hi, to = hi != null && lo != null ? Math.max(lo, hi) : hi ?? lo;
      window = { fromMonths: from, toMonths: to, from: addM(from), to: addM(to), basis: `${lo != null ? 'USCIS median for this form' : ''}${lo != null && hi != null ? ' to ' : ''}${hi != null ? 'USCIS 8-in-10 time' : ''}` };
    }
  }
  const community = communityFor({ form, office, received, premium, cls }, rows ?? cohort(() => true));
  const po = processingOffice(form, office);
  return {
    query: { form, office: office || null, officeName: OFFICES[office] || null, received: received || null, premium, cls: cls || null },
    processingOffice: po.name, officeNote: po.note,
    elapsedDays: received ? Math.max(0, days(received, today)) : null,
    window, official, rfe, h1b, processing, premium: premiumInfo, community,
    rfeEffect: 'A request for evidence pauses the case until you answer (up to 87 days with mailing) and USCIS then needs time to review the response — expect a later decision than the window shown.',
    sources: [...(stats?.sources || []), ...(processing ? [{ name: processing.source, period: processing.asOf }] : []), { name: 'Immigration Wallet users who shared their timelines anonymously', period: 'live' }],
    disclaimer: DISCLAIMER,
  };
}
export function formStatsStatus() {
  const s = readJson('data/form-stats.json');
  return s ? { loaded: true, period: s.allForms?.label || null, rfe: s.rfe?.label || null, builtAt: s.builtAt } : { loaded: false };
}
