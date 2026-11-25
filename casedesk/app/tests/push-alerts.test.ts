// Server alerts sign-up (news + Visa Bulletin): what the phone sends. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushTopics, newsTopicsText } from '../src/core/notify';
import { person } from './helpers';

const rec = (extra: any) => ({ cases: [], ...extra }) as any;

test('push topics: family visa tags, important news only by default, no bulletin without an I-140', () => {
  const p = person('a', 'self', { status: 'H-1B' as any });
  const t = pushTopics({}, [p], { a: rec({ visa: 'H-1B' }) });
  assert.deepEqual(t.news, { enabled: true, tags: ['H-1B'], importantOnly: true, webNews: false });
  assert.equal(t.bulletin.enabled, false);
  assert.equal(newsTopicsText(t), 'H-1B');
});

test('push topics: I-140 category and chargeability go to the bulletin; switches are respected', () => {
  const p = person('a', 'self', { facts: { location: 'US', gc: { chargeability: 'india' } } as any });
  const records = { a: rec({ cases: [{ form: 'I-140', category: 'E21', priorityDate: '2015-01-01' }] }) };
  const t = pushTopics({}, [p], records);
  assert.deepEqual(t.bulletin, { enabled: true, country: 'india', categories: ['EB-2'] });
  const off = pushTopics({ alerts: { bulletin: false, news: false, newsAll: true } }, [p], records);
  assert.equal(off.bulletin.enabled, false);
  assert.equal(off.news.enabled, false);
  assert.equal(off.news.importantOnly, false);
});

test('push topics: nothing personal is sent', () => {
  const p = person('Made Up Name', 'self', { facts: { location: 'US', gc: { chargeability: 'china' } } as any });
  const t = pushTopics({}, [p], { 'Made Up Name': rec({ cases: [{ form: 'I-140', category: 'EB3', priorityDate: '2019-05-05', receipt: 'IOE0000000000' }] }) });
  const s = JSON.stringify(t);
  for (const bad of ['Made Up Name', '2019-05-05', 'IOE0000000000']) assert.ok(!s.includes(bad), bad);
});
