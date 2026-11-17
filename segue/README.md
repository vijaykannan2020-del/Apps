# Segue handoff — Version 42

Read `../PROJECT.md` first. Updated 2026-11-17.
Live: https://vijaykannan2020-del.github.io/Apps/segue/

## Goal

Select a complete Spotify album or available artist catalog. Timed lyrics
select a section automatically, save its timings and prepare upcoming songs while
Spotify plays in the browser. No files, AI key, song-count picker, fixed excerpt
length or mandatory eight-song batch. Local-file review and Gemini estimates
remain explicit optional methods, not automatic fallbacks.

## Replay-data trial (Version 42) — backend not connected

The user approved trying audience replay data after Gemini, audio-file uploads
and timed-lyrics coverage failed their expectations. Version 42 implements an
opt-in experimental path; it is **not a verified/live replay feed**. No service
account, provider key, backend hostname or hosting-account access was available.
Do not tell the user it is ready to play real replay-selected Tamil passages.

Settings → **Replay trial · setup** accepts an HTTPS backend origin and a private
app connection token. The YTAPI provider key stays on the backend. Connect verifies
the backend's configured state, saves the app connection locally, confirms pause
and switches to Replay. Health does not yet validate live provider credentials;
the first real lookup does. An unconnected selector opens setup and preserves
the current method. No default migration, Gemini retry or file upload occurs.

`replay-service/worker.mjs` is a Cloudflare Worker with a dependency-free Node
adapter (`server.mjs`) for an existing server. Deployment/secrets/cache/cost steps
are in [replay-service/README.md](replay-service/README.md). Both options are
prepared; neither was deployed. An optional `REPLAY_CACHE` KV binding shares
successful derived ranges for 30 days. Browser `ai4`/`replay_lookups1` persist
successful ranges and negative results. Explicit Retry can clear client misses.

YTAPI's documented search, video-info and heatmap endpoints supply the data.
Search considers up to three duration-matched video candidates. Only Topic or
auto-generated release audio with matching Music-section title/credited artist
and duration within one second is accepted. This is a conservative metadata
match, **not proof of identical audio alignment**. No Spotify credential or audio
is sent to this service, and no audio stream/video is downloaded. The legacy
free endpoint returned 404; direct YouTube access returned 403; neither is used.

The backend validates a contiguous replay curve, ignores opening-only peaks and
flat/broken graphs, and picks surrounding low-interest valleys around a peak.
Flat tops are traversed while valley plateaus use the nearer edge. Named
verse/chorus chapters wholly within a region can refine its boundaries. Regions
over half the song are rejected rather than truncated to a timer. Output is
labelled **Replay-region estimate**, source `replay`, method `replay-v1`, alignment
`metadata-duration-only`. Crowd attention does not establish hype or a complete
charanam/vocal ending. No missing-data full-song/auto-skip policy was authorized.

The client prepares up to three songs ahead, saves once, reuses by recording and
rejects stale mode-change/Cancel completions. Cached replay ranges survive list
Clear and AI Reset. Same common Spotify transport is used, with observed SDK
progress. The new path makes no Gemini or LRCLIB calls. Missing graphs, mismatches,
unconnected service, rate/credit errors all remain explicit. An uncached match
uses 3–7 successful YTAPI calls; provider signup advertises 200 free credits. No
purchases or automatic top-ups were made/configured. Worker calls have spacing,
Retry-After handling and an overall approximately 32-second lookup budget. This
is not a promise of gapless playback, available replay data, or fewer pauses on
the user's actual collection until the live service and coverage are tested.

Checks: 78 controller/selection/library cases; 12 backend tests; mocked replay
browser flow (setup guard, connection, album, SDK start/next, no-graph failure,
local reload/cache/ISRC reuse); existing lyric/catalog/file/player regressions
and 14 layout/theme cases. These use fixtures, not live provider results/audio.
Live trial remains blocked on provider credentials and a deployed backend.

## One verse or refrain, not the lyric sheet (Version 41)

Vijay reported that automatic selections often covered nearly all the lyrics.
Version 40 accepted an explicit closing marker as a complete section, skipped
searching for stanzas inside it, and rewarded larger blocks. A second bug let
an old manual start beyond a new ending replace that ending with track duration.

