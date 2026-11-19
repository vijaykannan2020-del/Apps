// Home-screen widget snapshot (v2.5). Pure: builds the small JSON summary the app writes to the shared
// App Group for the WidgetKit extension (targets/widget/Snapshot.swift reads the same shape).
// Only non-sensitive summary data: initials or first names, status labels, dates, days left.
// Never passport, receipt, A-numbers or USCIS account numbers — clean() strips anything that looks like one.
import type { Person, Settings } from './model';
import { birthCountryOf, chargeabilityOf } from './birth';
import { STATUS_LABEL } from './model';
import type { PersonRecord } from './record';
import type { PersonResult } from './rules/engine';
import type { CaseView } from './cases';
import type { VisaBulletin } from './bulletin';
import { categoryOf, countryOf, cutoff, isCurrent } from './bulletin';
import { fmt } from './dates';
import { isISO, today as todayFn } from './dates';

export const WIDGET_GROUP = 'group.com.vijaykannan.casedesk';
export const WIDGET_KEY = 'snapshot.v1';
export const WIDGET_DISCLAIMER = 'For personal reference — not an official document';
export const WIDGET_DEADLINES = 5;

export type WidgetNames = 'initials' | 'first';
export type WidgetPerson = { id: string; name: string; initials?: string; status: string; until?: string; untilLabel?: string; url: string };
/** v2.8 Edit Widget: what a widget can show (the Swift ShowItem enum has the same raw values, in this order).
 *  status = Current status (the default): in the US the latest I-94 admit-until date; outside the US the
 *  I-797 approval expiry plus whether a valid visa stamp is in the passport. */
