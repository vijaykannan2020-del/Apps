// v3.0 onboarding: which steps apply for each status / situation, progress, resume, skip, where the
// app opens (setupDone, Finish later), family suggestions, the document checklist and typed answers
// that never override documents. Made-up people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_ORDER, OPTIONAL_STEPS, applies, setupSteps, setupProgress, nextStep, prevStep, resumeStep, startRoute, showContinueCard, rerunProgress,
  suggestStatus, familyStatusLabel, setupOpen, docChecklist, docProgress, gcFactsFor, gcAnswerOf, nextDeadline, countedSteps, type SetupStep,
} from '../src/core/onboarding';
import { deriveRecord } from '../src/core/record';
import { gcTrackOf } from '../src/core/gc';
import { stepMeta, stepKeys, gcLocalStage } from '../src/core/steps';
import type { StatusCategory } from '../src/core/model';
import { doc, person, T } from './helpers';

const steps = (status?: StatusCategory, extra: Parameters<typeof setupSteps>[0] = {}) => setupSteps({ status, notif: 'undetermined', ...extra });
const has = (s: SetupStep[], ...want: SetupStep[]) => want.every((w) => s.includes(w));
const lacks = (s: SetupStep[], ...no: SetupStep[]) => no.every((w) => !s.includes(w));

test('onboarding: branching — work visas get details/work/gc as they apply', () => {
  assert.deepEqual(steps('H-1B'), ['welcome', 'you', 'where', 'status', 'gc', 'family', 'docs', 'cases', 'alerts', 'protect', 'done']);
  for (const s of ['L-1A', 'L-1B'] as StatusCategory[]) assert.ok(has(steps(s), 'details', 'gc') && lacks(steps(s), 'work'), `${s}: blanket question, green card, no work step`);
  for (const s of ['TN', 'E-3', 'O-1'] as StatusCategory[]) { assert.ok(has(steps(s), 'gc'), s); assert.ok(lacks(steps(s), 'details', 'work'), s); }
});

test('onboarding: branching — students, dependents, green card, citizens, visitors', () => {
  const f1 = steps('F-1');
  assert.ok(has(f1, 'details') && lacks(f1, 'work', 'gc'), 'F-1: OPT question only');
  for (const s of ['F-1 OPT', 'STEM OPT'] as StatusCategory[]) { assert.ok(has(steps(s), 'details') && lacks(steps(s), 'work'), `${s}: no work step`); assert.ok(lacks(steps(s), 'gc'), `${s}: no green card step`); }
  const h4 = steps('H-4');
  assert.ok(has(h4, 'details', 'gc') && lacks(h4, 'work'), 'H-4: EAD question and green card, no employer');
  const l2 = steps('L-2');
  assert.ok(has(l2, 'gc') && lacks(l2, 'details', 'work'), 'L-2: green card only');
  const app = steps('green-card-applicant');
  assert.ok(has(app, 'gc') && lacks(app, 'details', 'work'), 'applicant: green card stage');
  for (const s of ['green-card', 'conditional-green-card', 'citizen', 'citizenship-applicant', 'B-2', 'J-1', 'other', 'unsure'] as StatusCategory[]) assert.ok(lacks(steps(s), 'details', 'work', 'gc'), `${s}: none of the visa follow-ups`);
  assert.ok(lacks(steps(undefined), 'details', 'work', 'gc'), 'before a status is picked, the bar counts only the common steps');
});

test('onboarding: branching — situations (rerun, I-94 saved, alerts already allowed)', () => {
  assert.ok(lacks(steps('H-1B', { rerun: true }), 'welcome'), 'Run setup again skips the welcome slides');
  assert.ok(lacks(steps('H-1B', { locationFromDocs: true }), 'where'), 'an I-94 already says where they are');
  assert.ok(lacks(steps('H-1B', { notif: 'granted' }), 'alerts'), 'permission already given');
  for (const n of ['undetermined', 'denied', 'unavailable'] as const) assert.ok(has(steps('H-1B', { notif: n }), 'alerts'), `alerts shown when ${n}`);
  for (const s of steps('H-1B')) assert.ok(SETUP_ORDER.indexOf(s) >= 0);
  assert.equal(applies('you', {}), true); assert.equal(applies('family', {}), true); assert.equal(applies('done', {}), true);
});

