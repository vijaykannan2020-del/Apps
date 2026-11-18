// The compliance engine: every person's findings, computed together so dependents can be compared
// with the person their status follows. Pure — the same inputs always give the same answer.
import { PRINCIPAL_OF, isDependentVisa, isNonimmigrant } from '../model';
import { missingDocs, missingSteps, trackOf, type Step } from '../steps';
import { bySeverity, worst, type FamilyCtx, type Finding, type Member, type RuleCtx, type Severity } from './types';
import { statusFacts, type StatusFacts } from './status';
import { stayRules } from './stay';
import { eadRules, outsideRules, passportRules, visaInUS, visaUnconfirmed } from './documents';
import { petitionRules } from './petition';
import { dependentRules, familyRules, graceRule } from './dependents';
import { travelRules } from './travel';
import { studentRules } from './student';
import { addressRule, applicantRules, residentRules } from './greenCard';
import { caseRules } from './cases';
import { finding } from './types';
import { fmt } from '../dates';

export type PersonResult = {
  personId: string;
  findings: Finding[];
  worst: Severity;
  facts: StatusFacts;
  missing: string[]; // document names (QA runner)
  missingSteps: Step[]; // the same list as steps (Home, Continue adding, person page)
  principalId?: string;
};

/** Info findings that describe a special situation: "all good" (C20) isn't shown next to them. */
const NOT_ALL_GOOD = ['R5', 'R7', 'R15', 'R18'];
const OK_IDS = ['i94-ok', 'i94-filed', 'gc-ok', 'gca-ok'];

/** Whose status a spouse / child follows (undefined = not a dependent). */
export function principalFor(m: Member, members: Member[]): Member | undefined {
  const { person, rec } = m;
  if (person.relation !== 'spouse' && person.relation !== 'child') return undefined;
  const others = members.filter((x) => x.person.id !== person.id);
  if (person.facts?.dependentOf) return others.find((x) => x.person.id === person.facts.dependentOf);
  const main = others.find((x) => x.person.relation === 'self') ?? others.find((x) => x.person.isMain);
  if (!rec.visa) return main;
  if (!isDependentVisa(rec.visa)) return undefined;
  const want = PRINCIPAL_OF[rec.visa] || [];
  const fits = others.filter((x) => x.rec.visa && want.includes(x.rec.visa));
  return fits.find((x) => x === main) ?? fits.find((x) => x.person.isMain) ?? fits[0] ?? (main && !main.rec.visa ? main : undefined);
}

function rulesFor(c: RuleCtx): Finding[] {
  const { person, rec } = c.me;
  const track = trackOf(person, rec);
  if (track === 'citizen' || rec.visa === 'US citizen') return []; // F3: no checks for citizens
  if (rec.location === 'Outside' && isNonimmigrant(rec.visa)) return [...visaUnconfirmed(c), ...outsideRules(c), ...caseRules(c)];
  if (rec.visa === 'Green card' || rec.visa === 'Conditional green card') {
    const out = [...residentRules(c), ...passportRules(c, false), ...addressRule(c), ...caseRules(c), ...travelRules(c)];
    out.push(finding(undefined, 'good', 'gc-ok', c.me.facts.statusUntil ? `Resident · card valid until ${fmt(c.me.facts.statusUntil)}` : 'Permanent resident', 'Carry the card when you travel. Report address changes within 10 days.'));
    return out;
  }
  if (rec.visa === 'Green card pending') {
    const out = [...passportRules(c, true), ...eadRules(c), ...travelRules(c), ...applicantRules(c), ...addressRule(c), ...caseRules(c)];
    const s = c.me.facts;
    out.push(finding(undefined, 'good', 'gca-ok', 'Green card pending — authorized to stay while the I-485 is pending', `${s.workUntil ? `Work permit until ${fmt(s.workUntil)}. ` : ''}${s.travelDocUntil ? `Travel document until ${fmt(s.travelDocUntil)}.` : 'Don’t travel without Advance Parole.'}`));
    return out;
  }
  return [
    ...visaUnconfirmed(c), ...graceRule(c), ...stayRules(c), ...passportRules(c, true), ...visaInUS(c), ...eadRules(c),
    ...dependentRules(c), ...petitionRules(c), ...studentRules(c), ...travelRules(c), ...applicantRules(c),
    ...addressRule(c), ...caseRules(c), ...familyRules(c),
  ];
}

