// v2.9 search from Home: a local index of people, documents, cases, tools, help topics and
// community, with immigration synonyms (GC = green card = I-485 …). Nothing leaves the phone. Pure.

export type SearchSection = 'People' | 'Documents' | 'Cases' | 'Tools' | 'Help' | 'Community';
export const SECTION_ORDER: SearchSection[] = ['People', 'Documents', 'Cases', 'Tools', 'Help', 'Community'];
export type SearchItem = { id: string; section: SearchSection; title: string; sub?: string; path: string; params?: Record<string, string>; keywords?: string[] };

/** Words that mean the same thing here. A query matching any word searches for all of them. */
export const SYNONYMS: string[][] = [
  ['gc', 'green card', 'greencard', 'i-485', 'i-140', 'perm', 'adjustment of status', 'priority date', 'gc tracking', 'permanent resident', 'i-551'],
  ['ead', 'work permit', 'employment authorization', 'i-765', 'c9', 'c26'],
  ['ap', 'advance parole', 'i-131', 'travel document', 'i-512'],
  ['stamping', 'visa stamp', 'visa', 'consulate', 'appointment'],
  ['vb', 'visa bulletin', 'bulletin', 'final action', 'dates for filing'],
  ['processing', 'processing times', 'how long', 'wait time'],
  ['i-94', 'admit until', 'stay', 'admission record'],
  ['i-797', 'approval', 'approval notice', 'notice', 'i-129'],
  ['receipt', 'case', 'case status', 'uscis'],
  ['l1', 'l-1', 'l-1a', 'l-1b', 'blanket', 'i-129s', 'l-2', 'l-2s'],
  ['h1b', 'h-1b', 'h-4', 'lottery', 'lca'],
  ['passport', 'renew passport'],
  ['citizenship', 'naturalization', 'n-400', 'civics', 'citizenship test'],
  ['layoff', 'lost my job', 'job ended', 'grace period', '60 days'],
  ['travel', 'trip', 'can i travel'],
  ['community', 'forum', 'ask', 'posts', 'questions'],
  ['reminders', 'notifications', 'alerts'],
  ['backup', 'icloud', 'restore'],
];

/** Lower case, "I-485" = "i485" = "I 485", accents and punctuation dropped. */
export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/ /g, '');

/** The query plus every synonym of it (whole query first, then each word). */
export function expandQuery(q: string): string[] {
  const nq = norm(q);
  if (!nq) return [];
  const out = new Set<string>([nq]);
  const add = (term: string) => {
    for (const g of SYNONYMS) if (g.some((w) => squash(w) === squash(term) || (squash(term).length >= 3 && squash(w).startsWith(squash(term))))) for (const w of g) out.add(norm(w));
  };
  add(nq);
  if (nq.includes(' ')) for (const w of nq.split(' ')) if (w.length >= 2) add(w);
  return [...out];
}

function score(it: SearchItem, terms: string[], nq: string): number {
  const title = norm(it.title), hay = [title, norm(it.sub ?? ''), ...(it.keywords ?? []).map(norm)].join(' | ');
  const hayS = hay.replace(/ /g, '');
  let s = 0;
  if (title === nq) s += 100;
  if (title.startsWith(nq)) s += 50;
  if (title.includes(nq)) s += 30;
  if (hay.includes(nq) || hayS.includes(nq.replace(/ /g, ''))) s += 20;
  for (const t of terms) if (t !== nq && t.length >= 2 && (hay.includes(t) || (t.length >= 3 && hayS.includes(t.replace(/ /g, ''))))) s += 8;
  // every word of a multi-word query somewhere ("arun passport")
  const words = nq.split(' ').filter(Boolean);
  if (words.length > 1 && words.every((w) => hay.includes(w))) s += 25;
  return s;
}

export type SearchGroup = { section: SearchSection; items: SearchItem[] };
/** Results grouped by section (People first), best match first, at most `per` per section. */
export function search(items: SearchItem[], q: string, per = 6): SearchGroup[] {
  const nq = norm(q);
  if (!nq) return [];
  const terms = expandQuery(q);
  const hits = items.map((it) => ({ it, s: score(it, terms, nq) })).filter((x) => x.s > 0);
  return SECTION_ORDER.map((section) => ({ section, items: hits.filter((x) => x.it.section === section).sort((a, b) => b.s - a.s).slice(0, per).map((x) => x.it) })).filter((g) => g.items.length);
}

/** Fixed entries: screens worth jumping to straight from search. */
export const STATIC_ITEMS: SearchItem[] = [
  { id: 'vb', section: 'Tools', title: 'Visa Bulletin', sub: 'This month’s final action dates and dates for filing', path: '/tools/vb', keywords: ['gc', 'priority date'] },
  { id: 'pd', section: 'Tools', title: 'Priority date', sub: 'GC tracking: is your green card date current?', path: '/tools/pd', keywords: ['gc tracking', 'i-140', 'perm'] },
  { id: 'gcp', section: 'Tools', title: 'Green card planner', sub: 'GC steps from PERM and I-140 to I-485', path: '/tools/gcp', keywords: ['gc', 'i-485', 'perm', 'i-140'] },
  { id: 'proc', section: 'Tools', title: 'Processing times', sub: 'How long USCIS is taking, by form', path: '/tools/proc', keywords: ['i-129', 'i-485', 'i-765', 'i-131'] },
  { id: 'cases', section: 'Cases', title: 'All cases', sub: 'Receipts and USCIS case status', path: '/(tabs)/cases', keywords: ['receipt', 'case status'] },
  { id: 'forum', section: 'Community', title: 'Community', sub: 'Ask people on the same visa', path: '/(tabs)/forum', keywords: ['forum', 'questions'] },
  { id: 'settings', section: 'Help', title: 'Settings', sub: 'Face ID, backups, colour, notifications', path: '/settings', keywords: ['backup', 'icloud', 'face id', 'notifications'] },
];
