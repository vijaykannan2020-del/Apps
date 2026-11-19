// v2.6 sync storage: snapshots per case, changes + badge, raw data, Live check availability gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV } from '../src/data/kv';
import { _useKV, saveSync, loadSync, markSeen, saveRaw, readRaw, liveAvailable, dismissNotice } from '../src/data/myuscis';
import { parseMyuscis, liveToPart, type ParseOk } from '../src/core/myuscis';
import type { Case } from '../src/core/model';
import type { CaseView } from '../src/core/cases';

const R = 'IOE0000000001';
const view: CaseView = { id: 'me:' + R, receipt: R, form: 'I-485', name: 'Green card application', ownerId: 'me', status: 'Pending', keyDates: [], history: [], docIds: [] };
let saved: Case | null = null;
const actions = { editCase: async (_v: CaseView, fn: (c: Case) => Case) => { saved = fn(saved ?? { id: 'c1', receipt: R, ownerId: 'me', keyDates: [], history: [] }); } };
const live = (o = {}) => liveToPart({ receipt: R, form: 'I-485', status: 'Case Was Received', updated: '2026-03-05', history: [{ date: '2026-03-05', status: 'Case Was Received' }], ...o }) as ParseOk;

test('saveSync stores snapshots, writes the case, sets the badge only when something changed', async () => {
  _useKV(memoryKV());
  const r1 = await saveSync(view, [live()], actions, { source: 'live', foreground: true });
  assert.ok(r1.ok && r1.diff.first);
  let s = await loadSync();
  assert.equal(s.cases[view.id].snaps.length, 1);
  assert.equal(s.cases[view.id].unseen, undefined);
  assert.ok(saved!.history.some((h) => h.text === 'Case Was Received'));
  const r2 = await saveSync(view, [live({ updated: '2026-04-01' })], actions, { source: 'live', foreground: true });
  assert.ok(r2.ok && r2.diff.silent);
  s = await loadSync();
  assert.equal(s.cases[view.id].unseen, true);
  assert.equal(s.cases[view.id].changes!.silentAt, '2026-04-01');
  await markSeen(view.id);
  assert.equal((await loadSync()).cases[view.id].unseen, false);
  await dismissNotice(view.id, 'k1');
  assert.deepEqual((await loadSync()).cases[view.id].dismissed, ['k1']);
});

test('data:null is never saved', async () => {
  _useKV(memoryKV());
  const p = parseMyuscis('{"data":null,"error":{"requestId":"r"}}');
  assert.equal(p.ok, false);
  const r = await saveSync(view, [], actions, { source: 'web', foreground: true });
  assert.equal(r.ok, false);
  assert.equal((await loadSync()).cases[view.id], undefined);
});

test('raw data is kept for one case for support sharing', async () => {
  _useKV(memoryKV());
  await saveRaw(view.id, [{ id: 'case', method: 'A', status: 200, text: '{"data":null}' }]);
  assert.match((await readRaw(view.id))!, /"method": "A"/);
  assert.equal(await readRaw('other'), null);
});

test('Live check shows only with production keys', async () => {
  assert.equal(await liveAvailable(async () => ({ uscis: true, uscisMode: 'production' }) as any), true);
  assert.equal(await liveAvailable(async () => ({ uscis: true, uscisMode: 'sandbox' }) as any), false);
  assert.equal(await liveAvailable(async () => ({ uscis: false, uscisMode: null }) as any), false);
  assert.equal(await liveAvailable(async () => { throw new Error('offline'); }), false);
});
