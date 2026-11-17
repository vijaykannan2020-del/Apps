// Employer / HR mode: deadlines across all employees, plus CSV export and import.
import { Platform } from 'react-native';
import type { I9Record } from './store';

export type Deadline = { id: string; name: string; what: string; date: string; days: number };
const FIELDS: { k: keyof I9Record; what: string }[] = [
  { k: 'expires', what: 'I-9 reverification' },
  { k: 'i94', what: 'I-94 ends' },
  { k: 'petitionEnd', what: 'Approval (I-797) ends' },
  { k: 'ead', what: 'EAD ends' },
  { k: 'passport', what: 'Passport expires' },
];
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

export function deadlines(recs: I9Record[]): Deadline[] {
  const out: Deadline[] = [];
  for (const r of recs) for (const f of FIELDS) {
    const v = r[f.k] as string | undefined;
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    out.push({ id: r.id, name: r.name, what: f.what, date: v, days: Math.round((new Date(v + 'T12:00:00').getTime() - today().getTime()) / 864e5) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const COLS = ['name', 'team', 'visa', 'document', 'work_auth_expires', 'i94_admit_until', 'petition_end', 'ead_end', 'passport_expires', 'notes'];
const esc = (v?: string) => { const s = v ?? ''; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCsv(recs: I9Record[]) {
  return [COLS.join(','), ...recs.map((r) => [r.name, r.team, r.visa, r.doc, r.expires, r.i94, r.petitionEnd, r.ead, r.passport, r.notes].map(esc).join(','))].join('\n');
}

function parseLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const normDate = (s: string) => {
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US MM/DD/YYYY
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined;
};

export function fromCsv(text: string): { recs: I9Record[]; skipped: number } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return { recs: [], skipped: 0 };
  const head = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const idx = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const c = {
    name: idx(['name', 'employee']), team: idx(['team', 'dept', 'department']), visa: idx(['visa', 'status', 'class']), doc: idx(['document', 'doc']),
    expires: idx(['work_auth', 'reverif', 'i9', 'expires']), i94: idx(['i94', 'i_94', 'admit']), petition: idx(['petition', 'i797', 'approval']),
    ead: idx(['ead']), passport: idx(['passport']), notes: idx(['note']),
  };
  const recs: I9Record[] = []; let skipped = 0;
  lines.slice(1).forEach((l, n) => {
    const v = parseLine(l); const g = (i: number) => (i >= 0 ? v[i] ?? '' : '');
    const name = g(c.name), expires = normDate(g(c.expires));
    if (!name || !expires) { skipped++; return; }
    recs.push({ id: `imp-${Date.now()}-${n}`, name, team: g(c.team) || undefined, visa: g(c.visa) || '—', doc: g(c.doc), expires, i94: normDate(g(c.i94)), petitionEnd: normDate(g(c.petition)), ead: normDate(g(c.ead)), passport: normDate(g(c.passport)), notes: g(c.notes) || undefined });
  });
  return { recs, skipped };
}

export async function shareCsv(text: string, filename = 'casedesk-employees.csv') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); return;
  }
  const { File, Paths } = require('expo-file-system');
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create(); f.write(text);
  await require('expo-sharing').shareAsync(f.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export employees' });
}

export async function pickCsv(): Promise<string | null> {
  const DocumentPicker = require('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (Platform.OS === 'web' && a.file) return await a.file.text();
  const { File } = require('expo-file-system');
  return await new File(a.uri).text();
}