test('onboarding: progress counts only the steps that apply (not welcome or done)', () => {
  const s = steps('H-1B');
  assert.equal(countedSteps(s).length, 9);
  assert.deepEqual(setupProgress('you', s), { at: 1, total: 9 });
  assert.deepEqual(setupProgress('gc', s), { at: 4, total: 9 });
  assert.deepEqual(setupProgress('welcome', s), { at: 0, total: 9 });
  assert.deepEqual(setupProgress('done', s), { at: 9, total: 9 });
  const h4 = steps('H-4'); // details + principal (fix8) + gc, no work
  assert.deepEqual(setupProgress('principal', h4), { at: 5, total: 11 });
  assert.deepEqual(setupProgress('gc', h4), { at: 6, total: 11 });
  assert.equal(countedSteps(steps('green-card')).length, 8);
});

test('onboarding: next / back / skip follow the order and never strand the user', () => {
  const s = steps('H-1B');
  assert.equal(nextStep('status', s), 'gc', 'details and work do not apply to H-1B');
  assert.equal(nextStep('gc', s), 'family');
  assert.equal(prevStep('gc', s), 'status');
  assert.equal(prevStep('you', s), 'welcome');
  assert.equal(prevStep('you', steps('H-1B', { rerun: true })), undefined, 'rerun: Back on the first step closes');
  // the alerts step stops applying once permission is given: next still moves on to protect
  assert.equal(nextStep('alerts', steps('H-1B', { notif: 'granted' })), 'protect');
  // the status changed under a step (L-1A → H-1B while on details): next goes forward by the order
  assert.equal(nextStep('details', s), 'gc');
  assert.equal(nextStep('protect', s), 'done');
  assert.equal(nextStep('done', s), 'done');
  // skip = the same move as next, without saving; only optional steps offer it
  assert.deepEqual([...OPTIONAL_STEPS].sort(), ['cases', 'docs', 'family', 'gc', 'principal', 'protect', 'work']);
  for (const req of ['you', 'where', 'status', 'details'] as SetupStep[]) assert.ok(!OPTIONAL_STEPS.includes(req), `${req} needs an answer`);
});

test('onboarding: resume where they left off', () => {
  const s = steps('H-1B');
  assert.equal(resumeStep(undefined, s, false), 'welcome', 'fresh start');
  assert.equal(resumeStep('docs', s, true), 'docs');
  assert.equal(resumeStep('details', s, true), 'gc', 'a step that no longer applies resumes at the next one');
  assert.equal(resumeStep('where', steps('H-1B', { locationFromDocs: true }), true), 'status');
  assert.equal(resumeStep('family', s, false), 'you', 'no person saved yet: back to the name');
  assert.equal(resumeStep('welcome', s, false), 'welcome');
  assert.equal(resumeStep('bogus', s, true), 'you');
  assert.equal(resumeStep(rerunProgress().step, steps('H-1B', { rerun: true }), true), 'you');
  assert.equal(rerunProgress().rerun, true);
});

test('onboarding: where the app opens — setupDone users never see it again; Finish later opens Home', () => {
  assert.equal(startRoute({}, 0), 'onboarding', 'first launch');
  assert.equal(startRoute({ setupDone: true }, 2), 'home', 'existing users');
  assert.equal(startRoute({ setupDone: true }, 0), 'onboarding', 'no people (after Delete all data)');
  assert.equal(startRoute({ setup: { step: 'family' } }, 1), 'onboarding', 'closed mid-way: resume the onboarding');
  assert.equal(startRoute({ setup: { step: 'family', later: true } }, 1), 'home', 'Finish later');
  assert.equal(startRoute({ setup: { step: 'you', later: true } }, 0), 'onboarding', 'nothing saved yet');
  // Home card: until done or dismissed
  assert.equal(showContinueCard({ setup: { step: 'docs', later: true } }, 1), true);
  assert.equal(showContinueCard({ setup: { step: 'docs', later: true, dismissed: true } }, 1), false);
  assert.equal(showContinueCard({ setupDone: true, setup: { step: 'docs', rerun: true } }, 1), false, 'a rerun never shows the card');
  assert.equal(showContinueCard({}, 1), false);
  assert.equal(showContinueCard({ setup: { step: 'docs' } }, 0), false);
  // open right now (tips and the alert prompt wait)
  assert.equal(setupOpen({ setup: { step: 'docs' } }), true);
  assert.equal(setupOpen({ setup: { step: 'docs', later: true } }), false, 'put off: Home behaves normally');
  assert.equal(setupOpen({ setupDone: true, setup: { step: 'you', rerun: true } }), true, 'Run setup again');
  assert.equal(setupOpen({ setupDone: true, setup: { step: 'docs' } }), false, 'example family / restore after a partial setup');
  assert.equal(setupOpen({ setupDone: true }), false);
});

