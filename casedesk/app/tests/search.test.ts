// v2.9 whole-app search: tolerant matching, synonyms, coverage of every route, no numbers shown.
// Made-up people and numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  addRecent, buildSearchIndex, caseViews, deriveRecord, editDistance, evaluateFamily, search, searchNorm, setToday, type SearchItem,
} from '../src/core';
import { STATIC_ITEMS } from '../src/core/search';
import { APP_SCREENS, NOT_SEARCHABLE } from '../src/content/searchScreens';
import { STARTER_NEWS } from '../src/content/news';
import { HELP } from '../src/content/help';
import { T, doc, person } from './helpers';

setToday('2026-11-18');

// a fake family: H-1B principal with a pending I-485, H-4 spouse, an L-1A relative, a case
const me = person('me', 'self', { name: 'Arun Kumar', status: 'H-1B' });
const sp = person('sp', 'spouse', { name: 'Meera Kumar', status: 'H-4' });
const l1 = person('l1', 'other', { name: 'Ravi Shankar', status: 'L-1A' });
const docs = [
  doc('me', T.passport('Z1111111', 'KUMAR', 'ARUN', '11/05/2017', '10/05/2027')),
  doc('me', T.i94('2027 June 28', '2026 March 10', 'H1B', 'Z1111111')),
  doc('me', T.approval('WAC2590123456', '10/02/2025', '10/01/2025', '09/30/2028')),
  doc('me', T.receipt('IOE0912345678', '03/01/2026', 'I485 - APPLICATION TO REGISTER PERMANENT RESIDENCE OR ADJUST STATUS')),
  doc('sp', T.ead('C26', '01/01/2026', '12/31/2026')),
  doc('l1', T.i94('2027 July 21', '2024 July 22', 'L1A', 'Y2222222')),
];
const people = [me, sp, l1];
const records = Object.fromEntries(people.map((p) => [p.id, deriveRecord(p, docs)]));
const results = evaluateFamily({ members: people.map((p) => ({ person: p, rec: records[p.id] })), docs });
const caseList = caseViews(people, records, docs, []);
const index: SearchItem[] = buildSearchIndex({ people, records, results, docs, caseList, news: STARTER_NEWS, tools: [{ id: 'travel', title: 'Can I travel?', sub: 'x' }] });
const find = (q: string) => search(index, q);
const flat = (q: string) => find(q).flatMap((g) => g.items);
const paths = (q: string) => flat(q).map((i) => i.path);

test('tolerant matching: case, dashes, partial words, small typos', () => {
  assert.equal(searchNorm('I-94'), searchNorm('i94'));
  assert.equal(searchNorm('L-2S'), 'l2s');
  assert.equal(editDistance('travle', 'travel'), 1);
  assert.ok(paths('i94').some((p) => p.startsWith('/document/')));
  assert.ok(paths('I-94').some((p) => p.startsWith('/document/')));
  assert.ok(paths('remin').some((p) => p.startsWith('/reminders/')), 'partial word');
  assert.ok(paths('remniders').some((p) => p.startsWith('/reminders/')), 'swapped letters');
  assert.ok(paths('procesing times').includes('/tools/proc'), 'missing letter');
  assert.ok(paths('BACKUP').some((p) => p === '/settings'));
  assert.ok(paths('vissa bulletin').includes('/tools/vb'));
});

test('synonyms for common terms reach the right places', () => {
  const cases: [string, (p: string[]) => boolean][] = [
    ['stamping', (p) => p.includes('/tools/waits')],
    ['extension', (p) => p.includes('/help/statuses') || p.some((x) => x.startsWith('/person/'))],
    ['transfer', (p) => p.length > 0],
    ['layoff', (p) => p.some((x) => x.startsWith('/layoff/'))],
    ['60-day grace', (p) => p.some((x) => x.startsWith('/layoff/'))],
    ['travel', (p) => p.includes('/tools/travel')],
    ['RFE', (p) => p.length > 0],
    ['biometrics', (p) => p.length > 0],
    ['interview', (p) => p.some((x) => x.startsWith('/gc/interview/'))],
    ['OPT', (p) => p.includes('/tools/guides')],
    ['STEM', (p) => p.includes('/tools/guides')],
    ['cap-gap', (p) => p.includes('/tools/guides')],
    ['H-4 EAD', (p) => p.includes('/tools/guides')],
    ['AC21', (p) => p.length > 0],
    ['portability', (p) => p.length > 0],
    ['work permit', (p) => p.some((x) => x.startsWith('/document/'))],
    ['GC', (p) => p.some((x) => x.startsWith('/gc/'))],
    ['I-797', (p) => p.some((x) => x.startsWith('/document/'))],
    ['dark mode', (p) => p.includes('/settings')],
    ['face id', (p) => p.includes('/settings')],
    ['7 year limit', (p) => p.includes('/person/l1')],
    ['6 year', (p) => p.includes('/person/me')],
    ['work location', (p) => p.includes('/person/me')],
    ['what to expect', (p) => p.some((x) => x.startsWith('/case/'))],
    ['cases like mine', (p) => p.some((x) => x.startsWith('/case/'))],
    ['citizenship test', (p) => p.includes('/tools/civics')],
    ['share with spouse', (p) => p.includes('/share')],
    ['import shared', (p) => p.includes('/share-import')],
    ['delete data', (p) => p.includes('/settings')],
    ['support', (p) => p.includes('/about')],
    ['saved posts', (p) => p.includes('/community/saved')],
    ['compose', (p) => p.includes('/community/compose')],
  ];
  for (const [q, ok] of cases) assert.ok(ok(paths(q)), `${q} → ${paths(q).join(', ')}`);
});

