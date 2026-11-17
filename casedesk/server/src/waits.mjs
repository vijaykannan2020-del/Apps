// US visa appointment wait times from the State Department's Global Visa Wait Times page.
// Refreshed every 12 hours; if travel.state.gov can't be reached the app shows its built-in snapshot.
const URL = 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/global-visa-wait-times.html';
const UA = 'CaseDesk/1.0 (immigration info app; +https://casedeskapp.duckdns.org)';
let state = null;
let lastTry = 0;
let lastError = null;

const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const key = (h) => /petition/i.test(h) ? 'petition' : /\(F,? ?M,? ?J\)|student/i.test(h) ? 'student' : /crew|transit/i.test(h) ? 'crew' : /average/i.test(h) ? 'visitorAvg' : /B1\/?B2/i.test(h) ? 'visitor' : null;

export function parseWaits(html) {
  const updated = html.match(/Last updated:?\s*([0-9]{1,2}-[A-Z]{3}-[0-9]{4})/i)?.[1] || null;
  let cols = null;
  const posts = [];
  for (const r of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]));
    if (!cells.length) continue;
    if (/city\s*\/\s*post/i.test(cells[0])) { cols = cells.map(key); continue; }
    if (!cols || cells.length < 3 || !cells[0]) continue;
    const row = { post: cells[0] };
    cells.slice(1).forEach((v, i) => { const k = cols[i + 1]; if (k) row[k] = v; });
    posts.push(row);
  }
  return posts.length ? { updated, source: URL, posts } : null;
}

export async function getWaits() {
  if ((!state || Date.now() - lastTry > 12 * 3600e3) && Date.now() - lastTry > 10 * 60e3) {
    lastTry = Date.now();
    try {
      const r = await fetch(URL, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = parseWaits(await r.text());
      if (!parsed) throw new Error('No wait-time rows found');
      state = { ...parsed, fetched: new Date().toISOString() };
      lastError = null;
    } catch (e) { lastError = e.message; console.error('waits:', e.message); }
  }
  if (!state) throw Object.assign(new Error('Wait times not available right now'), { status: 503 });
  return state;
}
export const waitsStatus = () => ({ loaded: !!state, posts: state?.posts.length || 0, updated: state?.updated || null, error: lastError });