test('onboarding: family status is suggested from yours (editable)', () => {
  assert.equal(suggestStatus('H-1B', 'spouse'), 'H-4');
  assert.equal(suggestStatus('H-1B', 'child'), 'H-4');
  assert.equal(suggestStatus('L-1A', 'spouse'), 'L-2');
  assert.equal(familyStatusLabel('L-2', 'spouse'), 'L-2S', 'the spouse of an L-1 is L-2S');
  assert.equal(familyStatusLabel('L-2', 'child'), 'L-2');
  assert.equal(suggestStatus('H-4', 'spouse'), 'H-1B', 'you are the dependent: your spouse is the principal');
  assert.equal(suggestStatus('H-4', 'child'), 'H-4');
  assert.equal(suggestStatus('L-2', 'spouse'), 'L-1');
  assert.equal(suggestStatus('F-1 OPT', 'spouse'), 'F-2');
  assert.equal(suggestStatus('green-card', 'spouse'), 'green-card');
  assert.equal(suggestStatus('H-1B', 'parent'), 'B-2');
  assert.equal(suggestStatus(undefined, 'child'), 'unsure');
});

test('onboarding: document checklist per visa, with the follow-up answers', () => {
  const h1 = person('a', 'self', { status: 'H-1B' });
  assert.deepEqual(docChecklist(h1).key, ['passport', 'visa', 'i94', 'approval'], 'H-1B key documents');
  assert.ok(docChecklist(h1).more.includes('receipt'), 'pending receipt is optional (More)');
  const h4 = person('b', 'self', { status: 'H-4' });
  assert.ok(!stepKeys(h4).includes('ead'), 'an H-4 who is "you" had no EAD step before');
  const h4e = person('b', 'self', { status: 'H-4', facts: { location: 'US', hasEad: true } });
  assert.ok(docChecklist(h4e).key.includes('ead'), 'said yes to the H-4 EAD: it is a key document');
  const l1 = person('c', 'self', { status: 'L-1A' });
  assert.equal(stepMeta(l1, 'approval').title, 'Approval · I-129S', 'blanket L by default');
  assert.equal(stepMeta(person('c', 'self', { status: 'L-1A', facts: { location: 'US', blanketL: false } }), 'approval').title, 'Approval notice', 'individual L: I-797');
  const opt = person('d', 'self', { status: 'F-1 OPT' });
  assert.ok(docChecklist(opt).key.includes('ead') && docChecklist(opt).key.includes('i20'));
  const gcH = person('e', 'self', { status: 'green-card' });
  assert.deepEqual(docChecklist(gcH).key, ['gc', 'passport']);
  const c9 = person('f', 'self', { status: 'H-1B', facts: { location: 'US', gc: { stage: 'i485', workOn: 'ead' } } });
  const k = docChecklist(c9).key;
  assert.ok(k.includes('i485') && k.includes('combo'), 'I-485 filed and working on the EAD (C9): both are key');
  assert.ok(!docChecklist(c9).key.includes('where') && !docChecklist(c9).more.includes('where'), 'where is never a document');
  // progress "3 of 7"
  const rows = docChecklist(h1).key.map((x) => ({ pid: 'a', k: x }));
  assert.deepEqual(docProgress(rows, (_, x) => x === 'passport' || x === 'i94'), { added: 2, total: 4 });
});

