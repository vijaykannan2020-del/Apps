// Community — pure logic shared by the screens (and unit-tested): the tag list (same as the
// server's src/forum.mjs TAGS), which tags fit this family, client-side checks that mirror the server
// so people get instant feedback, and small formatting helpers. Nothing here talks to the network.
import type { VisaType } from './model';
/** The four pastels used for avatars and tags (names only — the colours are theme tokens, t.pastel.*). */
export type PastelName = 'sage' | 'blush' | 'butter' | 'sky';
export const PASTEL_NAMES: PastelName[] = ['sage', 'blush', 'butter', 'sky'];

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
export const LIMITS = { title: [10, 150], body: [20, 5000], answer: [10, 5000], comment: [2, 5000], name: [3, 24], pollOption: [1, 80], pollOptions: [2, 4], steps: [2, 6] } as const;

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
export type PostType = 'question' | 'discussion' | 'timeline' | 'poll';
export type TimelineStep = { label: string; date: string };
export type TimelineData = { form: string; office: string; premium: boolean; steps: TimelineStep[] };
export type Draft = { title: string; body: string; tags: string[]; type?: PostType; poll?: string[]; timeline?: TimelineData; repost?: boolean };
/** First problem with a draft (or null when it can be posted). Mirrors the server's checks per post type. */
export function draftProblem(d: Draft, today = new Date().toISOString().slice(0, 10)): string | null {
  const type = d.type ?? 'question';
  if (!(d.repost && !len(d.title))) {
    if (len(d.title) < LIMITS.title[0]) return `Title needs at least ${LIMITS.title[0]} characters.`;
    if (len(d.title) > LIMITS.title[1]) return `Title can be at most ${LIMITS.title[1]} characters.`;
  }
  const bodyOptional = d.repost || type === 'timeline' || type === 'poll';
  if (!bodyOptional && len(d.body) < LIMITS.body[0]) return `Add a bit more detail (at least ${LIMITS.body[0]} characters).`;
  if (len(d.body) > LIMITS.body[1]) return `Details can be at most ${LIMITS.body[1]} characters.`;
  if (type === 'poll' && !d.repost) {
    const o = (d.poll ?? []).map((x) => x.trim()).filter(Boolean);
    if (o.length < LIMITS.pollOptions[0]) return `A poll needs at least ${LIMITS.pollOptions[0]} options.`;
    if (o.length > LIMITS.pollOptions[1]) return `A poll can have at most ${LIMITS.pollOptions[1]} options.`;
    if (o.some((x) => x.length > LIMITS.pollOption[1])) return `Poll options can be at most ${LIMITS.pollOption[1]} characters.`;
    if (new Set(o.map((x) => x.toLowerCase())).size !== o.length) return 'Make each poll option different.';
  }
  if (type === 'timeline' && !d.repost) {
    const p = timelineProblem(d.timeline, today);
    if (p) return p;
  }
  if (!d.tags.length && !d.repost) return 'Pick at least one tag so the right people see it.';
  return privacyProblem([d.title, d.body, ...(d.poll ?? [])].join('\n'));
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
export function feedQuery(o: { tab: FeedTab; famTags: string[]; tag?: string | null; q?: string; cursor?: string | null; sort?: SortId; range?: TopRange }): string {
  const p: [string, string][] = [];
  const sort = o.tab === 'Unanswered' ? 'unanswered' : o.sort ?? 'new';
  p.push(['sort', sort]);
  if (sort === 'top' && o.range && o.range !== 'all') p.push(['t', o.range]);
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

/** What a failed write means for the screen */
export const isAuthError = (e: { status?: number; code?: string }) => errorAction(e) === 'signin' || errorAction(e) === 'rules';

/** Ask for notification permission once, after the first question or answer. */
export const shouldAskNotify = (o: { asked: boolean; granted: boolean }) => !o.asked && !o.granted;

// ====================== v2.7: Reddit-style community ======================
export const POST_TYPES: { id: PostType; label: string; icon: string; hint: string }[] = [
  { id: 'question', label: 'Question', icon: 'help', hint: 'Ask something. You can mark one answer as accepted.' },
  { id: 'discussion', label: 'Discussion', icon: 'chat', hint: 'Share news, an experience or an opinion.' },
  { id: 'timeline', label: 'Timeline', icon: 'clock', hint: 'Share your case dates: form, office and each step.' },
  { id: 'poll', label: 'Poll', icon: 'hr', hint: 'Ask with 2–4 choices. One vote each.' },
];
export const typeLabel = (t: PostType | string) => POST_TYPES.find((x) => x.id === t)?.label ?? 'Post';
export const MAX_DEPTH = 4;
export const OFFICES = ['EAC', 'WAC', 'LIN', 'SRC', 'IOE', 'NBC', 'MSC', 'YSC', 'Consulate', 'Other'] as const;
export const STEPS = ['Filed', 'Receipt notice', 'Biometrics', 'RFE received', 'RFE response', 'Interview', 'Transferred', 'Approved', 'Denied', 'Card received'] as const;
export const FLAIRS = ['H-1B', 'H-4', 'L-1A', 'L-1B', 'L-2', 'F-1', 'OPT', 'STEM OPT', 'TN', 'E-3', 'O-1', 'J-1', 'B-1/B-2', 'Green card', 'Citizen'] as const;
/** The 24 built-in avatars (same ids as the server's AVATARS). No photo uploads. */
export const AVATARS: { id: string; emoji: string; name: string }[] = [
  { id: 'fox', emoji: '🦊', name: 'Fox' }, { id: 'owl', emoji: '🦉', name: 'Owl' }, { id: 'cat', emoji: '🐱', name: 'Cat' }, { id: 'dog', emoji: '🐶', name: 'Dog' },
  { id: 'panda', emoji: '🐼', name: 'Panda' }, { id: 'koala', emoji: '🐨', name: 'Koala' }, { id: 'tiger', emoji: '🐯', name: 'Tiger' }, { id: 'penguin', emoji: '🐧', name: 'Penguin' },
  { id: 'whale', emoji: '🐳', name: 'Whale' }, { id: 'turtle', emoji: '🐢', name: 'Turtle' }, { id: 'bee', emoji: '🐝', name: 'Bee' }, { id: 'butterfly', emoji: '🦋', name: 'Butterfly' },
  { id: 'cactus', emoji: '🌵', name: 'Cactus' }, { id: 'tulip', emoji: '🌷', name: 'Tulip' }, { id: 'maple', emoji: '🍁', name: 'Maple leaf' }, { id: 'mountain', emoji: '⛰️', name: 'Mountain' },
  { id: 'wave', emoji: '🌊', name: 'Wave' }, { id: 'moon', emoji: '🌙', name: 'Moon' }, { id: 'sun', emoji: '☀️', name: 'Sun' }, { id: 'star', emoji: '⭐', name: 'Star' },
  { id: 'rocket', emoji: '🚀', name: 'Rocket' }, { id: 'globe', emoji: '🌍', name: 'Globe' }, { id: 'compass', emoji: '🧭', name: 'Compass' }, { id: 'kite', emoji: '🪁', name: 'Kite' },
];

/** Stable small hash (same person / tag → same pastel on every phone). */
export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const pastelFor = (key: string): PastelName => PASTEL_NAMES[hash(key) % PASTEL_NAMES.length];
/** "Quiet Falcon 42" → "QF"; "dallasdad" → "DA"; [deleted] → "–". */
export function initials(name: string): string {
  const words = (name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return '–';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
export type AuthorLike = { id: string | null; name: string; avatar?: string | null; flair?: string | null; deleted?: boolean };
/** What to draw in the avatar circle: a built-in emoji or the initials, on a pastel picked from the person's id. */
export function avatarOf(a: AuthorLike): { pastel: PastelName; text: string; emoji: boolean } {
  const pastel = pastelFor(a.id || a.name || '?');
  const built = a.avatar ? AVATARS.find((x) => x.id === a.avatar) : undefined;
  return built ? { pastel, text: built.emoji, emoji: true } : { pastel, text: initials(a.name), emoji: false };
}
/** "QuietFalcon · L-1A · 2 h" */
export const byline = (a: AuthorLike, at: string, now = Date.now()) => [a.name, a.deleted ? '' : a.flair || '', timeAgo(at, now)].filter(Boolean).join(' · ');

export const fmtCount = (n: number): string => (Math.abs(n) < 1000 ? String(n) : Math.abs(n) < 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n / 1000)}k`);
export function joined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Joined ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------- votes ----------
export type Dir = 1 | 0 | -1;
/** Tapping the arrow you already picked clears it; tapping the other one switches. */
export const nextVote = (current: Dir, tapped: 1 | -1): Dir => (current === tapped ? 0 : tapped);
/** Optimistic score while the request is on its way. */
export const applyVote = <T extends { score: number; myVote: Dir }>(it: T, dir: Dir): T => ({ ...it, score: it.score - it.myVote + dir, myVote: dir, voted: dir === 1 });

// ---------- feed ----------
export type SortId = 'hot' | 'new' | 'top' | 'unanswered';
export type TopRange = 'day' | 'week' | 'all';
export const SORTS: { id: SortId; label: string }[] = [{ id: 'hot', label: 'Hot' }, { id: 'new', label: 'New' }, { id: 'top', label: 'Top' }, { id: 'unanswered', label: 'Unanswered' }];
export const TOP_RANGES: { id: TopRange; label: string }[] = [{ id: 'day', label: 'Today' }, { id: 'week', label: 'This week' }, { id: 'all', label: 'All time' }];
/** Same formula as the server (src/forum.mjs hotScore): votes on a log scale + a steady bonus for newer posts. */
export function hotScore(score: number, comments: number, createdMs: number): number {
  const s = score + comments * 0.5;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  return (s > 0 ? order : s < 0 ? -order : 0) + createdMs / 1000 / 45000;
}
/** Add a page to the list without repeating posts that moved between pages. */
export function mergePage<T extends { id: string }>(have: T[], page: T[]): T[] {
  const seen = new Set(have.map((p) => p.id));
  return [...have, ...page.filter((p) => !seen.has(p.id))];
}

// ---------- comment threads ----------
export type CommentLike = { id: string; parentId: string | null; score: number; up?: number; down?: number; createdAt: string; accepted?: boolean };
export type CommentSort = 'best' | 'new';
export type Node<C> = C & { replies: Node<C>[]; depth: number };
function wilson(up: number, down: number): number {
  const n = up + down;
  if (!n) return 0;
  const z = 1.2816, ph = up / n;
  return (ph + (z * z) / (2 * n) - z * Math.sqrt((ph * (1 - ph) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}
/** Flat list from the server → nested tree. Best: accepted answer, then vote confidence; New: newest first. */
export function buildTree<C extends CommentLike>(list: C[], sort: CommentSort = 'best'): Node<C>[] {
  const nodes = new Map<string, Node<C>>(list.map((c) => [c.id, { ...c, replies: [], depth: 0 }]));
  const roots: Node<C>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.replies.push(n); else if (!n.parentId) roots.push(n);
  }
  const acc = (a: Node<C>, b: Node<C>) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0);
  const byNew = (a: Node<C>, b: Node<C>) => b.createdAt.localeCompare(a.createdAt);
  const best = (a: Node<C>, b: Node<C>) => wilson(b.up ?? Math.max(0, b.score), b.down ?? 0) - wilson(a.up ?? Math.max(0, a.score), a.down ?? 0) || b.score - a.score || a.createdAt.localeCompare(b.createdAt);
  const cmp = sort === 'new' ? byNew : best;
  const walk = (arr: Node<C>[], depth: number) => { arr.sort((a, b) => (depth === 0 ? acc(a, b) : 0) || cmp(a, b)); for (const n of arr) { n.depth = depth; walk(n.replies, depth + 1); } return arr; };
  return walk(roots, 0);
}
export const countReplies = <C>(n: Node<C>): number => n.replies.reduce((a, r) => a + 1 + countReplies(r), 0);
export type ThreadRow<C> = { c: Node<C>; depth: number; collapsed: boolean; hidden: number };
/** Tree → the rows to draw, top to bottom. A collapsed comment keeps its own row and hides everything below it. */
export function threadRows<C extends { id: string }>(tree: Node<C>[], collapsed: ReadonlySet<string>): ThreadRow<C>[] {
  const out: ThreadRow<C>[] = [];
  const walk = (arr: Node<C>[]) => { for (const n of arr) { const isC = collapsed.has(n.id); out.push({ c: n, depth: Math.min(n.depth, MAX_DEPTH - 1), collapsed: isC, hidden: isC ? countReplies(n) : 0 }); if (!isC) walk(n.replies); } };
  walk(tree);
  return out;
}
export function commentProblem(body: string): string | null {
  if (len(body) < LIMITS.comment[0]) return 'Write a comment first.';
  if (len(body) > LIMITS.comment[1]) return `At most ${LIMITS.comment[1]} characters.`;
  return privacyProblem(body);
}

// ---------- polls ----------
/** Whole-number percentages that add up to 100 (largest remainder). All zero when nobody voted. */
export function pollPercents(votes: number[]): number[] {
  const total = votes.reduce((a, b) => a + b, 0);
  if (!total) return votes.map(() => 0);
  const raw = votes.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1])) { if (left-- <= 0) break; out[i]++; }
  return out;
}

// ---------- timeline shares ----------
const DAY = 864e5;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
export function timelineProblem(tl: TimelineData | undefined, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!tl?.form) return 'Pick the form.';
  if (!tl.office) return 'Pick the office.';
  const steps = tl.steps.filter((s) => s.label || s.date);
  if (steps.some((s) => !s.label || !s.date)) return 'Give every step a name and a date.';
  if (steps.length < LIMITS.steps[0]) return `Add at least ${LIMITS.steps[0]} dates (for example Filed and Approved).`;
  if (steps.length > LIMITS.steps[1]) return `At most ${LIMITS.steps[1]} dates.`;
  if (steps.some((s) => !isDate(s.date))) return 'Write dates as YYYY-MM-DD.';
  if (steps.some((s) => s.date > today)) return 'Dates can’t be in the future.';
  if (new Set(steps.map((s) => s.label)).size !== steps.length) return 'Use each step once.';
  return null;
}
/** Steps in date order with the days since the step before, and the total from first to last. */
export function timelineView(tl: TimelineData): { rows: { label: string; date: string; gap: number | null }[]; totalDays: number; outcome: 'approved' | 'denied' | 'pending' } {
  const steps = [...tl.steps].filter((s) => isDate(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const rows = steps.map((s, i) => ({ label: s.label, date: s.date, gap: i ? daysBetween(steps[i - 1].date, s.date) : null }));
  const labels = steps.map((s) => s.label);
  return { rows, totalDays: steps.length > 1 ? daysBetween(steps[0].date, steps[steps.length - 1].date) : 0, outcome: labels.includes('Denied') ? 'denied' : labels.includes('Approved') || labels.includes('Card received') ? 'approved' : 'pending' };
}
/** "Aug 14, 2026" from "2026-08-14" (no time zones involved). */
export function shortDate(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m) return isoDay;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
/** "81 days" / "1 day" / "same day" */
export const daysLabel = (n: number) => (n === 0 ? 'same day' : `${n} day${n === 1 ? '' : 's'}`);
/** Title suggestion for a timeline share: "I-765 at IOE: filed Aug 2026, approved Nov 2026 (81 days)". */
export function timelineTitle(tl: TimelineData): string {
  const v = timelineView(tl);
  if (v.rows.length < 2) return '';
  const my = (d: string) => shortDate(d).replace(/ \d+,/, '');
  const last = v.rows[v.rows.length - 1];
  return `${tl.form} at ${tl.office}: filed ${my(v.rows[0].date)}, ${last.label.toLowerCase()} ${my(last.date)} (${daysLabel(v.totalDays)})`;
}

// ---------- sharing ----------
export const postLink = (id: string) => `casedesk://community/post/${id}`;
/** Text for the system share sheet: the title, then the in-app link. */
export const shareText = (p: { id: string; title: string }) => `${p.title}\n${postLink(p.id)}`;
/** A link someone pasted or tapped → the post id (casedesk://community/post/<id> or /community/post/<id>). */
export function postIdFromLink(url: string): string | null {
  const m = /(?:^casedesk:\/\/|^\/|\/\/[^/]+\/)community\/post\/([\w-]{3,40})(?:[/?#]|$)/.exec(url.trim());
  return m ? m[1] : null;
}

// ---------- Google sign-in (off until a client id is pasted — see GOOGLE.md) ----------
/** "1234-abcd.apps.googleusercontent.com" → Google's iOS URL scheme "com.googleusercontent.apps.1234-abcd" (null when it isn't a client id). */
export function reversedClientId(clientId: string | undefined | null): string | null {
  const m = /^([\w-]+)\.apps\.googleusercontent\.com$/.exec(String(clientId ?? '').trim());
  return m ? `com.googleusercontent.apps.${m[1]}` : null;
}
/**
 * Should the Google button show, and where does Google send the person back to?
 * iOS: only when this installed build has the reversed-client-id URL scheme (added by plugins/withGoogleSignIn.js at
 * the next build) — an over-the-air update on an older build keeps the button hidden. `allowBundleScheme`
 * (extra.googleUseBundleScheme) lets the lead try it on the current build through the bundle-id scheme.
 */
export function googleRedirect(o: { platform: string; iosClientId?: string | null; webClientId?: string | null; hasModule: boolean; schemeInBuild: boolean; bundleId?: string; allowBundleScheme?: boolean }): { show: boolean; redirectUri?: string } {
  if (!o.hasModule) return { show: false };
  if (o.platform === 'web') return { show: !!o.webClientId };
  if (o.platform !== 'ios') return { show: false };
  const scheme = reversedClientId(o.iosClientId);
  if (!scheme) return { show: false };
  if (o.schemeInBuild) return { show: true, redirectUri: `${scheme}:/oauthredirect` };
  if (o.allowBundleScheme && o.bundleId) return { show: true, redirectUri: `${o.bundleId}:/oauthredirect` };
  return { show: false };
}

// ---------- v2.9: pinned Welcome card and conversation starters ----------
/** The three rules on the pinned Welcome card (the full text is the server's Welcome post). */
export const WELCOME_POINTS: { icon: string; text: string }[] = [
  { icon: 'lock', text: 'No receipt, A or passport numbers' },
  { icon: 'users', text: 'Be kind' },
  { icon: 'info', text: 'Not legal advice' },
];
export const WELCOME_START = 'Ask, share a timeline or answer someone.';
/** Under the first post when there is no Welcome card (older server, filtered feed). */
export const DISCLAIMER_CAPTION = 'Answers are from other members, not lawyers. Not legal advice.';
export type Starter = { id: string; title: string; icon: string; type: PostType; tag: string };
/** Start a conversation: each one opens New post with this type and tag picked. */
export const STARTERS: Starter[] = [
  { id: 'stamping', title: 'Share your stamping experience', icon: 'plane', type: 'discussion', tag: 'Stamping' },
  { id: 'extension', title: 'Ask about H-1B or L-1 extension timing', icon: 'help', type: 'question', tag: 'I-129' },
  { id: 'gc', title: 'Post your green card timeline', icon: 'cal', type: 'timeline', tag: 'Green card' },
  { id: 'poll', title: 'Poll: how long did your EAD take?', icon: 'chart', type: 'poll', tag: 'I-765' },
];
/** Fewer real posts than this (the pinned post does not count): show the starters under the feed. */
export const STARTERS_BELOW = 5;
export const showStarters = (o: { posts: { pinned?: boolean }[] | null; query: string; error?: string }) => !!o.posts && !o.query && !o.error && o.posts.filter((p) => !p.pinned).length < STARTERS_BELOW;
/** Compose deep link params → the type and first tags of a new post (unknown values are ignored). */
export function composePrefill(p: { type?: string; tag?: string }, fam: string[]): { type: PostType; tags: string[] } {
  const type = POST_TYPES.some((x) => x.id === p.type) ? (p.type as PostType) : 'question';
  const tag = p.tag && ALL_TAGS.includes(p.tag) ? [p.tag] : [];
  return { type, tags: [...new Set([...tag, ...fam.slice(0, 1)])].slice(0, MAX_TAGS) };
}
/** Start a discussion from an Updates item: Discussion type, the update's title, its summary and
 *  points quoted under a blank top (for the person's own question), the source link, and the update's
 *  visa tags that exist in Community (I-9, Fees, Wages aren't Community tags). Pure. */
export type NewsForPost = { title: string; summary: string; points?: string[]; tags: readonly string[]; url: string; agency: string };
export const NEWS_POST_MARK = '— About this update —';
export function newsPrefill(n: NewsForPost, when: string, fam: string[] = []): { type: PostType; title: string; body: string; tags: string[] } {
  // titles can't hold links: "Regulations.gov" → "Regulations gov"
  const clean = n.title.replace(/\bhttps?:\/\/\S+/gi, '').replace(/\b([a-z0-9-]+)\.(com|net|org|gov|io|in|co|us|info|biz|ly|me)\b/gi, '$1 $2').replace(/\s+/g, ' ').trim();
  const max = LIMITS.title[1];
  const title = clean.length > max ? `${clean.slice(0, clean.lastIndexOf(' ', max - 1) > 40 ? clean.lastIndexOf(' ', max - 1) : max - 1)}…` : clean;
  const lines = [NEWS_POST_MARK, `${n.title} (${n.agency}, ${when})`, n.summary, ...(n.points ?? []).slice(0, 5).map((x) => `• ${x}`), `Source: ${n.url}`];
  const body = `\n\n${lines.filter(Boolean).join('\n')}`.slice(0, LIMITS.body[1]);
  const own = n.tags.filter((t) => ALL_TAGS.includes(t));
  const tags = [...new Set(own.length ? own : fam.slice(0, 1))].slice(0, MAX_TAGS);
  return { type: 'discussion', title, body, tags };
}
/** True while the person hasn't written anything of their own above the quoted update. */
export function newsPostUntouched(body: string): boolean {
  const i = body.indexOf(NEWS_POST_MARK);
  return i >= 0 && body.slice(0, i).trim().length < 10;
}
/** "Hot", "New", "Top · Week", "Unanswered" for the sort menu button. */
export function sortLabel(sort: SortId, range: TopRange): string {
  const s = SORTS.find((x) => x.id === sort)?.label ?? 'Hot';
  if (sort !== 'top') return s;
  return `Top · ${range === 'day' ? 'Today' : range === 'week' ? 'Week' : 'All time'}`;
}
