// Quick self-test of parsing/normalising logic (no network needed).
import assert from 'node:assert';
import fs from 'node:fs';
import { normalize } from '../src/uscis.mjs';
import { parseLine } from '../src/csv.mjs';

const sample = { case_status: { receiptNumber: 'EAC9999103402', formType: 'I-130', submittedDate: '09-05-2023 14:28:39', modifiedDate: '09-05-2023 14:28:39', current_case_status_text_en: 'Case Approval Was Reaffirmed And Mailed Back To Department Of State', current_case_status_desc_en: 'On September 5, 2023 we reaffirmed…', hist_case_status: null } };
const n = normalize('EAC9999103402', sample);
assert.equal(n.form, 'I-130');
assert.equal(n.history.length, 1);
assert.ok(n.status.startsWith('Case Approval'));

assert.deepEqual(parseLine('a,"b, c",d'), ['a', 'b, c', 'd']);
assert.deepEqual(parseLine('x\t"y"\tz', '\t'), ['x', 'y', 'z']);
console.log('smoke ok', fs.existsSync('data/wages.json') ? '(wages loaded)' : '(no wage data yet)');
