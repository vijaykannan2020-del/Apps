// Every change the screens can make, in one place. Screens call these; they never touch storage.
import type { Case, Document, Person, PersonFacts, Settings, StatusCategory } from '../core/model';
import { today } from '../core/dates';
import type { CaseView } from '../core/cases';
import { newId, type Store } from './store';
import { deleteFile } from '../native/files';

export type Actions = ReturnType<typeof makeActions>;

export function makeActions(store: Store) {
  const nowIso = () => new Date().toISOString();
  async function editCase(view: CaseView, fn: (c: Case) => Case) {
    const base: Case = view.manual ?? { id: newId('case'), receipt: view.receipt ?? view.id, form: view.form, ownerId: view.ownerId, keyDates: [], history: [] };
    await store.upsertCase(fn({ ...base, keyDates: [...base.keyDates], history: [...base.history] }));
  }
  return {
    /** First run, screen 2: create "you" and go straight to Home. */
    async createSelf(name: string, status: StatusCategory) {
      const me: Person = { id: 'me', name: name.trim(), relation: 'self', isMain: true, status, facts: {}, createdAt: today(), reminders: { on: true, lead: [180, 90, 30, 7] } };
      await store.upsertPerson(me);
      await store.updateSettings({ tutorialSeen: true, setupDone: true });
      return me;
    },
    async upsertPerson(p: Person) { await store.upsertPerson(p); },
    async savePeople(list: Person[]) {
      const all = await store.people();
      const keep = all.filter((x) => !list.some((y) => y.id === x.id));
      await store.savePeople([...keep, ...list]);
    },
    async updatePerson(id: string, patch: Partial<Person>) {
      const all = await store.people();
      await store.savePeople(all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    async setFacts(id: string, patch: Partial<PersonFacts>) {
      const all = await store.people();
      await store.savePeople(all.map((p) => (p.id === id ? { ...p, facts: { ...p.facts, ...patch } } : p)));
    },
    async removePerson(id: string) {
      for (const d of (await store.docs()).filter((x) => x.ownerId === id)) for (const f of d.files ?? []) deleteFile(f);
      await store.removePerson(id);
    },
    async addDocs(docs: Document[]) {
      if (!docs.length) return;
      await store.addDocs(docs);
      const s = await store.settings();
      if (!s.firstDocAt) await store.updateSettings({ firstDocAt: nowIso() });
    },
    async updateDoc(id: string, patch: Partial<Document>) {
      const all = await store.docs();
      await store.saveDocs(all.map((d) => (d.id === id ? { ...d, ...patch, fields: { ...d.fields, ...(patch.fields ?? {}) } } : d)));
    },
    async replaceDoc(id: string, next: Pick<Document, 'type' | 'fields' | 'files'>) {
      const all = await store.docs();
      const old = all.find((d) => d.id === id);
      for (const f of old?.files ?? []) if (!next.files?.some((n) => n.file === f.file)) deleteFile(f);
      await store.saveDocs(all.map((d) => (d.id === id ? { ...d, ...next, edited: [] } : d)));
    },
    async deleteDoc(id: string) {
      const all = await store.docs();
      for (const f of all.find((d) => d.id === id)?.files ?? []) deleteFile(f);
      await store.saveDocs(all.filter((d) => d.id !== id));
    },
    // ---- cases ----
    async addCase(c: Omit<Case, 'id' | 'keyDates' | 'history'> & Partial<Pick<Case, 'keyDates' | 'history'>>) {
      await store.upsertCase({ id: newId('case'), keyDates: [], history: [{ date: nowIso(), text: 'Added in CaseDesk' }], ...c });
    },
    editCase,
    async deleteCase(view: CaseView) {
      if (view.docIds.length) await editCase(view, (c) => ({ ...c, hidden: true }));
      else if (view.manual) await store.saveCases((await store.cases()).filter((x) => x.id !== view.manual!.id));
    },
    async updateSettings(patch: Partial<Settings>) { await store.updateSettings(patch); },
    async wipe() {
      for (const d of await store.docs()) for (const f of d.files ?? []) deleteFile(f);
      await store.deleteAll();
    },
  };
}