The selector now combines explicit markers, aligned stanza paragraphs and
maximal repeated phrases even when outer blocks exist. It chooses one verse,
one continuous refrain, or a verse with one adjacent refrain return. Adjacent
or overlapping repeated hook fragments are coalesced; they cannot by themselves
end a refrain early. A properly bounded verse/refrain remains eligible intact
when it has no smaller stanza break. Candidate scoring favors structure and
boundary evidence rather than line count/length. Long line gaps only refine
otherwise oversized blocks, not every breath inside a valid verse.

A proposed automatic lyric passage is rejected if it covers over half the
recording or at least 65% of its timed vocal lines. These are conservative
whole-song/whole-lyric-sheet rejection guards, not clip durations: the algorithm
never truncates to 60 seconds or to a percentage boundary. It must still find
a structural start/end, or show that no reliable single section is available.
Long genuine sections of short songs may consequently be declined. If a verse
cannot be separated, the full sheet is not a fallback. Line-based inference
still cannot hear hype/beat strength, certify a charanam or a sustained vocal's
finish; this is a tighter structural estimate, not audio analysis.

New mappings use `method:lyrics-structure-v2`, recording `vocalLines`,
`totalVocalLines` and `structure`. Version-40 lyric mappings remain stored but
are no longer playable; they are looked up/refined once as needed, retaining
the prior range in `previous`. Old negative lookups use a different namespace
and do not block this retry. Newly refined mappings reuse by ID/ISRC without
more lyric requests. AI estimates, approved file mappings, queues, keys and
stored manual marks are not deleted. No Gemini tokens are spent by refinement.

Manual marks beyond the selected end are ignored during planning, and new ones
are refused. Timed-lyric marks that would expand a passage to most of the song
are also ignored/refused. Planning always retains the selected end; it never
substitutes song duration. Existing marks stay stored, and valid corrections
continue working. Active playback still defers a correction until next play.

Validation: 73 controller/selection/library cases plus the mocked Chromium album
flow, now seeding a long v1 mapping and stale manual start, prove one-time v2
refinement, preserved previous values/marks, SDK starts at the new passage and
cached reload/cross-release reuse. Regression fixtures cover an entire lyric
sheet with one closing marker, inner stanzas, coverage rejection and repeated
refrain fragments. Existing player/catalog/file checks and responsive cases
pass. The real 409-second Thayya Thayya lyric record still selects its bounded
158.090–245.430 verse/refrain; no actual audio was auditioned. Verify reported songs against their exact recording data and actual audio.

## Automatic timed lyrics (Version 40)

Version 40 changes existing installations to Timed lyrics once, without deleting
old caches, queues or keys. A `passage_mode40` marker preserves later explicit
method changes. Select an album/artist as usual and tap Play. The file chooser
is hidden in the default mode. Startup preparation does not autoplay.

LRCLIB search is browser-accessible and requires no secret. Requests identify
Segue through `Lrclib-Client`, carry no Spotify authorization and serialize with
350 ms spacing after a response. 429/503 Retry-After creates a global cooldown
with positive jitter; queued requests respect it and prefetch retries afterward.
Provider network calls time out in ten seconds. Exact song title (only a From
album suffix may be removed), an overlapping credited artist and duration within
two seconds are required. Live/remix/version labels are retained; mismatches,
instrumental/unsynced records and unbounded final lines do not produce clips.
Album metadata is kept for choosing between otherwise matching records. These
checks reduce mismatches, but provider timestamps are not audio verification.

The LRC parser supports multiple timestamps, Unicode, fractional seconds and
simultaneous lines. Selection prefers complete blocks delimited by explicit
empty timestamp markers or stanza paragraphs. When these are absent, aligned
plain-lyric stanza breaks, repeated multi-line refrain starts or unusually long
line gaps estimate structural boundaries. Candidates favor an interior varied
verse rather than an opening or repetitive refrain. No fixed clip duration,
line-count clip or arbitrary final-line duration is used. A final vocal without
a following boundary cannot be assigned the recording end as a fallback.

This is lyric structure, **not hype/beat measurement or proof a charanam or
sustained vocal finished**. Explicit lyric gaps are preferable; a next-line start
is only an estimated boundary. The matched 409-second Thayya Thayya example
selected 158.090–245.430 seconds from real LRCLIB data; the actual musical ending
was not auditioned. Another recording/version can have different timestamps.

