// GitHub job (casedesk-bulletin.yml): read the Visa Bulletin from travel.state.gov and save it to
// casedesk/site/visa-bulletin.json, the backup copy the server uses when its own fetch is blocked.
// travel.state.gov refuses plain HTTP clients, so pages are opened in a real Chrome (Playwright) when a
// plain request is refused. Keeps the previous file's history and fills the last 24 months.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.BULLETIN_FILE ||= path.resolve(here, '../../site/visa-bulletin.json');
process.env.BULLETIN_SEED ||= '/nonexistent';
const b = await import('../src/bulletin.mjs');

let browser = null;
async function chromeFetch(url) {
  if (!browser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  }
  const ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = res?.status() ?? 0;
    const html = await page.content();
    return { ok: status >= 200 && status < 300, status, text: async () => html };
  } finally { await ctx.close(); }
}

let s;
try { s = await b.refreshBulletin(); }
catch (e) {
  console.log(`Plain request refused (${e.message}); using Chrome`);
  b.setPageFetcher(chromeFetch);
  try { s = await b.refreshBulletin(); } catch (e2) { console.error(`Could not read the Visa Bulletin: ${e2.message}`); await browser?.close(); process.exit(1); }
}
console.log(`Visa Bulletin: ${s.month}`);
const added = await b.backfillHistory({ months: 24, delayMs: 2500 });
console.log(`History: +${added} months, ${b.bulletinStatus().historyMonths} kept`);
await browser?.close();
