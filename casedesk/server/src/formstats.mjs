// Parsers for official USCIS form statistics (pure functions over spreadsheet rows, no I/O):
//  1) "Number of Service-wide Forms by Quarter, Form Status, and Processing Time"
//     (uscis.gov/sites/default/files/document/data/quarterly_all_forms_fyYYYY_qN[_v1].xlsx)
//     One sheet. Columns: Form | Description (| classification) | quarter: Received, Approved, Denied,
//     Total completions, Pending, median Processing Time (months) | fiscal-year-to-date: Received,
//     Approved, Denied, Total, Pending. Section rows (Family-Based, Employment-Based ...) have no form number.
//  2) "Nonimmigrant Worker Petitions by Case Status and Request for Evidence (RFE)"
//     (i129_quarterly_request_for_evidence_fyYYYY_qN[_v1].xlsx). One tab per classification (H-1B, L-1A ...),
//     monthly rows per fiscal year plus TOTAL rows; columns: receipts, approvals, denials, completions,
//     completions with RFE, approvals with RFE, denials with RFE (and % columns we recompute ourselves).
// Both layouts change slightly between releases, so columns are found by their header words, not position.

const FORM_RE = /^(I|N|G)-\d{2,4}[A-Z]{0,3}\b/i;
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '').trim();
// "1,234" → 1234; "-" → 0 (USCIS uses a dash for none); "D" (suppressed), "N/A", "" → null
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/[,%$]/g, '');
  if (s === '-' || s === '–' || s === '—') return 0;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const pct = (a, b) => (a != null && b ? Math.round((a / b) * 1000) / 10 : null);

