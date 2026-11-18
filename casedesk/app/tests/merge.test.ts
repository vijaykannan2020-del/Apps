// N2: merging the same backup twice never duplicates anyone (the backup's "You" included).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';
import { matchPeople } from '../src/core/merge';
import { Store } from '../src/data/store';
import { memoryKV } from '../src/data/kv';
import type { Document, Person } from '../src/core/model';
import type { BackupPayload } from '../src/core/backup';

const stubs: Record<string, string> = {
  'react-native': path.join(__dirname, 'stubs/react-native.cjs'),
  'expo-file-system': path.join(__dirname, 'stubs/expo-file-system.cjs'),
};
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return stubs[req] ?? orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { restore } = require('../src/data/backupIO') as typeof import('../src/data/backupIO');

const person = (id: string, name: string, relation: Person['relation']): Person => ({ id, name, relation, facts: {}, createdAt: '2026-11-01' });
const passport = (id: string, ownerId: string, no: string, name: string, birthDate = '1990-01-01'): Document =>
  ({ id, ownerId, type: 'passport', fields: { passportNo: no, name, birthDate, validTo: '2031-01-01' }, addedAt: '2026-11-01', files: [{ file: `${id}.jpg`, name: 'p.jpg', mime: 'image/jpeg' }] });

// A made-up backup from another phone: "You" (Riya) and her spouse.
const backup: BackupPayload = {
  app: 'casedesk', schema: 1, exportedAt: '2026-11-10T00:00:00Z',
  people: [person('p_me', 'Riya', 'self'), person('p_sp', 'Dev', 'spouse')],
  docs: [passport('d1', 'p_me', 'Z1111111', 'RIYA TEST SAMPLE'), passport('d2', 'p_sp', 'Z2222222', 'DEV TEST SAMPLE', '1989-04-04')],
  cases: [], settings: {}, files: { 'd1#0': { name: 'p.jpg', mime: 'image/jpeg', data: 'AAAA' }, 'd2#0': { name: 'p.jpg', mime: 'image/jpeg', data: 'AAAA' } },
};

test('merging the same backup twice adds nobody the second time', async () => {
  const s = new Store(memoryKV());
  // this phone: a different "You"
  await s.savePeople([person('p_me', 'Arun', 'self')]);
  await s.saveDocs([passport('d9', 'p_me', 'Z9999999', 'ARUN EXAMPLE PERSON', '1985-05-05')]);
  const r1 = await restore(s, backup, 'merge');
  assert.deepEqual(r1.added.people.sort(), ['Dev', 'Riya']);
  const r2 = await restore(s, backup, 'merge');
  assert.deepEqual(r2.added.people, []);
  assert.deepEqual(r2.skipped.people.sort(), ['Dev', 'Riya']);
  assert.equal(r2.added.docs, 0);
  const people = await s.people();
  assert.equal(people.length, 3);
  assert.equal(people.filter((p) => p.name === 'Riya').length, 1);
  assert.equal(people.filter((p) => p.relation === 'self').length, 1, 'still one "You"');
  assert.equal((await s.docs()).length, 3);
});

test('matchPeople order: passport number, then legal name + date of birth, then name', () => {
  const here = [person('a', 'Mom', 'parent'), person('b', 'Kiddo', 'child'), person('c', 'Sam', 'spouse')];
  const hereDocs = [passport('h1', 'a', 'P1', 'RIVA TEST SAMPLE', '1960-02-02'), passport('h2', 'b', 'P2', 'LEO TEST SAMPLE', '2015-03-03')];
  const incoming = [person('x', 'Mother', 'parent'), person('y', 'Leo', 'child'), person('z', 'sam ', 'spouse'), person('w', 'New', 'child')];
  const inDocs = [passport('i1', 'x', 'P1', 'OTHER NAME', '1999-01-01'), passport('i2', 'y', 'P-NEW', 'LEO TEST SAMPLE', '2015-03-03')];
  const m = matchPeople(incoming, inDocs, here, hereDocs);
  assert.deepEqual(m.get('x'), { id: 'a', by: 'passport' });
  assert.deepEqual(m.get('y'), { id: 'b', by: 'legal-name-dob' });
  assert.deepEqual(m.get('z'), { id: 'c', by: 'name' });
  assert.equal(m.get('w'), undefined);
});

test('same legal name with a different date of birth is not the same person; nobody is matched twice', () => {
  const here = [person('a', 'A', 'child')];
  const hereDocs = [passport('h1', 'a', 'P1', 'LEO TEST SAMPLE', '2015-03-03')];
  const incoming = [person('x', 'B', 'child'), person('y', 'C', 'child')];
  const inDocs = [passport('i1', 'x', 'Q1', 'LEO TEST SAMPLE', '2018-01-01'), passport('i2', 'y', 'P1', 'LEO TEST SAMPLE', '2015-03-03')];
  const m = matchPeople(incoming, inDocs, here, hereDocs);
  assert.equal(m.get('x'), undefined);
  assert.deepEqual(m.get('y'), { id: 'a', by: 'passport' });
});
