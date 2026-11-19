// First-visit coach marks ("tours"): pure logic, no React — tested in tests/tours.test.ts.
// The UI lives in src/ui/tour.tsx; the words for each screen in src/content/tours.ts.

export type TourStep = {
  /** id of a <TourTarget id="…"> on the screen. No target (or not on screen) → a centred card. */
  target?: string;
  title?: string;
  text: string;
};

export const MAX_STEPS = 4;

/** Seen-list helpers. Settings keep `toursSeen: string[]` (screen ids) and `toursOff` (Skip all). */
export function isSeen(seen: readonly string[] | undefined, id: string): boolean {
  return !!seen && seen.includes(id);
}
export function markSeen(seen: readonly string[] | undefined, id: string): string[] {
  return isSeen(seen, id) ? [...(seen ?? [])] : [...(seen ?? []), id];
}

/** Auto-show once: only when data has loaded, tours aren't switched off, the screen hasn't shown
 *  its tour before, nothing else is showing, and the tour has something to say. */
export function shouldAutoShow(id: string, o: { ready: boolean; seen?: readonly string[]; off?: boolean; active?: string | null; steps: number; disabled?: boolean }): boolean {
  if (!o.ready || o.off || o.disabled) return false;
  if (o.active) return false;
  if (o.steps < 1) return false;
  return !isSeen(o.seen, id);
}

/** Tours are short: 2–4 steps. Extra steps are dropped; empty texts removed. */
export function normalizeSteps(steps: readonly TourStep[]): TourStep[] {
  return steps.filter((s) => s && s.text && s.text.trim()).slice(0, MAX_STEPS);
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Placement = { top: number; left: number; width: number; arrow: 'up' | 'down' | null; arrowX: number };

/**
 * Where the tip card goes. Below the target when there is room, otherwise above it; centred
 * vertically when there is no target or it is off screen. The card is never wider than 360 and
 * always stays `margin` inside the window. `arrowX` is relative to the card's left edge.
 */
export function placeTip(target: Rect | null | undefined, win: { width: number; height: number }, tipHeight: number, margin = 16, gap = 12): Placement {
  const width = Math.min(360, win.width - 2 * margin);
  const visible = !!target && target.width > 0 && target.height > 0 && target.y + target.height > 0 && target.y < win.height && target.x < win.width && target.x + target.width > 0;
  if (!visible || !target) {
    return { top: Math.max(margin, (win.height - tipHeight) / 2), left: (win.width - width) / 2, width, arrow: null, arrowX: width / 2 };
  }
  const cx = target.x + target.width / 2;
  const left = Math.min(Math.max(margin, cx - width / 2), win.width - margin - width);
  const arrowX = Math.min(Math.max(20, cx - left), width - 20);
  const below = target.y + target.height + gap;
  const spaceBelow = win.height - below - margin;
  const spaceAbove = target.y - gap - margin;
  if (spaceBelow >= tipHeight || spaceBelow >= spaceAbove) {
    return { top: Math.min(below, win.height - margin - tipHeight), left, width, arrow: 'up', arrowX };
  }
  return { top: Math.max(margin, target.y - gap - tipHeight), left, width, arrow: 'down', arrowX };
}

/** What VoiceOver reads for a step: "Tip 1 of 3. Add a case. Tap + to …". */
export function stepLabel(step: TourStep, i: number, n: number): string {
  return [`Tip ${i + 1} of ${n}.`, step.title ? `${step.title}.` : '', step.text].filter(Boolean).join(' ');
}
