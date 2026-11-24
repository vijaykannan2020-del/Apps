// Reads .srt / .vtt subtitle files so the app can draw subtitles itself (in sync with the video).
export type Cue = { start: number; end: number; text: string }; // milliseconds

const ms = (t: string) => {
  const m = t.trim().replace(',', '.').match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/);
  if (!m) return NaN;
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number((m[4] || '0').padEnd(3, '0'));
};

export function parseSubs(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r/g, '');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = ms(a), end = ms(b.split(' ').filter(Boolean)[0] || b);
    const body = lines.slice(i + 1).join('\n')
      .replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (!isNaN(start) && !isNaN(end) && body) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export async function loadSubs(url: string): Promise<Cue[]> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('Subtitle download failed (' + r.status + ').');
    const cues = parseSubs(await r.text());
    if (!cues.length) throw new Error('That subtitle file was empty or in an unsupported format.');
    return cues;
  } finally { clearTimeout(t); }
}

// Binary search for the line showing at time t.
export function cueAt(cues: Cue[], t: number): string {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = cues[mid];
    if (t < c.start) hi = mid - 1; else if (t > c.end) lo = mid + 1; else return c.text;
  }
  return '';
}
