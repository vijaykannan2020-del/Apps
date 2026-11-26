// GitHub job (casedesk-bulletin.yml): read the Visa Bulletin from travel.state.gov on GitHub's network and
// save it to casedesk/site/visa-bulletin.json, the backup copy the server uses when its own fetch is blocked.
// Keeps the previous file's history and fills the last 24 months. Exits 1 if nothing could be read.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.BULLETIN_FILE ||= path.resolve(here, '../../site/visa-bulletin.json');
process.env.BULLETIN_SEED ||= '/nonexistent';
const b = await import('../src/bulletin.mjs');
try {
  const s = await b.refreshBulletin();
  console.log(`Visa Bulletin: ${s.month}`);
} catch (e) { console.error(`Could not read the Visa Bulletin: ${e.message}`); process.exit(1); }
const added = await b.backfillHistory({ months: 24 });
console.log(`History: +${added} months, ${b.bulletinStatus().historyMonths} kept`);
