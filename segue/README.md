# Segue: handoff

Read `PROJECT.md` in the repository root first (deploy, phone layout rules,
change log). This file covers Segue only. Last updated: 2026-11-14, Version 32.

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
  beat-matching. Segue requests timed switches between chosen passages;
  timing depends on Spotify and foreground scheduling.
- The transport does not fade songs or change phone volume. Use Spotify or
  device volume controls. Exposed zero output volume is reported in the player.
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
with album mosaics and a searchable list of AI-picked songs. Version 31
uses one shared transport on every tab, including Playing. Playing contains
artwork, passage details, correction tools and queue; it has no second Play
button. Renaming is in-page. New order shuffles upcoming songs without
restarting the current song.

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

## Foldable layout and Liquid Glass (Version 32)

The navigation uses Cinema Book Version 22's material tokens: a floating
520px-capped capsule, translucent light/dark surfaces, 26px blur/saturation,
soft outer shadows, inset highlights and a rounded selected-tab pill. The
shared player is a separate floating glass surface above it, capped at 840px.
The one transport and Version 31 playback engine are unchanged.

Main content has an explicit 1120px maximum instead of width-dependent side
padding. At 720px and wider, Home puts its intro and Continue side by side,
Create separates source selection and mix configuration, Playing places compact
artwork/details beside its queue, and Settings uses columns. Artwork and long
mix names are bounded; wide layouts do not simply enlarge the portrait page.
On phones everything returns to one column. Important top actions remain left.

`measureChrome` measures actual player/nav heights and reserves scrollable
bottom padding. Fixed docks never overlap one another; the last content can
scroll fully above them. ResizeObserver, window/visual viewport resize, page
restore, and an observer-free renderer fallback keep this correct through
rotation and status wrapping. Only top/bottom safe-area insets are used.
Reduced transparency removes blur and uses solid surfaces; unsupported blur
also retains a solid fallback. Reduced motion disables tab transitions.

`python segue/tests/layout_browser.py` checks populated 120-song layouts at
320×740, 390×844, 430×932, 844×390, 900×600, 1280×900 and 1536×960 in both
themes, four views, 44px transport targets, dock bounds/reserved scroll room,
rotation without player/cache changes and no playback writes. It also emulates
reduced transparency. Extra phone/Duo runs verify the no-ResizeObserver
measurement fallback. Screenshots use synthetic account/music metadata.

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

## Shared transport and player rules (Version 31)

Read [PLAYER_REQUIREMENTS.md](PLAYER_REQUIREMENTS.md) for the full review,
behaviour contract, evidence and real-phone acceptance checks.

`DJ.phase` is the playback state; `DJ.action` is the pending command. Busy
is not playing. One `renderTransport()` renders the same footer outside the
scrolling views. Ready, waiting for AI, starting, checking, playing, paused,
buffering/reconnecting, disconnected, external playback, unconfirmed pause,
error and finished are distinct. A Pause icon appears only for fresh confirmed
playback. Pending work shows Cancel/progress; errors expose Retry. The footer never hides on Playing. Version 32 gives it a floating glass
surface with measured scroll padding so final controls remain reachable.

`DJ.enqueue()` serializes transport actions and assigns an intent epoch.
Same-target pending Play is coalesced. New intent cancels an AI wait; a late
cancelled start is stopped before the replacement start. Stale completions
cannot restore a previous UI state. AI processing remains independent.

Both start and seek verification require the expected track/relinked ID,
selected device, unpaused state and actual forward position movement over
multiple samples. Static `is_playing: true` is insufficient. An ignored start
position allows one corrective seek; a frozen stream still fails verification.
SDK state has a bounded fallback to Web API. Missing/stale state cannot leave
Playing visible forever. Progress stalls buffer, then stop with Retry.
A changed Spotify track/device ends mix scheduling without taking it over.

Pause is confirmed before Paused; failed pause shows Retry pause, and cannot
be labelled Mix finished. Next while paused selects silently. Previous restarts
after three seconds, otherwise follows listening history. Shuffle only changes
unplayed songs; disabling it restores their base order. Repeat Off/All/One,
base order and history persist with the mix. Manual Next ignores repeat-one.
Seeking is limited to the AI/manual passage. A paused local seek stores a
pending checkpoint so stale paused-device state cannot overwrite it on reopen.

Opening an already active mix only navigates. Building another mix while one
is playing saves it separately without pausing/replacing the queue. Manual
hook corrections while playing affect the next play, preserving the active
window. Unavailable/restricted tracks are filtered, short songs can have shorter
AI passages, and stale search responses cannot replace newer source results.

The shared output control names the selected device. Zero volume is shown when
Spotify exposes it; the app never guesses speaker audibility or forces volume.
Browser SDK Media Session actions use this same controller; remote playback
leaves the native Spotify app's lock screen ownership alone. Keep Segue active
for timed cuts: iOS may suspend web timers when locked.

## Code map

- `renderTransport`: the only playback-controls/status renderer.
- `DJ`: command serialization, observed phases, queue, shuffle/repeat/seek.
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
   style and cached AI mood; repeated artists are penalized, not strictly forbidden.
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
   failure stops with Retry on that song (a stale-device 404 can recover once). It never
   silently skips forward. Network errors or late AI can therefore cause a
   pause; uninterrupted playback cannot be guaranteed under those failures.
8. Pause freezes elapsed position; resume sends the intended URI and position.
   Replacing a mix clears the previous session. Pause cancels an AI wait, and
   a late Spotify play acknowledgement is followed by pause if cancelled.
   A finished set can replay from its first AI-picked passage.

## Checks

Run `node segue/tests/playback.test.cjs` from the repository root. No package
installation or credentials needed. Version 31 has 72 regressions covering
AI/cache/library behaviour and the shared transport rules. Unrelated scenarios
stub confirmation; the transport tests and browser flows exercise the real
moving-clock verifier. Frozen timestamps are explicit negative cases now.

Optional `python segue/tests/browser_flow.py` needs Playwright and Chromium.
`SEGUE_CHROMIUM` selects an executable; `SEGUE_PREVIEW_DIR` selects where
synthetic screenshots are written. All requests are intercepted; no live
account/key is used. Four populated views at 320/390/768/1024 widths passed in
light/dark with a moving simulator, no overflow/JS errors, and one shared footer. Version 32 uses measured scroll space for its floating
player and glass nav; the final content scrolls clear of both. Phone fault flows cover frozen start,
external pause/resume, network recovery and muted-output notice. Final phone
recheck includes inline renaming and 44px transport targets.

Complete checklist and limits: [PLAYER_REQUIREMENTS.md](PLAYER_REQUIREMENTS.md).
Real Spotify/iPhone speaker output and lock-screen behaviour are not verified.

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

## Current state (Version 32)

- AI picks work with a Gemini key (confirmed by Vijay: 14 of 15 songs).
- Phone layout redesigned to match Cinema Book; not yet confirmed by Vijay
  on the iPhone Duo.
- Version 32 responsive/foldable layout and glass docks pass the size/theme
  matrix; Version 31 transport remains unchanged and all 72 playback checks pass.
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
