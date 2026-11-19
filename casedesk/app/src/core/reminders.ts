// v2.9 reminders: per document type, each with its own lead times (passport 180/90, I-94 90/30/7…).
// Only the types a person actually has are offered. Pure — the scheduler is native/reminders.ts.
import type { Person } from './model';
import type { PersonRecord } from './record';

export type ReminderType = 'passport' | 'visa' | 'i94' | 'approval' | 'ead' | 'ap' | 'gc' | 'cases';
export type TypeSetting = { on: boolean; lead: number[] };
export type PersonReminders = NonNullable<Person['reminders']>;

export const REMINDER_TYPES: { key: ReminderType; title: string; what: string }[] = [
  { key: 'passport', title: 'Passport', what: 'passport expires' },
  { key: 'visa', title: 'Visa stamp', what: 'visa stamp expires' },
  { key: 'i94', title: 'I-94', what: 'I-94 ends' },
  { key: 'approval', title: 'Approval notice', what: 'approval ends' },
  { key: 'ead', title: 'EAD (work permit)', what: 'work permit ends' },
  { key: 'ap', title: 'Advance parole', what: 'travel document ends' },
  { key: 'gc', title: 'Green card', what: 'green card expires' },
  { key: 'cases', title: 'Case dates', what: 'case date' },
];
export const TYPE_DEFAULT: Record<ReminderType, number[]> = {
  passport: [180, 90], visa: [90, 30], i94: [90, 30, 7], approval: [180, 90], ead: [180, 90, 30], ap: [90, 30], gc: [180, 90], cases: [14, 7, 1],
};
export const LEAD_CHOICES = [180, 120, 90, 60, 30, 14, 7, 1];
export const OLD_DEFAULT = [180, 90, 30, 7];

/** The lead times for one type: the person's choice for it, else the type default (or their old
 *  single list, if they changed it before v2.9). */
export function typeSetting(rm: PersonReminders | undefined, k: ReminderType): TypeSetting {
  const own = rm?.types?.[k];
  if (own) return own;
  const old = rm?.lead;
  const custom = old && old.join() !== OLD_DEFAULT.join();
  return { on: true, lead: custom ? [...old] : [...TYPE_DEFAULT[k]] };
}

/** The date each type is about, for this person. */
export function typeDates(rec: PersonRecord | undefined): Partial<Record<ReminderType, string>> {
  if (!rec) return {};
  return { passport: rec.passportExpiry, visa: rec.visaStamp?.expires, i94: rec.i94?.until, approval: rec.petitionEnd, ead: rec.ead?.expires, ap: rec.advanceParole?.expires, gc: rec.greenCard?.expires };
}

/** Types this person actually has (a dated document, or a case with dates). */
export function typesFor(rec: PersonRecord | undefined, hasCaseDates: boolean): ReminderType[] {
  const d = typeDates(rec);
  return REMINDER_TYPES.map((x) => x.key).filter((k) => (k === 'cases' ? hasCaseDates : !!d[k]));
}

/** Which type a rule finding's date belongs to (by finding id). */
export function typeOfFinding(id: string): ReminderType | undefined {
  if (id.startsWith('pp-')) return 'passport';
  if (id.startsWith('visa-')) return 'visa';
  if (id.startsWith('i94') || id === 'ext-late') return 'i94';
  if (id.startsWith('ead-')) return 'ead';
  if (id.startsWith('ap-')) return 'ap';
  if (id.startsWith('i751') || id.startsWith('i90')) return 'gc';
  if (id.startsWith('rfe-')) return 'cases';
  return undefined;
}

/** Copy one person's reminder settings to others (Apply to: everyone / chosen people). */
export function copyReminders(from: PersonReminders, to: PersonReminders | undefined): PersonReminders {
  return { ...(to ?? { on: true, lead: OLD_DEFAULT }), on: from.on, lead: [...from.lead], types: from.types ? JSON.parse(JSON.stringify(from.types)) : undefined };
}

/** One line for a Reminders row: "On · Passport, I-94 and 2 more". */
export function reminderSummary(rm: PersonReminders | undefined, kinds: ReminderType[]): string {
  if (rm && !rm.on) return 'Off';
  const on = kinds.filter((k) => typeSetting(rm, k).on && typeSetting(rm, k).lead.length).map((k) => REMINDER_TYPES.find((x) => x.key === k)!.title.replace(/ \(.*\)$/, ''));
  if (!kinds.length) return 'On · add documents to get reminders';
  if (!on.length) return 'On · every type turned off';
  return `On · ${on.length <= 2 ? on.join(' and ') : `${on.slice(0, 2).join(', ')} and ${on.length - 2} more`}`;
}
