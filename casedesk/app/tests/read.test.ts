import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDocument, setToday } from '../src/core';
import { T } from './helpers';

setToday('2026-11-18');

test('passport: number, name, day-first dates', () => {
  const r = readDocument(T.passport('Z5123456', 'KUMAR', 'ARUN'));
  assert.equal(r.type, 'passport');
  assert.equal(r.fields.passportNo, 'Z5123456');
  assert.equal(r.fields.name, 'Arun Kumar');
  assert.equal(r.fields.validTo, '2034-05-10');
  assert.equal(r.fields.issueDate, '2024-05-11');
});

test('I-94: admit until, entry date, class; D/S', () => {
  const r = readDocument(T.i94('2028 September 30', '2026 January 05', 'H1B', 'Z5123456'));
  assert.equal(r.type, 'i94');
  assert.equal(r.fields.validTo, '2028-09-30');
  assert.equal(r.fields.entryDate, '2026-01-05');
  assert.equal(r.fields.classOfAdmission, 'H1B');
  const ds = readDocument(T.i94('D/S', '2025 January 06', 'F1', 'EK1234567'));
  assert.equal(ds.fields.durationOfStatus, true);
  assert.equal(ds.fields.validTo, undefined);
});

test('I-797A approval carries the I-94 tear-off', () => {
  const r = readDocument(T.approval('WAC2590123456', '10/02/2025', '10/01/2025', '09/30/2028'));
  assert.equal(r.type, 'approval');
  assert.equal(r.fields.form, 'I-129');
  assert.equal(r.fields.validTo, '2028-09-30');
  assert.equal(r.fields.i94Until, '2028-09-30');
  assert.equal(r.fields.noticeDate, '2025-10-02');
  assert.equal(r.fields.employer, 'ACME TECH INC');
});

test('I-797C receipt: blank priority-date column is not the received date', () => {
  const r = readDocument(T.receipt('WAC2690345678', '09/20/2026'));
  assert.equal(r.type, 'receipt');
  assert.equal(r.fields.receivedDate, '2026-09-20');
  assert.equal(r.fields.priorityDate, undefined);
  assert.equal(r.fields.petitionKind, 'extension');
});

test('EAD category from the column layout; (c)(3)(B) is OPT', () => {
  const r = readDocument(T.ead('C03B', '07/01/26', '06/30/27'));
  assert.equal(r.type, 'ead');
  assert.equal(r.fields.category, 'C3B');
  assert.equal(r.fields.validTo, '2027-06-30');
});

test('green card: conditional category, resident since', () => {
  const r = readDocument(T.greenCard('CR6', '01/25/2027', '01/25/2025'));
  assert.equal(r.type, 'green-card');
  assert.equal(r.fields.category, 'CR6');
  assert.equal(r.fields.conditional, true);
  assert.equal(r.fields.residentSince, '2025-01-25');
});

test('visa foil: P# annotation is not a receipt', () => {
  const t = 'UNITED STATES OF AMERICA\nVISA\nControl Number\nSurname\nKUMAR\nGiven Name\nARUN\nVisa Type/Class   Entries   Issue Date    Expiration Date\nR  H1B            M         10DEC2025     30SEP2028\nAnnotation\nP#-WAC2590123456\nPED-30SEP2028';
  const r = readDocument(t);
  assert.equal(r.type, 'visa');
  assert.equal(r.fields.receipt, undefined);
  assert.equal(r.fields.classOfAdmission, 'H1B');
  assert.equal(r.fields.validTo, '2028-09-30');
});

test('passport expiry: one misread digit is corrected, a clearly different printed date is kept (QA bug B)', () => {
  const t = (exp: string) => `REPUBLIC OF INDIA\nPassport No.\nK1234567\nSurname\nKUMAR\nGiven Name(s)\nASHA\nDate of Birth\n01/01/1990\nDate of Issue    Date of Expiry\n15/03/2024       ${exp}`;
  assert.equal(readDocument(t('24/03/2034')).fields.validTo, '2034-03-14'); // "24" for "14": one digit
  const keep = readDocument(t('30/03/2034')).fields; // QA bug B: clearly printed — keep it, with a note
  assert.equal(keep.validTo, '2034-03-30');
  assert.ok(keep.dateNote);
});
