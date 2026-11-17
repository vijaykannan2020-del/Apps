import fs from 'node:fs';
import readline from 'node:readline';

// Minimal streaming CSV/TSV reader (handles quotes, commas in quotes, BOM, UTF-16 files from USCIS).
export function parseLine(line, sep = ',') {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectEncoding(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(2);
  fs.readSync(fd, b, 0, 2, 0);
  fs.closeSync(fd);
  return b[0] === 0xff && b[1] === 0xfe ? 'utf16le' : 'utf8';
}

export async function* readRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: detectEncoding(file) }), crlfDelay: Infinity });
  let header = null, sep = ',';
  for await (let line of rl) {
    line = line.replace(/^﻿/, '');
    if (!line.trim()) continue;
    if (!header) {
      sep = line.split('\t').length > line.split(',').length ? '\t' : ',';
      header = parseLine(line, sep);
      continue;
    }
    const cells = parseLine(line, sep);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    yield row;
  }
}
