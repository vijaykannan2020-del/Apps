# Segue: handoff

Read `PROJECT.md` in the repository root first (deploy, phone layout rules,
change log). This file covers Segue only. Last updated: 2026-11-14, Version 29.

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
- AI picks are saved by Spotify song ID, independently of playlists. The same
  track reuses its pick after closing/reopening this app or selecting another
  playlist. Settings shows the saved count. Version 27 removes automatic
  deletion of old picks and reports storage failures. Data stays local to this
  browser/Home Screen app; it is not synced between devices or guaranteed to
  be shared with Safari. Clearing website data removes it. Different Spotify
  track IDs (such as another recording) may need separate picks.
- Browser storage keys (all prefixed `segue_`): `cid`, `at`, `rt`, `exp`,
  `ver` (Spotify sign-in), `aikey`, `ai4` (AI picks per track id), `hooks`
  (Vijay's own start marks), `genres` (artist genres).

## Phone playback devices (Version 27)

If no device is available, open the native Spotify app using the same account,
play any song briefly, return to Segue, then tap Refresh devices and Play.
Controls are in Settings and on Playing when a device is missing. Segue cannot
create a native Spotify device remotely. Phone playback still needs Premium.

Device discovery prefers the active native Spotify phone on iPhone, respects
an explicitly selected output, excludes restricted devices and clears stale
selections. A 404 refreshes devices and retries the same song on a recovered
output, excluding the failed device. Failed/disconnected browser SDK outputs
are cleared. Device lookup errors are visible. Returning to the foreground
refreshes discovery when not playing; it does not auto-start playback.

## Version 28 redesign and saved library

Four tabs: **Home**, **Create**, **Playing**, **Settings**. The existing fixed
shell, inner scrolling, top/bottom safe areas and light/dark modes remain.
Home has a compact returning-user header, Continue listening, saved mix cards
with album mosaics and a searchable list of AI-picked songs. A mini-player
opens Playing or plays/pauses the active mix. Playing shows the mix name,
saved status, selected output, controls, correction tools and running order.
Mixes can be renamed; New order creates a separate saved mix.

`Library` stores `segue_library_{Spotify user id}` independently of the
existing `segue_ai4` song-timing cache. It remembers selected sources and song
count before building, plus each mix's actual tracks/order, active song,
last recorded position and completion state. Snapshots update after AI
replanning/playback changes, about every five seconds while polling, and on
pause, page hide and page exit (best effort on iOS). Runtime promises and
credentials are excluded from mix serialization.

Boot restores the active mix and selection on Home **without starting music
or making AI requests**. Continue sends the saved URI/position explicitly.
An already-known account can still see its local library if Spotify has a
temporary network/server outage; it must reconnect to stream music. Logout
clears cached account identity and tokens but retains that account's library.

New AI results include song metadata so saved picks can be browsed and played
on Home. Existing timing-only picks stay intact. **Show older saved songs**
looks up missing names/artists through Spotify (up to 20 per tap), without
new AI calls. It cannot recover an old playlist order that was never saved.
The original per-track cache key and all sign-in/AI keys are preserved.

Storage is local to this browser/Home Screen app, not cloud sync or downloaded
audio. Clearing website data removes it. Reopening in Safari may use different
storage from the Home Screen app. Settings includes Reload app, which saves
the current snapshot and requests a fresh page without clearing local data.

## Clear lists (Version 29)

Home has separate Clear controls beside Your mixes and Saved AI picks. Each
asks for confirmation inside the page, so playback timers keep running. Clearing mixes removes saved snapshots and Continue
from this account's library but leaves current playback/queue running, source
selections, keys, AI mappings and manual start corrections intact. Auto-save
is detached from that cleared mix so polling/AI updates/pause cannot recreate
the deleted list. A newly built mix is saved normally.

Clearing the displayed AI song list only stores hidden song IDs in this
account's library (`hiddenPicks`); it does not edit `segue_ai4` or `segue_hooks`.
The hidden list remains cleared after reopening, while all best-part timings
remain reusable with no extra AI request. Explicitly building another mix
shows its songs again using those retained mappings. Pending picks from the current queue remain hidden too. Songs from a newly
created mix can appear as usual. The timings-kept count remains visible. No Spotify
playlist or Liked Songs is modified. Failed storage writes leave lists intact.

## Code map

- `Library`: serialization, account-scoped source draft/mix storage, restore,
  Home rendering, old-pick metadata recovery and mini-player.
- `v-home`: `continueMix`, `savedMixes`, `savedSongSearch`, `savedSongs`.
- `v-mix`: source tabs/search, `results`, chosen `crate`, count, Build mix.
- `v-play`: mix title/saved status, output shortcut, player and `queue`.
- `v-set`: AI key/count, device discovery, account, version and Reload app.
- `showView(name)` switches the four views; building/opening a mix shows Playing.

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
installation or credentials needed. These 40 checks use simulated services:
AI batching/quotas/fallbacks, first-song wait, cancellation, no estimate
substitution, exact passage bounds, manual overrides, stable current passage,
pause/resume, stale states, device changes, late AI and no failed-song skipping.
Also covers empty/stale devices, phone preference, 404 recovery, visible device
errors, pick reuse after reload/from another playlist, retaining old picks,
account-scoped mix/draft restoration without autoplay, serialization privacy,
completed-set replay, metadata recovery, concurrent cache merges, list clears
without touching playback/cache/keys/corrections, and persistent hidden lists.

Optional browser regression: `python segue/tests/browser_flow.py` (requires
Python Playwright plus Chromium; `SEGUE_CHROMIUM` can specify the executable).
`SEGUE_PREVIEW_DIR` optionally chooses the screenshot directory; otherwise it
uses a temporary folder. Uses synthetic accounts and intercepts every request.

Browser flow passed at 320/390/768/1024-pixel widths, in light/dark modes:
create → saved mix/song list → search/rename → play/pause → reopen → same
order/song/position without autoplay → continue with no extra AI request →
saved library visible during a simulated Spotify outage, plus cancelling and
confirming Clear and reopening with empty lists and unchanged AI cache. Four populated views
had no horizontal overflow or JavaScript errors. Real device checks remain.

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

## Current state (Version 29)

- AI picks work with a Gemini key (confirmed by Vijay: 14 of 15 songs).
- Phone layout redesigned to match Cinema Book; not yet confirmed by Vijay
  on the iPhone Duo.
- Version 29 list clearing, library restoration, saved-song browsing and playback
  regression checks pass with simulated services.
  Live phone playback, real quotas and real model availability are not yet confirmed.

## Open items

- Confirm on the phone that songs no longer skip or overrun, including
  with the page in the background.
- Check whether the new prompt really moves picks beyond the pallavi, and
  how accurate the later-in-song times are.
- Lock screen / background playback on iPhone is unreliable for web pages;
  not solved.
- Song timings and full mixes/orders now persist on this device. Cross-device
  sync, cloud backup and offline audio are not implemented. Historical mixes
  from versions before 28 cannot be reconstructed if never stored.
- Possible later: file-based true DJ mixing (needs music files, Vijay has
  not asked for it).
