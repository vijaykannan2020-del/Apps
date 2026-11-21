// v3.0: Discuss in Community from an update — pre-filled Discussion, quoted update, Community tags only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, draftProblem, newsPostUntouched, newsPrefill } from '../src/core/community';

const item = { title: 'Modernizing H-1B Requirements on Regulations.gov', summary: 'DHS is changing H-1B rules.', points: ['Cap-gap runs to April 1.', 'Takes effect: January 17, 2027.'], tags: ['H-1B', 'OPT', 'Fees'], url: 'https://www.federalregister.gov/d/2024-29354', agency: 'DHS' };

test('prefill: discussion, link-free title, quoted update, Community tags only', () => {
  const p = newsPrefill(item, 'Dec 18, 2024', ['L-1']);
  assert.equal(p.type, 'discussion');
  assert.equal(p.title, 'Modernizing H-1B Requirements on Regulations gov');
  assert.deepEqual(p.tags, ['H-1B', 'OPT']);
  assert.match(p.body, /^\n\n— About this update —\nModernizing H-1B Requirements on Regulations.gov \(DHS, Dec 18, 2024\)\nDHS is changing H-1B rules\.\n• Cap-gap runs to April 1\.\n• Takes effect: January 17, 2027\.\nSource: https:\/\/www\.federalregister\.gov/);
});

test('prefill: no Community tags on the update → the family’s first tag', () => {
  assert.deepEqual(newsPrefill({ ...item, tags: ['I-9'] }, 'x', ['L-1', 'L-2']).tags, ['L-1']);
});

test('long titles are cut at a word within the limit', () => {
  const p = newsPrefill({ ...item, title: 'Word '.repeat(60).trim() }, 'x');
  assert.ok(p.title.length <= LIMITS.title[1]);
  assert.ok(p.title.endsWith('Word…'));
  assert.equal(draftProblem({ type: p.type, title: p.title, body: p.body, tags: p.tags }), null);
});

test('untouched until the person writes something above the quote', () => {
  const p = newsPrefill(item, 'x');
  assert.equal(newsPostUntouched(p.body), true);
  assert.equal(newsPostUntouched(`Does this change cap-gap for STEM OPT?${p.body}`), false);
  assert.equal(newsPostUntouched('A normal post with no quote at all.'), false);
});
