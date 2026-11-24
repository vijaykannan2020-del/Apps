// Subtitles from the web for a movie or episode (found by its TMDB id), via Wyzie Subs.
// Needs a free key from sub.wyzie.io (saved only on this phone).
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'sideline-tv.subs.key';
export async function getSubsKey() { return (await AsyncStorage.getItem(KEY).catch(() => null)) || ''; }
export async function setSubsKey(v: string) { await AsyncStorage.setItem(KEY, v.trim()); }
export type WebSub = { name: string; url: string; lang: string };

export async function findSubtitles(tmdbId: number, langs: string[], season?: number, episode?: number): Promise<WebSub[]> {
  const out: WebSub[] = [];
  const key = await getSubsKey();
  if (!key) throw new Error('Add a free subtitles key in Settings (from sub.wyzie.io) to search subtitles online.');
  for (const lang of langs) {
    const u = new URL('https://sub.wyzie.io/search');
    u.searchParams.set('id', String(tmdbId));
    u.searchParams.set('key', key);
    u.searchParams.set('language', lang);
    u.searchParams.set('format', 'srt');
    if (season && episode) { u.searchParams.set('season', String(season)); u.searchParams.set('episode', String(episode)); }
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
      const r = await fetch(u.toString(), { signal: c.signal }).finally(() => clearTimeout(t));
      if (!r.ok) continue;
      const j = await r.json();
      for (const x of (Array.isArray(j) ? j : []).slice(0, 6)) {
        if (x?.url) out.push({ url: String(x.url), lang, name: (x.display || x.language || lang) + (x.media ? ' · ' + String(x.media).slice(0, 40) : '') });
      }
    } catch {}
  }
  return out;
}
