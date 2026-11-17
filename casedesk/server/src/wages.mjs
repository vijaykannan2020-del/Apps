// DOL OFLC prevailing wages, loaded from data/wages.json (built by scripts/ingest-wages.mjs).
import fs from 'node:fs';
import path from 'node:path';

let db = null;
function load() {
  if (db) return db;
  const file = path.resolve('data/wages.json');
  if (!fs.existsSync(file)) return null;
  db = JSON.parse(fs.readFileSync(file, 'utf8'));
  return db;
}

const err = (status, message) => Object.assign(new Error(message), { status });
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');

export function wageStatus() {
  const d = load();
  return d ? { loaded: true, wageYear: d.wageYear, rows: Object.keys(d.wages).length } : { loaded: false };
}

export function searchSoc(q) {
  const d = load(); if (!d) throw err(503, 'Wage data not loaded yet.');
  const n = norm(q);
  const items = d.soc.filter((s) => s.code.startsWith(q) || norm(s.title).includes(n)).slice(0, 15);
  return { items };
}

export function searchArea(q) {
  const d = load(); if (!d) throw err(503, 'Wage data not loaded yet.');
  const n = norm(q);
  const items = d.areas.filter((a) => norm(a.name).includes(n) || a.counties?.some((c) => norm(c).includes(n))).slice(0, 15)
    .map(({ code, name, state }) => ({ code, name, state }));
  return { items };
}

export function wage(soc, area) {
  const d = load(); if (!d) throw err(503, 'Wage data not loaded yet.');
  const w = d.wages[`${area}|${soc}`];
  if (!w) throw err(404, 'No DOL wage for that occupation in that area. Try the nearest metro area or check FLAG.');
  const s = d.soc.find((x) => x.code === soc);
  const a = d.areas.find((x) => x.code === area);
  return { soc, title: s?.title ?? soc, area, areaName: a?.name ?? area, hourly: w, wageYear: d.wageYear };
}

export function states() {
  const d = load(); if (!d) throw err(503, 'Wage data not loaded yet.');
  return { items: d.states || [] };
}

export function counties(state) {
  const d = load(); if (!d) throw err(503, 'Wage data not loaded yet.');
  const names = Object.fromEntries(d.areas.map((a) => [a.code, a.name]));
  const items = (d.geo || []).filter((g) => g.state === state)
    .map((g) => ({ county: g.county, area: g.area, areaName: names[g.area] || g.area }))
    .sort((a, b) => a.county.localeCompare(b.county));
  return { items };
}