test('onboarding: green card answers are typed facts that documents override', () => {
  const p = person('g', 'self', { status: 'H-1B' });
  assert.deepEqual(gcFactsFor('none', p.facts), { greenCardStarted: undefined, gc: {} });
  const f485 = gcFactsFor('i485', p.facts, { category: 'EB-2', priorityDate: '2020-01-15', workOn: 'ead' });
  assert.equal(f485.greenCardStarted, true);
  assert.deepEqual(f485.gc, { stage: 'i485', category: 'EB-2', priorityDate: '2020-01-15', workOn: 'ead' });
  assert.equal(gcFactsFor('perm', p.facts, { category: 'EB-2' }).gc?.category, undefined, 'no category before the I-140');
  const typed = person('g', 'self', { status: 'H-1B', facts: { location: 'US', ...f485 } });
  assert.equal(gcAnswerOf(typed), 'i485');
  assert.equal(gcLocalStage(typed, deriveRecord(typed, [])), 'i485');
  const me = { person: typed, rec: deriveRecord(typed, []) };
  assert.equal(gcTrackOf(me, [me])?.stage, 'i485', 'typed stage shows until documents say otherwise');
  const i140 = person('h', 'self', { status: 'H-1B', facts: { location: 'US', ...gcFactsFor('i140', {}, { category: 'EB-2', priorityDate: '2019-05-01' }) } });
  const m2 = { person: i140, rec: deriveRecord(i140, []) };
  assert.equal(gcTrackOf(m2, [m2])?.stage, 'waiting', 'I-140 approved = waiting for the priority date');
  assert.equal(gcTrackOf(m2, [m2])?.priorityDate, '2019-05-01');
  // a saved green card always wins over a typed stage
  const holder = person('i', 'self', { status: 'H-1B', facts: { location: 'US', gc: { stage: 'i485' } } });
  const card = doc('i', T.greenCard('E21', '10/01/2034', '10/01/2024'));
  const m3 = { person: holder, rec: deriveRecord(holder, [card]) };
  assert.equal(gcTrackOf(m3, [m3])?.stage, 'approved');
});

test('onboarding: typed employer and date of birth never replace what documents show', () => {
  const p = person('j', 'self', { status: 'H-1B', facts: { location: 'US', employer: 'Typed Name LLC', birthDate: '1990-01-01' } });
  const ap = doc('j', T.approval('WAC2590000001', '02/01/2025', '02/01/2025', '01/31/2028'));
  const rec = deriveRecord(p, [ap]);
  assert.equal(rec.employer, 'ACME TECH INC', 'the approval notice wins');
  assert.equal(deriveRecord(p, []).employer, 'Typed Name LLC', 'typed fills the gap');
  const pp = doc('j', T.passport('Z1234567', 'KUMAR', 'ARUN'));
  assert.equal(deriveRecord(p, [pp]).birthDate, '1986-06-14', 'passport date of birth wins');
});

test('onboarding: summary card picks the soonest future date', () => {
  const t = '2026-11-19';
  assert.deepEqual(nextDeadline([{ name: 'A', what: 'Passport', date: '2030-01-01' }, { name: 'B', what: 'I-94', date: '2027-03-01' }, { name: 'C', what: 'EAD', date: '2025-01-01' }, { name: 'D', what: 'Visa' }], t), { name: 'B', what: 'I-94', date: '2027-03-01' });
  assert.equal(nextDeadline([], t), undefined);
});

test('onboarding: screens wire the rules (static checks)', async () => {
  const { readFileSync } = await import('node:fs');
  const idx = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
  assert.match(idx, /startRoute\(settings, people.length\)/, 'the start redirect uses startRoute');
  const setup = readFileSync(new URL('../src/screens/setup.tsx', import.meta.url), 'utf8');
  assert.match(setup, /setupDone: true, tutorialSeen: true, setup: undefined/, 'Go to Home marks setupDone and clears progress');
  assert.match(setup, /later: true/, 'Finish later keeps progress and opens Home');
  assert.match(setup, /quick: true/, 'documents open the existing document step in quick mode');
  assert.match(setup, /useReduceMotion/, 'transitions respect Reduce Motion');
  assert.doesNotMatch(setup, /require\('expo-/, 'no direct native requires (guarded modules only)');
  const settings = readFileSync(new URL('../src/screens/settings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /Run setup again/);
  const home = readFileSync(new URL('../src/screens/home.tsx', import.meta.url), 'utf8');
  assert.match(home, /showContinueCard/);
});
