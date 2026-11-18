// Keeps the family list clean and fills in names that earlier versions couldn't read.
// Runs quietly when the Documents tab opens.
import { loadFamily, Member } from './family';
import { read, write } from './store';
import { loadProfile, saveProfile, Profile } from './profile';
import { mapDocs, allDocs, updateDoc, VaultDoc } from './vault';

const FAMILY = 'cd.family.v1';
const CASES = 'cd.cases.v1';
const RELATION_WORDS = ['spouse', 'child', 'parent', 'other', 'son', 'daughter', 'wife', 'husband', 'kid', 'me'];
export const isNamed = (m: { name?: string; relation: string }) => !!m.name?.trim() && !RELATION_WORDS.includes(m.name.trim().toLowerCase());

// Fill any empty field of `into` from `from` (dates, visa details).
function mergeProfile(into: Profile, from: Profile): Profile {
  const out: any = { ...into };
  for (const [k, v] of Object.entries(from)) if (v !== undefined && v !== '' && (out[k] === undefined || out[k] === '')) out[k] = v;
  return out;
}

async function moveOwner(fromId: string, toId: string) {
  if ((await allDocs()).some((d) => d.owner === fromId)) await mapDocs((d) => (d.owner === fromId ? { ...d, owner: toId } : d));
  const cases = await read<{ owner?: string }[]>(CASES, []);
  if (cases.some((c) => c.owner === fromId)) await write(CASES, cases.map((c) => (c.owner === fromId ? { ...c, owner: toId } : c)));
}

// You can only have one spouse: an extra spouse entry without a name (left behind by an earlier scan)
// is merged into the named one — its dates, documents and cases move across.
export async function mergeDuplicateSpouse(): Promise<boolean> {
  const fam = await loadFamily();
  const spouses = fam.filter((m) => m.relation === 'Spouse');
  if (spouses.length < 2) return false;
  const keep = spouses.find(isNamed) ?? spouses[0];
  const extra = spouses.filter((m) => m.id !== keep.id && !isNamed(m));
  if (!extra.length) return false;
  let merged: Member = keep;
  for (const x of extra) { merged = { ...merged, profile: mergeProfile(merged.profile, x.profile) }; await moveOwner(x.id, keep.id); }
  await write(FAMILY, fam.filter((m) => !extra.some((x) => x.id === m.id)).map((m) => (m.id === keep.id ? merged : m)));
  return true;
}

let running = false;
// Documents saved before names could be read: read the name (and a missing expiry) from the file again,
// and give it to its person if they don't have a name yet. Each document is tried once.
export async function backfillNames() {
  if (running) return;
  running = true;
  try {
    const { readText, parseDocument, ocrAvailable } = await import('./ocr');
    if (!ocrAvailable()) return;
    const docs = (await allDocs()) as (VaultDoc & { nameTried?: boolean })[];
    const todo = docs.filter((d) => !d.name && !d.nameTried && !d.uri.startsWith('web:') && ['Passport', 'Visa stamp', 'EAD card', 'I-94', 'Other'].includes(d.type));
    for (const d of todo.slice(0, 6)) {
      let f: ReturnType<typeof parseDocument> | null = null;
      try { const text = await readText(d.uri, d.mime); f = text ? parseDocument(text) : null; } catch {}
      const cur = ((await allDocs()) as (VaultDoc & { nameTried?: boolean })[]).find((x) => x.id === d.id);
      if (!cur) continue;
      cur.nameTried = true;
      if (f?.name) cur.name = f.name;
      if (f?.validTo && !cur.expires && cur.type === (f.type ?? cur.type)) cur.expires = f.validTo;
      await updateDoc(cur);
      if (!f?.name) continue;
      const owner = cur.owner || 'me';
      if (owner === 'me') {
        const p = await loadProfile();
        if (p && !p.name) await saveProfile({ ...p, name: f.name, passportExpiry: p.passportExpiry || (cur.type === 'Passport' ? cur.expires : undefined) });
      } else {
        const fam = await loadFamily();
        const m = fam.find((x) => x.id === owner);
        if (m && !isNamed(m)) {
          m.name = f.name;
          if (cur.type === 'Passport' && cur.expires && !m.profile.passportExpiry) m.profile.passportExpiry = cur.expires;
          await write(FAMILY, fam);
        }
      }
    }
  } finally { running = false; }
}
