// Recent Home searches: kept only on this phone (cd2.* key, so Delete all data clears them;
// not part of backups or shared packages). Never sent anywhere.
import { asyncKV } from '../native/asyncKV';
import { addRecent } from '../core/search';

const KEY = 'cd2.search.recent';
const kv = asyncKV();
export async function loadRecent(): Promise<string[]> {
  try { const raw = await kv.getItem(KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch { return []; }
}
export async function rememberSearch(list: string[], q: string): Promise<string[]> {
  const next = addRecent(list, q);
  try { await kv.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
export async function clearRecent(): Promise<void> { try { await kv.removeItem(KEY); } catch {} }
