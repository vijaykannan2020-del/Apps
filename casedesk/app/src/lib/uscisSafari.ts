// Case status the USCIS-approved way for people (no API keys): the official Case Status Online page
// opens in Safari inside the app — real Safari passes USCIS's security check — and the person copies the
// result. Back in CaseDesk we read what they copied and fill in the case.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CaseResult } from './api';

export const USCIS_CASE_URL = 'https://egov.uscis.gov/';

export type Parsed = { status: string; detail: string; form?: string; date?: string };

// Status headings USCIS uses, matched from the explanation when only that was copied.
const FROM_DETAIL: [RegExp, string][] = [
  [/we (have )?approved/i, 'Case Was Approved'],
  [/we denied/i, 'Case Was Denied'],
  [/rejected/i, 'Case Rejected'],
  [/request for (initial )?evidence|sent you a request for/i, 'Request for Evidence Was Sent'],
  [/received your response to our request for evidence/i, 'Response To USCIS Request For Evidence Was Received'],
  [/(new )?card (was )?(produced|is being produced)|ordered your new card/i, 'New Card Is Being Produced'],
  [/card (was )?mailed|mailed your new card/i, 'Card Was Mailed To Me'],
  [/delivered your new card|card was delivered/i, 'Card Was Delivered To Me By The Post Office'],
  [/fingerprint/i, 'Case Was Updated To Show Fingerprints Were Taken'],
  [/scheduled an interview|interview (was )?scheduled/i, 'Interview Was Scheduled'],
  [/transferred your case/i, 'Case Was Transferred And A New Office Has Jurisdiction'],
  [/actively review/i, 'Case Is Being Actively Reviewed By USCIS'],
  [/received your (form|case)|we received/i, 'Case Was Received'],
];

const looksLikeHeading = (l: string) => l.length >= 8 && l.length <= 90 && !/[.:]$/.test(l) && /^[A-Z]/.test(l) && !/^on [A-Z][a-z]+ \d/i.test(l);

export function parseCaseText(raw: string, receipt?: string): Parsed | null {
  if (!raw) return null;
  const text = raw.replace(/\r/g, '').trim();
  if (text.length < 15) return null;
  if (receipt && text.replace(/\s/g, '').toUpperCase() === receipt) return null; // still the receipt we copied
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(case status online|check case status|enter a receipt number|receipt number:?)$/i.test(l));
  if (!lines.length) return null;
  // The explanation: the longest sentence-like line (usually starts "On <date>, we …").
  const detailLine = lines.filter((l) => l.length > 40).sort((a, b) => (/^on [A-Z][a-z]+ \d/i.test(b) ? 1 : 0) - (/^on [A-Z][a-z]+ \d/i.test(a) ? 1 : 0) || b.length - a.length)[0];
  if (!detailLine) return null;
  const idx = lines.indexOf(detailLine);
  const heading = lines.slice(0, idx).reverse().find(looksLikeHeading);
  const status = heading || FROM_DETAIL.find(([re]) => re.test(detailLine))?.[1];
  if (!status) return null;
  const form = detailLine.match(/Form\s+([A-Z]-?\d{2,4}[A-Z]?)/)?.[1]?.replace(/^([A-Z])(\d)/, '$1-$2');
  const d = detailLine.match(/^(?:On|As of)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i)?.[1];
  const parsed = d ? new Date(`${d} 12:00`) : null;
  const date = parsed && !isNaN(+parsed) ? parsed.toISOString().slice(0, 10) : undefined;
  return { status, detail: detailLine, form, date };
}

// Opens USCIS with the receipt number on the clipboard; returns what was copied on the way back (if any).
export async function checkInSafari(receipt: string): Promise<Parsed | null> {
  if (Platform.OS === 'web') { window.open(USCIS_CASE_URL, '_blank'); return null; }
  const Clipboard = require('expo-clipboard');
  const WebBrowser = require('expo-web-browser');
  await Clipboard.setStringAsync(receipt);
  await WebBrowser.openBrowserAsync(USCIS_CASE_URL, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle?.PAGE_SHEET ?? 'pageSheet',
    dismissButtonStyle: 'done',
    readerMode: false,
    enableBarCollapsing: true,
  });
  try {
    const copied: string = await Clipboard.getStringAsync();
    return parseCaseText(copied, receipt);
  } catch { return null; }
}

// Turns a parsed result into the stored case shape, keeping earlier history.
export async function toCaseResult(receipt: string, p: Parsed): Promise<CaseResult> {
  let history: CaseResult['history'] = [];
  try {
    const all = JSON.parse((await AsyncStorage.getItem('cd.cases.v1')) || '[]');
    history = all.find((c: any) => c.receipt === receipt)?.history || [];
  } catch {}
  const date = p.date || new Date().toISOString().slice(0, 10);
  if (!history.length || history[0].status !== p.status) history = [{ date, status: p.status }, ...history];
  return { receipt, form: p.form, status: p.status, detail: p.detail, updated: date, history };
}