export const WIDGET_KINDS = ['status', 'deadline', 'passport', 'visa', 'i94', 'ead', 'ap', 'gc', 'case', 'pd'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
/** One thing to show for one person. mode: until = a date coming up (days left, coloured by urgency);
 *  info = words, not a countdown. place / stamp only on the status item (stamp only outside the US).
 *  Dates, labels and yes/no flags only — never a document or receipt number. */
export type WidgetItem = {
  kind: WidgetKind; personId: string; who: string; whoInitials: string; label: string; mode: 'until' | 'info';
  date?: string; text?: string; place?: 'US' | 'Outside'; stamp?: boolean; url: string;
};
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
  items?: WidgetItem[]; // v2.8: every person × every kind that applies to them
  familyItems?: WidgetItem[]; // v2.8: Whole family = the nearest / latest item of each kind
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

/** Optional green card fields: v2.9 adds green card documents and a GC stage; read them defensively so
 *  the widget works before and after that merge (and with records saved by older versions). */
type GcView = { gc?: { stage?: unknown; stageLabel?: unknown } };

/** Green card stage in a few words, from the record (v2.9 stage first, then the cases we know). */
export function gcStage(rec: PersonRecord, pdCurrent?: boolean): string | undefined {
  const extra = (rec as PersonRecord & GcView).gc;
  const given = typeof extra?.stageLabel === 'string' ? extra.stageLabel : typeof extra?.stage === 'string' ? extra.stage : undefined;
  if (given) return given;
  if (rec.naturalizedOn || rec.visa === 'US citizen') return 'US citizen';
  if (rec.greenCard) return rec.greenCard.conditional ? 'Conditional green card' : 'Green card holder';
  const cases = rec.cases ?? [];
  const has = (form: string, status?: string) => cases.some((c) => c.form === form && (!status || c.status === status));
  if (has('I-485', 'approved')) return 'I-485 approved';
  if (has('I-485', 'pending')) return 'I-485 pending';
  if (rec.i140Approved || has('I-140', 'approved')) return pdCurrent ? 'I-140 approved · priority date current' : 'I-140 approved · waiting for priority date';
  if (has('I-140', 'pending')) return 'I-140 pending';
  if (cases.some((c) => /PERM|9089/i.test(c.form ?? ''))) return 'PERM';
  return undefined;
}

/** Everything one person's widget can show. A kind that doesn't apply is simply left out
 *  (the widget then says "Not added yet — open the app"). Every link opens the person, except a case update. */
export function personItems(p: Person, o: { rec?: PersonRecord; res?: PersonResult; cases: CaseView[]; bulletin?: VisaBulletin; who: string; whoInitials: string; today: string; scrub?: (s: string) => string }): WidgetItem[] {
  const sc = o.scrub ?? ((s: string) => s);
  const { rec, res, today: t } = o;
  const out: WidgetItem[] = [];
  const url = personUrl(p.id);
  const add = (kind: WidgetKind, label: string, mode: WidgetItem['mode'], x: Partial<Pick<WidgetItem, 'date' | 'text' | 'place' | 'stamp' | 'url'>>) =>
    out.push({
      kind, personId: p.id, who: o.who, whoInitials: o.whoInitials, label: clean(sc(label)).slice(0, 40), mode,
      ...(isISO(x.date) ? { date: x.date } : {}), ...(x.text ? { text: clean(sc(x.text)).slice(0, 60) } : {}),
      ...(x.place ? { place: x.place } : {}), ...(typeof x.stamp === 'boolean' ? { stamp: x.stamp } : {}), url: x.url ?? url,
    });
  const mine = o.cases.filter((c) => c.ownerId === p.id);

  // Current status (default)
  if (rec) {
    const status = clean(statusText(p, rec, res)).slice(0, 30);
    const stampOk = isISO(rec.visaStamp?.expires) && rec.visaStamp!.expires! >= t;
    if (rec.location === 'Outside') {
      const ap = rec.currentApproval ?? rec.upcomingApproval;
      const until = isISO(ap?.validTo) ? ap!.validTo : rec.petitionEnd;
      const label = ap?.form === 'I-129S' ? 'I-129S approval valid until' : 'I-797 valid until';
      if (isISO(until)) add('status', label, 'until', { date: until, text: status, place: 'Outside', stamp: stampOk });
      else if (rec.visaStamp || rec.approvals?.length) add('status', 'Outside the US', 'info', { text: 'Approval notice not added', place: 'Outside', stamp: stampOk });
    } else if (rec.naturalizedOn || rec.visa === 'US citizen') {
      add('status', 'Current status', 'info', { text: 'US citizen', place: 'US' });
    } else if (isISO(rec.greenCard?.expires)) {
      add('status', 'Green card valid until', 'until', { date: rec.greenCard!.expires, text: status, place: 'US' });
    } else if (isISO(rec.i94?.until)) {
      add('status', 'Valid until (I-94)', 'until', { date: rec.i94!.until, text: status, place: 'US' });
    } else if (rec.i94?.ds) {
      add('status', 'Valid until (I-94)', 'info', { text: 'D/S — duration of status', place: 'US' });
    } else {
      const v = validUntil(rec, res);
      if (v.until) add('status', 'Status valid until', 'until', { date: v.until, text: status, place: 'US' });
    }
  }

  const next = personDeadlines(p, rec, res, o.cases, t)[0];
  if (next) add('deadline', next.what, 'until', { date: next.date });
  if (rec) {
    if (isISO(rec.passportExpiry)) add('passport', 'Passport valid until', 'until', { date: rec.passportExpiry });
    if (isISO(rec.visaStamp?.expires)) add('visa', 'Visa stamp valid until', 'until', { date: rec.visaStamp!.expires, stamp: rec.visaStamp!.expires! >= t });
    if (isISO(rec.i94?.until)) add('i94', 'I-94 admit until', 'until', { date: rec.i94!.until });
    else if (rec.i94?.ds) add('i94', 'I-94 admit until', 'info', { text: 'D/S — duration of status' });
    const ead = rec.ead, apd = rec.advanceParole; // optional: more of these arrive with v2.9 green card documents
    if (isISO(ead?.expires)) add('ead', 'EAD valid until', 'until', { date: ead!.expires });
    if (isISO(apd?.expires)) add('ap', 'Advance parole valid until', 'until', { date: apd!.expires });
  }
  const latest = [...mine].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0];
  if (latest) {
    const head = latest.history?.[0]?.text && latest.history[0].text.length <= 60 ? latest.history[0].text : latest.status;
    add('case', `${latest.form ?? 'Case'} update`, 'info', { date: latest.updated, text: head, url: caseKey(latest) ? caseUrl(caseKey(latest)) : url });
  }
  let pdCurrent: boolean | undefined;
  const pd = rec?.cases?.find((x) => x.form === 'I-140' && x.priorityDate && x.category);
  const cat = categoryOf(pd?.category);
  if (rec && pd && cat && isISO(pd.priorityDate)) {
    const b = o.bulletin;
    const born = birthCountryOf(p.facts?.birthCountry, rec);
    const ctry = p.facts?.gc?.chargeability ?? (born && born.from !== 'nationality' ? chargeabilityOf(born.code) : countryOf(rec.nationality));
    const c = b ? cutoff(b.rows, cat, ctry, b.uscisChart) : undefined;
    pdCurrent = b ? isCurrent(pd.priorityDate, c) : undefined;
    const text = !b ? `${cat} · ${fmt(pd.priorityDate)}` : pdCurrent ? `Current in the ${b.month} bulletin` : c && c !== 'U' && c !== 'C' ? `Cut-off ${fmt(c)} (${b.month})` : `Not current (${b.month})`;
    add('pd', `${cat} priority date`, 'info', { date: pd.priorityDate, text });
  }
  if (rec) {
    const stage = gcStage(rec, pdCurrent);
    if (stage) add('gc', 'Green card stage', 'info', { text: stage, ...(isISO(rec.greenCard?.residentSince) ? { date: rec.greenCard!.residentSince } : {}) });
  }
  return WIDGET_KINDS.flatMap((k) => out.filter((x) => x.kind === k));
}

