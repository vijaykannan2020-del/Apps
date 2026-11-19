// Community text checks: abuse / profanity words, spam and contact solicitation, links, and personal
// data people often paste by mistake (receipt numbers, A-numbers, SSNs, emails, phone numbers).
// Returns a short reason the app can show, or null when the text is fine.

// Kept short and unambiguous on purpose (word-boundary matches, after undoing common letter swaps).
const ABUSE = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dickhead', 'cunt', 'whore', 'slut',
  'retard', 'retarded', 'faggot', 'fag', 'nigger', 'nigga', 'chink', 'paki', 'spic', 'wetback', 'kike', 'tranny', 'raghead',
  'kill yourself', 'kys', 'go back to your country', 'i will kill', 'rape',
  'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'bhosdike', 'gaand', 'randi', 'harami',
];
const SPAM = [
  'whatsapp me', 'whatsapp at', 'telegram me', 'dm me', 'message me privately', 'call me at', 'contact me at', 'text me at',
  'guaranteed visa', 'guaranteed approval', '100% approval', 'buy h1b', 'h1b for sale', 'sell h1b', 'fake documents', 'fake paystubs',
  'crypto investment', 'work from home and earn', 'onlyfans',
];
const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't' };
const norm = (s) => String(s).toLowerCase().replace(/[01!34@5$7+]/g, (c) => LEET[c]).replace(/(?<=\w)[_.\-]+(?=\w)/g, '');
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
// Masked vowels count too: f*ck, sh*t.
const masked = (w) => esc(w).replace(/[aeiou]/g, (v) => `[${v}*]`);
const ABUSE_RE = new RegExp(`(?<![\\w*])(${ABUSE.map(masked).join('|')})(?![\\w*])`, 'i');
const SPAM_RE = new RegExp(`\\b(${SPAM.map(esc).join('|')})\\b`, 'i');
// Stretched words: "fuuuuck" → "fuck" (only for the longer words, so "ass"-like short words don't misfire).
const LONG = ABUSE.filter((w) => w.length >= 4 && !w.includes(' '));
const squash = (s) => s.replace(/(\w)\1+/g, '$1');
const LONG_RE = new RegExp(`\\b(${LONG.map((w) => esc(squash(w))).join('|')})\\b`, 'i');

const RECEIPT = /\b(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|TSC|NSC|VSC|CSC)\s?-?\d{10}\b/i;
const A_NUMBER = /\bA[\s#-]?0?\d{8,9}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+91[\s-]?\d{5}[\s-]?\d{5}\b/;
const PASSPORT_HINT = /\bpassport\s*(no\.?|number|#)\s*[:#]?\s*[A-Z]\d{7}\b/i;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(com|net|org|gov|io|in|co|us|info|biz|ly|me)\b(\/\S*)?/gi;

// All caps: most words of 5+ letters are capitals (short acronyms like USCIS, RFE, EAD are fine).
const shouting = (s) => { const w = s.match(/[A-Za-z]{5,}/g) || []; const caps = w.filter((x) => x === x.toUpperCase() && !/^(USCIS|STEM|VISA|ASAP)$/.test(x)); return caps.length >= 5 && caps.length > w.length * 0.7; };
export const countLinks = (s) => (String(s).match(LINK) || []).length;

/** First problem with the text, or null. kind: 'title' | 'body' | 'name'. */
export function checkText(s, { kind = 'body', maxLinks = 2 } = {}) {
  const raw = String(s || '');
  const n = norm(raw);
  if (ABUSE_RE.test(n) || LONG_RE.test(squash(n))) return 'Please keep it respectful — that wording isn’t allowed in Community.';
  if (kind === 'name') return null;
  if (SPAM_RE.test(n)) return 'Ads, paid services and “contact me privately” posts aren’t allowed. Keep help in the thread.';
  if (RECEIPT.test(raw)) return 'Remove your receipt number — it’s personal. Say the form and service center instead (for example I-129 at EAC).';
  if (SSN.test(raw) || A_NUMBER.test(raw) || PASSPORT_HINT.test(raw)) return 'Remove personal numbers (A-number, SSN or passport number) before posting.';
  if (EMAIL.test(raw) || PHONE.test(raw)) return 'Remove emails and phone numbers — keep contact details private.';
  const links = countLinks(raw);
  if (kind === 'title' && links) return 'Links aren’t allowed in titles.';
  if (links > maxLinks) return `At most ${maxLinks} links per post.`;
  if (/(.)\1{14,}/.test(raw) || shouting(raw)) return 'Please write normally (no long repeats or all caps).';
  return null;
}
