// Reads the quality options (bitrate ladder) out of an HLS master playlist, so the player can offer them.
export type Variant = { label: string; url: string; height: number; bandwidth: number };

export async function fetchVariants(masterUrl: string, headers: Record<string, string>): Promise<Variant[]> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
  let text = '';
  try {
    const r = await fetch(masterUrl, { headers, signal: c.signal });
    if (!r.ok) return [];
    text = await r.text();
  } catch { return []; } finally { clearTimeout(t); }
  if (!text.includes('#EXT-X-STREAM-INF')) return []; // a single-quality (media) playlist
  const lines = text.replace(/\r/g, '').split('\n');
  const out: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const attrs = lines[i];
    const url = (lines[i + 1] || '').trim();
    if (!url || url.startsWith('#')) continue;
    const res = (attrs.match(/RESOLUTION=\d+x(\d+)/) || [])[1];
    const bw = Number((attrs.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
    const height = Number(res || 0);
    const label = height ? height + 'p' : bw ? (bw / 1e6).toFixed(1) + ' Mbps' : 'Stream ' + (out.length + 1);
    out.push({ label, url: new URL(url, masterUrl).toString(), height, bandwidth: bw });
  }
  // Best first, drop duplicates by label.
  const seen = new Set<string>();
  return out.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth).filter(v => (seen.has(v.label) ? false : seen.add(v.label)));
}
