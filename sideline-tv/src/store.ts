// Your portal details live only on this phone (never in the code or on a server).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { Settings } from './portal';

const KEY = 'sideline-tv.settings.v1';
export const EMPTY: Settings = { portal: '', mac: '', model: 'MAG254', serial: '', deviceId: '' };

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  try { cache = { ...EMPTY, ...JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') }; }
  catch { cache = { ...EMPTY }; }
  return cache!;
}

export async function saveSettings(s: Settings) {
  cache = s;
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach(l => l(s));
}

export function useSettings(): Settings | null {
  const [s, set] = useState<Settings | null>(cache);
  useEffect(() => {
    let alive = true;
    loadSettings().then(v => alive && set(v));
    listeners.add(set);
    return () => { alive = false; listeners.delete(set); };
  }, []);
  return s;
}

export const isReady = (s: Settings | null) => !!(s && s.portal.trim() && s.mac.replace(/[^0-9a-f]/gi, '').length === 12);

// Saved lists (channel list, movie categories, login address) so the app opens instantly next time.
export async function getCache<T>(name: string, key: string): Promise<{ at: number; data: T } | null> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem('sideline-tv.cache.' + name)) || 'null');
    return v && v.key === key ? { at: v.at, data: v.data } : null;
  } catch { return null; }
}
export async function setCache(name: string, key: string, data: unknown) {
  try { await AsyncStorage.setItem('sideline-tv.cache.' + name, JSON.stringify({ key, at: Date.now(), data })); } catch {}
}