test('content: help full text, needs attention, document fields and dates, cases, updates, checks, visa types', () => {
  // a line deep in a help topic (not the first lines)
  const deep = HELP.find((h) => h.body.length > 3)!;
  const line = deep.body[deep.body.length - 1].split(/[.,]/)[0].split(' ').slice(0, 4).join(' ');
  assert.ok(paths(line).includes(`/help/${deep.id}`), line);
  // needs attention findings open the person
  const att = find('passport').find((g) => g.section === 'Needs attention');
  assert.ok(att?.items.every((i) => i.path.startsWith('/person/')));
  // dates as text
  assert.ok(flat('Jun 2027').some((i) => i.section === 'Documents'));
  assert.ok(flat('June 2027').some((i) => i.section === 'Documents'));
  // form, category, class
  assert.ok(flat('C26').some((i) => i.path.startsWith('/document/')));
  assert.ok(flat('I-485').some((i) => i.section === 'Cases'));
  assert.ok(flat('L1A').some((i) => i.section === 'Documents'));
  // employer read from the approval
  assert.ok(flat('acme').some((i) => i.section === 'Documents'));
  // updates stored on the phone
  const n = STARTER_NEWS[0];
  assert.ok(paths(n.title.split(' ').slice(0, 4).join(' ')).includes(`/news/${encodeURIComponent(n.id)}`));
  // what the app checks
  assert.ok(find('I-94 ended').some((g) => g.section === 'Checks'));
  // visa types with an explanation
  for (const v of ['H-1B', 'L-1A', 'L-2S', 'F-1', 'OPT', 'E-3', 'B-2']) assert.ok(find(v).some((g) => g.section === 'Visa types'), v);
});

test('numbers stay hidden: no passport or receipt number in any result line, a full receipt still finds its case', () => {
  const secret = ['Z1111111', 'Y2222222', 'WAC2590123456', 'IOE0912345678'];
  for (const it of index) for (const s of secret) { assert.ok(!(it.title + (it.sub ?? '')).includes(s), `${it.id} shows ${s}`); assert.ok(!(it.keywords ?? []).join(' ').includes(s), `${it.id} keyword ${s}`); }
  for (const q of ['travel', 'IOE', 'passport', 'Z111']) for (const it of flat(q)) for (const s of secret) assert.ok(!(it.sub ?? '').includes(s));
  const byReceipt = flat('IOE0912345678');
  assert.ok(byReceipt.some((i) => i.section === 'Cases'), 'full receipt finds the case');
  assert.ok(byReceipt.some((i) => i.section === 'Documents'), 'and the receipt notice');
  assert.ok(!flat('IOE0912').some((i) => i.section === 'Cases'), 'part of a receipt number finds nothing');
  assert.ok(!flat('Z1111111').some((i) => i.section === 'Documents'), 'a passport number never finds a document');
});

test('coverage: every route in app/ is reachable from search (or listed with a reason)', () => {
  const root = new URL('../app/', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.tsx')) files.push(p.slice(root.length - 1).replace(/\.tsx$/, '')); } };
  walk(root);
  const route = (f: string) => f.replace(/^\/\(tabs\)\/index$/, '/(tabs)').replace(/\/index$/, '') || '/';
  const re = (r: string) => new RegExp(`^${r.replace(/[()]/g, '\\$&').replace(/\[[^\]]+\]/g, '[^/]+')}$`);
  const reach = new Set(index.map((i) => i.path.split('?')[0]));
  const missing: string[] = [];
  for (const f of files) {
    if (NOT_SEARCHABLE[f]) continue;
    const r = route(f);
    if (![...reach].some((p) => re(r).test(p))) missing.push(r);
  }
  assert.deepEqual(missing, [], `not reachable: ${missing.join(', ')}`);
  // every tool of the Tools tab has an entry
  const src = readFileSync(new URL('../src/screens/tools.tsx', import.meta.url), 'utf8');
  const toolIds = [...src.slice(src.indexOf('export const TOOLS'), src.indexOf('const TILE_TONES')).matchAll(/\{ id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(toolIds.length >= 10);
  for (const id of toolIds) assert.ok(APP_SCREENS.some((s) => s.path === (id === 'news' ? '/news' : `/tools/${id}`)), `tool ${id}`);
  // the settings rows the owner listed
  for (const t of ['Appearance', 'Colour', 'Reminders', 'Back up to a file', 'iCloud backup', 'Face ID lock', 'Import shared documents', 'Share with family', 'Delete all data', 'About and support', 'Privacy']) assert.ok(index.some((i) => i.title === t), t);
});

test('recent searches and empty query', () => {
  assert.deepEqual(addRecent(['i94', 'gc'], 'I94'), ['I94', 'gc']);
  assert.deepEqual(addRecent([], 'a'), []);
  assert.equal(addRecent(Array.from({ length: 10 }, (_, i) => `q${i}`), 'new').length, 8);
  assert.deepEqual(search(index, '   '), []);
});

test('the search code never touches the network', () => {
  for (const f of ['../src/core/search.ts', '../src/core/searchIndex.ts', '../src/screens/search.tsx', '../src/data/recentSearches.ts']) {
    const s = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/fetch\(|getJSON|postJSON|XMLHttpRequest|\/api\//.test(s), f);
  }
});

test('ranking: the section with the closest match comes first (owner, Nov 2026: "Visa Bulletin" above visa stamps)', () => {
  const items = [...STATIC_ITEMS, { id: 'doc-visa', section: 'Documents' as const, title: 'Visa stamp', sub: 'ends Jun 18, 2027', path: '/document/x' }];
  const g = search(items, 'Visa Bulletin');
  assert.equal(g[0].section, 'Tools');
  assert.equal(g[0].items[0].title, 'Visa Bulletin');
});
