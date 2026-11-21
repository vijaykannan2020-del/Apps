import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefFromAbstract, sentences } from '../src/news.mjs';

test('sentences keep abbreviations together', () => {
  assert.deepEqual(sentences('U.S. employers must file. See 8 C.F.R. 214.2 for details. Done.'), ['U.S. employers must file.', 'See 8 C.F.R. 214.2 for details.', 'Done.']);
});

test('final rule: summary plus up to 3 abstract points and the effective date', () => {
  const b = briefFromAbstract({
    title: 'H-1B rule', docType: 'Rule', effective: '2027-01-17',
    abstract: 'DHS is amending its H-1B regulations. It streamlines eligibility. It extends cap-gap to April 1. Employers must show a real position. DHS will expand site visits.',
  });
  assert.equal(b.summary, 'DHS is amending its H-1B regulations. It streamlines eligibility.');
  assert.equal(b.points.length, 4);
  assert.equal(b.points.at(-1), 'Takes effect: January 17, 2027.');
});

test('proposed rule: says nothing changes yet and gives the comment deadline', () => {
  const b = briefFromAbstract({ title: 'Fees', docType: 'Proposed Rule', commentsClose: '2027-02-03', abstract: 'USCIS proposes to adjust certain immigration benefit request fees.' });
  assert.match(b.points[0], /nothing changes yet/);
  assert.equal(b.points[1], 'Public comments are open until February 3, 2027.');
});

test('no abstract: title becomes the summary, never more than 5 points', () => {
  const b = briefFromAbstract({ title: 'Notice of something', docType: 'Notice' });
  assert.equal(b.summary, 'Notice of something');
  assert.deepEqual(b.points, []);
});
