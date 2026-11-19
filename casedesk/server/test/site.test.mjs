import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sitePage, siteDir } from '../src/site.mjs';

test('site pages: invite page, privacy and assets are served; nothing else', () => {
  const dir = siteDir();
  assert.ok(dir, 'finds casedesk/site');
  const get = sitePage('/get', dir);
  assert.equal(get.status, 200);
  assert.match(get.headers['Content-Type'], /text\/html/);
  assert.match(String(get.body), /Immigration Wallet/);
  assert.match(get.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  for (const p of ['/get.html', '/privacy.html', '/style.css', '/links.js']) assert.equal(sitePage(p, dir).status, 200, p);
  for (const p of ['/', '/../server/.env', '/site/get.html', '/get.html/../.env', '/constructor', '/__proto__']) assert.equal(sitePage(p, dir), null, p);
  assert.equal(sitePage('/get', null).status, 404); // folder not deployed yet
});

test('invite page reads its links from links.js and says what to do when they are empty', () => {
  const html = fs.readFileSync(new URL('../../site/get.html', import.meta.url), 'utf8');
  assert.match(html, /src="links\.js"/);
  assert.match(html, /Coming soon/);
  assert.match(html, /add you as a tester/);
  assert.ok(!/code is [a-z]+ [a-z]+/i.test(html));
});
