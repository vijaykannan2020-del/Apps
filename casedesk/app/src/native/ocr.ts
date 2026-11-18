// Reading text from photos and PDFs on the phone. Photos: Apple Vision / ML Kit (expo-text-extractor).
// PDFs: the text layer (expo-pdf-text-extract), else page images (react-native-pdf-thumbnail) read
// like photos. Every native module is required lazily in try/catch, so an over-the-air update can
// never crash an installed build that lacks one — the feature just reports "not available".
import { Platform } from 'react-native';
import { readDocument } from '../core/read';

// Literal requires (Metro bundles only static names), each guarded so a missing module can't crash.
const mods = {
  ocr: (): any => { try { return require('expo-text-extractor'); } catch { return undefined; } },
  pdf: (): any => { try { return require('expo-pdf-text-extract'); } catch { return undefined; } },
  thumb: (): any => { try { return require('react-native-pdf-thumbnail'); } catch { return undefined; } },
  manip: (): any => { try { return require('expo-image-manipulator'); } catch { return undefined; } },
  constants: (): any => { try { return require('expo-constants'); } catch { return undefined; } },
};

async function ocrImage(uri: string): Promise<string> {
  const ocr = mods.ocr();
  if (!ocr?.isSupported || !ocr.extractTextFromImage) return '';
  try { return ((await ocr.extractTextFromImage(uri)) as string[]).join('\n'); } catch { return ''; }
}

const score = (t: string) => {
  const r = readDocument(t);
  return (r.type ? 10 : 0) + Object.keys(r.fields).length * 2 + Math.min(10, t.split('\n').length / 4);
};

/** Read the original; if that's weak, retry on an enlarged and rotated copy and keep the best. */
async function readImageBest(uri: string, width?: number): Promise<string> {
  let best = await ocrImage(uri);
  if (score(best) >= 22) return best;
  const M = mods.manip();
  if (!M?.manipulateAsync) return best;
  try {
    const big = await M.manipulateAsync(uri, [{ resize: { width: Math.max(2400, Math.min(3200, (width || 1200) * 2)) } }], { compress: 0.95, format: M.SaveFormat.JPEG });
    const merged = `${best}\n${await ocrImage(big.uri)}`;
    if (score(merged) > score(best)) best = merged;
    for (const rot of [90, 270, 180]) {
      if (score(best) >= 28) break;
      const r = await M.manipulateAsync(big.uri, [{ rotate: rot }], { compress: 0.95, format: M.SaveFormat.JPEG });
      const t = await ocrImage(r.uri);
      if (score(t) > score(best)) best = t;
    }
  } catch {}
  return best;
}

export async function readText(uri: string, mime: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf')) {
      let text = '';
      const pdf = mods.pdf();
      try { if (pdf?.isAvailable?.()) text = (await pdf.extractText(uri)) || ''; } catch {}
      if (text.replace(/\s/g, '').length >= 40) {
        const r = readDocument(text);
        const idDoc = r.type === 'passport' || r.type === 'visa' || r.type === 'ead' || r.type === 'green-card';
        if (r.type && r.fields.validTo && !idDoc) return text; // a good e-filed text layer
      }
      const Thumb = mods.thumb()?.default;
      if (Thumb?.generate) {
        const pages: string[] = [];
        for (let pg = 0; pg < 3; pg++) {
          try { const r = await Thumb.generate(uri, pg, { quality: 95 }); pages.push(await readImageBest(r.uri, r.width)); } catch { break; }
        }
        const img = pages.join('\n');
        if (img.replace(/\s/g, '').length >= 20) text = `${img}\n${text}`;
      }
      return text || null;
    }
    return await readImageBest(uri);
  } catch {
    return null;
  }
}

/** On-device reading works only in the real app build (not Expo Go or the web preview). */
export function ocrAvailable() {
  if (Platform.OS === 'web') return false;
  const C = mods.constants()?.default;
  return C?.executionEnvironment !== 'storeClient' && !!mods.ocr();
}
