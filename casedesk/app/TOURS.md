# First-visit tips (coach marks)

**v2.7 (calmer help).** Tips show by themselves, once, only on the complicated screens
(`AUTO_TIP_SCREENS` in `src/core/tours.ts`): `case` (status check), `check-status` (the paste sheet),
`flow-step`, `review`, `summary`, `backup`, `restore`, `icloud`. Home shows ONE tip, once: "Tap ? on
any screen for tips." Every other screen is quiet. The **?** in the nav bar (or next to the large
title on tabs, or at the top of a sheet) plays any screen's 2-4 tips on demand.

Settings → Help (Settings is now a pushed page from the Home avatar):

- **Show tips on every screen** (off) — `settings.toursAll`. On: every screen shows its tips once.
- **Show all tips again** — clears `toursSeen` and turns the switch on.

The rule is one pure function, `autoSteps(id, steps, all)`.

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
- `useTour` auto-shows ~0.7 s after the screen gets focus (only when "Show tips on each screen" is on; Home's one tip otherwise). Content inside a **sheet** is outside the
  navigator, so use `useSheetTour` there, wrap the content in `<TourScope tour={tour}>` and put a
  `<TourButton />` at the top.
- Tab roots have no nav bar: put `<TourButton />` in `LargeTitle right={…}` and pass `tour` to `Screen`.
- `<TourTarget id>` is a plain `View` (`collapsable={false}`) around the control; pass `style` if the
  wrapper must flex (e.g. `style={{ flex: 1 }}` in a footer). A target scrolled out of view inside a
  `<Screen>` is scrolled into the top third first (its scroll area comes from `<TourScroll>`, which
  `Screen` uses). A target that isn't rendered (or sits in a sheet) shows as a centred card without an
  arrow — write the text so it still makes sense.
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

## Community (v2.7): one tip only

Owner rule: Community shows **one** first-visit tip — `communityFeed` has a single step. Every other
community screen passes `{ auto: false }` to `useTour` / `useSheetTour`, so its tips appear only from
the **?** button. `tests/community-v27.test.ts` checks both.

## Guided tour (v3.0)

A 1-minute walk through the app itself (owner: after setup, show where things are instead of a list of
tools). Started from the setup Done step (**Show me around (about 1 minute)** / Go to Home), Settings → Help →
**Take the tour** (route `/guide`, also in Help and Search), and a one-time Home card **Take a 1-minute tour**
for people who finished setup earlier (`settings.guideSeen`).

- Stops and words: `src/core/guide.ts` `guideStops()` (pure, `tests/guide.test.ts`). Home card · Search ·
  main person's status card + Review · Documents · Add to Apple Wallet · Cases · Community · Tools · widget
  how-to (drawn with views) · Share with family · end (Settings → Help → Take the tour). Stops that don't apply
  are skipped (no documents → no Wallet stop, no cases, no widgets on Android, I lost my job only for work
  visas); never more than 10 (Share then becomes a line on the last card).
- UI: `src/screens/guide.tsx` `<Guide>` (wraps `<Tours>` in `app/_layout.tsx`). Each stop navigates for real
  (tabs, or Family → person, Home → Settings), finds `"<tour id>:<TourTarget id>"` (every `<TourTarget>` also
  registers globally, `guideTargetsFor` in `ui/tour.tsx`), scrolls it clear of the floating tab bar and rings
  it; a missing element gives a centred card. Per-screen tips and the alert prompt wait while it runs.
- To point a stop at something new: wrap it in `<TourTarget id="x">` inside a screen with `useTour('screen')`
  and use `target: 'screen:x'`.
