// v2.6: Live check mode for /api/health and receipt redaction in error logs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uscisMode, redactPath, normalize } from '../src/uscis.mjs';

test('uscisMode: null without keys, sandbox for api-int, production otherwise', () => {
  assert.equal(uscisMode({}), null);
  assert.equal(uscisMode({ USCIS_CLIENT_ID: 'a', USCIS_CLIENT_SECRET: 'b', USCIS_API_BASE: 'https://api-int.uscis.gov/case-status' }), 'sandbox');
  assert.equal(uscisMode({ USCIS_CLIENT_ID: 'a', USCIS_CLIENT_SECRET: 'b', USCIS_API_BASE: 'https://api.uscis.gov/case-status' }), 'production');
});

test('redactPath never keeps a receipt', () => {
  assert.equal(redactPath('/api/case/IOE0000000001'), '/api/case/[receipt]');
  assert.equal(redactPath('/x/ioe0000000001/y'), '/x/[receipt]/y');
  assert.equal(redactPath('/api/news'), '/api/news');
});

test('normalize: synthetic Torch answer', () => {
  const n = normalize('IOE0000000001', { case_status: { formType: 'I-485', current_case_status_text_en: 'Case Was Received', current_case_status_desc_en: 'On March 2, 2026, we received…', modifiedDate: '2026-03-05T10:00:00Z', hist_case_status: [{ date: '2026-03-02', completed_text_en: 'Case Was Received' }] } });
  assert.equal(n.status, 'Case Was Received'); assert.equal(n.updated, '2026-03-05'); assert.equal(n.history[0].status, 'Case Was Received');
});
