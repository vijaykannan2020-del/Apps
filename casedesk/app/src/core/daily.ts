// Daily check-in notification: at most one a day (10 AM), a different topic each day, made on the phone
// from the family's own data plus the Visa Bulletin, tools and community. Nothing leaves the phone.
// Skipped on days that already have a date reminder. Settings → Notifications → "Daily check-in".
import type { Person } from './model';
import type { PersonRecord } from './record';
import type { VisaBulletin } from './bulletin';
import { addDays, daysBetween, fmt } from './dates';
import { typeDates, REMINDER_TYPES } from './reminders';

export type DailyItem = { at: string; topic: string; title: string; body: string; url: string };
export type DailyInput = {
  today: string;
  people: Person[];
  records: Record<string, PersonRecord | undefined>;
  bulletin: VisaBulletin;
  docs: number;
  cases: { form?: string; status?: string; checkedAt?: string }[];
  backupOn: boolean;
  /** dates that already get a reminder notification (no second notification that day) */
  busyDays?: Set<string>;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type Pick = (day: string, n: number) => Omit<DailyItem, 'at' | 'topic'> | null;

/** The family's nearest upcoming date (passport, I-94, visa, EAD …) for a countdown. */
function nextDate(i: DailyInput, day: string): { who: string; what: string; date: string; id: string } | null {
  let best: { who: string; what: string; date: string; id: string } | null = null;
  for (const p of i.people) {
    const d = typeDates(i.records[p.id]);
    for (const t of REMINDER_TYPES) {
      const v = (d as Record<string, string | undefined>)[t.key];
      if (!v || v <= day) continue;
      if (!best || v < best.date) best = { who: p.name, what: t.what, date: v, id: p.id };
    }
  }
  return best;
}

const TOPICS: [string, Pick][] = [];
const add = (topic: string, f: Pick) => TOPICS.push([topic, f]);

export function dailyItems(i: DailyInput, days = 7): DailyItem[] {
  TOPICS.length = 0;
  // 1. countdown to the family's next date
  add('countdown', (day) => {
    const n = nextDate(i, day);
    if (!n) return null;
    const left = daysBetween(day, n.date);
    return { title: `${n.who}: ${n.what} in ${left} days`, body: `On ${fmt(n.date)}. Open to see what to do and when to start.`, url: `/person/${n.id}` };
  });
  // 2. Visa Bulletin: the month's bulletin and where EB-2 / EB-3 stand
  add('bulletin', (day) => {
    const b = i.bulletin; if (!b?.month) return null;
    const eb2 = b.rows.find((r) => r.cat === 'EB-2');
    const chart = b.uscisChart === 'final' ? 'final' : 'filing';
    const india = eb2?.[chart]?.india;
    const m = +day.slice(5, 7) - 1;
    const fresh = [MONTHS[m], MONTHS[(m + 1) % 12]].includes(b.month.split(' ')[0]);
    return {
      title: fresh ? `${b.month} Visa Bulletin: where’s your date?` : 'Check the Visa Bulletin',
      body: india && india !== 'C' && india !== 'U' ? `EB-2 India (${chart === 'filing' ? 'dates for filing' : 'final action'}): ${fmt(india)}. See your category and country.` : 'See how your category and country moved this month.',
      url: '/tools/vb',
    };
  });
  // 3. case status
  add('cases', () => {
    if (!i.cases.length) return { title: 'Track your USCIS case', body: 'Add a receipt number and get an alert when the status changes.', url: '/cases' };
    const c = i.cases[0];
    return { title: 'Any news on your case?', body: `${c.form ?? 'Your case'}${c.status ? `: ${c.status.slice(0, 60)}` : ''}. Tap to check the latest status.`, url: '/cases' };
  });
  // 4. tools, a different one each time
  const tools: [string, string, string][] = [
    ['Green card planner', 'See your next steps and how long each one usually takes.', '/tools/gcp'],
    ['Can I travel?', 'Check what you need before an international trip.', '/tools/travel'],
    ['Processing times', 'See how long USCIS is taking for your form right now.', '/tools/proc'],
    ['Prevailing wage', 'Look up the wage level for a job title and city.', '/tools/wage'],
    ['Employer H-1B data', 'See how many H-1Bs an employer filed and approved.', '/tools/emp'],
    ['Visa appointment waits', 'Check current interview wait times at US consulates.', '/tools/waits'],
    ['Priority date', 'See how far your priority date is from current.', '/tools/pd'],
    ['Citizenship test', 'Practise a few civics questions — it takes two minutes.', '/tools/civics'],
  ];
  add('tool', (_d, n) => { const t = tools[n % tools.length]; return { title: `Tool of the day: ${t[0]}`, body: t[1], url: t[2] }; });
  // 5. documents
  add('docs', () => (i.docs < 3 ? { title: 'Add a document in seconds', body: 'Scan a passport, I-797 or I-94 and the app reads the dates for reminders.', url: '/family' } : { title: 'Are your documents up to date?', body: 'Got a new I-94 or approval notice? Add it so your dates stay right.', url: '/family' }));
  // 6. community
  add('community', () => ({ title: 'Ask the community', body: 'See what others with the same visa are asking, or post your own question.', url: '/forum' }));
  // 7. news
  add('news', () => ({ title: 'This week in immigration', body: 'Catch up on USCIS and DOL updates for your visa types.', url: '/updates' }));
  // 8. backup (only while it's off)
  add('backup', () => (i.backupOn ? null : { title: 'Keep a safe copy of your documents', body: 'Turn on the locked backup so a lost phone doesn’t mean lost documents.', url: '/settings-page/backup' }));

  const out: DailyItem[] = [];
  const start = Math.floor(Date.parse(i.today + 'T12:00:00Z') / 864e5);
  let last = '';
  for (let k = 1; k <= days; k++) {
    const day = addDays(i.today, k);
    if (i.busyDays?.has(day)) continue;
    for (let tries = 0; tries < TOPICS.length; tries++) {
      const n = start + k + tries;
      const [topic, f] = TOPICS[n % TOPICS.length];
      if (topic === last) continue;
      const m = f(day, Math.floor(n / TOPICS.length));
      if (!m) continue;
      out.push({ at: day, topic, ...m });
      last = topic;
      break;
    }
  }
  return out;
}
