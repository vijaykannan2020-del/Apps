// Where a link opened by the system should go (pure, tested). A local .iwshare file -> the import
// screen with the file's URL; anything else -> null (unchanged).
export function shareImportPath(path: string): string | null {
  // Android: a share file opened from Files, Gmail or WhatsApp arrives as a content:// URI (the app only
  // registers for the share file's own MIME type, so nothing else lands here).
  if (/^content:\/\/[\w.-]+\//i.test(path)) return `/share-import?file=${encodeURIComponent(path)}`;
  if (!/^file:\/\//i.test(path)) return null;
  const clean = path.split(/[?#]/)[0];
  if (!/\.iwshare$/i.test(clean)) return null;
  return `/share-import?file=${encodeURIComponent(clean)}`;
}
