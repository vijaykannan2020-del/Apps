// N4: no empty draft is left behind (nothing read → nothing kept; Home → save clears cd2.draft).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import path from 'node:path';

const stubs: Record<string, string> = {
  'react-native': path.join(__dirname, 'stubs/react-native.cjs'),
  'expo-file-system': path.join(__dirname, 'stubs/expo-file-system.cjs'),
};
const M = Module as any;
const orig = M._resolveFilename;
M._resolveFilename = function (req: string, ...a: any[]) { return stubs[req] ?? orig.call(this, req, ...a); };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const flow = require('../src/data/flow') as typeof import('../src/data/flow');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const doc = { id: 'doc_1', ownerId: 'me', type: 'passport' as const, fields: { passportNo: 'X1' }, addedAt: '2026-11-18', files: [] };

test('hasContent: an empty flow is not worth keeping', () => {
  assert.equal(flow.hasContent(null), false);
  assert.equal(flow.hasContent({ mode: 'missing', pids: ['me'], up: {}, where: {}, misDone: false }), false);
  assert.equal(flow.hasContent({ mode: 'missing', pids: ['me'], up: { me: { passport: undefined } }, where: {}, misDone: false }), false);
  assert.equal(flow.hasContent({ mode: 'missing', pids: ['me'], up: { me: { passport: { state: 'done', doc } } }, where: {}, misDone: false }), true);
});

test('commit (Home → save) leaves no draft, and an empty flow is never written', async () => {
  const saved: unknown[] = [];
  flow.bindDraft((d) => { saved.push(d); });
  flow.restoreDraft({ mode: 'missing', pids: ['me'], up: { me: { passport: { state: 'done', doc } } }, where: {}, misDone: false });
  assert.equal(flow.draftReady(), true);
  const added: unknown[] = [];
  const fam = { actions: { addDocs: async (d: unknown[]) => { added.push(...d); }, setFacts: async () => {} } } as never;
  const epoch = flow.flowEpoch();
  await flow.commit(fam);
  await wait(300);
  assert.equal(added.length, 1);
  assert.equal(saved.at(-1), null, 'the draft is cleared');
  assert.equal(flow.flowEpoch(), epoch + 1, 'step screens won’t restart a flow after the save');
  // a new flow with nothing in it writes null, not an empty draft
  saved.length = 0;
  const fam2 = { people: [{ id: 'me', name: 'Me', relation: 'self', facts: {}, createdAt: '' }], records: {}, docs: [], missing: {} } as never;
  flow.startFlow({ mode: 'renew', pids: ['me'], only: ['passport'] }, fam2);
  await wait(300);
  assert.ok(saved.every((d) => d === null));
  flow.endFlow();
});