Derived schema-2 `source:timed-lyrics` timings and provider record IDs persist
in the existing local IndexedDB store and reuse by Spotify ID or verified
ISRC/duration. Full lyrics are processed transiently and not stored/displayed.
Previous AI ranges are retained when replaced. Ordinary list Clear and AI Reset
preserve lyric/local-reviewed mappings. `lyrics_lookups1` stores negative lookup
results (one day for missing matching sections; one minute for request failures,
or the server cooldown). Settings Retry missing lyrics clears those misses but
cannot bypass provider rate limits. No Gemini requests are made in this mode.

Prefetch processes songs sequentially until at least three upcoming songs cover
about ten minutes, or twelve songs were examined. These are preparation limits,
not album/artist song caps or excerpt rules. New playback/selection continues
preparing ahead; shared per-song promises avoid duplicate work. Mode changes and
Cancel reject late starts and stale callbacks. Cached choices need no re-query.
If the next song has no matching timed section, the player verifies pause and
shows the reason. It does not skip it, invent a cut or silently play the entire
song. Missing lyric coverage, provider errors, Spotify loading and iOS suspension
can still prevent uninterrupted playback. This release does not claim gapless
playback, fades, a native app or new lock-screen/CarPlay support.

Validation: 64 controller/selection/library checks; a new real Chromium mocked
album flow covers one-time default migration, zero file/AI prompts, matching,
prefetch, SDK transitions, missing lyrics, IndexedDB reload and cross-release
reuse. Existing catalog/database, file-analysis, shared-player and 14 responsive
size/theme checks pass. Live LRCLIB API/search/CORS and the example's section
were checked; real Spotify audio and iPhone playback still need listening tests.

## Matching audio files (Version 39)

Create/open a mix, then Settings → Matching audio file. Choose a Spotify song
and an unprotected matching MP3/M4A/WAV (browser codec support varies). Each
recording is paired manually: duration must match within one second, but that
alone cannot prove the recording/version matches. Files over 32 MiB, recordings
outside 12 seconds–12 minutes, unsupported codecs and silent signals fail visibly.

The browser decodes to 11025 Hz mono and runs original non-neural signal processing
in a cancellable Worker: windowed FFT, RMS energy, bass, positive spectral flux,
chroma similarity, structural novelty and sustained quiet gaps. Candidate sections
come from detected changes, ranked for energy/beat activity/repetition; there is
no fixed excerpt duration. Analysis windows and noise filters are not clip presets.
No clear boundary means manual range entry rather than fabricated timings.

Files/PCM are neither uploaded nor stored. This is not Spotify audio extraction.
Review suggestions using the existing Spotify transport, adjust start/end, then
Approve and save. Preview stops at its endpoint instead of advancing the mix and
is not cached. Only approval creates schema-2 `source:local-audio` timings with
`boundary:user-reviewed`; the user must verify the complete sung phrase ending.
The detector cannot recognize charanams, lyrics, vocal completion or subjective
best moments. Synthetic-tone tests do not establish musical selection quality.

Saved ranges use the existing local IndexedDB timing store, Spotify ID and
verified ISRC/duration reuse across release IDs. Approval clears an older manual
start for that song so the reviewed range is respected. No extra audio player,
background audio trick, model dependency or server is introduced. Prepare every
song's passage before listening: an unprepared song pauses with a matching-file
instruction rather than spending AI tokens or choosing a random excerpt. Spotify
loading latency/iOS suspension can still cause gaps.

Local-file mode ignores old AI-only estimates for playback but preserves them.
Switch to Gemini explicitly to use them/the saved AI key again. Mode changes
verify pause and invalidate pending AI generations. AI testing Reset preserves
approved local-file passages; ordinary list Clear still preserves all mappings.

Checks: 55 controller/library/selection cases; `local_audio_browser.py` exercises
real WAV decode, Worker suggestions, cancellation, mismatch rejection, editable
review/preview, zero AI/uploads, ISRC reuse and IndexedDB reload. Existing complete
catalog, shared-player and 14 responsive size/theme cases also pass with mocked
Spotify/Gemini. Real musical judgment and iPhone playback remain user checks.

## Explicit testing reset (Version 38)

Settings → **Reset AI timings for testing** clears AI-estimated timings
and their saved rows. Approved file passages and timed-lyric mappings remain.
In Gemini mode, the next uncached Play asks Gemini again. Ordinary list Clear
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
`ai_backup`, `ai_revision`, `recordings1` and account-scoped `library_*` records and `lyrics_lookups1` lookup results. It migrates legacy
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

- `node segue/tests/playback.test.cjs`: 78 controller/selection/library cases,
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
