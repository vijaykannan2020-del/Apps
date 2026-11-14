# Segue: handoff

Read `PROJECT.md` in the repository root first (deploy, phone layout rules,
change log). This file covers Segue only. Last updated: 2026-11-14, Version 26.

Live: https://vijaykannan2020-del.github.io/Apps/segue/

## What Segue does, in one paragraph

Vijay picks one or more of his Spotify playlists, albums, artists or Liked
Songs and a number of songs. Segue puts them in an order, asks an AI which
part of each song is the famous, best-loved one (start and end, usually 30
to 75 seconds), and plays just those parts one after another through
Spotify. Vijay's own words for the goal: "ask the AI for the best part of
each song and play it, that's all".

## What Vijay wants, and what he has rejected

- Simple screen. Only: pick music, number of songs, Build mix. He found
  Vibe, Which part, Transition and seconds pickers confusing; all removed.
- The AI decides the best part. It may take time and keep working while
  music plays; the whole mix does not have to be ready up front.
- The best part should not always be the opening pallavi. Charanam,
  interlude or final reprise are often what he wants.
- Rejected, do not bring back without asking: YouTube playback (ads even
  with Premium), "Mix in Spotify" button (playlists play full songs),
  lyrics lookup as a visible step.
- He wants his own app, not Offtrack or Spotify's own Mix feature.

## Hard limits (already explained to Vijay)

- Spotify gives apps one stream, no audio access, and its developer policy
  forbids overlapping or mixing Spotify content. So no true DJ overlap or
  beat-matching. Segue switches songs on the bar line ("DJ cut").
- On phones, Spotify volume cannot be changed by the app, so there are no
  fades there. Fades only happen with "This browser" on a computer.
- Spotify dev mode (Feb 2026 rules): Premium required, 5 users, playlist
  songs readable only for playlists the user owns or collaborates on
  (`/playlists/{id}/items`), no artist top-tracks (search is used), search
  limit 10, no audio-features (ReccoBeats is used instead).
- The AI never hears the song. Its start and end times come from what it
  knows about the song, so they are estimates and some are off by several
  seconds. "Starts here" on the Playing tab lets Vijay fix a song once.
- Gemini free tier: 5 requests a minute and 20 a day per model. This is why
  one AI request covers 8 songs.

## Files

- `index.html`: everything (HTML, CSS, plain JavaScript). No framework, no
  build step, no Firebase.
- `manifest.json`, `icon-180.png`, `icon-512.png`: Home Screen files.

## Setup and secrets

- Spotify app (developer.spotify.com/dashboard): Web API and Web Playback
  SDK ticked; Redirect URI exactly
  `https://vijaykannan2020-del.github.io/Apps/segue/`. The code forces this
  exact address (`CANON`).
- Spotify Client ID: typed into the app, kept in the browser. Not a secret,
  but do not commit it.
- AI key (Gemini `AIza…` or Claude `sk-ant…`): typed into Settings, kept in
  the browser only. Never commit it or ask Vijay to paste it in chat.
