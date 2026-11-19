// Version / build / OTA update id for Settings → About. Every module is optional (guarded).
import type { AppInfo } from '../core/appinfo';
import { native } from './safe';

export function appInfo(): AppInfo {
  const out: AppInfo = {};
  try { const C = require('expo-constants').default; out.version = C?.expoConfig?.version; out.build = C?.expoConfig?.ios?.buildNumber ?? undefined; } catch {}
  try { const A = require('expo-application'); out.version = A?.nativeApplicationVersion ?? out.version; out.build = A?.nativeBuildVersion ?? out.build; } catch {}
  try {
    const U = native.updates();
    if (U) {
      out.updateId = U.updateId ?? null;
      out.channel = U.channel ?? null;
      out.updateAt = U.createdAt ? new Date(U.createdAt).toISOString() : null;
      out.embedded = !!U.isEmbeddedLaunch;
      out.runtime = U.runtimeVersion ?? null;
    }
  } catch {}
  return out;
}
