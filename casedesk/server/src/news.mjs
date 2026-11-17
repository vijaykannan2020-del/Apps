// Official-source news feed: Federal Register API (USCIS, DHS, DOL-ETA) + optional RSS feeds.
// Each item becomes a short "executive" card. If ANTHROPIC_API_KEY is set, Claude writes the
// one-line summary and 2–3 "what it means" points; otherwise the official abstract is trimmed.
import fs from 'node:fs';
import path from 'node:path';

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
  for (const f of ['title', 'abstract', 'publication_date', 'html_url', 'document_number', 'type', 'agencies', 'effective_on']) qs.append('fields[]', f);
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

async function summarize(item) {
  if (summaries[item.id]) return summaries[item.id];
  const fallback = { summary: trim(item.abstract || item.title, 180), points: [], impact: /final rule|interim final|fee/i.test(`${item.docType} ${item.title}`) ? 'high' : 'info' };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !item.abstract) return (summaries[item.id] = fallback);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You write plain-English executive summaries of official US immigration notices for employees and HR teams. Use only facts in the notice. Reply with JSON only: {"summary": one sentence under 25 words, "points": 2-3 short bullets on who is affected and when, "impact": "high"|"medium"|"info"}.\n\nTitle: ${item.title}\nType: ${item.docType || 'notice'}\nEffective: ${item.effective || 'n/a'}\nAbstract: ${item.abstract}`,
        }],
      }),
    });
    const j = await r.json();
    const text = j.content?.[0]?.text || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    summaries[item.id] = { summary: parsed.summary || fallback.summary, points: (parsed.points || []).slice(0, 3), impact: ['high', 'medium', 'info'].includes(parsed.impact) ? parsed.impact : 'info' };
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
  const seen = new Set();
  const items = [];
  for (const i of raw.sort((a, b) => b.date.localeCompare(a.date))) {
    if (seen.has(i.title)) continue;
    seen.add(i.title);
    const s = await summarize(i);
    items.push({ id: i.id, date: i.date, agency: i.agency, title: i.title, summary: s.summary, points: s.points, impact: s.impact, tags: i.tags.length ? i.tags : ['Fees'].filter(() => /fee/i.test(i.title)), url: i.url });
    if (items.length >= 40) break;
  }
  // Web news: keep the newest 30, de-duplicated, with the headline as the summary
  const webSeen = new Set();
  const web = webBatches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []))
    .filter((i) => i.tags.length && !webSeen.has(i.title) && webSeen.add(i.title))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
    .map((i) => ({ id: i.id, kind: 'news', date: i.date, agency: i.agency, title: i.title, summary: `Reported by ${i.agency}. Open the article for details.`, points: [], impact: 'info', tags: i.tags, url: i.url }));
  saveSummaries();
  if (items.length || web.length) state = { items: [...items.map((i) => ({ ...i, kind: 'official' })), ...web], at: Date.now() };
  return state;
}

export async function getNews() {
  const ttl = (Number(process.env.NEWS_REFRESH_MINUTES) || 60) * 60_000;
  if (!state.items.length || Date.now() - state.at > ttl) {
    try { await refreshNews(); } catch (e) { console.error('news refresh failed', e.message); }
  }
  return { items: state.items, updated: new Date(state.at || Date.now()).toISOString() };
}
