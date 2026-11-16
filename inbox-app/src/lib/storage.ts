// Small key/value storage: Keychain on iPhone (secure), localStorage on web.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) { try { return localStorage.getItem(key); } catch { return null; } }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) { try { localStorage.setItem(key, value); } catch {} return; }
  try { await SecureStore.setItemAsync(key, value); } catch {}
}

export async function removeItem(key: string): Promise<void> {
  if (web) { try { localStorage.removeItem(key); } catch {} return; }
  try { await SecureStore.deleteItemAsync(key); } catch {}
}
