// Sign in for Community. Apple: expo-apple-authentication (new native module in the v2.4 TestFlight
// build). On an older installed build the require fails and the sheet says to update from TestFlight.
// No name or email is requested — the server gives each person a made-up display name.
// Google: only when app.json has extra.googleIosClientId (see GOOGLE.md); uses expo-auth-session.
import { Linking, Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { randomBytes } from '../core/backup';
import { native } from '../native/safe';
import { googleRedirect, reversedClientId } from '../core/community';
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
  if (!A?.signInAsync) throw new Error(Platform.OS === 'android' ? 'Update the app from Google Play to join the community.' : 'Update the app from the App Store to join the community.');
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

// ---------- Google (off until a client id is in app.json — see GOOGLE.md) ----------
export function googleConfig(): { iosClientId: string; webClientId?: string; allowBundleScheme: boolean; bundleId?: string } | null {
  try {
    const cfg = require('expo-constants').default?.expoConfig ?? {};
    const extra = cfg.extra ?? {};
    if (!reversedClientId(extra.googleIosClientId)) return null;
    return { iosClientId: String(extra.googleIosClientId).trim(), webClientId: extra.googleWebClientId ? String(extra.googleWebClientId) : undefined, allowBundleScheme: extra.googleUseBundleScheme === true, bundleId: cfg.ios?.bundleIdentifier };
  } catch { return null; }
}
export const googleModule = (): any => { try { return require('expo-auth-session/providers/google'); } catch { return undefined; } };
/** Null = hide the Google button (no client id, no module, or this installed build can't receive Google's redirect). */
export async function googleSupport(): Promise<{ iosClientId: string; webClientId?: string; redirectUri?: string } | null> {
  const cfg = googleConfig();
  if (!cfg) return null;
  const hasModule = !!googleModule()?.useIdTokenAuthRequest;
  let schemeInBuild = false;
  const scheme = reversedClientId(cfg.iosClientId);
  if (Platform.OS === 'ios' && scheme && hasModule) { try { schemeInBuild = !!(await Linking.canOpenURL(`${scheme}:/oauthredirect`)); } catch { schemeInBuild = false; } }
  const r = googleRedirect({ platform: Platform.OS, iosClientId: cfg.iosClientId, webClientId: cfg.webClientId, hasModule, schemeInBuild, bundleId: cfg.bundleId, allowBundleScheme: cfg.allowBundleScheme });
  return r.show ? { iosClientId: cfg.iosClientId, webClientId: cfg.webClientId, redirectUri: r.redirectUri } : null;
}
export async function finishGoogle(idToken: string) { await signInWith('google', { idToken }); }

// ---------- Android: native Google sign-in (Credential Manager) ----------
// Needs extra.googleWebClientId (a Web OAuth client in the same Google project as the Android client,
// which is registered with the app's signing SHA-1). The id token's aud is the web client id, so the
// server's GOOGLE_CLIENT_ID list must include it. Hidden on iOS and on builds without the module.
export const googleNativeModule = (): any => {
  if (Platform.OS !== 'android') return undefined;
  try { if (!require('react-native').TurboModuleRegistry?.get?.('RNGoogleSignin') && !require('react-native').NativeModules?.RNGoogleSignin) return undefined; } catch { return undefined; }
  try { return require('@react-native-google-signin/google-signin'); } catch { return undefined; }
};
export function androidGoogleClient(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const id = String(require('expo-constants').default?.expoConfig?.extra?.googleWebClientId || '').trim();
    return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) && googleNativeModule()?.GoogleSignin ? id : null;
  } catch { return null; }
}
export async function signInWithGoogleNative(webClientId: string): Promise<void> {
  const { GoogleSignin, isSuccessResponse, statusCodes } = googleNativeModule();
  GoogleSignin.configure({ webClientId, scopes: [] });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const r = await GoogleSignin.signIn();
    if (isSuccessResponse && !isSuccessResponse(r)) return; // cancelled
    const idToken = r?.data?.idToken ?? r?.idToken;
    if (!idToken) throw new Error('Google didn’t return a sign-in token. Try again.');
    await finishGoogle(idToken);
  } catch (e: any) {
    if (e?.code === statusCodes?.SIGN_IN_CANCELLED) return;
    if (e?.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services is needed to sign in with Google.');
    throw e instanceof Error && !e.message.includes('DEVELOPER_ERROR') ? e : new Error('Google sign-in didn’t finish. Try again.');
  }
}

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
