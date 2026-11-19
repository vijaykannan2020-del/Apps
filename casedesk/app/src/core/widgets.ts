// Home-screen widget snapshot (v2.5). Pure: builds the small JSON summary the app writes to the shared
// App Group for the WidgetKit extension (targets/widget/Snapshot.swift reads the same shape).
// Only non-sensitive summary data: initials or first names, status labels, dates, days left.
// Never passport, receipt, A-numbers or USCIS account numbers — clean() strips anything that looks like one.
import type { Person, Settings } from './model';
import { STATUS_LABEL } from './model';
import type { PersonRecord } from './record';
import type { PersonResult } from './rules/engine';
import type { CaseView } from './cases';
import type { VisaBulletin } from './bulletin';
import { isISO, today as todayFn } from './dates';

export const WIDGET_GROUP = 'group.com.vijaykannan.casedesk';
export const WIDGET_KEY = 'snapshot.v1';
export const WIDGET_DISCLAIMER = 'For personal reference — not an official document';
export const WIDGET_DEADLINES = 5;

export type WidgetNames = 'initials' | 'first';
export type WidgetPerson = { id: string; name: string; status: string; until?: string; untilLabel?: string; url: string };
export type WidgetDeadline = { personId: string; who: string; what: string; date: string; url: string };
export type WidgetCase = { who: string; form: string; status: string; date?: string; url: string };
export type WidgetSnapshot = {
  v: 1;
  updatedAt: string;
  locked: boolean;
  people: WidgetPerson[];
  deadlines: WidgetDeadline[];
  latestCase: WidgetCase | null;
  bulletin: { month: string; next?: string } | null;
  disclaimer: string;
};

/** Widget settings with their defaults: initials, and details hidden while Face ID lock is on. */
export const widgetNames = (s: Pick<Settings, 'widgetNames'>): WidgetNames => (s.widgetNames === 'first' ? 'first' : 'initials');
export const widgetHideLocked = (s: Pick<Settings, 'widgetHideLocked'>) => s.widgetHideLocked !== false;
export const widgetsLocked = (s: Pick<Settings, 'faceId' | 'widgetHideLocked'>) => !!s.faceId && widgetHideLocked(s);

