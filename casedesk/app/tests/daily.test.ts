// Daily check-in notifications: one a day, topics vary, quiet on reminder days. Made-up data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyItems } from '../src/core/daily';
import { BULLETIN } from '../src/content/bulletin';
import { person } from './helpers';

const base = { today: '2026-11-28', people: [person('a', 'self')], records: { a: { cases: [], passportExpiry: '2027-03-01' } as any }, bulletin: BULLETIN, docs: 1, cases: [], backupOn: false };

test('daily: seven days, one a day at most, never the same topic twice in a row', () => {
  const d = dailyItems(base);
  assert.equal(d.length, 7);
  assert.equal(new Set(d.map((x) => x.at)).size, 7);
  for (let i = 1; i < d.length; i++) assert.notEqual(d[i].topic, d[i - 1].topic);
  assert.ok(new Set(d.map((x) => x.topic)).size >= 5, 'a mix of topics');
  assert.ok(d.every((x) => x.title && x.body && x.url.startsWith('/')));
});

test('daily: no check-in on a day that already has a date reminder; backup tip only while backup is off', () => {
  const busy = new Set(['2026-11-30', '2026-12-02']);
  const d = dailyItems({ ...base, busyDays: busy });
  assert.ok(d.every((x) => !busy.has(x.at)));
  assert.ok(dailyItems({ ...base, backupOn: true }, 30).every((x) => x.topic !== 'backup'));
});

test('daily: the countdown names the family date', () => {
  const c = dailyItems(base, 30).find((x) => x.topic === 'countdown')!;
  assert.match(c.title, /passport expires in \d+ days/);
  assert.equal(c.url, '/person/a');
});
