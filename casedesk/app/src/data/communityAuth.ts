// Sign in for Community. Apple: expo-apple-authentication (new native module in the v2.4 TestFlight
// build). On an older installed build the require fails and the sheet says to update from TestFlight.
// No name or email is requested — the server gives each person a made-up display name.
// Google: only when app.json has extra.googleIosClientId (see GOOGLE.md); uses expo-auth-session.
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { randomBytes } from '../core/backup';
import { native } from '../native/safe';
import { signInWith, updateMe } from './communityApi';

export const appleModule = (): any => { try { return require('expo-apple-authentication'); } catch { return undefined; } };

export type AppleSupport = 'ok' | 'update' | 'unsupported';
/** 'update' = this installed build predates Sign in with Apple (needs the TestFlight update). */
export async function appleSupport(): Promise<AppleSupport> {
  if (Platform.OS !== 'ios') return 'unsupported';
  const A = appleModule();
  if (!A?.signInAsync) return 'update';
  // On an older installed build the JS package is bundled but its native part is missing: say 'update', not 'unsupported'.
  if ((globalThis as any).expo) { try { const { requireOptionalNativeModule } = require('expo-modules-core'); if (typeof requireOptionalNativeModule === 'function' && !requireOptionalNativeModule('ExpoAppleAuthentication')) return 'update'; } catch {} }
  try { return (await A.isAvailableAsync()) ? 'ok' : 'unsupported'; } catch { return 'update'; }
}

export const makeNonce = () => {
  const raw = bytesToHex(randomBytes(16));
  return { raw, hashed: bytesToHex(sha256(utf8ToBytes(raw))) };
};

/** Returns false when the person cancelled. Throws with a readable message otherwise. */
export async function signInWithApple(): Promise<boolean> {
  const A = appleModule();
  if (!A?.signInAsync) throw new Error('Update the app from TestFlight to join the community.');
  const n = makeNonce();
  let cred: any;
  try {
    cred = await A.signInAsync({ requestedScopes: [], nonce: n.hashed });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return false;
    throw new Error('Sign in with Apple didn’t finish. Try again.');
  }
  if (!cred?.identityToken) throw new Error('Sign in with Apple didn’t return a token. Try again.');
  await signInWith('apple', { identityToken: cred.identityToken, nonce: n.raw, authorizationCode: cred.authorizationCode ?? undefined });
  return true;
}

// ---------- Google (off until configured) ----------
export function googleConfig(): { iosClientId: string; webClientId?: string } | null {
  try {
    const extra = require('expo-constants').default?.expoConfig?.extra ?? {};
    return extra.googleIosClientId ? { iosClientId: String(extra.googleIosClientId), webClientId: extra.googleWebClientId ? String(extra.googleWebClientId) : undefined } : null;
  } catch { return null; }
}
export const googleModule = (): any => { try { return require('expo-auth-session/providers/google'); } catch { return undefined; } };
export async function finishGoogle(idToken: string) { await signInWith('google', { idToken }); }

// ---------- push for "someone answered" ----------
/** Asks iOS for permission (once), then registers this phone's Expo push token with the account. */
export async function enableAnswerPush(ask: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = native.notifications();
  if (!N?.getExpoPushTokenAsync) return false;
  try {
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && ask) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return false;
    let projectId: string | undefined;
    try { projectId = require('expo-constants').default?.expoConfig?.extra?.eas?.projectId; } catch {}
    const t = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!t?.data) return false;
    await updateMe({ pushToken: t.data });
    return true;
  } catch { return false; }
}
export async function disableAnswerPush() { try { await updateMe({ pushToken: null }); } catch {} }
