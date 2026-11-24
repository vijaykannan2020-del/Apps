// Posters and IDs from TMDB (your own key, saved only on this phone), cached so each title is looked up once.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sideline-tv.tmdb.key';
const CACHE = 'sideline-tv.tmdb.cache.v1';
let key: string | null = null;
let cache: Record<string, Hit | null> | null = null;
const inflight = new Map<string, Promise<Hit | null>>();
let saveTimer: any = null;

export type Hit = { id: number; type: 'movie' | 'tv'; poster: string; year: string; title: string };

export async function getTmdbKey(): Promise<string> {
  if (key === null) key = (await AsyncStorage.getItem(KEY).catch(() => null)) || '';
  return key;
}
export async function setTmdbKey(v: string) { key = v.trim(); await AsyncStorage.setItem(KEY, key); cache = {}; await AsyncStorage.removeItem(CACHE).catch(() => {}); }

// "Aquaman And The Lost Kingdom 4K (2023) [Tamil]" -> { q: "Aquaman And The Lost Kingdom", year: "2023" }
export function cleanTitle(raw: string): { q: string; year: string } {
  let t = String(raw || '');
  const y = t.match(/\b(19|20)\d{2}\b/);
  t = t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(4k|uhd|fhd|hd|sd|hdr|1080p|720p|480p|hevc|x26[45]|web-?dl|webrip|bluray|dual audio|multi audio|tamil|telugu|hindi|malayalam|kannada|english|dubbed|org|season\s*\d+|s\d{1,2}(e\d{1,3})?)\b/gi, ' ')
    .replace(/[|_:.\-]+/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { q: t, year: y ? y[0] : '' };
}

async function api(path: string, params: Record<string, string>) {
  const k = await getTmdbKey();
  if (!k) return null;
  const u = new URL('https://api.themoviedb.org/3' + path);
  for (const [a, b] of Object.entries(params)) if (b) u.searchParams.set(a, b);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (/^[a-f0-9]{32}$/i.test(k)) u.searchParams.set('api_key', k); else headers.Authorization = 'Bearer ' + k;
  const r = await fetch(u.toString(), { headers });
  if (!r.ok) return null;
  return r.json();
}

export async function lookup(rawTitle: string, kind: 'movie' | 'tv'): Promise<Hit | null> {
  if (!(await getTmdbKey())) return null;
  if (cache === null) { try { cache = JSON.parse((await AsyncStorage.getItem(CACHE)) || '{}'); } catch { cache = {}; } }
  const { q, year } = cleanTitle(rawTitle);
  if (!q) return null;
  const ck = kind + '|' + q.toLowerCase() + '|' + year;
  if (ck in cache!) return cache![ck];
  if (inflight.has(ck)) return inflight.get(ck)!;
  const p = (async () => {
    try {
      let j = await api('/search/' + kind, { query: q, [kind === 'movie' ? 'year' : 'first_air_date_year']: year });
      if (!j?.results?.length && year) j = await api('/search/' + kind, { query: q });
      if (!j?.results?.length) j = await api('/search/' + (kind === 'movie' ? 'tv' : 'movie'), { query: q });
      const x = j?.results?.[0];
      const hit: Hit | null = x ? {
        id: x.id, type: x.title ? 'movie' : 'tv',
        poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '',
        year: String(x.release_date || x.first_air_date || '').slice(0, 4), title: x.title || x.name || q,
      } : null;
      cache![ck] = hit;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => AsyncStorage.setItem(CACHE, JSON.stringify(cache)).catch(() => {}), 1500);
      return hit;
    } catch { return null; } finally { inflight.delete(ck); }
  })();
  inflight.set(ck, p);
  return p;
}
