# Segue handoff — Version 35

Read `../PROJECT.md` first. Updated 2026-11-15.
Live: https://vijaykannan2020-del.github.io/Apps/segue/

## Goal

Pick Spotify music, validate the tracks, let AI choose each complete favourite
passage, and play those passages through one browser player. No song-length
preset, native-output selection, diagnostic music badges or hidden timing
fallback. Keep the CD deck right / bounded queue left on wide screens; stack
on phones. Cinema Book's neutral white/black/gray palette and glass navigation.

## Version 35 rebuild

The previous transport controller was replaced, rather than patched again.
Removed account-wide `/me/player` status fallback, native queue adoption,
Web API pause/seek routes, volume ramps, worker timing, harmonic/energy/genre
analysis, chorus heuristics and duration presets. There is no framework or
hydration; stale asynchronous state and competing playback paths were the risks.

`DJ` is one serialized browser-stream controller. SDK `ready` provides the only
device ID. Web API Start/Resume loads **one requested URI** at its AI start;
all actual state comes from SDK `getCurrentState`. Pause/resume/seek use local
SDK methods. Same-song resume/Previous can seek without another URI load.
A different SDK song is paused and detached, never adopted as a mix song.
A missing SDK state cannot be replaced by account-wide Spotify status.

Playing requires matching track/relinked ID, unpaused SDK state and advancing
position. Frozen/unknown states cannot show Pause/rotating CD. Pause is verified;
failures remain unconfirmed. Commands serialize with an intent generation;
Cancel, silent paused navigation, local seek and mix restore reject old work.
The one transport node moves inside the deck on Playing and floats elsewhere;
this issues no audio commands. No second audio player or silent audio exists.

## AI passages and boundaries

The old prompt required 30–75 seconds, the planner capped at 75 seconds, and
missing ends became 45 seconds. All those rules are removed. The new prompt
requests a **complete musical passage**, start before the first sung word,
end after the final phrase/sustained syllable, with no minimum, maximum or
one-minute target. Song end is allowed. Missing, backwards, nonfinite or
out-of-recording ranges are rejected, never filled with a duration fallback.

`Phrase.load` optionally fetches LRCLIB timed metadata with a four-second
budget. A title/artist match and duration within two seconds are required.
Only timing arrays are cached, not full lyric text. Timed blank/instrumental
markers are section-break hints; ordinary lyric line starts are NOT treated
as proof of silence. The AI receives those distinctions. A marker within
15 seconds after its proposed end may extend the ending, never shorten it.
Without an applicable marker, its end remains explicitly `estimated`.

Spotify does not expose audio/vocal detection to this app. Timed lyrics and AI
knowledge can still be wrong or refer to imprecise timings. This is not a
sample-accurate guarantee that every sung syllable completes. There is no
claim that AI hears/analyzes Spotify audio. Audio Analysis is deprecated.

`AI.one` prepares up to eight songs per serialized request; `aiAhead` rolls
this buffer ahead while music plays. Gemini model discovery, finite retries
and request spacing remain. Initial playback waits for a real pick. If the next
pick is late at a planned end, the current song continues to a subsequent
recorded section marker or its real end instead of being paused/cut mid-vocal.
Even if AI finishes sooner, that boundary is preserved. If AI remains unavailable
at the real song end, playback waits with an error/retry rather than skipping
or using an estimated fallback. Network gaps/Spotify load latency cannot be
eliminated; there is no gapless guarantee.

No true crossfade/overlap or beat mixing. Spotify supplies one protected stream;
iOS SDK volume is not settable in JavaScript. Do not add a fake fade or claim
that iPhone fading works. Native Spotify crossfade settings are not exposed
as a reliable control for these API loads.

## Cache and saved library

- `segue_ai4` is preserved. Valid new picks use `schema:2`. Old length-capped
  entries remain stored and visible as needing recheck; they are revalidated
  once before reuse. A replacement keeps its old start/end in `previous`.
  New schema-2 picks are reused across playlists/reloads without new AI calls.
