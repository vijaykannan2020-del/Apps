// Receipt validation + mapping USCIS status text to a simple 5-step progress.
export const RECEIPT_RE = /^(EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC|NSC|TSC|VSC|CSC)\d{10}$/;

export const normalizeReceipt = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const CENTERS: Record<string, string> = {
  EAC: 'Vermont Service Center', VSC: 'Vermont Service Center',
  WAC: 'California Service Center', CSC: 'California Service Center',
  LIN: 'Nebraska Service Center', NSC: 'Nebraska Service Center',
  SRC: 'Texas Service Center', TSC: 'Texas Service Center',
  NBC: 'National Benefits Center', MSC: 'National Benefits Center',
  IOE: 'USCIS online filing (ELIS)', YSC: 'Potomac Service Center',
};

export const STAGES = ['Received', 'Biometrics', 'In review', 'Decision', 'Card / Docs'];

export type Tone = 'accent' | 'green' | 'amber' | 'red' | 'neutral';

export function stageOf(status = ''): { step: number; tone: Tone; short: string } {
  const s = status.toLowerCase();
  if (/denied|rejected|terminated|revoked|withdraw/.test(s)) return { step: 3, tone: 'red', short: 'Action needed' };
  if (/card (was )?(produced|mailed|delivered|picked)|document (was )?mailed|delivered|oath/.test(s)) return { step: 4, tone: 'green', short: 'Done' };
  if (/approved|approval|reaffirmed/.test(s)) return { step: 3, tone: 'green', short: 'Approved' };
  if (/evidence|rfe|noid|intent to deny/.test(s)) return { step: 2, tone: 'amber', short: 'RFE' };
  if (/interview/.test(s)) return { step: 2, tone: 'accent', short: 'Interview' };
  if (/fingerprint|biometric/.test(s)) return { step: 1, tone: 'accent', short: 'Biometrics' };
  if (/transfer|actively reviewed|being reviewed|relocated|response .* received/.test(s)) return { step: 2, tone: 'accent', short: 'In review' };
  if (/received|accepted/.test(s)) return { step: 0, tone: 'accent', short: 'Received' };
  return { step: 0, tone: 'neutral', short: status ? 'Update' : 'Not checked' };
}

export const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
