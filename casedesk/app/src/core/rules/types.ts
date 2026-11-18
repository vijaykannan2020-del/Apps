// Shared types and helpers for the rule groups.
import type { Case, DocFields, DocType, Person, Settings } from '../model';
import type { PersonRecord } from '../record';
import { RULES, type Source } from './catalog';
import type { StatusFacts } from './status';

/** act = act now (red), review (amber), info (neutral), good (green). */
export type Severity = 'act' | 'review' | 'info' | 'good';

export type Finding = {
  id: string; // stable key for the UI
  rule?: string; // C1…C25, X1…X3, R1…R27 (untagged = a note that never changes the pill)
  severity: Severity;
  title: string;
  detail: string;
  notLegalAdvice: boolean; // shown on every act-now item (V4)
  talkToAttorney: boolean; // "Talk to an attorney" button on act-now items
  source?: Source;
  checked?: string;
  date?: string; // the date this finding is about (for reminders)
};

export type Member = { person: Person; rec: PersonRecord; facts?: StatusFacts };

export type { VisaBulletin as Bulletin } from '../bulletin';
import type { VisaBulletin } from '../bulletin';

export type FamilyCtx = {
  members: Member[];
  docs: { ownerId: string; type: DocType; fields: DocFields }[]; // every saved document (for the documents still to add)
  settings?: Settings;
  cases?: Case[]; // cases added by hand / with status updates (denied, RFE…)
  bulletin?: VisaBulletin;
  holdCountries?: string[];
};

export type RuleCtx = FamilyCtx & {
  me: Member & { facts: StatusFacts };
  principal?: Member & { facts: StatusFacts }; // whose status a dependent follows
  dependent: boolean; // spouse / child following a principal
};

export function finding(rule: string | undefined, severity: Severity, id: string, title: string, detail: string, date?: string): Finding {
  const info = rule ? RULES[rule] : undefined;
  return {
    id, rule, severity, title, detail, date,
    notLegalAdvice: severity === 'act' || severity === 'review',
    talkToAttorney: severity === 'act',
    source: info?.source, checked: info?.checked,
  };
}

export const ORDER: Record<Severity, number> = { act: 0, review: 1, info: 2, good: 3 };
export const bySeverity = (a: Finding, b: Finding) => ORDER[a.severity] - ORDER[b.severity];

/** The pill for a list: only rule-tagged findings count. */
export function worst(fs: Finding[]): Severity {
  const tagged = fs.filter((f) => f.rule);
  return tagged.length ? [...tagged].sort(bySeverity)[0].severity : 'good';
}

export const SEVERITY_LABEL: Record<Severity, string> = { act: 'Act now', review: 'Review', info: 'Info', good: 'All good' };
