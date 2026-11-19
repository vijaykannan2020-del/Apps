// Interview checklist → PDF (gc2 item 4). expo-print is not in TestFlight build 6, so the printer is
// looked up as an optional native module (no static require: an OTA bundle must run on build 6).
// With it (a later native build that adds expo-print): HTML → PDF → share sheet. Without it: the
// checklist goes out as plain text through the system share sheet.
import { Platform, Share } from 'react-native';
import { share } from './files';

function printer(): { printToFileAsync?: (o: { html: string }) => Promise<{ uri: string }> } | undefined {
  if (Platform.OS === 'web') return undefined;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    return typeof requireOptionalNativeModule === 'function' ? requireOptionalNativeModule('ExpoPrint') ?? undefined : undefined;
  } catch { return undefined; }
}
export const canPrintPdf = () => typeof printer()?.printToFileAsync === 'function';

/** 'pdf' when a PDF was shared, 'text' when the text fallback was used, 'none' if both failed or were cancelled. */
export async function shareChecklist(html: string, text: string, title: string): Promise<'pdf' | 'text' | 'none'> {
  const P = printer();
  if (P?.printToFileAsync) {
    try {
      const { uri } = await P.printToFileAsync({ html });
      if (uri && (await share(uri, 'application/pdf', title))) return 'pdf';
    } catch {}
  }
  try { const r = await Share.share({ message: text, title }); return (r as any)?.action === 'dismissedAction' ? 'none' : 'text'; } catch { return 'none'; }
}
