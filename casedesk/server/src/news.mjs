// Official-source news feed: Federal Register API (USCIS, DHS, DOL-ETA) + optional RSS feeds.
// Each item becomes a short "executive" card: a 1–2 sentence summary and 3–5 short points (what
// changes, who is affected, key dates). If ANTHROPIC_API_KEY is set, Claude writes them; otherwise
// they are built from the official abstract and the Federal Register dates (briefFromAbstract).
import fs from 'node:fs';
import path from 'node:path';
import { notifyNews } from './push.mjs';

const DATA = path.resolve('data');
const SUMMARY_FILE = path.join(DATA, 'summaries.json');
const AGENCIES = (process.env.FR_AGENCIES || 'u-s-citizenship-and-immigration-services,employment-and-training-administration,homeland-security-department').split(',');
const KEEP_DAYS = 120;

const TAGS = [
  ['H-1B', /h-1b|specialty occupation|cap[- ]subject|labor condition application/i],
  ['L-1', /\bl-1|intracompany/i],
  ['TN', /\btn\b|usmca|nafta professional/i],
  ['STEM OPT', /stem opt|stem optional practical/i],
  ['OPT', /optional practical training|\bopt\b|f-1 student/i],
  ['H-4', /h-4/i],
  ['L-2', /l-2/i],
  ['I-9', /form i-9|employment eligibility verification|e-verify|employment authorization document|automatic extension/i],
  ['Fees', /\bfee/i],
  ['Wages', /prevailing wage|wage level|oews|wage protections/i],
  ['Green card', /adjustment of status|i-485|i-140|perm|labor certification|immigrant (worker|visa)|visa bulletin/i],
  ['Citizenship', /naturaliz|n-400|civics/i],
];

let summaries = {};
try { summaries = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')); } catch {}
const saveSummaries = () => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summaries)); };

let state = { items: [], at: 0 };

const tagsFor = (text) => TAGS.filter(([, re]) => re.test(text)).map(([t]) => t);
const agencyLabel = (names) => (names.some((n) => /citizenship/i.test(n)) ? 'USCIS' : names.some((n) => /labor|employment and training/i.test(n)) ? 'DOL' : 'DHS');
const trim = (s = '', n = 220) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s);

async function fromFederalRegister() {
  const qs = new URLSearchParams({ per_page: '60', order: 'newest' });
  AGENCIES.forEach((a) => qs.append('conditions[agencies][]', a));
  for (const f of ['title', 'abstract', 'publication_date', 'html_url', 'document_number', 'type', 'agencies', 'effective_on', 'comments_close_on']) qs.append('fields[]', f);
  const r = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${qs}`);
  if (!r.ok) throw new Error(`Federal Register ${r.status}`);
  const j = await r.json();
  return (j.results || []).map((d) => {
    const text = `${d.title} ${d.abstract || ''}`;
    return {
      id: `fr-${d.document_number}`,
      date: d.publication_date,
      agency: agencyLabel((d.agencies || []).map((a) => a.name || a.raw_name || '')),
      title: d.title,
      abstract: d.abstract || '',
      docType: d.type,
      effective: d.effective_on,
      commentsClose: d.comments_close_on,
      tags: tagsFor(text),
      url: d.html_url,
    };
  });
}

async function fromRss(url) {
  const r = await fetch(url);
  if (!r.ok) return [];
  const xml = await r.text();
  const pick = (block, tag) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 30).map((m, i) => {
    const b = m[0];
    const title = pick(b, 'title');
    const desc = pick(b, 'description');
    const date = new Date(pick(b, 'pubDate') || Date.now()).toISOString().slice(0, 10);
    const link = pick(b, 'link');
    return { id: `rss-${Buffer.from(link || title).toString('base64url').slice(0, 24)}-${i}`, date, agency: /dol\.gov/.test(url) ? 'DOL' : 'USCIS', title, abstract: desc, tags: tagsFor(`${title} ${desc}`), url: link };
  });
}

// Unofficial news from the web (Google News RSS search) — labelled "News & analysis" in the app.
const WEB_QUERIES = (process.env.NEWS_QUERIES || 'H-1B visa,L-1 visa,STEM OPT,H-4 EAD,green card visa bulletin,USCIS,prevailing wage H-1B').split(',').map((s) => s.trim()).filter(Boolean);
async function fromWebNews(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const xml = await r.text();
  const pick = (b, tag) => (b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  return [...xml.matchAll(/<item>[\s\S]*?<\/item>/gi)].slice(0, 12).map((m) => {
    const b = m[0];
    const source = pick(b, 'source') || 'News';
    const title = pick(b, 'title').replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
    const link = pick(b, 'link');
    return { id: `web-${Buffer.from(link).toString('base64url').slice(-20)}`, kind: 'news', date: new Date(pick(b, 'pubDate') || Date.now()).toISOString().slice(0, 10), agency: source, title, abstract: '', tags: tagsFor(title), url: link };
  });
}

// ---- Same story from several outlets → one card ----
const STOP = new Set('a an the of to in on for and or with by at from as is are be its it this that after over new says say said will may can us u.s. amid how what why who more than into about'.split(' '));
const words = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9$ -]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const similar = (a, b) => {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
};
const daysApart = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
// Groups items about the same event (similar headline, within 3 days). Keeps the newest as the card.
export function clusterStories(list, threshold = 0.6) {
  const groups = [];
  for (const it of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
    const g = groups.find((x) => daysApart(x.lead.date, it.date) <= 3 && similar(x.lead.title, it.title) >= threshold);
    if (g) { if (!g.sources.some((s) => s.name === it.agency)) g.sources.push({ name: it.agency, url: it.url }); g.tags = [...new Set([...g.tags, ...it.tags])]; }
    else groups.push({ lead: it, sources: [{ name: it.agency, url: it.url }], tags: it.tags });
  }
  return groups;
}

// ---- Summary + points from the official text (no AI needed) ----
const ABBR = /\b(U\.S|e\.g|i\.e|Sec|No|Nos|Inc|Dept|Mr|Ms|Dr|St|Jan|Feb|Mar|Apr|Aug|Sept?|Oct|Nov|Dec|C\.F\.R|Fed|Reg|al|approx|vs)\.$/i;
export function sentences(text = '') {
  const parts = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9("“])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else if (p) out.push(p);
  }
  return out;
}
const longDate = (d) => { const t = new Date(`${d}T12:00:00Z`); return isNaN(+t) ? d : t.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
/** A 1–2 sentence summary and up to 5 short points: the rest of the abstract, then what kind of
 *  document it is and its dates (effective date, comment deadline). */
export function briefFromAbstract(item) {
  const s = sentences(item.abstract || '');
  let summary = s.shift() || item.title || '';
  if (summary.length < 90 && s.length) summary += ` ${s.shift()}`;
  const points = s.slice(0, 3).map((x) => trim(x, 200));
  const type = String(item.docType || '');
  if (/proposed/i.test(type)) points.push('Proposed rule: nothing changes yet. It can still change before a final rule.');
  if (item.commentsClose) points.push(`Public comments are open until ${longDate(item.commentsClose)}.`);
  if (item.effective) points.push(`${/proposed/i.test(type) ? 'Planned start' : 'Takes effect'}: ${longDate(item.effective)}.`);
  else if (/^rule$/i.test(type)) points.push('Final rule. Check the source for the date it takes effect.');
  return { summary: trim(summary, 320), points: points.slice(0, 5) };
}

const SUMMARY_V = 2; // bump to rebuild cached summaries (v2: longer summary, 3–5 points)
async function summarize(item) {
  if (summaries[item.id]?.v === SUMMARY_V) return summaries[item.id];
  const brief = briefFromAbstract(item);
  const fallback = { v: SUMMARY_V, summary: brief.summary || trim(item.title, 320), points: brief.points, impact: /final rule|interim final|fee/i.test(`${item.docType} ${item.title}`) ? 'high' : 'info' };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !item.abstract) return (summaries[item.id] = fallback);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You write plain-English executive summaries of official US immigration notices for employees and HR teams. Use only facts in the notice. Reply with JSON only: {"summary": 1-2 sentences, under 45 words, saying what changes, "points": 3-5 short bullets (each under 25 words): what changes, who is affected, key dates, and what people may need to do, "impact": "high"|"medium"|"info"}.\n\nTitle: ${item.title}\nType: ${item.docType || 'notice'}\nEffective: ${item.effective || 'n/a'}\nComments close: ${item.commentsClose || 'n/a'}\nAbstract: ${item.abstract}`,
        }],
      }),
    });
    const j = await r.json();
    const text = j.content?.[0]?.text || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const pts = (Array.isArray(parsed.points) ? parsed.points : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 5);
    summaries[item.id] = { v: SUMMARY_V, summary: parsed.summary || fallback.summary, points: pts.length >= 2 ? pts : fallback.points, impact: ['high', 'medium', 'info'].includes(parsed.impact) ? parsed.impact : 'info' };
  } catch {
    summaries[item.id] = fallback;
  }
  return summaries[item.id];
}