- Browser storage keys (all prefixed `segue_`): `cid`, `at`, `rt`, `exp`,
  `ver` (Spotify sign-in), `aikey`, `ai4` (AI picks per track id), `hooks`
  (Vijay's own start marks), `genres` (artist genres).

## Screen layout (since Version 24)

Same shell as Cinema Book: `body` does not scroll, `main.app` scrolls,
`nav.nav` is the bottom tab bar. Top and bottom safe areas only, nothing in
the top-right corner. Colours are CSS variables with a dark-mode override.

- `v-mix`: source tabs and search (`#results`), chosen sources (`#crate`),
  number of songs, Build mix.
- `v-play`: now playing, play controls, "Starts here / −2s / +2s / Reset",
  running order (`#queue`) with the AI status box (`#aiStat`).
- `v-set`: AI key, Play on (device list), account and Log out, version.
- `showView(name)` switches tabs. Build mix jumps to `v-play`.

## How a mix is built and played

1. `buildMix()` reads tracks (`tracksFromSource`), removes duplicates,
   picks `ST.max` at random, fetches tempo/key/energy from ReccoBeats
   (`fetchFeatures`) and artist genres (`fetchGenres`), applies saved AI
   picks, then calls `remix()`.
2. `buildOrder()` orders songs: neighbours close in tempo, key (Camelot),
   style and AI mood; no artist twice in a row.
3. `planSegments()` sets `start`, `end`, `hook` per song. Priority:
   Vijay's mark (`HK`) > AI pick (`aiStart`/`aiEnd`) > simple rule. AI start and end times are used directly, bounded by the song length
   and a maximum 75-second passage. Songs with `_lock` are left alone.
4. AI: `aiAhead()` looks up to eight songs ahead. `AI.one(t)` queues up to
   eight undecided songs in one request. Requests never overlap. Gemini calls
   are at least 13 seconds apart. Model discovery and backup selection remain;
   a successful model is preferred without discarding backups. Each model has
   at most one explicitly signalled temporary rate-limit retry per request.
   Daily quota failures and timeouts move to the next model, then stop.
5. `DJ.go(i)` waits for an actual AI pick before starting a song. There is no
   12/45-second cutoff that silently substitutes an estimate. A saved manual
   start remains an override. Build mix requires an AI key. A missing/failed
   AI answer displays a retry message; it does not play an estimated passage.
6. Player position comes only from the expected Spotify track (including
   relinked IDs). Poll results from an earlier action are ignored. External
   Spotify pause/resume is reflected; another song/device stops Segue's
   scheduling rather than taking over that playback. Cuts require a fresh
   confirmed state; a failed/missing poll never advances the mix on its own.
7. At a passage boundary `DJ.transition()` starts the next song with its ready
   AI pick, without waiting on a new AI call or changing volume. If that pick
   is late, playback pauses at the boundary and waits for it. A Spotify start
   failure retries the same song once, then stops with Play-to-retry. It never
   silently skips forward. Network errors or late AI can therefore cause a
   pause; uninterrupted playback cannot be guaranteed under those failures.
8. Pause freezes elapsed position; resume sends the intended URI and position.
   Replacing a mix clears the previous session. Pause cancels an AI wait, and
   a late Spotify play acknowledgement is followed by pause if cancelled.
   A finished set can replay from its first AI-picked passage.

## Checks

Run `node segue/tests/playback.test.cjs` from the repository root. No package
installation or credentials needed. These 19 checks use simulated services:
AI batching/quotas/fallbacks, first-song wait, cancellation, no estimate
substitution, exact passage bounds, manual overrides, stable current passage,
pause/resume, stale states, device changes, late AI and no failed-song skipping.

Chromium browser checks passed on 320, 390, 768 and 1024 pixel-wide viewports
in light/dark mode, all three tabs, with simulated Spotify responses. No page
JavaScript errors, horizontal overflow or clipped bottom navigation. Manifest
and actual icon dimensions passed. Real iPhone/Spotify/AI checks remain below.

## Leftover code that is not used

Kept in the file but not called: lyrics lookup (`lyricHook`, `findHooks`,
`chorusFromLRC`, `parseLRC`), `curve()` vibes other than `smooth`, the
"Smooth fade" branch of `planSegments`, `drawCurve` (chart hidden by CSS).
Safe to delete in a clean-up; ask Vijay first.

## Rules for changes

- Pull `main` first. Raise `APP_VERSION` by 1 on every change; the header
  and Settings labels read from it. Add a line to the change log in
  `PROJECT.md`.
- Tell Vijay to open `…/Apps/segue/?v=N` so he gets the fresh copy.
- He works from his phone and wants steps one at a time.
- Real Spotify, Gemini and ReccoBeats cannot be reached from most
  assistants' workspaces. Say plainly what was tested with stand-ins and
  what only he can test on the phone.

## Current state (Version 26)

- AI picks work with a Gemini key (confirmed by Vijay: 14 of 15 songs).
- Phone layout redesigned to match Cinema Book; not yet confirmed by Vijay
  on the iPhone Duo.
- Version 26 playback and AI regression checks pass with simulated services.
  Live phone playback, real quotas and real model availability are not yet confirmed.

## Open items

- Confirm on the phone that songs no longer skip or overrun, including
  with the page in the background.
- Check whether the new prompt really moves picks beyond the pallavi, and
  how accurate the later-in-song times are.
- Lock screen / background playback on iPhone is unreliable for web pages;
  not solved.
- Possible later: saving a finished mix's picks so the same mix replays
  without the AI; file-based true DJ mixing (needs music files, Vijay has
  not asked for it).
