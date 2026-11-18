// Is this phone on Wi-Fi? (expo-network, guarded). undefined = unknown → iOS's own iCloud setting
// "Use Cellular Data" decides when the file uploads.
import { native } from './safe';
export async function onWifi(): Promise<boolean | undefined> {
  const N = native.network();
  try { const s = await N?.getNetworkStateAsync?.(); if (!s) return undefined; return s.type === (N.NetworkStateType?.WIFI ?? 'WIFI') || s.type === (N.NetworkStateType?.ETHERNET ?? 'ETHERNET'); } catch { return undefined; }
}
