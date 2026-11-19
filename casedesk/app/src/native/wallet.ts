// Presents a signed .pkpass (v2.5). With react-native-wallet-manager (v2.5+ builds) iOS shows its own
// "Add to Apple Wallet" sheet (PKAddPassesViewController). Older builds don't have the module: the file
// is handed to the share sheet instead, where iOS offers Wallet. Every call is guarded.
import { Platform, TurboModuleRegistry } from 'react-native';
import { native } from './safe';

export const PASS_MIME = 'application/vnd.apple.pkpass';
export const PASS_UTI = 'com.apple.pkpass';

export function hasWalletModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  try { return !!TurboModuleRegistry.get('NativeWalletManager'); } catch { return false; }
}
function walletManager(): any {
  if (!hasWalletModule()) return undefined;
  try { return require('react-native-wallet-manager').default; } catch { return undefined; }
}

/** Wallet cards are an iPhone/iPad feature; old builds can still use the share-sheet path. */
export const walletPlatform = () => Platform.OS === 'ios';

export async function canAddPasses(): Promise<boolean> {
  const W = walletManager();
  if (!W) return walletPlatform();
  try { return !!(await W.canAddPasses()); } catch { return true; }
}

async function writePass(base64: string, name: string): Promise<string | null> {
  try {
    const fs = native.fileSystem();
    const f = new fs.File(fs.Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    await f.write(base64, { encoding: 'base64' });
    return f.uri as string;
  } catch { return null; }
}

/** 'added' (Wallet sheet shown), 'shared' (share sheet shown on an older build) or 'failed'. */
export async function presentPass(base64: string, name = 'Immigration-status-card.pkpass'): Promise<'added' | 'shared' | 'failed'> {
  const uri = await writePass(base64, name);
  if (!uri) return 'failed';
  const W = walletManager();
  if (W) {
    try {
      const ok = await W.showAddPassControllerFromFile(decodeURI(uri.replace(/^file:\/\//, '')));
      if (ok !== false) return 'added';
    } catch { /* fall through to the share sheet */ }
  }
  const S = native.sharing();
  try {
    if (S?.isAvailableAsync && (await S.isAvailableAsync())) { await S.shareAsync(uri, { mimeType: PASS_MIME, UTI: PASS_UTI, dialogTitle: 'Add to Apple Wallet' }); return 'shared'; }
  } catch {}
  return 'failed';
}