// Fiscal year/quarter from a file name: quarterly_all_forms_fy2026_q3_v1.xlsx → { fy: 2026, q: 3 }
export function periodFromName(name = '') {
  const m = String(name).match(/fy[_ -]?(\d{4})[_ -]?q(?:tr)?[_ -]?(\d)/i);
  return m ? { fy: +m[1], q: +m[2] } : null;
}
// Federal FY: Q1 = Oct–Dec of the previous calendar year.
export function quarterDates(fy, q) {
  const startMonth = [9, 0, 3, 6][q - 1];
  const year = q === 1 ? fy - 1 : fy;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
// The last n finished federal fiscal quarters, newest first (USCIS posts each about 3–5 months after it ends).
export function recentQuarters(now = new Date(), n = 8) {
  let fy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  let q = Math.floor(((now.getUTCMonth() + 3) % 12) / 3) + 1;
  const out = [];
  for (let i = 0; i < n; i++) { q--; if (!q) { q = 4; fy--; } out.push({ fy, q }); }
  return out;
}
export const periodLabel = (fy, q) => `FY${fy} Q${q}`;

// Combined header text per column over a few rows (headers are often split over 2–3 rows / merged cells).
function headerText(aoa, from, to) {
  const width = Math.max(...aoa.slice(from, to + 1).map((r) => (r || []).length), 0);
  const out = [];
  for (let c = 0; c < width; c++) out.push(aoa.slice(from, to + 1).map((r) => clean(r?.[c])).filter(Boolean).join(' ').toLowerCase());
  return out;
}
const findFrom = (heads, re, from = 0, not) => { for (let i = from; i < heads.length; i++) if (re.test(heads[i]) && !(not && not.test(heads[i]))) return i; return -1; };

/** Parse the quarterly all-forms workbook (array of rows of the first sheet). */
export function parseAllForms(aoa, fileName = '') {
  const hr = aoa.findIndex((r) => (r || []).some((c) => /^received/i.test(clean(c))) && (r || []).some((c) => /^approved/i.test(clean(c))));
  if (hr < 0) throw new Error('header row with Received / Approved not found');
  const heads = headerText(aoa, Math.max(0, hr - 2), hr);
  const rec = findFrom(heads, /receiv/);
  const cols = { received: rec, approved: findFrom(heads, /approv/, rec), denied: findFrom(heads, /den/, rec) };
  cols.completed = findFrom(heads, /total|complet/, cols.denied);
  cols.pending = findFrom(heads, /pending/, rec);
  cols.median = findFrom(heads, /process|median|month/);
  const rec2 = findFrom(heads, /receiv/, Math.max(cols.pending, cols.median, cols.completed) + 1);
  const fy = rec2 < 0 ? null : { received: rec2, approved: findFrom(heads, /approv/, rec2), denied: findFrom(heads, /den/, rec2), completed: findFrom(heads, /total|complet/, rec2 + 2), pending: findFrom(heads, /pending/, rec2) };
  // Which column holds form numbers?
  const counts = {};
  for (const r of aoa.slice(hr + 1)) (r || []).forEach((c, i) => { if (i < rec && FORM_RE.test(clean(c))) counts[i] = (counts[i] || 0) + 1; });
  const formCol = +(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);

  // Period: file name, else a title line like "April 1, 2026 - June 30, 2026" / "3rd Quarter Fiscal Year 2026"
  let period = periodFromName(fileName);
  const title = aoa.slice(0, hr).map((r) => (r || []).map(clean).join(' ')).join(' ');
  if (!period) {
    const m = title.match(/(\d)(?:st|nd|rd|th)\s+quarter[^0-9]*(?:fiscal year|fy)\s*(\d{4})/i);
    if (m) period = { fy: +m[2], q: +m[1] };
  }
  const rows = [];
  let section = '', lastForm = '';
  for (const r of aoa.slice(hr + 1)) {
    if (!r || !r.some((c) => clean(c))) continue;
    const first = clean(r[formCol]);
    const texts = r.slice(0, rec).map(clean).filter(Boolean);
    if (/^total/i.test(first) || /^total\b/i.test(texts[0] || '')) { if (/all forms/i.test(texts.join(' '))) break; continue; }
    if (/^(notes?|source)\b/i.test(texts[0] || '')) break; // footnotes under the table
    let form = FORM_RE.test(first) ? first.match(FORM_RE)[0].toUpperCase() : '';
    const hasNumbers = num(r[cols.received]) != null || num(r[cols.pending]) != null || num(r[cols.approved]) != null;
    if (!form && !hasNumbers) { if (texts.length === 1 && texts[0].length < 60) section = texts[0]; continue; }
    if (!form) form = lastForm; // continuation row of a merged form cell
    if (!form) continue;
    lastForm = form;
    const desc = texts.filter((t) => !FORM_RE.test(t) || t.length > 10).map((t) => t.replace(FORM_RE, '').trim()).filter(Boolean).join(' · ');
    const paren = desc.match(/\(([^)]+)\)\s*$/)?.[1];
    const other = texts.length > 2 ? texts[texts.length - 1] : '';
    const category = clean(paren || (other && other !== desc ? other : '') || '');
    const pick = (c) => (c >= 0 ? num(r[c]) : null);
    const row = {
      form, section, description: desc, category,
      received: pick(cols.received), approved: pick(cols.approved), denied: pick(cols.denied),
      completed: pick(cols.completed), pending: pick(cols.pending), medianMonths: pick(cols.median),
    };
    if (row.completed == null && row.approved != null && row.denied != null) row.completed = row.approved + row.denied;
    row.approvalRate = pct(row.approved, (row.approved ?? 0) + (row.denied ?? 0));
    if (fy) {
      const f = { received: pick(fy.received), approved: pick(fy.approved), denied: pick(fy.denied), completed: pick(fy.completed), pending: pick(fy.pending) };
      f.approvalRate = pct(f.approved, (f.approved ?? 0) + (f.denied ?? 0));
      row.fytd = f;
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error('no form rows found');
  return { ...(period ? { fy: period.fy, q: period.q, label: periodLabel(period.fy, period.q), ...quarterDates(period.fy, period.q) } : {}), rows };
}

// Classification name from a tab name or title: "H-1B", "L-1A", "L-1B", "Blanket L", "O", "TN" …
export function classKey(s = '') {
  const u = String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (/BLANKET/.test(u)) return 'LBLANKET';
  const m = u.replace(/ /g, '').match(/^(H1B1|H1B|H2A|H2B|H3|L1A|L1B|L1|O1A|O1B|O1|O|P|Q|R|TN|E1|E2|E3|E)/);
  return m ? m[1] : u.replace(/ /g, '');
}

/** Parse one tab of the I-129 RFE workbook. Returns totals for the latest fiscal year in the tab (and the one before). */
export function parseRfeSheet(aoa, sheetName = '') {
  const hr = aoa.findIndex((r) => (r || []).some((c) => /receipt/i.test(clean(c))) && (r || []).some((c) => /approv/i.test(clean(c))));
  if (hr < 0) return null;
  const heads = headerText(aoa, Math.max(0, hr - 1), hr);
  const noPct = /%|percent|rate/;
  const col = {
    fy: findFrom(heads, /fiscal|^fy/), month: findFrom(heads, /month|quarter|period/),
    receipts: findFrom(heads, /receipt/),
    approvals: findFrom(heads, /approv/, 0, /rfe|evidence|%|percent|rate/),
    denials: findFrom(heads, /den/, 0, /rfe|evidence|%|percent|rate/),
    completions: findFrom(heads, /complet/, 0, /rfe|evidence|%|percent|rate/),
    rfeCompletions: findFrom(heads, /(rfe|evidence)/, 0, /approv|den|%|percent|rate/),
    rfeApprovals: findFrom(heads, /approv.*(rfe|evidence)|(rfe|evidence).*approv/, 0, noPct),
    rfeDenials: findFrom(heads, /den.*(rfe|evidence)|(rfe|evidence).*den/, 0, noPct),
  };
  const title = aoa.slice(0, hr).map((r) => (r || []).map(clean).join(' ')).join(' ');
  const cls = classKey(sheetName && !/^sheet\d*$/i.test(sheetName) ? sheetName : (title.match(/\(([^)]+)\)/)?.[1] || title));
  const byFy = {};
  let curFy = null;
  for (const r of aoa.slice(hr + 1)) {
    if (!r || !r.some((c) => clean(c))) continue;
    const fyCell = clean(r[col.fy]);
    const label = r.slice(0, Math.max(col.receipts, 1)).map(clean).join(' ');
    const fyM = fyCell.match(/(20\d{2})/) || label.match(/fy\s?(20\d{2})|(20\d{2})/i);
    if (fyM) curFy = +(fyM[1] || fyM[2]);
    if (!curFy || num(r[col.receipts]) == null && num(r[col.approvals]) == null) continue;
    const v = (c) => (c >= 0 ? num(r[c]) ?? 0 : 0);
    const isTotal = /total/i.test(label);
    const b = (byFy[curFy] ||= { sum: { receipts: 0, approvals: 0, denials: 0, completions: 0, rfeCompletions: 0, rfeApprovals: 0, rfeDenials: 0 }, total: null, months: 0 });
    const vals = { receipts: v(col.receipts), approvals: v(col.approvals), denials: v(col.denials), completions: v(col.completions), rfeCompletions: v(col.rfeCompletions), rfeApprovals: v(col.rfeApprovals), rfeDenials: v(col.rfeDenials) };
    if (isTotal) b.total = vals; else { for (const k in vals) b.sum[k] += vals[k]; b.months++; }
  }
  const years = Object.keys(byFy).map(Number).sort((a, b) => b - a);
  if (!years.length) return null;
  const shape = (fy) => {
    const b = byFy[fy];
    const t = b.total && b.total.completions ? b.total : b.sum;
    const completions = t.completions || t.approvals + t.denials;
    const rfeCompletions = t.rfeCompletions || t.rfeApprovals + t.rfeDenials;
    return {
      fy, months: b.months || null, receipts: t.receipts, approvals: t.approvals, denials: t.denials, completions,
      approvalRate: pct(t.approvals, completions), rfeCompletions, rfeRate: pct(rfeCompletions, completions),
      rfeApprovals: t.rfeApprovals, approvalAfterRfe: pct(t.rfeApprovals, rfeCompletions),
    };
  };
  return { classification: cls, label: sheetName || cls, latest: shape(years[0]), previous: years[1] ? shape(years[1]) : null };
}

/** All tabs of the RFE workbook: { sheetName: aoa } → { H1B: {...}, L1A: {...} } */
export function parseRfe(sheets, fileName = '') {
  const out = {};
  for (const [name, aoa] of Object.entries(sheets)) {
    const p = parseRfeSheet(aoa, name);
    if (p && p.latest.completions) out[p.classification] = p;
  }
  const period = periodFromName(fileName);
  return { ...(period ? { fy: period.fy, q: period.q, label: periodLabel(period.fy, period.q) } : {}), classes: out };
}

/** National H-1B approval totals by fiscal year from H-1B Employer Data Hub rows (any column naming). */
export function addHubRow(acc, row, fyFallback = '') {
  const keys = Object.keys(row);
  const fy = String(row[keys.find((h) => /fiscal year/i.test(h))] || '').trim() || fyFallback;
  if (!/^20\d{2}$/.test(fy)) return acc;
  const y = (acc[fy] ||= { initialApproval: 0, initialDenial: 0, continuingApproval: 0, continuingDenial: 0 });
  for (const h of keys) {
    const v = parseInt(String(row[h] ?? '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!v || /year|zip|naics|tax id|code/i.test(h)) continue;
    const initial = /initial|new employment/i.test(h);
    if (/approv/i.test(h)) initial ? (y.initialApproval += v) : (y.continuingApproval += v);
    else if (/denial|denied/i.test(h)) initial ? (y.initialDenial += v) : (y.continuingDenial += v);
  }
  return acc;
}
export function hubSummary(acc) {
  const out = {};
  for (const [fy, y] of Object.entries(acc)) {
    out[fy] = { ...y, initialApprovalRate: pct(y.initialApproval, y.initialApproval + y.initialDenial), continuingApprovalRate: pct(y.continuingApproval, y.continuingApproval + y.continuingDenial) };
  }
  return out;
}

/** Combine parsed files into data/form-stats.json. allForms: [{ parsed, url, file }] newest first. */
export function buildFormStats({ allForms = [], rfe = null, hub = null, builtAt = new Date().toISOString() }) {
  const sorted = [...allForms].filter((a) => a.parsed).sort((a, b) => (b.parsed.fy * 10 + b.parsed.q) - (a.parsed.fy * 10 + a.parsed.q));
  const cur = sorted[0];
  const key = (r) => `${r.form}|${r.category || r.description}`;
  const trend = {};
  for (const a of [...sorted].reverse()) for (const r of a.parsed.rows) (trend[key(r)] ||= []).push({ period: a.parsed.label, medianMonths: r.medianMonths, approvalRate: r.approvalRate, completed: r.completed });
  const sources = [];
  if (cur) sources.push({ name: 'USCIS — Number of Service-wide Forms by Quarter, Form Status, and Processing Time', period: cur.parsed.label, url: cur.url || null, file: cur.file });
  if (rfe) sources.push({ name: 'USCIS — Nonimmigrant Worker Petitions (I-129) by Case Status and Request for Evidence', period: rfe.parsed.label || null, url: rfe.url || null, file: rfe.file });
  if (hub && Object.keys(hub).length) sources.push({ name: 'USCIS — H-1B Employer Data Hub', period: `FY${Object.keys(hub).sort().slice(-1)[0]}`, url: 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub' });
  return {
    builtAt,
    allForms: cur ? { fy: cur.parsed.fy, q: cur.parsed.q, label: cur.parsed.label, start: cur.parsed.start, end: cur.parsed.end, rows: cur.parsed.rows.map((r) => ({ ...r, trend: trend[key(r)] })) } : null,
    rfe: rfe ? rfe.parsed : null,
    h1bHub: hub && Object.keys(hub).length ? hub : null,
    sources,
  };
}
