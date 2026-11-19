// v2.9 compact filters (owner: people come to read updates and posts, not tabs): one scrolling chip row
// on Updates, the Community sort as a menu button, the pinned Welcome card and Start a conversation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { topicOrder } from '../src/core/updates';
import { ALL_TAGS, POST_TYPES, STARTERS, STARTERS_BELOW, WELCOME_POINTS, composePrefill, showStarters, sortLabel } from '../src/core/community';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');

test('Updates chips: Green card, Fees, then the visa types, then the rest A–Z, no duplicates', () => {
  assert.deepEqual(topicOrder(['Wages', 'TN', 'Fees', 'I-9', 'H-1B', 'Green card', 'L-1', 'H-4', 'STEM OPT', 'H-1B']), ['Green card', 'Fees', 'H-1B', 'H-4', 'L-1', 'TN', 'STEM OPT', 'I-9', 'Wages']);
  assert.deepEqual(topicOrder([]), []);
});

test('Updates screen: no intro line, compact segmented control, one scrolling row of small chips', () => {
  const s = src('screens/news.tsx');
  assert.ok(!s.includes('Rule changes from USCIS, DHS, DOL and State'), 'intro sentence dropped');
  assert.ok(!/<Chips\b/.test(s), 'no wrapping chip grid (Home or the full list)');
  assert.equal((s.match(/<ChipRow\b/g) || []).length, 2, 'Home and the full list');
  assert.equal((s.match(/<Segmented compact\b/g) || []).length, 2);
  assert.ok(/size="sm"/.test(s));
  const kit = src('ui/kit.tsx');
  assert.match(kit, /hitSlop=\{\{ top: 6, bottom: 6, left: 2, right: 2 \}\}[\s\S]{0,400}height: 32/, '32 pt chip, 44 pt hit area');
  assert.match(kit, /horizontal showsHorizontalScrollIndicator=\{false\}[\s\S]{0,200}flex: 1/, 'one row that scrolls');
});

test('Community header: search is a button, the sort is a menu button on the chip row, disclaimer is a caption', () => {
  const s = src('screens/community.tsx');
  assert.match(s, /IconButton plain icon="search" label="Search posts"/);
  assert.match(s, /<ChipRow [^>]*lead=\{<TourTarget id="sort"><MenuButton/);
  assert.ok(!s.includes('<Hint>{COMMUNITY_DISCLAIMER}</Hint>'), 'no disclaimer above the feed');
  assert.ok(!s.includes('Search posts — stamping'), 'no full-width search field');
});

test('sort button label', () => {
  assert.equal(sortLabel('hot', 'week'), 'Hot');
  assert.equal(sortLabel('unanswered', 'day'), 'Unanswered');
  assert.equal(sortLabel('top', 'week'), 'Top · Week');
  assert.equal(sortLabel('top', 'all'), 'Top · All time');
});

test('Start a conversation: 4 prompts with a real type and tag; only under a short feed, never while searching', () => {
  assert.equal(STARTERS.length, 4);
  for (const s of STARTERS) { assert.ok(POST_TYPES.some((t) => t.id === s.type), s.id); assert.ok(ALL_TAGS.includes(s.tag), s.tag); }
  const pin = { pinned: true }, post = {};
  assert.equal(showStarters({ posts: null, query: '' }), false, 'still loading');
  assert.equal(showStarters({ posts: [], query: '' }), true);
  assert.equal(showStarters({ posts: [pin, post], query: '' }), true, 'the pinned post does not count');
  assert.equal(showStarters({ posts: [pin, ...Array(STARTERS_BELOW).fill(post)], query: '' }), false);
  assert.equal(showStarters({ posts: [post], query: 'rfe' }), false);
  assert.equal(showStarters({ posts: [post], query: '', error: 'offline' }), false);
});

test('compose prefill from a prompt: type and tag picked, the family tag added, junk ignored', () => {
  assert.deepEqual(composePrefill({ type: 'timeline', tag: 'Green card' }, ['L-1', 'L-2']), { type: 'timeline', tags: ['Green card', 'L-1'] });
  assert.deepEqual(composePrefill({ type: 'discussion', tag: 'L-1' }, ['L-1']), { type: 'discussion', tags: ['L-1'] });
  assert.deepEqual(composePrefill({ type: 'nope', tag: '<b>' }, []), { type: 'question', tags: [] });
  assert.deepEqual(composePrefill({}, ['H-1B']), { type: 'question', tags: ['H-1B'] }, 'plain New post as before');
});

test('pinned Welcome card: three rules, no downvote and no report menu on the official post', () => {
  assert.equal(WELCOME_POINTS.length, 3);
  assert.match(WELCOME_POINTS.map((w) => w.text).join(' '), /receipt[\s\S]*kind[\s\S]*legal advice/i);
  const c = src('screens/communityCards.tsx');
  assert.match(c, /if \(p\.pinned\) return <PinnedCard/);
  assert.match(c, /noDown=\{p\.official\}/);
  assert.match(c, /p\.deleted \|\| p\.official \? null : <ActionButton icon="more"/);
});