- `segue_hooks` keeps manual start corrections. The prompt receives a manual
  start when present; no manual correction is deleted by this release.
- `segue_boundaries1` caches duration-matched timing arrays, separately from AI.
- `segue_library_{Spotify user id}` keeps sources, mix order, position, shuffle,
  repeat/history and hidden saved-song IDs. Reopen selects the CD view without
  autoplay. Another mix can be prepared/saved without interrupting audio.
- Clear mixes removes only the list and detaches autosave for that mix; Clear
  saved songs hides rows. Neither clears AI picks, corrections or Spotify music.
- All storage is browser-local, not cloud backup/offline audio. Another browser
  or Home Screen installation may have separate storage. Do not clear website
  data or uninstall as a routine update; that can lose local information.

## Media controls and app identity

SDK `enableMediaSession:true` enables its browser media integration. Segue
registers guarded Play/Pause/Stop/Previous/Next/SeekTo actions and removes
SeekBackward/SeekForward (`null`), requesting track buttons instead of ten-second
skips. Handlers are refreshed after SDK events and during rendering. Metadata
is published only for the loaded mix song, with album/app name Segue; unknown
context clears it. Unsupported actions are isolated so another action survives.
Actual OS button presentation is browser-controlled, not guaranteed by mocks.

`manifest.json` explicitly sets `id`, `start_url` and `scope` to `/Apps/segue/`.
This matches the old implicit start identity, so it does not deliberately make
a second installation. Plate Log is untouched. The report that a notification
opens Plate Log is not reproduced or proven fixed: Media Session has no standard
launch-URL setter. Explicit scoped identity prevents ambiguous future metadata,
but existing iOS routing/installation behavior needs phone verification.
If it persists, investigate same-origin standalone routing before proposing an
isolated hostname/native wrapper; do not silently delete app data or other apps.

Premium and a supported browser/protected-media capability are required. iOS
requires a user Play gesture and can suspend page work when locked. Real iPhone
notification actions, launch routing and CarPlay remain unverified. A static web
app does not supply a native CarPlay UI or guaranteed background AI timing.

## Files and checks

Single-file `index.html`, `manifest.json`, icons. No framework, build system,
Firebase, other app edits, downloaded audio or new backend. Spotify redirect
remains exactly `https://vijaykannan2020-del.github.io/Apps/segue/`.
Client ID and AI key stay on the user's device; never ask for keys or commit them.

- `node segue/tests/playback.test.cjs`: 36 rebuilt-controller/AI/library cases,
  actual advancing SDK state, frozen/late/wrong-song failures, cancellation,
  variable passage lengths, cache migration, matching boundary evidence,
  late-AI continuity, media action selection and manifest identity.
- `python segue/tests/browser_flow.py`: mocked SDK/Spotify/AI flows at four
  sizes in both themes, single transport, persistence/clears, actual media
  handler calls, wrong-track stop, pause/resume and reconnect failures.
- `python segue/tests/layout_browser.py`: populated 120-song library at seven
  phone/landscape/foldable sizes in both themes, neutral colors, removed badges,
  44px targets, scroll clearance, rotation, reduced transparency/motion.
- Browser checks need Playwright/Chromium. `SEGUE_CHROMIUM` selects the browser;
  `SEGUE_PREVIEW_DIR` selects synthetic preview output. All requests intercepted;
  these are not real protected audio, audible musical judgment or iOS tests.

Version 34's old controller-specific tests were replaced to exercise the new
SDK-only contract; historical pass counts do not certify the rebuilt controller.

Official references: [SDK](https://developer.spotify.com/documentation/web-playback-sdk/reference),
[deprecated Audio Analysis](https://developer.spotify.com/documentation/web-api/reference/get-audio-analysis),
[Media Session handlers](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler),
[manifest identity](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id).

Raise `APP_VERSION` on every release; update `PROJECT.md` and this handoff.
Hosting is GitHub Pages from `main`; verify live version after publishing.
