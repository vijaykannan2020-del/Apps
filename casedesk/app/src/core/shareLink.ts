// Where a link opened by the system should go (pure, tested). A local .iwshare file -> the import
// screen with the file's URL; anything else -> null (unchanged).
export function shareImportPath(path: string): string | null {
  if (!/^file:\/\//i.test(path)) return null;
  const clean = path.split(/[?#]/)[0];
  if (!/\.iwshare$/i.test(clean)) return null;
  return `/share-import?file=${encodeURIComponent(clean)}`;
}
