// Editable content served to the app without an app update:
//   data/content/guides.json          { "reviewed": "Dec 1, 2026", "items": [ ...same shape as app/src/data/visas.ts ] }
//   data/content/processing.json      { "asOf": "Nov 19, 2026", "items": [ { form, category, months } ] }
// Edit the JSON on the server; the app picks it up on next launch.
import fs from 'node:fs';
import path from 'node:path';

const read = (name) => {
  const f = path.resolve('data/content', name);
  if (!fs.existsSync(f)) throw Object.assign(new Error('Not published on the server — the app uses its built-in copy.'), { status: 404 });
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};

export const guides = () => read('guides.json');
export const processingTimes = () => read('processing.json');
