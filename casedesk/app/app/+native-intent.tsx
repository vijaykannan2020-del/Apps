// System links into the app. A .iwshare file opened from Files, Messages, Mail or AirDrop arrives as a
// file:// URL (needs the build that registers the file type, see app.json); send it to the import
// screen. Everything else (casedesk://… links, notifications) is left as it was.
import { shareImportPath } from '../src/core/shareLink';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try { return shareImportPath(path) ?? path; } catch { return path; }
}
