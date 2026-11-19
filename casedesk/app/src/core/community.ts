// Community Q&A — pure logic shared by the screens (and unit-tested): the tag list (same as the
// server's src/forum.mjs TAGS), which tags fit this family, client-side checks that mirror the server
// so people get instant feedback, and small formatting helpers. Nothing here talks to the network.
import type { VisaType } from './model';

export const COMMUNITY_DISCLAIMER = 'Community answers are from other users, not lawyers — not legal advice.';
export const RULES_VERSION = 1;
export const COMMUNITY_RULES = [
  'Be kind. No harassment, hate, threats, sexual content or personal attacks — zero tolerance: content is removed and accounts are banned.',
  'Keep your privacy. Never post receipt numbers, A-numbers, passport numbers, emails or phone numbers.',
  'No ads, paid services, “DM me”, or anything that looks like a scam.',
  'Stay on topic: US visas, green cards, citizenship and the paperwork around them.',
  'Community answers are from other users, not lawyers — not legal advice. For your own case, talk to an immigration attorney.',
  'See something wrong? Tap ••• → Report, or block the person. Reports are reviewed within 24 hours.',
];

export const TAGS = {
  visa: ['H-1B', 'H-4', 'L-1', 'L-2', 'F-1', 'OPT', 'STEM OPT', 'TN', 'E-3', 'O-1', 'J-1', 'B-1/B-2', 'Green card', 'Citizenship'],
  form: ['I-129', 'I-130', 'I-131', 'I-140', 'I-485', 'I-539', 'I-765', 'I-751', 'I-90', 'N-400', 'PERM', 'DS-160'],
  topic: ['Stamping', 'Travel', 'RFE', 'Layoff', 'Job change', 'Premium', 'Priority date', 'Lottery', 'Processing times'],
} as const;
export const ALL_TAGS: string[] = [...TAGS.visa, ...TAGS.form, ...TAGS.topic];
export const MAX_TAGS = 5;
export const LIMITS = { title: [10, 150], body: [20, 5000], answer: [10, 5000], name: [3, 24] } as const;

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam or ads' },
  { id: 'scam', label: 'Scam or paid “services”' },
  { id: 'abuse', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'personal-info', label: 'Shares someone’s personal details' },
  { id: 'off-topic', label: 'Off-topic' },
  { id: 'other', label: 'Something else' },
];

// Visa type on a person's record → community tags (principal and dependent both see the principal's tag).
const VISA_TAGS: Partial<Record<VisaType, string[]>> = {
  'H-1B': ['H-1B'], 'H-4': ['H-4', 'H-1B'], 'H-4 EAD': ['H-4', 'H-1B'],
  'L-1A': ['L-1'], 'L-1B': ['L-1'], 'L-2': ['L-2', 'L-1'], 'L-2S': ['L-2', 'L-1'],
  TN: ['TN'], TD: ['TN'], 'E-3': ['E-3'], 'E-3D': ['E-3'], 'O-1': ['O-1'], 'O-3': ['O-1'],
  'F-1': ['F-1'], 'F-1 OPT': ['OPT', 'F-1'], 'STEM OPT': ['STEM OPT', 'OPT'], 'F-2': ['F-1'], 'J-1': ['J-1'], 'J-2': ['J-1'],
  'B-1/B-2': ['B-1/B-2'], 'B-2': ['B-1/B-2'],
  'Green card pending': ['Green card', 'I-485'], 'Green card': ['Citizenship', 'Green card'], 'Conditional green card': ['I-751', 'Green card'],
};

/** Tags for "For my visa": the family's visa types first, then the forms on their cases. Max 8. */
export function familyCommunityTags(visas: (VisaType | undefined)[], forms: (string | undefined)[] = []): string[] {
  const out: string[] = [];
  const add = (t: string) => { if (ALL_TAGS.includes(t) && !out.includes(t)) out.push(t); };
  for (const v of visas) for (const t of (v && VISA_TAGS[v]) || []) add(t);
  for (const f of forms) if (f) add(f.toUpperCase().replace(/^I(\d)/, 'I-$1'));
  return out.slice(0, 8);
}

/** Tag chips for the composer: the family's tags first, then everything else in list order. */
export const orderedTags = (fam: string[]) => [...fam.filter((t) => ALL_TAGS.includes(t)), ...ALL_TAGS.filter((t) => !fam.includes(t))];

