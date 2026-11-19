// Invite text and install links (v2.9). Fake names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareInviteText, appInviteText, firstName } from '../src/core/invite';
import { APP_STORE_URL, INVITE_URL } from '../src/content/links';

test('invite text: first name, install link, steps, never a code', () => {
  const t = shareInviteText('Sam Doe', INVITE_URL);
  assert.match(t, /^Sam shared immigration documents/);
  assert.ok(t.includes(INVITE_URL));
  assert.match(t, /Enter the 6-word code I tell you/);
  assert.doesNotMatch(t, /code:\s*\w/i);
  assert.match(shareInviteText('', INVITE_URL), /^Someone in your family/);
  assert.equal(firstName('me'), '');
  assert.ok(appInviteText('Alex Doe', INVITE_URL).includes(INVITE_URL));
});

test('install link: App Store only, same value in the app and on the invite page', () => {
  assert.match(APP_STORE_URL, /^https:\/\/apps\.apple\.com\/app\/id\d+$/);
  const js = readFileSync(new URL('../../site/links.js', import.meta.url), 'utf8');
  assert.ok(js.includes(`appStore: '${APP_STORE_URL}'`));
  const html = readFileSync(new URL('../../site/get.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /testflight/i);
});
