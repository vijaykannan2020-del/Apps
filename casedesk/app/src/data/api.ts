// The CaseDesk server (news, Visa Bulletin, processing times, wages, employer data). Optional:
// every screen has a built-in copy and says which one it shows. No personal data is ever sent.
import { native } from '../native/safe';

let base: string | undefined;
export function apiBase(): string {
  if (base !== undefined) return base;
  try { const C = require('expo-constants').default; base = (C?.expoConfig?.extra as any)?.apiBase || ''; } catch { base = ''; }
  return base!;
}
void native;

export async function getJSON<T>(path: string, timeoutMs = 8000): Promise<T> {
  const b = apiBase();
  if (!b) throw new Error('offline');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const r = await fetch(b + path, { headers: { Accept: 'application/json' }, signal: ctl?.signal });
    if (!r.ok) throw new Error(`Server error ${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(timer); }
}
/** Live copy from the server, or the built-in one. `fetchedAt` = when the live copy arrived. */
export async function fetchOr<T>(path: string, fallback: T): Promise<{ data: T; live: boolean; fetchedAt?: string }> {
  try { return { data: await getJSON<T>(path), live: true, fetchedAt: new Date().toISOString() }; } catch { return { data: fallback, live: false }; }
}