/** Same thresholds as the Swift widget (Snapshot.swift urgency()): ≤ 30 days red, ≤ 90 amber, else green. */
export function urgencyFor(days: number | null | undefined): 'red' | 'amber' | 'green' | 'none' {
  if (days === null || days === undefined) return 'none';
  return days <= 30 ? 'red' : days <= 90 ? 'amber' : 'green';
}

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const letters = (parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]]).map((p) => Array.from(p)[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}
export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || '?';
export const widgetName = (name: string, mode: WidgetNames) => clean(mode === 'first' ? firstName(name) : initials(name)).slice(0, 24);

/** Strip anything that looks like a receipt number, A-number, SSN or long ID number. */
export const FORBIDDEN = [/\b[A-Z]{3}\d{10}\b/gi, /\bA[- ]?\d{8,9}\b/gi, /\b\d{3}-\d{2}-\d{4}\b/g, /\b[A-Z]{0,2}\d{6,}\b/gi];
export function clean(s: string): string {
  let out = String(s ?? '');
  for (const re of FORBIDDEN) out = out.replace(re, '•••');
  return out.replace(/\s+/g, ' ').trim();
}
export const looksSensitive = (s: string) => FORBIDDEN.some((re) => { re.lastIndex = 0; const hit = re.test(s); re.lastIndex = 0; return hit; });

/** The status label the app shows (screens/common.tsx statusLabel), without React Native. */
export function statusText(p: Person, rec?: PersonRecord, res?: PersonResult): string {
  if (rec?.visa) {
    const l = res?.facts.visaLabel ?? rec.visa;
    return l === 'Green card pending' ? 'Green card applicant' : l;
  }
  if (p.status === 'L-2' && p.relation === 'spouse') return 'L-2S';
  return p.status ? STATUS_LABEL[p.status] : 'Not sure yet';
}

/** "Valid until" for the family list: the date status runs to, and what sets it. */
export function validUntil(rec?: PersonRecord, res?: PersonResult): { until?: string; label?: string } {
  if (!rec) return {};
  const s = res?.facts.statusUntil;
  if (isISO(s)) return { until: s, label: rec.i94?.until === s ? 'I-94' : rec.greenCard?.expires === s ? 'Card' : 'Status' };
  if (isISO(rec.greenCard?.expires)) return { until: rec.greenCard!.expires, label: 'Card' };
  if (isISO(rec.i94?.until)) return { until: rec.i94!.until, label: 'I-94' };
  return {};
}

/** Every upcoming date for one person (the same dates reminders use, minus the visa stamp — an
 *  expired stamp doesn't end anyone's stay in the US, so it is never the "next deadline"). */
export function personDeadlines(p: Person, rec: PersonRecord | undefined, res: PersonResult | undefined, cases: CaseView[], t: string): { what: string; date: string }[] {
  const out: { what: string; date: string }[] = [];
  const add = (what: string, date?: string) => { if (isISO(date) && date >= t) out.push({ what, date }); };
  if (rec) {
    add('Passport expires', rec.passportExpiry); add('I-94 ends', rec.i94?.until); add('Work permit ends', rec.ead?.expires);
    add('Green card expires', rec.greenCard?.expires); add('Approval ends', rec.petitionEnd); add('Travel document ends', rec.advanceParole?.expires);
  }
  for (const f of res?.findings ?? []) if (f.date && (f.severity === 'act' || f.severity === 'review')) add(f.title, f.date);
  for (const c of cases) if (c.ownerId === p.id) for (const k of c.keyDates) add(`${c.form ?? 'Case'}: ${k.label}`, k.date);
  const seen = new Set<string>();
  return out.filter((d) => { const k = d.what + d.date; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.date.localeCompare(b.date));
}

/** A link key for a case that carries no receipt number (CaseView ids are "<owner>:<receipt>"). */
export const caseKey = (c: Pick<CaseView, 'manual' | 'docIds' | 'id'>) => c.manual?.id ?? c.docIds[0] ?? '';
export const personUrl = (id: string) => `casedesk://person/${encodeURIComponent(id)}`;
export const caseUrl = (key: string) => `casedesk://open/case/${encodeURIComponent(key)}`;

/** The Visa Bulletin for month M+1 usually comes out around the middle of month M. */
export function nextBulletinDate(month: string | undefined, t: string): string | undefined {
  const m = (month || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return undefined;
  const idx = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(m[1].toLowerCase());
  if (idx < 0) return undefined;
  const d = `${m[2]}-${String(idx + 1).padStart(2, '0')}-15`;
  return d >= t ? d : undefined; // late: due any day, the widget shows just the month
}

export type WidgetInput = {
  people: Person[];
  records: Record<string, PersonRecord>;
  results: Record<string, PersonResult>;
  caseList: CaseView[];
  settings: Settings;
  bulletin?: VisaBulletin;
  today?: string;
  now?: string; // ISO timestamp (tests pin it)
};

export function buildWidgetSnapshot(i: WidgetInput): WidgetSnapshot {
  const t = i.today ?? todayFn();
  const base = { v: 1 as const, updatedAt: i.now ?? new Date().toISOString(), disclaimer: WIDGET_DISCLAIMER };
  if (widgetsLocked(i.settings)) return { ...base, locked: true, people: [], deadlines: [], latestCase: null, bulletin: null };
  const mode = widgetNames(i.settings);
  const nameOf = new Map(i.people.map((p) => [p.id, widgetName(p.name, mode)]));
  const people: WidgetPerson[] = i.people.map((p) => {
    const rec = i.records[p.id], res = i.results[p.id];
    const v = validUntil(rec, res);
    return { id: p.id, name: nameOf.get(p.id)!, status: clean(statusText(p, rec, res)).slice(0, 40), ...(v.until ? { until: v.until, untilLabel: v.label } : {}), url: personUrl(p.id) };
  });
  const deadlines: WidgetDeadline[] = i.people
    .flatMap((p) => personDeadlines(p, i.records[p.id], i.results[p.id], i.caseList, t).map((d) => ({ personId: p.id, who: nameOf.get(p.id)!, what: clean(d.what).slice(0, 48), date: d.date, url: personUrl(p.id) })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who))
    .slice(0, WIDGET_DEADLINES);
  const latest = [...i.caseList].filter((c) => nameOf.has(c.ownerId)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0];
  const headline = latest ? clean(latest.history[0]?.text && latest.history[0].text.length <= 60 ? latest.history[0].text : latest.status) : '';
  const latestCase: WidgetCase | null = latest
    ? { who: nameOf.get(latest.ownerId)!, form: clean(latest.form ?? 'Case'), status: headline.slice(0, 60), ...(latest.updated ? { date: latest.updated } : {}), url: caseKey(latest) ? caseUrl(caseKey(latest)) : personUrl(latest.ownerId) }
    : null;
  const bulletin = i.bulletin?.month ? { month: i.bulletin.month, ...(nextBulletinDate(i.bulletin.month, t) ? { next: nextBulletinDate(i.bulletin.month, t) } : {}) } : null;
  return { ...base, locked: false, people, deadlines, latestCase, bulletin };
}

/** Compare two snapshots ignoring the timestamp (write only when something the widget shows changed). */
export const sameSnapshot = (a?: WidgetSnapshot | null, b?: WidgetSnapshot | null) => !!a && !!b && JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
