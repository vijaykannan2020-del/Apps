// v2.9 search from Home: a local index of everything in the app — people, what needs attention,
// documents, cases, every screen, settings, tools, updates, help, visa types and what the app checks —
// with immigration synonyms and tolerant matching (case, dashes, partial words, small typos).
// Nothing leaves the phone. Pure.

export type SearchSection =
  | 'People' | 'Needs attention' | 'Documents' | 'Cases' | 'Green card' | 'Screens' | 'Tools' | 'Settings'
  | 'Updates' | 'Visa types' | 'Help' | 'Checks' | 'Community';
export const SECTION_ORDER: SearchSection[] = ['People', 'Needs attention', 'Documents', 'Cases', 'Green card', 'Screens', 'Tools', 'Settings', 'Updates', 'Visa types', 'Help', 'Checks', 'Community'];

export type SearchItem = {
  id: string;
  section: SearchSection;
  title: string;
  sub?: string; // the result line — never a passport or receipt number
  path: string;
  params?: Record<string, string>;
  keywords?: string[]; // extra words that find it (not shown)
  body?: string; // long text (help topic, update, visa guide): searched; a matching line is shown
  exact?: string[]; // only a FULL match finds it (a typed receipt number); never shown
};

/** Words that mean the same thing here. A query matching any word also searches for the others. */
export const SYNONYMS: string[][] = [
  ['gc', 'green card', 'greencard', 'i-485', 'i-140', 'perm', 'adjustment of status', 'aos', 'priority date', 'gc tracking', 'permanent resident', 'i-551', 'lpr'],
  ['ead', 'work permit', 'employment authorization', 'i-765', 'c9', 'c26', 'c09'],
  ['h-4 ead', 'h4 ead', 'c26', 'spouse work permit'],
  ['ap', 'advance parole', 'i-131', 'travel document', 'i-512', 'combo card'],
  ['stamping', 'visa stamp', 'visa', 'consulate', 'appointment', 'dropbox', 'interview waiver'],
  ['vb', 'visa bulletin', 'bulletin', 'final action', 'dates for filing', 'cut off', 'retrogression'],
  ['processing', 'processing times', 'how long', 'wait time', 'timeline'],
  ['i-94', 'i94', 'admit until', 'admission record', 'arrival departure'],
  ['i-797', 'approval', 'approval notice', 'notice of action', 'i-797a', 'i-797b', 'i-797c'],
  ['receipt', 'case', 'case status', 'uscis case', 'check status', 'receipt number'],
  ['extension', 'extend', 'eos', 'extension of stay', 'i-539', 'i-129', 'renew status'],
  ['transfer', 'h-1b transfer', 'change employer', 'new employer', 'portability', 'ac21'],
  ['portability', 'ac21', 'i-485j', 'same or similar', 'job change'],
  ['layoff', 'laid off', 'lost my job', 'job ended', 'terminated', 'fired', 'grace period', '60 day grace', '60-day', 'unemployment'],
  ['travel', 'trip', 'can i travel', 'flight', 'leave the us', 're-entry', 'reentry'],
  ['rfe', 'request for evidence', 'noid', 'i-797e', 'evidence'],
  ['biometrics', 'biometric', 'fingerprints', 'asc appointment', 'biometrics appointment'],
  ['interview', 'interview notice', 'field office', 'gc interview'],
  ['opt', 'f-1 opt', 'optional practical training', 'unemployment days', '90 days'],
  ['stem', 'stem opt', 'stem extension', '24 month', 'i-983', '150 days'],
  ['cap gap', 'cap-gap', 'capgap', 'cap gap extension'],
  ['f-1', 'f1', 'student', 'i-20', 'sevis', 'dso', 'sevp'],
  ['l-1', 'l1', 'l-1a', 'l-1b', 'blanket', 'blanket l', 'i-129s', 'intracompany'],
  ['l-2', 'l2', 'l-2s', 'l2s', 'l-2 spouse'],
  ['h-1b', 'h1b', 'specialty occupation', 'lottery', 'cap', 'lca'],
  ['h-4', 'h4', 'h-4 spouse', 'dependent'],
  ['max out', '6 year', '6-year limit', '7 year', '7-year limit', 'time limit', 'max stay', 'recapture', 'day counter', 'day counters'],
  ['work location', 'worksite', 'work site', 'remote', 'work from home', 'amendment', 'new city', 'metro'],
  ['passport', 'renew passport', 'passport expiry'],
  ['citizenship', 'naturalization', 'n-400', 'civics', 'citizenship test', 'us citizen'],
  ['community', 'forum', 'ask', 'posts', 'questions', 'discussion'],
  ['reminders', 'notifications', 'alerts', 'notify'],
  ['backup', 'back up', 'icloud', 'restore', 'export', 'new phone'],
  ['lock', 'face id', 'touch id', 'passcode', 'privacy'],
  ['appearance', 'dark mode', 'light mode', 'theme', 'colour', 'color'],
  ['share', 'share with family', 'share with spouse', 'airdrop', 'import shared'],
  ['delete', 'delete data', 'wipe', 'erase', 'remove everything'],
  ['fees', 'filing fee', 'cost', 'price'],
  ['wage', 'prevailing wage', 'salary', 'wage level'],
  ['i-9', 'i9', 'employment eligibility'],
  ['expect', 'what to expect', 'cases like mine', 'estimate'],
  ['updates', 'news', 'headlines', 'policy', 'announcement'],
  ['wallet', 'apple wallet', 'pass', 'widget', 'widgets'],
  ['support', 'help', 'contact', 'about', 'feedback'],
];