export function toggleTag(list: string[], tag: string, max = MAX_TAGS): string[] {
  if (list.includes(tag)) return list.filter((t) => t !== tag);
  return list.length >= max ? list : [...list, tag];
}

// Mirrors of the server's personal-data checks, so the warning shows while typing.
const RECEIPT = /\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|TSC|NSC|VSC|CSC)\s?-?\d{10}\b/i;
const A_NUMBER = /\bA[\s#-]?0?\d{8,9}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

export function privacyProblem(s: string): string | null {
  if (RECEIPT.test(s)) return 'Remove your receipt number — it’s personal. Say the form and service center instead (for example I-129 at EAC).';
  if (SSN.test(s) || A_NUMBER.test(s)) return 'Remove personal numbers (A-number, SSN or passport number) before posting.';
  if (EMAIL.test(s) || PHONE.test(s)) return 'Remove emails and phone numbers — keep contact details private.';
  return null;
}

const len = (s: string) => s.trim().length;
export type Draft = { title: string; body: string; tags: string[] };
/** First problem with a question draft (or null when it can be posted). */
export function draftProblem(d: Draft): string | null {
  if (len(d.title) < LIMITS.title[0]) return `Title needs at least ${LIMITS.title[0]} characters.`;
  if (len(d.title) > LIMITS.title[1]) return `Title can be at most ${LIMITS.title[1]} characters.`;
  if (len(d.body) < LIMITS.body[0]) return `Add a bit more detail (at least ${LIMITS.body[0]} characters).`;
  if (len(d.body) > LIMITS.body[1]) return `Details can be at most ${LIMITS.body[1]} characters.`;
  if (!d.tags.length) return 'Pick at least one tag so the right people see it.';
  return privacyProblem(`${d.title}\n${d.body}`);
}
export function answerProblem(body: string): string | null {
  if (len(body) < LIMITS.answer[0]) return `Write at least ${LIMITS.answer[0]} characters.`;
  if (len(body) > LIMITS.answer[1]) return `At most ${LIMITS.answer[1]} characters.`;
  return privacyProblem(body);
}
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < LIMITS.name[0] || n.length > LIMITS.name[1]) return `${LIMITS.name[0]}–${LIMITS.name[1]} characters.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n)) return 'Use letters, numbers, spaces, dots, dashes or underscores.';
  return null;
}

/** "just now", "5 min", "3 h", "2 d", then "Mar 4" / "Mar 4, 2025". */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  const d = new Date(t), y = new Date(now).getFullYear();
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return d.getFullYear() === y ? `${M} ${d.getDate()}` : `${M} ${d.getDate()}, ${d.getFullYear()}`;
}

export type FeedTab = 'For my visa' | 'All' | 'Unanswered';
export const FEED_TABS: FeedTab[] = ['For my visa', 'All', 'Unanswered'];
/** Query string for GET /api/forum/posts. A picked chip wins over the family's tags. */
export function feedQuery(o: { tab: FeedTab; famTags: string[]; tag?: string | null; q?: string; cursor?: string | null; sort?: 'new' | 'top' }): string {
  const p: [string, string][] = [];
  p.push(['sort', o.tab === 'Unanswered' ? 'unanswered' : o.sort ?? 'new']);
  const tags = o.tag ? [o.tag] : o.tab === 'For my visa' ? o.famTags : [];
  if (tags.length) p.push(['tags', tags.join(',')]);
  if (o.q?.trim()) p.push(['q', o.q.trim().slice(0, 100)]);
  if (o.cursor) p.push(['cursor', o.cursor]);
  return '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** What the app does with a server error code. */
export function errorAction(e: { status?: number; code?: string }): 'signin' | 'rules' | 'banned' | 'retry' | 'show' {
  if (e.code === 'auth' || e.status === 401) return 'signin';
  if (e.code === 'rules') return 'rules';
  if (e.code === 'banned') return 'banned';
  if (!e.status || e.status >= 500 || e.status === 429) return e.status === 429 ? 'show' : 'retry';
  return 'show';
}

/** Ask for notification permission once, after the first question or answer. */
export const shouldAskNotify = (o: { asked: boolean; granted: boolean }) => !o.asked && !o.granted;
