# Segue handoff — Version 38

Read `../PROJECT.md` first. Updated 2026-11-15.
Live: https://vijaykannan2020-del.github.io/Apps/segue/

## Goal

Select a complete Spotify album or artist catalog, ask Gemini for the best
beat-driven charanam, save its returned range and play it in the browser.
No song-count picker or mandatory eight-song rule. Existing valid timings
are reused, including across release IDs when the recording is verified.
The Play button is centered in both the CD deck and the compact player.

## Explicit testing reset (Version 38)

Settings → **Reset AI timings for testing** clears the active AI timing cache
and saved AI-pick rows so the next Play asks Gemini again. Ordinary list Clear
still only hides rows/clears mix lists and preserves AI mappings.

Reset saves the previous nonempty cache in IndexedDB key `ai_backup`, verifies
pause only when a stream/action needs stopping (it also works before any song
has played), and clears runtime/checkpoint timing readiness for the saved queues.
Albums, track order, sources, keys, recording identity metadata and manual start
corrections remain. Manual marks are explicitly described in the Settings note.
No new AI request is started by Reset itself. Open Playing and tap Play to test.

A persisted `ai_revision` generation rejects queued or in-flight answers from
before the reset. Old callbacks cannot refill the cache, restart a cancelled
song, clear a newer pending request, or release a new prefetch lock. Request
spacing is retained. The most recent backup is kept if Reset is pressed again
while the cache is already empty. Reset is an on-device user action; publishing
this version does not remotely clear anybody's phone or auto-reset on launch.

## Complete selected charanam (Version 37)

The AI instruction now explicitly says ONE complete charanam, not the complete
song: do not end while its lyrics, last word, sustained note or final sung
syllable is continuing. Finish its natural resolving chorus phrase, if needed,
and stop before the following verse. Do not use the remaining song as a timing
fallback. A new AI response covering the entire recording (0 to song end) is
rejected. A final charanam starting later and ending at song end remains valid.

The player no longer extends to a later marker or actual song end if the next
AI pick is late. It verifies local pause at the selected passage end, then
waits for the next pick. Prefetch is intended to avoid that wait, but network
or model failures can still cause it. Failed pause is visibly unconfirmed;
Retry pause cannot accidentally resume. Saved timings are preserved without
automatic AI re-spending, so the new instruction applies to new selections.
AI still cannot hear the recording or certify the exact vocal ending.

## Complete selection and automatic batching (Version 36)

Albums retain every available track page in album order. Artist selection pages
through albums, singles, compilations and appearances, then every release's
tracks credited to that artist. This replaces the former capped artist search.
All playable songs are considered; repeat recording IDs are deduplicated. There
is no 15/30/60/120 selection, random sample or initial shuffle. Spotify's account,
market, catalog and API access still determine availability. A failed catalog
page fails visibly rather than claiming a partial search was the whole artist.

Gemini receives one compact question asking for the best charanam with a strong
beat and energetic vocals, including the complete section and natural return to
the chorus. It returns ID, start, end and a short section name. No fixed duration
and no lyric lookup or post-answer range extension. If a song has no charanam,
it can choose the best equivalent complete verse or beat-driven instrumental.
A manual start remains an explicit user override. Times are still AI estimates,
not a claim that Gemini listened to Spotify audio.

A startup request packs a small group (up to six); playback prepares larger
requests (up to twenty), adjusted down for long input metadata by a conservative
token-budget estimate. Those are request safety bounds, never a queue/song cap.
Requests serialize, only uncached recordings are included, and no new question
is asked merely because an app version or source changes. The shared question
reduces repeated prompt overhead; a batch does not make song metadata cost zero
tokens. Gemini rate spacing/model fallback remain. Pending prefetch hands off
when the selected source changes.

Saved choices continue to be reused as requested; the new charanam question
applies to uncached songs. This release does not automatically re-spend AI
requests to replace valid older saved choices. Legacy pre-Version-35 capped
entries still follow the existing one-time schema validation rule.

## Recording reuse and database (Version 36)