// ---------- text ----------
/** Lower case, accents dropped, dashes joined ("I-94" = "i94", "L-2S" = "l2s"), other punctuation a space. */
export const norm = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/(\w)[-‐–.](?=\w)/g, '$1').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/ /g, '');
const words = (s: string) => norm(s).split(' ').filter(Boolean);

/** Edit distance up to `max` (anything above is max + 1). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let pp: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1); // swapped letters count as one
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}
const typoAllowed = (n: number) => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

/** How well one query word matches one indexed word: 10 exact, 7 start of word, 4 inside, 3 small typo. */
function wordScore(q: string, w: string): number {
  if (q === w) return 10;
  if (w.startsWith(q)) return q.length >= 2 || /\d/.test(q) ? 7 : 2;
  if (q.length >= 4 && w.includes(q)) return 4;
  const k = typoAllowed(q.length);
  if (k && Math.abs(w.length - q.length) <= k && editDistance(q, w, k) <= k) return 3;
  if (k && w.length > q.length && editDistance(q, w.slice(0, q.length), k) <= k && q.length >= 5) return 2; // typo in a prefix
  return 0;
}

// ---------- prepared index ----------
type Prepared = { it: SearchItem; title: string[]; rest: string[]; restSet: Set<string>; titleSq: string; allSq: string; titleStr: string; restStr: string; body: string; lines: string[]; lineWords: string[][]; exact: string[] };
const cache = new WeakMap<SearchItem[], Prepared[]>();
function prepare(items: SearchItem[]): Prepared[] {
  const hit = cache.get(items);
  if (hit) return hit;
  const out = items.map((it) => {
    const title = words(it.title);
    const rest = [...new Set([...words(it.sub ?? ''), ...(it.keywords ?? []).flatMap(words), ...words(it.body ?? '')])];
    const lines = (it.body ?? '').split(/\n|(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    return {
      it, title, rest, restSet: new Set(rest), titleSq: squash(it.title), lines, lineWords: lines.map(words),
      titleStr: ` ${title.join(' ')} `, restStr: ` ${[...words(it.sub ?? ''), ...(it.keywords ?? []).flatMap((k) => [...words(k), '|'])].join(' ')} `,
      allSq: [it.title, it.sub ?? '', ...(it.keywords ?? [])].map(squash).join('|'),
      body: ` ${norm(it.body ?? '')} `,
      exact: (it.exact ?? []).map(squash).filter((x) => x.length >= 6),
    };
  });
  cache.set(items, out);
  return out;
}

/** Synonym phrases for the query: the whole query, then each word (typos of 5+ letters allowed). */
export function expandQuery(q: string): string[] {
  const nq = norm(q);
  if (!nq) return [];
  const out = new Set<string>([nq]);
  const add = (term: string) => {
    const t = squash(term);
    if (!t) return;
    for (const g of SYNONYMS) {
      const hit = g.some((w) => { const s = squash(w); return s === t || (t.length >= 3 && s.startsWith(t) && s.length - t.length <= 4) || (t.length >= 5 && editDistance(t, s, 1) <= 1); });
      if (hit) for (const w of g) out.add(norm(w));
    }
  };
  add(nq);
  const ws = nq.split(' ');
  if (ws.length > 1) { for (const w of ws) if (w.length >= 2) add(w); for (let i = 0; i < ws.length - 1; i++) add(`${ws[i]} ${ws[i + 1]}`); }
  return [...out];
}

const bestIn = (q: string, list: string[]) => { let b = 0; for (const w of list) { const s = wordScore(q, w); if (s > b) b = s; if (b === 10) break; } return b; };

function score(p: Prepared, qWords: string[], nq: string, syn: string[]): [number, boolean] {
  const qSq = nq.replace(/ /g, '');
  if (p.exact.length && p.exact.includes(qSq)) return [500, true]; // full receipt number typed
  let s = 0;
  if (p.titleSq === qSq) s += 120;
  else if (p.titleSq.startsWith(qSq) && qSq.length >= 2) s += 60;
  else if (qSq.length >= 3 && p.titleSq.includes(qSq)) s += 35;
  if (qSq.length >= 5 && p.allSq.includes(qSq)) s += 15;
  // every query word must be found (title counts more), directly or through a synonym
  let all = true, total = 0;
  for (const q of qWords) {
    const t = bestIn(q, p.title), r = p.restSet.has(q) ? 10 : bestIn(q, p.rest);
    const w = Math.max(t * 1.6, r);
    if (w <= 0) { all = false; continue; }
    total += w;
  }
  if (all) s += total;
  // synonym phrases ("work permit" for EAD), matched on word boundaries
  let synHit = 0;
  for (const ph of syn) {
    if (ph === nq || ph.length < 2) continue;
    const b = ` ${ph} `;
    if (p.titleStr.includes(b)) synHit = Math.max(synHit, 18);
    else if (p.restStr.includes(b)) synHit = Math.max(synHit, 10);
    else if (ph.length >= 4 && p.body.includes(b)) synHit = Math.max(synHit, 4);
  }
  s += synHit;
  if (!all && !synHit && s < 35) return [0, false];
  // strong = every word found outside long body text, or a synonym in the title / keywords
  const direct = all && qWords.every((q) => Math.max(bestIn(q, p.title), bestIn(q, [...words(p.it.sub ?? ''), ...(p.it.keywords ?? []).flatMap(words)])) > 0);
  // a phrase found inside one line of a help topic, update or guide also counts
  const inLine = (qWords.length >= 2 || nq.length >= 6) && p.lineWords.some((lw) => qWords.every((q) => bestIn(q, lw) >= 7));
  if (inLine) s += 12;
  return [s, direct || inLine || synHit >= 10 || s >= 35];
}

/** The body line that matches (shown as the result line for help, updates and guides). */
function snippet(p: Prepared, qWords: string[]): string | undefined {
  if (!p.lines.length) return undefined;
  if (qWords.some((q) => bestIn(q, p.title) >= 7 || p.title.length && bestIn(q, words(p.it.sub ?? '')) >= 7)) return undefined;
  const i = p.lineWords.findIndex((w) => qWords.every((q) => bestIn(q, w) >= 4));
  const j = i >= 0 ? i : p.lineWords.findIndex((w) => qWords.some((q) => bestIn(q, w) >= 7));
  const line = j >= 0 ? p.lines[j] : undefined;
  if (!line) return undefined;
  return line.length > 110 ? `${line.slice(0, 107).trimEnd()}…` : line;
}

export type SearchGroup = { section: SearchSection; items: SearchItem[] };
/** Results grouped by section (People first), best match first, at most `per` per section. */
export function search(items: SearchItem[], q: string, per = 5): SearchGroup[] {
  const nq = norm(q);
  if (!nq) return [];
  const qWords = nq.split(' ').filter((w) => w.length >= 1);
  const syn = expandQuery(q);
  const prepared = prepare(items);
  const hits: { p: Prepared; s: number; strong: boolean }[] = [];
  for (const p of prepared) { const [s, strong] = score(p, qWords, nq, syn); if (s > 0) hits.push({ p, s, strong }); }
  // drop weak matches (a word only deep in some long text) when there are strong ones
  if (hits.some((h) => h.strong)) for (let i = hits.length - 1; i >= 0; i--) if (!hits[i].strong) hits.splice(i, 1);
  // one entry per destination and title
  const seen = new Set<string>();
  const uniq = hits.sort((a, b) => b.s - a.s).filter((h) => { const k = `${h.p.it.section}|${h.p.it.title}|${h.p.it.path}|${JSON.stringify(h.p.it.params ?? {})}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return SECTION_ORDER.map((section) => ({
    section,
    items: uniq.filter((h) => h.p.it.section === section).slice(0, per).map((h) => { const sn = snippet(h.p, qWords); return sn ? { ...h.p.it, sub: sn } : h.p.it; }),
  })).filter((g) => g.items.length);
}

/** Fixed entries kept for older callers: the GC and processing tools, cases and community. */
export const STATIC_ITEMS: SearchItem[] = [
  { id: 'vb', section: 'Tools', title: 'Visa Bulletin', sub: 'This month’s final action dates and dates for filing', path: '/tools/vb', keywords: ['gc', 'priority date'] },
  { id: 'pd', section: 'Tools', title: 'Priority date', sub: 'GC tracking: is your green card date current?', path: '/tools/pd', keywords: ['gc tracking', 'i-140', 'perm'] },
  { id: 'gcp', section: 'Tools', title: 'Green card planner', sub: 'GC steps from PERM and I-140 to I-485', path: '/tools/gcp', keywords: ['gc', 'i-485', 'perm', 'i-140'] },
  { id: 'proc', section: 'Tools', title: 'Processing times', sub: 'How long USCIS is taking, by form', path: '/tools/proc', keywords: ['i-129', 'i-485', 'i-765', 'i-131'] },
  { id: 'cases', section: 'Cases', title: 'All cases', sub: 'Receipts and USCIS case status', path: '/(tabs)/cases', keywords: ['receipt', 'case status'] },
  { id: 'forum', section: 'Community', title: 'Community', sub: 'Ask people on the same visa', path: '/(tabs)/forum', keywords: ['forum', 'questions'] },
  { id: 'settings', section: 'Settings', title: 'Settings', sub: 'Face ID, backups, colour, notifications', path: '/settings', keywords: ['backup', 'icloud', 'face id', 'notifications'] },
];

/** Shown when the field is empty. */
export const SUGGESTIONS = ['I-94', 'Extension', 'Visa Bulletin', 'Travel', 'Work permit', 'Backup'];

/** Recent searches: newest first, no repeats (case-insensitive), at most `max`. */
export function addRecent(list: string[], q: string, max = 8): string[] {
  const t = q.trim();
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => norm(x) !== norm(t))].slice(0, max);
}
