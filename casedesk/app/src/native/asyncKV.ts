// AsyncStorage behind the KV interface. Required lazily inside try/catch: if the native module is
// missing (web preview, an older build) the app falls back to memory instead of crashing.
import type { KV } from '../data/kv';
import { memoryKV } from '../data/kv';

export function asyncKV(): KV {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    const AS = mod?.default ?? mod;
    if (!AS?.getItem) throw new Error('AsyncStorage unavailable');
    return {
      getItem: (k) => AS.getItem(k),
      setItem: (k, v) => AS.setItem(k, v),
      removeItem: (k) => AS.removeItem(k),
      getAllKeys: () => AS.getAllKeys(),
    };
  } catch {
    return memoryKV();
  }
}