function finalize(out: Finding[]): Finding[] {
  let fs = out;
  const has = (r: string) => fs.some((f) => f.rule === r);
  if (has('R26')) fs = fs.filter((f) => f.rule !== 'C10'); // a trip turns "visa expired" into stamping
  if (has('R24')) fs = fs.filter((f) => f.rule !== 'C4'); // R24 already says: plan the extension before the I-94 date
  if (has('R6') || fs.some((f) => f.rule === 'R5' && f.severity === 'act')) fs = fs.filter((f) => !['C2', 'C3', 'C4'].includes(f.rule ?? '')); // student status ended: the grace date is what counts
  const seen = new Set<string>();
  fs = fs.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
  const ok = fs.find((f) => OK_IDS.includes(f.id));
  if (ok) ok.rule = fs.some((f) => f.severity === 'act' || f.severity === 'review' || (f.rule && NOT_ALL_GOOD.includes(f.rule))) ? undefined : 'C20';
  return fs.sort(bySeverity);
}

/** Everyone's findings and status dates. */
export function evaluateFamily(ctx: FamilyCtx): Record<string, PersonResult> {
  const members = ctx.members;
  const principal = new Map<string, Member | undefined>(members.map((m) => [m.person.id, principalFor(m, members)]));
  const facts = new Map<string, StatusFacts>();
  const manual = (ctx.cases || []).map((x) => ({ receipt: x.receipt, status: x.status }));
  const factsOf = (m: Member, depth = 0): StatusFacts => {
    const have = facts.get(m.person.id);
    if (have) return have;
    const p = principal.get(m.person.id);
    const pf = p && depth < 3 ? factsOf(p, depth + 1) : undefined;
    const f = statusFacts(m, p, pf, manual);
    facts.set(m.person.id, f);
    return f;
  };
  for (const m of members) factsOf(m);
  const out: Record<string, PersonResult> = {};
  for (const m of members) {
    const p = principal.get(m.person.id);
    const c: RuleCtx = {
      ...ctx,
      me: { ...m, facts: facts.get(m.person.id)! },
      principal: p ? { ...p, facts: facts.get(p.person.id)! } : undefined,
      dependent: !!p,
    };
    const fs = finalize(rulesFor(c));
    out[m.person.id] = { personId: m.person.id, findings: fs, worst: worst(fs), facts: c.me.facts, missing: missingDocs(m.person, m.rec, ctx.docs), missingSteps: missingSteps(m.person, m.rec, ctx.docs), principalId: p?.person.id };
  }
  return out;
}

/** Top items across the family for Home → "Needs attention". */
export type AttentionItem = { personId: string; finding: Finding; people: string[] };

/**
 * Top items across the family for Home → "Needs attention". The same finding for several people
 * (e.g. "Principal's I-94 ends first" for every dependent) is ONE item listing everyone it affects.
 */
export function needsAttention(results: Record<string, PersonResult>, n = 3): AttentionItem[] {
  const groups = new Map<string, AttentionItem>();
  for (const r of Object.values(results)) for (const f of r.findings) {
    if (f.severity !== 'act' && f.severity !== 'review') continue;
    const shared = f.id === 'principal-first' || f.rule === 'C15';
    const key = shared ? `${f.id}|${f.title}` : `${r.personId}|${f.id}|${f.title}`;
    const g = groups.get(key);
    if (g) { if (!g.people.includes(r.personId)) g.people.push(r.personId); }
    else groups.set(key, { personId: r.personId, finding: f, people: [r.personId] });
  }
  return [...groups.values()]
    .sort((a, b) => bySeverity(a.finding, b.finding) || (a.finding.date || '9999').localeCompare(b.finding.date || '9999'))
    .slice(0, n);
}

/** "A", "A and B", "A, B and C". */
export const listNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
