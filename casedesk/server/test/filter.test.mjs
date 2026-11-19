import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, countLinks } from '../src/filter.mjs';

test('normal immigration questions pass (acronyms, forms, dates, office codes)', () => {
  for (const s of [
    'H-1B extension RFE at EAC — I-129 filed 2026-03-14, premium. Anyone got approved after RFE response?',
    'Is I-485 interview waived for EB-2 India with PD 2013? USCIS shows Case Was Received.',
    'Traveling to India for H-1B stamping in Chennai, DS-160 and appointment questions',
    'Class of admission on my I-94 says H1B but approval says valid to 09/30/2028, which wins?',
    'Read the official page: https://www.uscis.gov/forms/i-129 and https://travel.state.gov',
    'Shitake mushrooms aside — assessment of class passes',
  ]) assert.equal(checkText(s), null, s);
});

test('abuse, slurs, stretched and leetspeak profanity are refused', () => {
  for (const s of ['you are a f*ck1ng idiot', 'FUUUUCK this', 'go back to your country', 'such a b1tch', 'kys']) assert.match(checkText(s) || '', /respectful/, s);
  assert.match(checkText('Calm f.u.c.k', { kind: 'name' }) || '', /respectful/);
});

test('personal data is refused with a helpful reason', () => {
  assert.match(checkText('My receipt EAC2612345678 is stuck') || '', /receipt number/);
  assert.match(checkText('my A-number is A123456789') || '', /personal numbers/);
  assert.match(checkText('ssn 123-45-6789') || '', /personal numbers/);
  assert.match(checkText('mail me at someone@example.com') || '', /emails and phone/);
  assert.match(checkText('call 214-555-0182 anytime') || '', /emails and phone|contact me/);
});

test('spam and links', () => {
  assert.match(checkText('Guaranteed visa approval, whatsapp me') || '', /Ads/);
  assert.match(checkText('see https://a.com https://b.com https://c.com') || '', /At most 2 links/);
  assert.match(checkText('look at www.example.com', { kind: 'title' }) || '', /titles/);
  assert.equal(countLinks('uscis.gov and https://x.org/a'), 2);
  assert.match(checkText('PLEASE HELP URGENT MY VISA STAMPING GOT REFUSED TODAY WHAT SHOULD DO') || '', /all caps/);
});
