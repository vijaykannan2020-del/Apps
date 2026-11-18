// The app's data on the phone: people, documents, cases, settings. Everything is stored under
// versioned keys prefixed "cd2." (the old app used "cd."; this app starts empty and never touches them).
// Each collection is one JSON blob: { v: SCHEMA, data }. Reads never throw — a corrupt or unknown
// blob is moved aside to "<key>.bad" and the default is returned, so a bad write can't brick the app.
// Writes are serialised per key so two quick saves can't interleave.
import type { Case, Document, Person, Settings } from '../core/model';
import { DEFAULT_SETTINGS } from '../core/model';
import type { KV } from './kv';
import { migrateDocs } from '../core/files';

export const SCHEMA = 1;
export const PREFIX = 'cd2.';
export const KEYS = {
  people: `${PREFIX}people.v1`,
  docs: `${PREFIX}docs.v1`,
  cases: `${PREFIX}cases.v1`,
  settings: `${PREFIX}settings.v1`,
  meta: `${PREFIX}meta`,
  draft: `${PREFIX}draft`,
} as const;

type Blob<T> = { v: number; data: T };
/** Migration hooks: MIGRATIONS[n] upgrades a blob's data from schema n to n + 1. */
export const MIGRATIONS: Record<number, (key: string, data: any) => any> = {};

export type Snapshot = { people: Person[]; docs: Document[]; cases: Case[]; settings: Settings };

export class Store {
  private queue = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  constructor(private kv: KV) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    const r = await this.readStrict<T>(key);
    return r.ok && r.found ? r.data : fallback;
  }

  /** Like read, but says whether the value really loaded (ok: false on a storage error, a corrupt
   *  blob or one from a newer version). Used where acting on a fallback would be destructive. */
  private async readStrict<T>(key: string): Promise<{ ok: true; found: boolean; data: T } | { ok: false }> {
    let raw: string | null = null;
    try { raw = await this.kv.getItem(key); } catch { return { ok: false }; }
    if (raw == null) return { ok: true, found: false, data: undefined as T };
    try {
      const blob = JSON.parse(raw) as Blob<T>;
      if (!blob || typeof blob !== 'object' || typeof blob.v !== 'number') throw new Error('bad blob');
      let data: any = blob.data;
      for (let v = blob.v; v < SCHEMA; v++) {
        const m = MIGRATIONS[v];
        if (!m) throw new Error(`no migration from ${v}`);
        data = m(key, data);
      }
      if (blob.v > SCHEMA) return { ok: false }; // written by a newer app version: don't overwrite, don't crash
      return { ok: true, found: true, data: data as T };
    } catch {
      try { await this.kv.setItem(`${key}.bad`, raw); } catch {}
      return { ok: false };
    }
  }

  private write<T>(key: string, data: T): Promise<void> {
    const prev = this.queue.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => this.kv.setItem(key, JSON.stringify({ v: SCHEMA, data } satisfies Blob<T>)));
    this.queue.set(key, next);
    return next.then(() => this.emit());
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const l of this.listeners) { try { l(); } catch {} } }

  // ---- collections ----
  people() { return this.read<Person[]>(KEYS.people, []); }
  async docs() { return this.migrated(await this.read<Document[]>(KEYS.docs, [])); }
  /** Documents, or null when they couldn't be loaded (the orphan sweep must not run then). */
  async docsOrNull(): Promise<Document[] | null> {
    const r = await this.readStrict<Document[]>(KEYS.docs);
    if (!r.ok) return null;
    return r.found && Array.isArray(r.data) ? this.migrated(r.data) : [];
  }
  /** Earlier builds stored absolute file paths: keep names only (rewritten once, quietly). */
  private migrated(docs: Document[]): Document[] {
    const m = migrateDocs(docs);
    if (m.changed) {
      const prev = this.queue.get(KEYS.docs) ?? Promise.resolve();
      const next = prev.catch(() => {}).then(() => this.kv.setItem(KEYS.docs, JSON.stringify({ v: SCHEMA, data: m.docs })));
      this.queue.set(KEYS.docs, next.catch(() => {}));
    }
    return m.docs;
  }
  cases() { return this.read<Case[]>(KEYS.cases, []); }
  async settings() { return { ...DEFAULT_SETTINGS, ...(await this.read<Partial<Settings>>(KEYS.settings, {})) } as Settings; }
  async snapshot(): Promise<Snapshot> {
    const [people, docs, cases, settings] = await Promise.all([this.people(), this.docs(), this.cases(), this.settings()]);
    return { people, docs, cases, settings };
  }

  savePeople(p: Person[]) { return this.write(KEYS.people, p); }
  saveDocs(d: Document[]) { return this.write(KEYS.docs, d); }
  saveCases(c: Case[]) { return this.write(KEYS.cases, c); }
  saveSettings(s: Settings) { return this.write(KEYS.settings, s); }

  // ---- in-progress document flow (survives the app being closed) ----
  draft<T>() { return this.read<T | null>(KEYS.draft, null); }
  /** The draft, or { ok: false } when it exists but couldn't be loaded. */
  async draftStrict<T>(): Promise<{ ok: boolean; data: T | null }> {
    const r = await this.readStrict<T>(KEYS.draft);
    return r.ok ? { ok: true, data: r.found ? r.data : null } : { ok: false, data: null };
  }
  async saveDraft<T>(d: T | null) { try { if (d) await this.kv.setItem(KEYS.draft, JSON.stringify({ v: SCHEMA, data: d })); else await this.kv.removeItem(KEYS.draft); } catch {} }

  // ---- convenience ----
  async upsertPerson(p: Person) { const all = await this.people(); await this.savePeople([...all.filter((x) => x.id !== p.id), p]); }
  async removePerson(id: string) {
    await this.savePeople((await this.people()).filter((x) => x.id !== id));
    await this.saveDocs((await this.docs()).filter((d) => d.ownerId !== id));
    await this.saveCases((await this.cases()).filter((c) => c.ownerId !== id));
  }
  async addDocs(ds: Document[]) { const all = await this.docs(); const ids = new Set(ds.map((d) => d.id)); await this.saveDocs([...all.filter((x) => !ids.has(x.id)), ...ds]); }
  async removeDoc(id: string) { await this.saveDocs((await this.docs()).filter((d) => d.id !== id)); }
  async upsertCase(c: Case) { const all = await this.cases(); await this.saveCases([...all.filter((x) => x.id !== c.id && x.receipt !== c.receipt), c]); }
  async updateSettings(patch: Partial<Settings>) { await this.saveSettings({ ...(await this.settings()), ...patch }); }

  /** Export everything (V3). The UI encrypts this before writing the file. */
  async exportJSON() { return JSON.stringify({ app: 'casedesk', schema: SCHEMA, exportedAt: new Date().toISOString(), ...(await this.snapshot()) }); }
  async importJSON(json: string) {
    const x = JSON.parse(json);
    if (x?.app !== 'casedesk' || typeof x.schema !== 'number' || x.schema > SCHEMA) throw new Error('Not a CaseDesk backup from this version');
    await this.savePeople(x.people ?? []); await this.saveDocs(x.docs ?? []); await this.saveCases(x.cases ?? []); await this.saveSettings({ ...DEFAULT_SETTINGS, ...(x.settings ?? {}) });
  }
  /** Delete all data: every cd2.* key (never the old app's cd.* keys). */
  async deleteAll() {
    const keys = (await this.kv.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    for (const k of keys) await this.kv.removeItem(k);
    this.emit();
  }
}

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
