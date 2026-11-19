// v2.9: builds the Home search index from what is on this phone plus the app's own screens and
// content. Pure (tested in tests/search.test.ts). Result lines never carry a passport or receipt
// number; a full receipt number typed in still finds its case (SearchItem.exact).
import type { Document, Person } from './model';
import { DOC_LABEL } from './model';
import type { PersonRecord } from './record';
import type { PersonResult } from './rules/engine';
import type { CaseView } from './cases';
import { isPendingCase } from './cases';
import { docTitle } from './docs';
import { fmt, isISO } from './dates';
import { RULES } from './rules/catalog';
import type { SearchItem } from './search';
import { HELP } from '../content/help';
import { VISAS } from '../content/visas';
import { GC_SEARCH } from '../content/searchGc';
import { APP_SCREENS, type ScreenEntry } from '../content/searchScreens';

export type IndexInput = {
  people: Person[];
  records: Record<string, PersonRecord | undefined>;
  results: Record<string, PersonResult | undefined>;
  docs: Document[];
  caseList: CaseView[];
  news?: { id: string; date: string; agency: string; title: string; summary: string; points?: string[] }[];
  tools?: { id: string; title: string; sub: string }[]; // the Tools tab list (adds any tool not in APP_SCREENS)
  statusLabel?: (p: Person) => string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A date as people type it: "Jun 28, 2027", "Jun 2027", "June 2027", "2027". */
export function dateWords(iso?: string): string[] {
  if (!isISO(iso)) return [];
  const m = MONTHS[Number(iso.slice(5, 7)) - 1], y = iso.slice(0, 4);
  return [fmt(iso), `${m.slice(0, 3)} ${y}`, `${m} ${y}`, y];
}

const REL: Record<string, string> = { self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', other: 'Family' };
const TYPE_WORDS: Partial<Record<string, string[]>> = {
  passport: ['passport'], visa: ['visa stamp', 'stamping', 'visa'], i94: ['i-94', 'admit until', 'arrival record'], approval: ['approval', 'i-797', 'i-797a', 'approval notice'],
  receipt: ['receipt', 'i-797c', 'receipt notice'], notice: ['notice', 'uscis notice'], i129s: ['i-129s', 'blanket l'], ead: ['ead', 'work permit', 'i-766'],
  i20: ['i-20', 'student'], ds2019: ['ds-2019', 'j-1'], 'green-card': ['green card', 'i-551', 'permanent resident card'], 'advance-parole': ['advance parole', 'i-512', 'travel document'],
  'reentry-permit': ['re-entry permit'], naturalization: ['naturalization certificate', 'citizenship'], 'travel-history': ['travel history', 'trips'], lca: ['lca', 'labor condition application'],
};
const DATE_KEYS = ['validTo', 'validFrom', 'issueDate', 'noticeDate', 'receivedDate', 'priorityDate', 'entryDate', 'appointmentDate', 'dueDate', 'residentSince', 'programEnd', 'optEnd'] as const;

/** Visa types that have no full guide yet: one plain explanation each. */
export const VISA_NOTES: { code: string; text: string; keywords: string[] }[] = [
  { code: 'E-3', text: 'Australian specialty occupation workers; two-year periods that can be extended.', keywords: ['australia'] },
  { code: 'O-1', text: 'Extraordinary ability; up to 3 years at first, then extensions of up to 1 year.', keywords: ['extraordinary ability'] },
  { code: 'J-1', text: 'Exchange visitor with a DS-2019; some must spend 2 years at home before an H or L or green card.', keywords: ['exchange visitor', 'ds-2019', '212e', 'home residency'] },
  { code: 'H-4', text: 'Spouse or child of an H-1B worker; the stay follows the H-1B dates.', keywords: ['h4', 'dependent', 'spouse'] },
  { code: 'L-2', text: 'Child of an L-1 worker (the spouse is L-2S); the stay follows the L-1 dates.', keywords: ['l2', 'dependent', 'child'] },
  { code: 'F-2', text: 'Spouse or child of an F-1 student; cannot work.', keywords: ['f2', 'dependent'] },
  { code: 'B-1/B-2', text: 'Business or tourist visitor; no work, usually admitted for up to 6 months.', keywords: ['visitor', 'tourist', 'b2', 'parents visit'] },
  { code: 'Cap-gap', text: 'An F-1 with a timely filed H-1B cap petition keeps status and OPT work until the H-1B starts (up to April 1).', keywords: ['cap gap', 'capgap', 'opt to h-1b'] },
];

export function buildSearchIndex(x: IndexInput): SearchItem[] {
  const name = (id: string) => x.people.find((p) => p.id === id)?.name ?? '';
  const main = x.people.find((p) => p.relation === 'self') ?? x.people[0];
  const visaOf = (p: Person) => x.records[p.id]?.visa ?? p.status ?? '';
  const pick = (who?: ScreenEntry['who']): Person | undefined => {
    if (!who || who === 'main') return main;
    const want = who === 'L-1' ? ['L-1A', 'L-1B', 'L-1'] : who === 'H-1B' ? ['H-1B'] : ['H-1B', 'L-1A', 'L-1B', 'L-1', 'TN', 'E-3', 'O-1', 'F-1 OPT', 'STEM OPT'];
    return x.people.find((p) => want.includes(visaOf(p))) ?? main;
  };
  const firstCase = (pending: boolean) => (pending ? x.caseList.find(isPendingCase) : undefined) ?? x.caseList[0];
  const out: SearchItem[] = [];

  // people
  for (const p of x.people) {
    const r = x.records[p.id];
    out.push({ id: `p:${p.id}`, section: 'People', title: p.name, sub: `${REL[p.relation] ?? 'Family'} · ${x.statusLabel?.(p) ?? visaOf(p)}`, path: `/person/${p.id}`, keywords: [r?.legalName ?? '', String(visaOf(p)), REL[p.relation] ?? '', p.relation === 'self' ? 'me' : ''] });
  }
  // what needs attention (opens the person); the same item for several people is one row
  const att = new Map<string, { f: NonNullable<PersonResult['findings']>[number]; who: Person[] }>();
  for (const p of x.people) {
    for (const f of x.results[p.id]?.findings ?? []) {
      if (f.severity !== 'act' && f.severity !== 'review') continue;
      const k = `${f.id}|${f.title}`;
      const e = att.get(k);
      if (e) e.who.push(p); else att.set(k, { f, who: [p] });
    }
  }
  for (const { f, who } of att.values()) {
    const names = who.map((p) => p.name);
    const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    out.push({ id: `f:${who[0].id}:${f.id}`, section: 'Needs attention', title: f.title, sub: `${list} · ${f.severity === 'act' ? 'Act now' : 'Review'}`, path: `/person/${who[0].id}`, body: f.detail, keywords: [...names, f.rule ? RULES[f.rule]?.name ?? '' : '', ...dateWords(f.date)] });
  }
  // documents: type, form, category, class, employer, dates as text — never the passport number
  for (const d of x.docs) {
    const f = d.fields;
    const dates = DATE_KEYS.flatMap((k) => dateWords(f[k] as string | undefined));
    const end = f.validTo ? `ends ${fmt(f.validTo)}` : f.noticeDate ? `notice ${fmt(f.noticeDate)}` : undefined;
    out.push({
      id: `d:${d.id}`, section: 'Documents', title: docTitle(d), sub: [name(d.ownerId), end].filter(Boolean).join(' · '), path: `/document/${d.id}`,
      keywords: [DOC_LABEL[d.type], ...(TYPE_WORDS[d.type] ?? []), f.form ?? '', f.category ?? '', f.classOfAdmission ?? '', f.preferenceCategory ?? '', f.employer ?? '', f.school ?? '', name(d.ownerId), ...dates],
      exact: f.receipt ? [f.receipt] : undefined,
    });
  }
  // cases: form, status, key dates; the receipt only as an exact match
  for (const c of x.caseList) {
    out.push({
      id: `c:${c.id}`, section: 'Cases', title: `${c.form ?? 'Case'} · ${c.name}`, sub: [name(c.ownerId), c.status].filter(Boolean).join(' · '), path: `/case/${encodeURIComponent(c.id)}`,
      keywords: [c.form ?? '', c.status, c.name, name(c.ownerId), ...c.keyDates.flatMap((k) => [k.label, ...dateWords(k.date)]), ...dateWords(c.filed)],
      exact: c.receipt ? [c.receipt] : undefined,
    });
  }
  // every screen and sub-screen
  for (const s of APP_SCREENS) {
    let path = s.path, params = s.params;
    if (path.includes(':pid')) { const p = pick(s.who); if (!p) continue; path = path.replace(':pid', p.id); }
    if (s.to) { const c = firstCase(s.to === 'pending-case'); if (c) { path = `/case/${encodeURIComponent(c.id)}`; params = undefined; } }
    out.push({ id: `s:${s.id}`, section: s.section, title: s.title, sub: s.sub, path, params, keywords: s.keywords });
  }
  for (const t of x.tools ?? []) if (!APP_SCREENS.some((s) => s.path === `/tools/${t.id}`)) out.push({ id: `t:${t.id}`, section: 'Tools', title: t.title, sub: t.sub, path: `/tools/${t.id}`, keywords: [t.id] });
  // green card entries (their own synonyms)
  for (const g of GC_SEARCH) {
    const tool = out.find((o) => o.path === g.route);
    if (tool) { tool.keywords = [...(tool.keywords ?? []), ...g.synonyms]; continue; }
    if (g.route.includes(':pid') && !main) continue;
    out.push({ id: `g:${g.id}`, section: 'Green card', title: g.title, sub: g.subtitle, path: g.route.replace(':pid', main?.id ?? ''), keywords: g.synonyms });
  }
  // updates stored on this phone
  for (const n of x.news ?? []) out.push({ id: `n:${n.id}`, section: 'Updates', title: n.title, sub: `${n.agency} · ${fmt(n.date.slice(0, 10))}`, path: `/news/${encodeURIComponent(n.id)}`, body: [n.summary, ...(n.points ?? [])].join('\n'), keywords: [n.agency, ...dateWords(n.date.slice(0, 10))] });
  // visa types: the guides, then short notes for the rest
  for (const v of VISAS) out.push({ id: `v:${v.id}`, section: 'Visa types', title: `${v.code} · ${v.name}`, sub: v.tagline, path: '/tools/guides', params: { visa: v.id }, body: [...v.facts.map((f) => `${f.label}: ${f.value}`), ...v.steps, ...v.keyPoints, v.alert ?? ''].join('\n'), keywords: [v.code, v.id] });
  for (const v of VISA_NOTES) out.push({ id: `v:${v.code}`, section: 'Visa types', title: v.code, sub: v.text, path: '/tools/guides', keywords: v.keywords });
  // help topics: full text
  for (const h of HELP) out.push({ id: `h:${h.id}`, section: h.id === 'community' ? 'Community' : 'Help', title: h.title, sub: h.sub, path: `/help/${h.id}`, body: [...h.body, ...(h.steps ?? [])].join('\n') });
  // what the app checks (rules catalog)
  for (const r of Object.values(RULES)) out.push({ id: `r:${r.id}`, section: 'Checks', title: r.name, sub: `What the app checks · ${r.source.label}`, path: '/help/statuses', keywords: ['check', 'rule'] });
  return out;
}
