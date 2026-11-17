// Employer search across H-1B (USCIS Data Hub), PERM and LCA (DOL), from data/employers.json.
import fs from 'node:fs';
import path from 'node:path';
import { keyOf } from './keys.mjs';

let db = null;
let mtime = 0;
const load = () => {
  const f = path.resolve('data/employers.json');
  if (!fs.existsSync(f)) return null;
  const m = fs.statSync(f).mtimeMs;
  if (!db || m !== mtime) { db = Object.entries(JSON.parse(fs.readFileSync(f, 'utf8'))); mtime = m; }
  return db;
};
const err = (status, message) => Object.assign(new Error(message), { status });

export function h1bStatus() {
  const d = load();
  return d ? { loaded: true, employers: d.length } : { loaded: false };
}

const shape = (e) => ({
  name: e.name,
  state: e.state,
  h1b: Object.entries(e.h1b).map(([fy, v]) => ({ fy, ...v })),
  perm: Object.entries(e.perm).map(([fy, v]) => ({ fy, ...v })),
  lca: Object.entries(e.lca).map(([fy, v]) => ({ fy, ...v })),
});
const volume = (e) => Object.values(e.h1b).reduce((s, y) => s + y.initialApproval + y.continuingApproval, 0)
  + Object.values(e.perm).reduce((s, y) => s + y.certified, 0) + Object.values(e.lca).reduce((s, y) => s + y.certified, 0);

export function employer(q) {
  const d = load(); if (!d) throw err(503, 'Employer data not loaded yet.');
  const k = keyOf(q);
  if (k.length < 2) return { items: [] };
  const words = k.split(' ');
  const hits = d.filter(([key]) => words.every((w) => key.includes(w)));
  hits.sort((a, b) => (b[0].startsWith(k) - a[0].startsWith(k)) || volume(b[1]) - volume(a[1]));
  return { items: hits.slice(0, 10).map(([, e]) => shape(e)) };
}

export function top(fy, type = 'initial', n = 10) {
  const d = load(); if (!d) throw err(503, 'Employer data not loaded yet.');
  const f = type === 'continuing' ? 'continuingApproval' : 'initialApproval';
  const items = d.filter(([, e]) => e.h1b[fy]).map(([, e]) => ({ label: e.name, value: e.h1b[fy][f] }))
    .sort((a, b) => b.value - a.value).slice(0, n);
  return { fy, type, items };
}
