// iCloud automatic backup — the pure part (unit-tested): file names, which backups to keep, and
// when an automatic backup is due. The file is the same password-protected .casedesk backup as
// Settings → Back up now; only where it is saved differs (the app's private iCloud container).

export const ICLOUD_DIR = '/CaseDesk Backups';
export const KEEP = 3;
const DAY = 864e5;

export type ICloudSettings = {
  on: boolean;
  wifiOnly: boolean;
  lastAt?: string; // ISO time of the last successful iCloud backup
  lastError?: string;
  changedAt?: string; // last data change not yet in an iCloud backup
  lastAttemptAt?: string; // last automatic try that failed
  failures?: number; // automatic tries that failed in a row (reset on success or Back up now)
};

/** Back-off after failed automatic backups: 30 minutes, then 2 hours, then daily. */
export function retryAfterMs(failures = 0): number {
  return failures <= 0 ? 0 : failures === 1 ? 30 * 60e3 : failures === 2 ? 2 * 3600e3 : 24 * 3600e3;
}
export const ICLOUD_DEFAULT: ICloudSettings = { on: false, wifiOnly: true };

const pad = (n: number) => String(n).padStart(2, '0');
/** CaseDesk-2026-11-18-0930.casedesk (UTC, sortable). */
export function backupName(d: Date): string {
  return `CaseDesk-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.casedesk`;
}
const RE = /^CaseDesk-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})?\.casedesk$/;
export const isBackupName = (n: string) => RE.test(n);
/** When a backup file was made, from its name. */
export function backupTime(n: string): string | undefined {
  const m = n.match(RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z` : undefined;
}
/** Newest first; only our own backup files. */
export const sortBackups = (names: string[]) => names.filter(isBackupName).sort().reverse();
/** The backups to delete so that only the newest `keep` remain. */
export const toPrune = (names: string[], keep = KEEP) => sortBackups(names).slice(keep);

/**
 * Is an automatic backup due? Daily, and a little while after a change (debounced: two minutes
 * after the last change, at most every 30 minutes). Never when off, never on cellular if
 * "Only on Wi-Fi" is set and we know the connection isn't Wi-Fi.
 */
export function backupDueNow(s: ICloudSettings, now: Date, net: { wifi?: boolean } = {}): 'daily' | 'changed' | null {
  if (!s.on) return null;
  if (s.wifiOnly && net.wifi === false) return null;
  if (s.failures && s.lastAttemptAt && now.getTime() - Date.parse(s.lastAttemptAt) < retryAfterMs(s.failures)) return null; // backing off
  const last = s.lastAt ? Date.parse(s.lastAt) : 0;
  const t = now.getTime();
  if (!last || t - last >= DAY) return 'daily';
  if (s.changedAt) {
    const ch = Date.parse(s.changedAt);
    if (ch > last && t - ch >= 2 * 60e3 && t - last >= 30 * 60e3) return 'changed';
  }
  return null;
}

/**
 * Plain-English iCloud errors. Native errors arrive as { code, message, domain?, userInfo? } with
 * NSError details in the message (react-native-cloud-storage passes localizedDescription through).
 *  • NSCocoaErrorDomain 640 (NSFileWriteOutOfSpaceError), ERR_QUOTA_EXCEEDED, "quota"/"out of space" → full
 *  • no iCloud account / ubiquity identity → not signed in
 *  • NSUbiquitousFileUnavailableError (4353) / container unavailable / iCloud Drive off → turn on iCloud Drive
 */
export function friendlyICloudError(e: unknown): string {
  const x = (e ?? {}) as { code?: unknown; message?: unknown; domain?: unknown; nativeStackIOS?: unknown; userInfo?: unknown };
  const text = [x.code, x.message, x.domain, typeof e === 'string' ? e : '', JSON.stringify(x.userInfo ?? '')].map((v) => String(v ?? '')).join(' ');
  const t = text.toLowerCase();
  if (/\b640\b/.test(text) && /nscocoaerrordomain|cocoa/i.test(text)) return 'iCloud storage is full — free up space in iOS Settings → your name → iCloud';
  if (/err_quota_exceeded|quota|out of space|enough (icloud )?(storage|space)|storage (is )?full|nsfilewriteoutofspaceerror|\b4354\b/.test(t)) return 'iCloud storage is full — free up space in iOS Settings → your name → iCloud';
  if (/not signed in|no icloud account|sign in to icloud|ubiquityidentitytoken|identity token|err_authentication_failed|signed-out/.test(t)) return 'Sign in to iCloud in iOS Settings';
  if (/\b4353\b|nsubiquitousfileunavailableerror|icloud drive (is )?(off|disabled)|container (is )?(unavailable|not available)|ubiquity container/.test(t)) return 'Turn on iCloud Drive for Immigration Wallet in iOS Settings → your name → iCloud';
  const m = String(x.message ?? (typeof e === 'string' ? e : '') ?? '').trim();
  return m || 'Couldn’t back up to iCloud';
}
