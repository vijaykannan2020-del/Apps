// QA v4 P2: paste-back accepts only real USCIS status text (junk, partial and full-page copies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaseText, isKnownHeading } from '../src/core/uscis';

test('junk is rejected', () => {
  for (const junk of [
    'Groceries for the weekend: milk, eggs, bread, coffee and fruit for the trip',
    'Call the school about the field trip on Friday and bring the signed form back',
    'On November 1, 2026, we went to the park and had a picnic with the kids.', // "On <date>, we" but no form / receipt
    'Meeting notes\nWe approved the budget for next quarter and the new laptop request.',
    'Case study: how we approved our design in one week (blog post)',
  ]) assert.equal(parseCaseText(junk), null, junk);
});

test('partial copies: a known heading alone, or an explanation that names a form or receipt', () => {
  const h = parseCaseText('Case Was Approved\n');
  assert.equal(h?.status, 'Case Was Approved');
  const e = parseCaseText('On October 1, 2026, we approved your Form I-765, Application for Employment Authorization.');
  assert.equal(e?.status, 'Case Was Approved');
  assert.equal(e?.form, 'I-765');
  assert.equal(e?.date, '2026-10-01');
  const r = parseCaseText('As of November 3, 2026, we are actively reviewing your case, Receipt Number IOE0912345678.');
  assert.equal(r?.status, 'Case Is Being Actively Reviewed By USCIS');
  assert.equal(parseCaseText('Approved'), null, 'too short / not a heading');
});

test('full-page copy with menus and footer', () => {
  const page = `Skip to main content
An official website of the United States government
Case Status Online
Enter a Receipt Number
IOE0912345678
Check Status
Response To USCIS’ Request For Evidence Was Received
On November 12, 2026, we received your response to our Request for Evidence for your Form I-129, Petition for a Nonimmigrant Worker, Receipt Number IOE0912345678. USCIS has begun working on your case again.
Need help? Contact us
USCIS.gov | Privacy | Accessibility`;
  const p = parseCaseText(page, 'IOE0912345678')!;
  assert.equal(p.status, 'Response To USCIS’ Request For Evidence Was Received');
  assert.equal(p.form, 'I-129');
  assert.equal(p.date, '2026-11-12');
  assert.ok(isKnownHeading('Case Was Received and A Receipt Notice Was Sent'));
  assert.ok(isKnownHeading('New Card Is Being Produced'));
  assert.ok(!isKnownHeading('Groceries for the weekend'));
});

test('explanations with any wording after the date keep their date and form (As of … fingerprints …)', () => {
  const p = parseCaseText('As of November 3, 2026, fingerprints relating to your Form I-485, Application to Register Permanent Residence or Adjust Status, Receipt Number IOE0912345678, have been applied to your case.')!;
  assert.ok(p, 'accepted');
  assert.equal(p.date, '2026-11-03');
  assert.equal(p.form, 'I-485');
  assert.equal(p.status, 'Case Was Updated To Show Fingerprints Were Taken');
  const q = parseCaseText('On October 30, 2026, the post office delivered your new card for Receipt Number IOE0912345678, to the address that you gave us.')!;
  assert.equal(q.date, '2026-10-30');
  assert.equal(q.status, 'Card Was Delivered To Me By The Post Office');
  // still junk without a form or receipt number
  assert.equal(parseCaseText('As of November 3, 2026, the grocery list is milk, eggs and coffee for the week.'), null);
});
