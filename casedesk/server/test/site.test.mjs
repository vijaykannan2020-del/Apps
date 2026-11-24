import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, isSiteHost, handleSite } from '../src/site.mjs';

const run = (host, url) => new Promise((done) => {
  const out = { status: 0, headers: {}, body: '' };
  const res = { writeHead(s, h = {}) { out.status = s; out.headers = h; }, end(b) { out.body = b ? String(b) : ''; done(out); } };
  const handled = handleSite({ method: 'GET', url, headers: { host } }, res);
  if (!handled) done(null);
});

test('maps paths to site files', () => {
  assert.equal(resolve('/'), 'home.html');
  assert.equal(resolve('/immigration-wallet/'), 'get.html');
  assert.equal(resolve('/immigration-wallet/privacy'), 'privacy.html');
  assert.equal(resolve('/immigration-wallet/privacy.html'), 'privacy.html');
  assert.equal(resolve('/immigration-wallet/support'), 'support.html');
  assert.equal(resolve('/immigration-wallet/style.css'), 'style.css');
  assert.equal(resolve('/style.css'), 'style.css');
  assert.equal(resolve('/../server.mjs'), null);
  assert.equal(resolve('/immigration-wallet/../../etc/passwd'), null);
  assert.equal(resolve('/privacy'), null);
});

test('only site hosts are handled', async () => {
  assert.ok(isSiteHost('tharamaya.com'));
  assert.ok(!isSiteHost('casedeskapp.duckdns.org'));
  assert.equal(await run('casedeskapp.duckdns.org', '/'), null);
});

test('www redirects, pages render, support gets community rules', async () => {
  const w = await run('www.tharamaya.com', '/immigration-wallet/privacy');
  assert.equal(w.status, 301);
  assert.equal(w.headers.Location, 'https://tharamaya.com/immigration-wallet/privacy');
  const home = await run('tharamaya.com', '/');
  assert.equal(home.status, 200);
  assert.match(home.body, /Immigration Wallet/);
  const sup = await run('tharamaya.com:443', '/immigration-wallet/support');
  assert.equal(sup.status, 200);
  assert.match(sup.body, /Reporting and blocking/);
  assert.match(sup.body, /Common questions/);
  assert.equal((await run('tharamaya.com', '/nope')).status, 404);
});
