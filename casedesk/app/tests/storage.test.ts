import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, KEYS } from '../src/data/store';
import { memoryKV } from '../src/data/kv';

test('versioned keys, corrupt blobs are set aside, delete-all keeps the old app’s keys', async () => {
  const kv = memoryKV({ 'cd.profile.v1': '{"old":true}', [KEYS.cases]: 'not json' });
  const s = new Store(kv);
  assert.deepEqual(await s.cases(), []);
  assert.equal(await kv.getItem(`${KEYS.cases}.bad`), 'not json');
  await s.upsertPerson({ id: 'me', name: 'Me', relation: 'self', facts: {}, createdAt: '2026-11-18' });
  assert.equal((await s.people()).length, 1);
  assert.ok(JSON.parse((await kv.getItem(KEYS.people))!).v === 1);
  const backup = await s.exportJSON();
  await s.deleteAll();
  assert.equal((await s.people()).length, 0);
  assert.equal(await kv.getItem('cd.profile.v1'), '{"old":true}');
  await s.importJSON(backup);
  assert.equal((await s.people()).length, 1);
});
