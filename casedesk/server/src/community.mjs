// "Cases like mine": anonymous, opt-in timelines. Stores only form type, the 3-letter office code,
// the month+day a case was received and when/how it was decided. No receipt numbers, names or devices.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE = path.resolve('data/community.json');
let rows = [];
try { rows = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
let dirty = false;
setInterval(() => { if (dirty) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rows)); dirty = false; } }, 30_000).unref();

const FORMS = /^(I-129|I-130|I-131|I-140|I-485|I-539|I-765|I-751|I-90|I-821D|N-400|N-600|I-526E?|I-829|I-907)$/;
const OFFICES = /^(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES = ['approved', 'denied', 'rfe', 'pending'];
const CLASSES = /^(H1B|L1A|L1B|L1|O1|TN|E3|H4|L2|F1|C9|C26)$/;

// id = random value made on the phone, so a person can update their own entry later.
export function submit(b) {
  const id = String(b.id || '');
  if (!/^[a-f0-9]{16,64}$/.test(id)) throw Object.assign(new Error('Bad id'), { status: 400 });
  const form = String(b.form || '').toUpperCase(), office = String(b.office || '').toUpperCase();
  if (!FORMS.test(form) || !OFFICES.test(office) || !DATE.test(b.received || '')) throw Object.assign(new Error('Missing form, office or received date'), { status: 400 });
  const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : 'pending';
  const decided = DATE.test(b.decided || '') ? b.decided : null;
  const today = new Date().toISOString().slice(0, 10);
  if (b.received > today || (decided && (decided < b.received || decided > today))) throw Object.assign(new Error('Dates look wrong'), { status: 400 });
  const premium = !!b.premium;
  const cls = CLASSES.test(String(b.cls || '').toUpperCase()) ? String(b.cls).toUpperCase() : undefined; // optional visa class, e.g. L1A
  const hid = crypto.createHash('sha256').update(id).digest('hex').slice(0, 24);
  const row = { h: hid, form, office, received: b.received, decided, outcome, premium, at: today, ...(cls ? { cls } : {}) };
  const i = rows.findIndex((r) => r.h === hid);
  if (i >= 0) rows[i] = row; else rows.push(row);
  if (rows.length > 200000) rows = rows.slice(-200000);
  dirty = true;
  return { ok: true };
}
export function remove(b) {
  const hid = crypto.createHash('sha256').update(String(b.id || '')).digest('hex').slice(0, 24);
  rows = rows.filter((r) => r.h !== hid); dirty = true;
  return { ok: true };
}

const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export function stats(q) {
  const form = (q.get('form') || '').toUpperCase(), office = (q.get('office') || '').toUpperCase();
  const premium = q.get('premium') === '1';
  const pick = (r) => r.form === form && (!office || r.office === office) && r.premium === premium;
  const all = rows.filter(pick);
  const decided = all.filter((r) => r.decided && (r.outcome === 'approved' || r.outcome === 'denied'));
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const recent = decided.filter((r) => r.decided >= since);
  const durs = recent.map((r) => days(r.received, r.decided)).filter((d) => d >= 0);
  const byMonth = {};
  for (const r of recent) { const m = r.decided.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; }
  const lastApprovals = recent.filter((r) => r.outcome === 'approved').sort((a, b) => b.decided.localeCompare(a.decided)).slice(0, 8).map((r) => ({ received: r.received, decided: r.decided, office: r.office }));
  return {
    form, office: office || null, premium, total: all.length, decided: recent.length,
    medianDays: median(durs), p25: durs.length >= 8 ? median(durs.sort((a, b) => a - b).slice(0, durs.length >> 1)) : null,
    p75: durs.length >= 8 ? median(durs.sort((a, b) => a - b).slice(durs.length >> 1)) : null,
    approvalRate: recent.length >= 5 ? Math.round((recent.filter((r) => r.outcome === 'approved').length / recent.length) * 100) : null,
    byMonth, lastApprovals, minSample: 5,
  };
}
export const communityStatus = () => ({ entries: rows.length });
// Read-only copy of matching rows (used by expect.mjs). Rows hold no receipt numbers or ids beyond the hash.
export const cohort = (pred) => rows.filter(pred).map(({ h, ...r }) => r);
// Tests only: replace the in-memory rows.
export const _setRows = (r) => { rows = r; };