/** Whole family: for each kind, the item that matters first — the nearest date coming up, the newest
 *  case update, the oldest priority date. */
export function familyItems(items: WidgetItem[], t: string): WidgetItem[] {
  const out: WidgetItem[] = [];
  for (const kind of WIDGET_KINDS) {
    const list = items.filter((x) => x.kind === kind);
    if (!list.length) continue;
    const dated = list.filter((x) => x.date);
    let pick: WidgetItem | undefined;
    if (kind === 'case') pick = [...dated].sort((a, b) => b.date!.localeCompare(a.date!))[0];
    else if (kind === 'pd') pick = [...dated].sort((a, b) => a.date!.localeCompare(b.date!))[0];
    else pick = [...dated].filter((x) => x.mode === 'until' && x.date! >= t).sort((a, b) => a.date!.localeCompare(b.date!))[0] ?? [...dated].sort((a, b) => b.date!.localeCompare(a.date!))[0];
    out.push(pick ?? list[0]);
  }
  return out;
}

export function buildWidgetSnapshot(i: WidgetInput): WidgetSnapshot {
  const t = i.today ?? todayFn();
  const base = { v: 1 as const, updatedAt: i.now ?? new Date().toISOString(), disclaimer: WIDGET_DISCLAIMER };
  if (widgetsLocked(i.settings)) return { ...base, locked: true, people: [], deadlines: [], latestCase: null, bulletin: null };
  const mode = widgetNames(i.settings);
  const nameOf = new Map(i.people.map((p) => [p.id, widgetName(p.name, mode)]));
  // Rule titles can name another family member in full ("X’s I-94 ends first"): swap full names for the widget name.
  const full = i.people.filter((p) => p.name.trim()).map((p) => [p.name.trim(), nameOf.get(p.id)!] as const).sort((a, b) => b[0].length - a[0].length);
  const scrub = (s: string) => full.reduce((acc, [n, w]) => acc.split(n).join(w), s);
  const people: WidgetPerson[] = i.people.map((p) => {
    const rec = i.records[p.id], res = i.results[p.id];
    const v = validUntil(rec, res);
    return { id: p.id, name: nameOf.get(p.id)!, initials: widgetName(p.name, 'initials'), status: clean(statusText(p, rec, res)).slice(0, 40), ...(v.until ? { until: v.until, untilLabel: v.label } : {}), url: personUrl(p.id) };
  });
  const deadlines: WidgetDeadline[] = i.people
    .flatMap((p) => personDeadlines(p, i.records[p.id], i.results[p.id], i.caseList, t).map((d) => ({ personId: p.id, who: nameOf.get(p.id)!, what: clean(scrub(d.what)).slice(0, 48), date: d.date, url: personUrl(p.id) })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who))
    .slice(0, WIDGET_DEADLINES);
  const latest = [...i.caseList].filter((c) => nameOf.has(c.ownerId)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0];
  const headline = latest ? clean(latest.history[0]?.text && latest.history[0].text.length <= 60 ? latest.history[0].text : latest.status) : '';
  const latestCase: WidgetCase | null = latest
    ? { who: nameOf.get(latest.ownerId)!, form: clean(latest.form ?? 'Case'), status: headline.slice(0, 60), ...(latest.updated ? { date: latest.updated } : {}), url: caseKey(latest) ? caseUrl(caseKey(latest)) : personUrl(latest.ownerId) }
    : null;
  const bulletin = i.bulletin?.month ? { month: i.bulletin.month, ...(nextBulletinDate(i.bulletin.month, t) ? { next: nextBulletinDate(i.bulletin.month, t) } : {}) } : null;
  const items = i.people.flatMap((p) => { try { return personItems(p, { rec: i.records[p.id], res: i.results[p.id], cases: i.caseList, bulletin: i.bulletin, who: nameOf.get(p.id)!, whoInitials: widgetName(p.name, 'initials'), today: t, scrub }); } catch { return []; } });
  return { ...base, locked: false, people, deadlines, latestCase, bulletin, items, familyItems: familyItems(items, t) };
}

/** Compare two snapshots ignoring the timestamp (write only when something the widget shows changed). */
export const sameSnapshot = (a?: WidgetSnapshot | null, b?: WidgetSnapshot | null) => !!a && !!b && JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
