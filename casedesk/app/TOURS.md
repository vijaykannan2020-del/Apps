# First-visit tips (coach marks)

Every screen shows a short tour the first time it opens: 2–4 tips that dim the screen, ring the
control they talk about and point at it with an arrow. **Next / Back / Skip**, dots for progress,
"Got it" on the last tip (with **Open the help topic** when the screen has one). Each screen's tour
is shown **once** and remembered in `settings.toursSeen`. The **?** in the nav bar (or next to the
large title on tabs, or at the top of a sheet) replays it. **Settings → Help → Show all tips again**
clears the list.

Files:

| File | What |
|---|---|
| `src/core/tours.ts` | Pure logic: `shouldAutoShow`, `markSeen`, `normalizeSteps` (max 4), `placeTip`, `stepLabel` |
| `src/ui/tour.tsx` | `TourProvider`, `useTour`, `useSheetTour`, `TourTarget`, `TourScope`, `TourButton` |
| `src/content/tours.ts` | The words for every screen (`TOURS`), keyed by screen id |
| `src/screens/tours.tsx` | `<Tours>` — binds the provider to the family settings and help topics (in `app/_layout.tsx`) |
| `tests/tours.test.ts` | Shown-once logic, placement, and a check that every `useTour` id and step target exists |

## Add a tour to your screen (3 lines)

```tsx
import { Screen, TourTarget, useTour } from '../ui';

export function WhatToExpectScreen() {
  const tour = useTour('expect');                // words from content/tours.ts → TOURS.expect
  return (
    <Screen nav={{ title: 'What to expect', back: 'Back', onBack: back }} tour={tour}>  {/* adds the ? */}
      <TourTarget id="timeline"><Timeline … /></TourTarget>
      …
```

and in `src/content/tours.ts`:

```ts
expect: { help: 'cases', steps: [
  { target: 'timeline', title: 'Your timeline', text: 'Each step USCIS usually takes, with typical times.' },
  { target: 'help', title: 'Help', text: 'Tap ? to see these tips again.' },   // 'help' = the ? button
] },
```

Or pass the steps inline: `useTour('community', [{ target: 'post', text: '…' }, …], { help: 'privacy' })`.

Rules:

- **Hooks before early returns** (`useTour` must run on every render).
- `useTour` auto-shows ~0.7 s after the screen gets focus. Content inside a **sheet** is outside the
  navigator, so use `useSheetTour` there, wrap the content in `<TourScope tour={tour}>` and put a
  `<TourButton />` at the top.
- Tab roots have no nav bar: put `<TourButton />` in `LargeTitle right={…}` and pass `tour` to `Screen`.
- `<TourTarget id>` is a plain `View` (`collapsable={false}`) around the control; pass `style` if the
  wrapper must flex (e.g. `style={{ flex: 1 }}` in a footer). A step whose target isn't on screen
  (not rendered yet, or scrolled away) shows as a centred card without an arrow — write the text so
  it still makes sense.
- 2–4 tips, each under ~150 characters. Plain words, say what to tap.
- Ids are screen ids, not routes; once seen, a new id shows again (rename the id if you rewrite a tour
  and want everyone to see it).
- Tips aren't shown during first-run (no people yet) or while another tour is up.

## Accessibility

- The tip card is one VoiceOver element: "Tip 1 of 3. Add a case. Tap + to add …", announced when
  it appears; the screen behind is hidden from VoiceOver while the tour is up. Buttons are 44 pt.
- Reduce Motion: no fade.
- Tapping the dimmed area = Skip. Android back is not captured (the tour stays until Skip / Done).
- Works on wide (unfolded) screens: the card is at most 360 pt wide and follows the target in either pane.

## QA / screenshots

Auto-show is off when `localStorage['cd2.notours'] = '1'` (web) or `globalThis.__NO_TOURS__ = true`,
or when settings have `toursOff: true`. Puppeteer scripts that tap through screens should set one of
these (or seed `toursSeen`), otherwise the first tap on each screen dismisses its tour.
