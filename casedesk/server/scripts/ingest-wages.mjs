// Build data/wages.json from the OFLC wage files.
// 1) Download the yearly "OFLC Wages" zip from https://flag.dol.gov/wage-data/wage-data-downloads
// 2) Unzip it, e.g. into data/raw/oflc
// 3) node scripts/ingest-wages.mjs data/raw/oflc 2026-27
import fs from 'node:fs';
import path from 'node:path';
import { readRows } from '../src/csv.mjs';

const [dir = 'data/raw/oflc', wageYear = '2026-27'] = process.argv.slice(2);
const find = (re) => {
  const f = fs.readdirSync(dir).find((n) => re.test(n));
  if (!f) throw new Error(`Missing file matching ${re} in ${dir}`);
  return path.join(dir, f);
};
const col = (row, ...names) => {
  for (const n of names) {
    const k = Object.keys(row).find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === n);
    if (k !== undefined) return row[k];
  }
  return '';
};

const wages = {};
let n = 0;
for await (const r of readRows(find(/^alc_export.*\.csv$/i))) {
  const area = col(r, 'area');
  const soc = col(r, 'soccode');
  const lv = ['level1', 'level2', 'level3', 'level4'].map((l) => parseFloat(col(r, l)));
  if (area && soc && lv.every((x) => x > 0)) { wages[`${area}|${soc}`] = lv; n++; }
}

// Geography.csv maps every county / town to its OFLC wage area (MSA or non-metro area) — same as FLAG.
const areaMap = new Map();
const geo = [];
const stateNames = {};
for await (const r of readRows(find(/^geography.*\.csv$/i))) {
  const code = col(r, 'area');
  if (!code) continue;
  const st = col(r, 'stateab');
  const a = areaMap.get(code) || { code, name: col(r, 'areaname'), state: st, counties: [] };
  const county = col(r, 'countytownname');
  if (county && !a.counties.includes(county)) a.counties.push(county);
  areaMap.set(code, a);
  if (st && county) { geo.push({ state: st, county, area: code }); stateNames[st] = col(r, 'state') || st; }
}

const soc = [];
for await (const r of readRows(find(/^oes_soc_occs.*\.csv$/i))) {
  const code = col(r, 'soccode');
  if (code) soc.push({ code, title: col(r, 'title') });
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/wages.json', JSON.stringify({ wageYear, wages, areas: [...areaMap.values()], soc, geo, states: Object.entries(stateNames).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)) }));
console.log(`Saved ${n.toLocaleString()} wage rows, ${areaMap.size} areas, ${soc.length} occupations for wage year ${wageYear}.`);