Spotify ID is the primary timing key. ISRC plus a duration within one second
permits reuse for the same recording issued under another album ID. It does not
match by title alone or reuse a live/remix/different-length recording. Simplified
album tracks can obtain ISRC through Spotify track metadata; older cached songs
are enriched lazily when metadata candidates could match. Duplicate recordings
within an AI request are skipped. Lookup failure never fabricates a match.

`Persist` uses IndexedDB `segue-library`, object store `data`, for `ai4`,
`ai_backup`, `ai_revision`, `recordings1` and account-scoped `library_*` records. It migrates legacy
localStorage values only when no newer database value exists, keeping the old
copies as a backup. Token/AI-key settings remain in the existing small settings
store. Database writes serialize; AI saves wait for persistence. Storage errors
are surfaced. After migration, a database-open failure stops with Retry rather
than loading stale backups as if the saved library had disappeared.

This is a persistent database **on this device/browser**, not a cloud service.
There is no extra login/backend and no cross-device sync. Clearing website data
can still erase it. List Clear continues to preserve AI timings and recording
identities. Larger catalogs no longer rely on localStorage's small quota.

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

## Playback continuity and limits

The old fixed 30–75-second rule, 75-second cap and 45-second missing-end fallback
remain removed. Invalid/nonfinite/out-of-recording ranges are rejected. The
player uses the returned start/end; there is no extra extension to force a
preset length. Previously stored section-marker data is retained without new lookups, but it
does not extend the selected range.

Prefetch runs ahead while audio plays. If the next answer is late at the selected passage
end, playback pauses there and waits for that answer. No random range or unrelated Spotify song is substituted.
Network/Spotify load latency and iOS suspension can still cause gaps or waits;
continuous intent is not a gapless guarantee.

Gemini does not receive Spotify audio. It can misidentify the section or its
start/end; no prompt can certify that the last sung syllable has finished.
Spotify Audio Analysis is deprecated. No true overlap/crossfade/beat mixing or
fake iOS volume ramp is added; SDK volume is not settable in JavaScript on iOS.

## Cache and saved library

- `segue_ai4` is preserved. Valid new picks use `schema:2`. Old length-capped
  entries remain stored and visible as needing recheck; they are revalidated
  once before reuse. A replacement keeps its old start/end in `previous`.
  New schema-2 picks are reused across playlists/reloads without new AI calls.
- `segue_hooks` keeps manual start corrections. The prompt receives a manual
  start when present; no manual correction is deleted by this release.
- Older `segue_boundaries1` data is left intact; Version 36 does not fetch new lyrics.
- `segue_library_{Spotify user id}` keeps sources, mix order, position, shuffle,
  repeat/history and hidden saved-song IDs. Reopen selects the CD view without
  autoplay. Another mix can be prepared/saved without interrupting audio.
- Clear mixes removes only the list and detaches autosave for that mix; Clear
  saved songs hides rows. Neither clears AI picks, corrections or Spotify music.
- All storage is browser-local (IndexedDB with a legacy fallback), not cloud backup/offline audio. Another browser
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

- `node segue/tests/playback.test.cjs`: 50 rebuilt-controller/AI/library cases,
  actual advancing SDK state, frozen/late/wrong-song failures, cancellation,
  variable ranges, adaptive batching, all catalog pages, ISRC reuse/mismatch,
  cache preservation, late-AI pause/wait, media actions and manifest identity.
- `python segue/tests/browser_flow.py`: mocked SDK/Spotify/AI flows at four
  sizes in both themes, single transport, persistence/clears, actual media
  handler calls, wrong-track stop, pause/resume and reconnect failures.
- `python segue/tests/catalog_browser.py`: complete 128-track album and second
  release-ID reuse with zero extra Gemini requests, legacy database migration,
  reload durability, a 6 MiB catalog, explicit reset/backup/fresh-batch checks
  and unavailable-database handling.
- `python segue/tests/layout_browser.py`: populated 120-song library at seven
  phone/landscape/foldable sizes in both themes, neutral colors, removed badges,
  centered Play geometry, no count picker, 44px targets, scroll clearance,
  rotation and reduced transparency/motion.
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
