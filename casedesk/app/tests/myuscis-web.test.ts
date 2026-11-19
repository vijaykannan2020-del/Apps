// v2.6 in-app WebView helpers: signed-in detection, no injection on sign-in pages, nonce-checked messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignedInUrl, isAuthPage, allowedMyuscisHost, allowedEgovHost, myuscisFetchScript, egovScript, readWebMessage } from '../src/core/myuscisWeb';

test('signed-in detection: only my.uscis.gov/account pages that are not sign-in pages', () => {
  assert.equal(isSignedInUrl('https://my.uscis.gov/account'), true);
  assert.equal(isSignedInUrl('https://my.uscis.gov/account/applicant'), true);
  assert.equal(isSignedInUrl('https://my.uscis.gov/account/sign-in'), false);
  assert.equal(isSignedInUrl('https://myaccount.uscis.gov/sign-in'), false);
  assert.equal(isSignedInUrl('https://my.uscis.gov/account/mfa?x=1'), false);
  assert.equal(isSignedInUrl('https://evil.example/account'), false);
  assert.equal(isSignedInUrl('https://my.uscis.gov.evil.example/account'), false);
  assert.equal(isAuthPage('https://myaccount.uscis.gov/sign-in'), true);
  assert.equal(isAuthPage('https://my.uscis.gov/account/applicant'), false);
});

test('navigation stays on USCIS hosts', () => {
  assert.ok(allowedMyuscisHost('https://myaccount.uscis.gov/sign-in'));
  assert.ok(allowedMyuscisHost('https://my.uscis.gov/account'));
  assert.ok(!allowedMyuscisHost('https://uscis.gov.evil.example/'));
  assert.ok(!allowedMyuscisHost('http://my.uscis.gov/account'), 'https only');
  assert.ok(allowedEgovHost('https://egov.uscis.gov/casestatus/landing.do'));
  assert.ok(!allowedEgovHost('https://example.com'));
});

test('fetch script: four relative links, credentials include, host guard, nonce; no password fields touched', () => {
  const s = myuscisFetchScript('IOE0000000001', 'n1');
  assert.match(s, /location\.hostname !== 'my\.uscis\.gov'/);
  assert.match(s, /credentials: 'include'/);
  for (const p of ['/account/case-service/api/cases/IOE0000000001', '/account/case-service/api/case_status/IOE0000000001', '/secure-messaging/api/case-service/receipt_info/IOE0000000001', '/account/case-service/api/cases/IOE0000000001/documents']) assert.ok(s.includes(p), p);
  assert.ok(!/password|input|cookie|localStorage/i.test(s));
  const e = egovScript('IOE0000000001', 'n2');
  assert.ok(!/password|cookie|localStorage|\.click\(\)|submit\(\)/i.test(e), 'egov script never presses buttons itself');
});

test('messages: wrong nonce or junk ignored', () => {
  assert.equal(readWebMessage('{"type":"egov-text","nonce":"x","text":"hi"}', 'y'), null);
  assert.equal(readWebMessage('not json', 'y'), null);
  assert.equal(readWebMessage('{"type":"other","nonce":"y"}', 'y'), null);
  assert.equal(readWebMessage('{"type":"egov-text","nonce":"y","text":"hi"}', 'y')!.type, 'egov-text');
});

import { describeResult, needsFallback, readPageScript, isEndpointUrl } from '../src/core/myuscisWeb';
test('sync details: data null, non-JSON, 401 and good answers are told apart; method B script reads only API pages', () => {
  const nul = describeResult({ id: 'case', status: 200, text: '{"data":null,"error":{"userMessage":null,"requestId":"r-1"}}' }, 'A');
  assert.deepEqual([nul.json, nul.dataNull, nul.requestId, nul.ok], [true, true, 'r-1', false]);
  assert.ok(needsFallback(nul));
  const html = describeResult({ id: 'case', status: 200, text: '<html>Sign in</html>' }, 'A');
  assert.deepEqual([html.json, html.ok], [false, false]);
  const unauth = describeResult({ id: 'case', status: 401, text: '{"error":"unauthorized"}' }, 'A');
  assert.equal(unauth.ok, false);
  const good = describeResult({ id: 'case', status: 200, text: '{"data":{"receiptNumber":"IOE0000000001"}}' }, 'B');
  assert.deepEqual([good.ok, good.method, good.size > 10], [true, 'B', true]);
  assert.match(readPageScript('n'), /\\\/api\\\//);
  assert.ok(isEndpointUrl('https://my.uscis.gov/account/case-service/api/cases/IOE0000000001'));
  assert.ok(!isEndpointUrl('https://my.uscis.gov/account/applicant'));
});
