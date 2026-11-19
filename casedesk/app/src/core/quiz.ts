// Citizenship practice test: how each answer looks after a choice, and the end-of-test summary.
export type AnswerState = 'idle' | 'correct' | 'wrong' | 'answer' | 'dim';

/** chosen = index picked (null = not answered yet); right = the correct index. */
export function answerState(k: number, chosen: number | null, right: number): AnswerState {
  if (chosen === null) return 'idle';
  if (k === chosen) return k === right ? 'correct' : 'wrong';
  if (k === right) return 'answer'; // the right answer, shown after a wrong pick
  return 'dim';
}

export const ANSWER_LABEL: Record<AnswerState, string> = { idle: '', correct: 'Correct', wrong: 'Not quite', answer: 'Right answer', dim: '' };

export type QuizResult = { q: string; chosen: string; right: string; ok: boolean };
/** Score summary. The real test asks up to 20 and needs 12 right (60%); this practice uses the same share. */
export function quizSummary(results: QuizResult[]) {
  const right = results.filter((r) => r.ok).length;
  const total = results.length;
  const pct = total ? Math.round((right / total) * 100) : 0;
  const passMark = Math.ceil(total * 0.6);
  return { right, total, pct, passMark, passed: right >= passMark, missed: results.filter((r) => !r.ok) };
}
