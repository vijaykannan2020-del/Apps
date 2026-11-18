// On-phone diagnostics: a short log of app starts, saves and errors kept in cd2.diag (last 150 lines),
// shown in Profile → Help → Diagnostics so the owner can send it. No document contents are logged.
import { Platform } from 'react-native';
import { native } from './safe';

const KEY = 'cd2.diag';
const MAX = 150;
let lines: string[] = [];
let loaded = false;
let AS: any;
function kv(): any {
  if (AS !== undefined) return AS;
  try { const m = require('@react-native-async-storage/async-storage'); AS = m?.default ?? m; if (!AS?.getItem) AS = null; } catch { AS = null; }
  return AS;
}
export const storageOk = () => !!kv();
let saving: Promise<void> = Promise.resolve();
function flush(): Promise<void> {
  const s = kv(); if (!s) return Promise.resolve();
  saving = saving.then(() => s.setItem(KEY, JSON.stringify(lines.slice(-MAX)))).catch(() => {});
  return saving;
}
const ts = () => { const d = new Date(); return `${d.toISOString().slice(5, 10)} ${d.toTimeString().slice(0, 8)}`; };
export function diag(msg: string): Promise<void> {
  lines.push(`${ts()} ${msg}`.slice(0, 600));
  if (lines.length > MAX * 2) lines = lines.slice(-MAX);
  return loaded ? flush() : Promise.resolve();
}
export async function diagLines(): Promise<string[]> { await saving; return lines.slice(-MAX); }
export async function clearDiag() { lines = []; await flush(); }

/** Call once at start: loads the old log, records the launch and installs the crash handlers. */
export async function startDiag() {
  const s = kv();
  try { const raw = s ? await s.getItem(KEY) : null; const old = raw ? JSON.parse(raw) : []; lines = [...(Array.isArray(old) ? old : []), ...lines]; } catch {}
  loaded = true;
  let up = '';
  try {
    const U = native.updates();
    if (U) up = ` update=${String(U.updateId ?? 'embedded').slice(0, 8)} embedded=${!!U.isEmbeddedLaunch} emergency=${!!U.isEmergencyLaunch} channel=${U.channel ?? '?'} runtime=${U.runtimeVersion ?? '?'}`;
  } catch {}
  await diag(`START v2 ${Platform.OS} ${String(Platform.Version)} storage=${s ? 'phone' : 'MEMORY (not saved!)'}${up}`);
  try {
    const EU = (globalThis as any).ErrorUtils;
    if (EU?.getGlobalHandler && !(globalThis as any).__cdDiag) {
      (globalThis as any).__cdDiag = true;
      const prev = EU.getGlobalHandler();
      EU.setGlobalHandler((e: any, fatal?: boolean) => {
        const m = `${fatal ? 'FATAL' : 'ERROR'} ${e?.name ?? ''}: ${e?.message ?? e} @ ${String(e?.stack ?? '').split('\n').slice(0, 4).join(' | ')}`;
        let called = false; const go = () => { if (!called) { called = true; prev?.(e, fatal); } };
        diag(m).finally(go); setTimeout(go, 700);
      });
    }
  } catch {}
  try {
    const t: any = (globalThis as any).HermesInternal;
    t?.enablePromiseRejectionTracker?.({ allRejections: true, onUnhandled: (_id: number, e: any) => { diag(`UNHANDLED ${e?.message ?? e} @ ${String(e?.stack ?? '').split('\n').slice(0, 3).join(' | ')}`); } });
  } catch {}
}
