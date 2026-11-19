// First-time tour steps for "What to expect" and "Cases like mine" on the case screen.
// The reusable tour system (useTour(screenId, steps) with refs, "?" in the nav bar replays it) is being built on
// branch v2.3 (casedesk/app/TOURS.md). Until it is merged, useTour below is a no-op shim with the same call shape:
// after the merge, replace the shim with `export { useTour } from './tours'` (or whatever TOURS.md names it).
import { useRef, type RefObject } from 'react';

export type TourStep = { id: string; title: string; body: string };

export const EXPECT_TOUR: TourStep[] = [
  { id: 'window', title: 'Your typical window', body: 'The bar shows when cases like yours are usually decided, counted from the day USCIS received it. The dot is today. It is an estimate, not a promise for your case.' },
  { id: 'numbers', title: 'Where the numbers come from', body: 'Official USCIS statistics come first — the quarterly form report, I-129 approval and RFE rates by visa class, and published processing times. Each number shows its quarter or date.' },
  { id: 'options', title: 'Premium and visa class', body: 'Tap Premium if you paid for premium processing — the window becomes the USCIS business-day clock. Pick the visa class to get rates for H-1B, L-1A, L-1B and others.' },
  { id: 'office', title: 'The receipt prefix', body: 'EAC, WAC, LIN, SRC or IOE shows where USCIS received the case. Service centers share work, so the decision may come from any of them.' },
];
export const COMMUNITY_TOUR: TourStep[] = [
  { id: 'community', title: 'Cases like mine', body: 'Timelines other app users shared anonymously, for the same form, office and month when there are enough. Nothing shows until at least 10 similar cases are decided.' },
  { id: 'share', title: 'Share anonymously', body: 'Turn this on to add your timeline. Only the form, the 3-letter office code, dates, outcome, premium and visa class are sent — never your receipt number or name. Turn it off to delete it.' },
];

type Refs = Record<string, RefObject<unknown>>;
/** No-op until the v2.3 tour system lands. Returns refs to attach to the highlighted views. */
export function useTour(_screenId: string, steps: TourStep[]): { refs: Refs; replay: () => void } {
  const refs = useRef<Refs>(Object.fromEntries(steps.map((s) => [s.id, { current: null }]))).current;
  return { refs, replay: () => {} };
}