export async function refreshNews() {
  const feeds = (process.env.EXTRA_FEEDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const batches = await Promise.allSettled([fromFederalRegister(), ...feeds.map(fromRss)]);
  const webBatches = await Promise.allSettled(WEB_QUERIES.map(fromWebNews));
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const raw = batches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []))
    .filter((i) => i.date >= cutoff)
    .filter((i) => i.agency === 'USCIS' || i.tags.length) // DHS/DOL items only if they touch our visa topics
    .filter((i) => !/^(agency information collection|privacy act of 1974)/i.test(i.title)); // drop paperwork notices
  const items = [];
  for (const { lead: i, sources } of clusterStories(raw, 0.85)) {
    i.sources = sources;
    const s = await summarize(i);
    items.push({ id: i.id, date: i.date, agency: i.agency, title: i.title, summary: s.summary, points: s.points, impact: s.impact, tags: i.tags, url: i.url, sources: i.sources.length > 1 ? i.sources : undefined });
    if (items.length >= 40) break;
  }
  // Web news: the same story from several outlets becomes ONE card listing every source
  const web = clusterStories(webBatches.flatMap((b) => (b.status === 'fulfilled' ? b.value : [])).filter((i) => i.tags.length))
    .slice(0, 30)
    .map(({ lead: i, sources, tags }) => ({
      id: i.id, kind: 'news', date: i.date, agency: i.agency, title: i.title,
      summary: sources.length > 1 ? `Reported by ${sources.length} outlets: ${sources.slice(0, 3).map((x) => x.name).join(', ')}${sources.length > 3 ? '…' : ''}.` : `Reported by ${i.agency}. Open the article for details.`,
      points: [], impact: sources.length >= 3 ? 'medium' : 'info', tags, url: i.url, sources,
    }));
  saveSummaries();
  if (items.length || web.length) {
    state = { items: [...items.map((i) => ({ ...i, kind: 'official' })), ...web], at: Date.now() };
    notifyNews(state.items).catch((e) => console.error('notify news', e.message));
  }
  return state;
}

export async function getNews() {
  const ttl = (Number(process.env.NEWS_REFRESH_MINUTES) || 60) * 60_000;
  if (!state.items.length || Date.now() - state.at > ttl) {
    try { await refreshNews(); } catch (e) { console.error('news refresh failed', e.message); }
  }
  return { items: state.items, updated: new Date(state.at || Date.now()).toISOString() };
}
