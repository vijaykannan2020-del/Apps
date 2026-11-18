// Key-value storage interface. The app uses AsyncStorage (src/native/asyncKV.ts); tests use memoryKV.
export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export function memoryKV(init: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(init));
  return {
    async getItem(k) { return m.has(k) ? m.get(k)! : null; },
    async setItem(k, v) { m.set(k, v); },
    async removeItem(k) { m.delete(k); },
    async getAllKeys() { return [...m.keys()]; },
  };
}
