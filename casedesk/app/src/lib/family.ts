// Family members' status (spouse, children, parents) — same checks and reminders as "Me", stored on the phone.
import { Profile } from './profile';
import { useStored, read, write } from './store';

export type Member = { id: string; name: string; relation: string; profile: Profile };
export const RELATIONS = ['Spouse', 'Child', 'Parent', 'Other'];
const KEY = 'cd.family.v1';

export const useFamily = () => useStored<Member[]>(KEY, []);
export const loadFamily = () => read<Member[]>(KEY, []);
export async function saveMember(m: Member) {
  const all = await loadFamily();
  const i = all.findIndex((x) => x.id === m.id);
  if (i >= 0) all[i] = m; else all.push(m);
  await write(KEY, all);
}
export async function removeMember(id: string) {
  await write(KEY, (await loadFamily()).filter((m) => m.id !== id));
}
