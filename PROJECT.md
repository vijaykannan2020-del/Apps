# Apps: project handoff

Read this file first, whichever assistant you are (Claude, ChatGPT or other).
It says what is in this repository, how it is deployed, and the rules for
changing it safely. Update the "Change log" at the bottom after every change.

Owner: Vijay (GitHub: vijaykannan2020-del). Family use only, for now.
Last updated: 2026-11-15.

## What is here

| Folder | What it is | Live address |
|---|---|---|
| `cinema-book/` | Cinema Book, the real app the family uses | https://vijaykannan2020-del.github.io/Apps/cinema-book/ |
| `cinema-book-test/` | Test copy of Cinema Book, for trying changes | https://vijaykannan2020-del.github.io/Apps/cinema-book-test/ |
| `sideline/` | Sideline: movies, Webtor, server connection and live TV | https://vijaykannan2020-del.github.io/Apps/sideline/ |
| `plate-log/` | Plate Log, a separate food diary app | https://vijaykannan2020-del.github.io/Apps/plate-log/ |
| `speaknative/` | SpeakNative: American English speaking coach (AI role-play with feedback, Polish rewrites, drills with pronunciation check). Same Firebase sign-in | https://vijaykannan2020-del.github.io/Apps/speaknative/ |
| `segue/` | Segue: plays saved passages selected from timed lyrics in Spotify albums, artists and playlists. Full handoff in `segue/README.md` | https://vijaykannan2020-del.github.io/Apps/segue/ |
| `my-inbox/` | My Inbox: own Beeper-style unified inbox for WhatsApp, Instagram and Messenger. NOT a GitHub Pages app: it runs on Vijay's own VPS (Docker: Synapse + mautrix bridges + push gateway + Caddy). Setup in `my-inbox/README.md`; holds no secrets (created on the server by `setup.sh`) | Vijay's own domain (not Pages) |

Hosting is GitHub Pages from the `main` branch. A push to `main` is live in
one to two minutes. There is no build step and no package manager.

## Cinema Book in one paragraph

A movie and web-series diary used on an iPhone as a Home Screen web app.
Search any film or series, see the official poster and where it streams
(USA and India), log it as watched or on the watchlist with half-star
ratings, where, when and in which language it was watched, plus notes.
Series have season tracking (completed and pending). There are monthly and
yearly numbers split by movies and series, and a Post page that turns a
review into a 1080x1350 image with texts for Instagram, X, X thread,
Facebook, Threads and WhatsApp, with optional AI rewriting (including
Tanglish).

## How it is built

- One file per app: `index.html` holds all HTML, CSS and plain JavaScript.
  No framework, no bundler. Keep it that way.
- `manifest.json`, `icon-180.png`, `icon-512.png` are the Home Screen files.
- Backend is Firebase only (compat SDK 10.12.2, loaded from the CDN):
  email and password sign-in, and Firestore. Project id `my-apps-1ed9e`.
- **Supabase is not used.** An earlier Expo and Supabase attempt was
  dropped. Do not add it back.
- Data paths in Firestore, all under `apps/cinemabook/`:
  - `users/{uid}/entries/{key}`: one document per film or series
  - `config/tmdb` with field `token`: the TMDB key
  - `config/ai` with field `key`: the AI key (Gemini or Claude)
- Firestore rules allow only the two family email addresses. Plate Log uses
  the same Firebase project and the same sign-in.
- Film data: TMDB API v3 (search, details, watch providers, trending).
  Second source for missing titles: Wikidata.
- AI review writing: Gemini REST, trying several model names in order, or
  the Claude API if the saved key starts with `sk-ant`.

## Secrets

- The Firebase web config inside `index.html` is meant to be public. Leave it.
- The TMDB key and the AI key are **never** written into the code or this
  repository. They are typed once into the app's Settings page and stored in
  Firestore. Do not ask Vijay to paste them into chat or commit them.

## Main parts of `index.html`

- Sections: `v-home`, `v-book`, `v-stats`, `v-post`, `v-set`; bottom bar `#nav`.
- `APP_VERSION` constant near the top of the script, and a matching
  "Version N" label on the Settings page. The app checks for a newer copy of
  itself and reloads (`checkUpdate()`).
- TMDB helpers: `tm()`, `card()`, `cards()`, `details()`.
- Wikidata: `wd()`, `wikiSearch()`, `openWiki()`.
- Search: `search()` merges TMDB spelling variants with Wikidata results.
- Title page: `openTitle()`, `openSheet()`, `wireForm()`, `wireSeasons()`,
  `save()`, `del()`.
- Post page: `startPost()`, `aiText()`, `useOpt()`, `paintPlat()`, `drawPost()`.
- Theme: `paintTheme()`, colour tokens in CSS, `data-theme` on the root.

## Rules for making changes

1. **Change the test copy first.** Edit `cinema-book-test/index.html`, never
   `cinema-book/` directly. Vijay checks the test copy on his phone.
2. **Raise the version every time.** Add 1 to `APP_VERSION` and change the
   "Version N" label on the Settings page to match. Without this the phone
   keeps showing the old copy.
3. The test copy differs from the real app in three small ways only: page
   title "Cinema Book Test", Home Screen name "Cinema Test", and a
   "Test copy" badge in the heading. Keep those when editing it.
4. **Move to the real app only when Vijay says "move it".** Then copy the
   test `index.html` into `cinema-book/`, undo the three test-only
   differences, and commit.
5. The test copy and the real app share the same Firestore data. Do not run
   anything in the test copy that deletes or rewrites entries in bulk.
6. Before starting, pull the latest `main`. After finishing, add a line to
   the Change log below. This is how Claude and ChatGPT avoid overwriting
   each other.
7. One change per commit, with a plain message such as
   "Cinema Book test copy: Version 16 - short description".
8. Do not touch `plate-log/` unless Vijay asks.
9. Segue has no test copy. Changes go straight to `segue/index.html`; raise
   its `APP_VERSION` (the labels read from it) and tell Vijay to open the
   address with `?v=N` at the end.

## Phone layout notes

Vijay uses a foldable iPhone ("Duo"). On it, the clock and Wi-Fi pill sit at
the top right and cover part of the page.

- Keep important buttons away from the top-right corner. The region switch
  and Close button stay on the left.
- The page is a fixed shell: `body` is a full-height column that does not
  scroll, `.app` scrolls inside it, `.nav` is pinned at the bottom (since Version 22 as a
  floating capsule with `position:fixed`; it still never scrolls).
- Use only top and bottom safe-area insets. Left and right insets squeezed
  the bottom bar and were removed in Version 15.
- Check both light and dark mode after any colour change.

## Current state

- Real app (`cinema-book/`): Version 26.
- Test copy (`cinema-book-test/`): Version 26 (same as the real app).
  search, season tracking, dark mode, pinned full-width bottom bar.
  Waiting for Vijay to confirm the bottom bar on his phone.
- Segue (`segue/`): Version 41. Spotify sign-in, automatic timed-lyric passage selection with
  saved recording reuse and optional file review/Gemini estimates, and a phone layout matching Cinema Book are in place. Player
  now uses one shared transport on every screen, observed playback phases,
  shuffle/repeat/seek and saved queues. Pending work is not shown as Playing. Simulated checks pass; live phone confirmation pending.
  Details, limits and open items: `segue/README.md`.

- SpeakNative (`speaknative/`): Version 3. No test copy; changes go straight
  to `speaknative/index.html` with `APP_VERSION` raised. Firestore paths under
  `apps/speaknative/`: `users/{uid}` (one progress document: days, scores,
  phrasebook, mistakes, voice settings) and `config/ai` (optional own key).
  With no own key it reads Cinema Book's `apps/cinemabook/config/ai`.
  Microphone uses Safari's built-in speech recognition (`webkitSpeechRecognition`);
  voice: natural Gemini TTS (models listed from the key, `*-tts`; WAV or raw PCM
  wrapped to WAV, played through one unlocked `Audio` element; per-character
  voices) with the phone's speech voices as fallback. Voice key at
  `apps/speaknative/config/voice`, else the AI key if it is Gemini. AI: Claude (`claude-sonnet-5-5`) or Gemini.

## Open items

- Confirm the full-width bottom bar on the Duo, then move 15 to the real app.
- Wikidata search has not been tested against the live service.
- Post page title picker uses TMDB only, not Wikidata.
- Ideas not started: episode-level tracking, separate practice data for the
  test copy.
- Going commercial would need a paid TMDB licence and different hosting;
  GitHub Pages and the free TMDB terms are for non-commercial use.

## Change log

- 2026-11-15, Claude: My Inbox Version 16. App shell is sized to window.visualViewport (CSS vars --vvh/--vvt) so the composer sits directly above the iOS keyboard instead of leaving a black gap; no safe-area padding under the composer while the keyboard is up. Note: iOS's ⌃ ⌄ ✓ form bar above the keyboard cannot be removed from a web app (only a native wrapper avoids it).

- 2026-11-15, Claude: My Inbox Version 15. Floating dock hides while the keyboard is open (visualViewport + focus detection). Search mode: big title hides, filters stay, a back chevron on the LEFT closes search (top-right is covered by the foldable's clock). Swipe colours only render while a row is being swiped (no coloured outline at rest).

- 2026-11-15, Claude: My Inbox Version 14. All / Unread / Groups filter chips under search (chats opened from Unread stay listed until the filter changes). Swipe a chat right = read/unread, left = archive; swipe a message right = reply. Avatars and images no longer flicker on redraw (resolved blob URLs reused synchronously). Bridge name suffixes like "(WA)" hidden in names.

- 2026-11-15, Claude: My Inbox Version 13. Bridge commands sent from setup chats (login…, list-logins, cancel, help, logout) get the bridge prefix (!wa / !ig / !fb) so they work in any setup chat, not only the first "management room"; answers (usernames, codes, options) are sent as typed. Accounts reuses any existing chat with the bridge bot (preferring the management room) instead of creating a duplicate. Added a cancel button.

- 2026-11-15, Claude: My Inbox Version 12. Accounts → App → "Check for updates" (reloads straight into a newer deployed version, otherwise says up to date). Server auto-update now runs every minute (auto-update.sh rewrites its own cron line and holds a flock so runs never overlap).

- 2026-11-15, Claude: My Inbox Version 11 adds WhatsApp-style features. Long-press a chat: mark read/unread (m.marked_unread account data), pin (m.favourite tag), mute (room push rule with no actions), archive (m.lowpriority tag; archived chats behind an "Archived" row). Long-press a message: quick reactions (one per person, toggle), reply (m.in_reply_to, quote shows the original, tap to jump), copy, edit own text (m.replace), delete for everyone (redaction). Read ticks from the other side's read receipts (✓ sent, blue ✓✓ read), typing… in header and list. Sync filter now includes those account-data, push-rule and ephemeral types; snapshot keeps tags/unread/receipts/muted. Pin/archive/mute/unread live in the inbox only (not guaranteed to sync to the phone apps); reactions, replies, edits, deletes and read state go through the bridges.

- 2026-11-15, Claude: My Inbox Version 10. Saves a compact snapshot of rooms (last 30 messages each, needed members) plus the sync position in localStorage, so reopening shows chats instantly and only fetches changes (Synapse's full initial sync is slow on the 2 GB server). Shows "Syncing your chats…" on a first sync; Accounts won't create a duplicate setup chat while the first sync is still running; a rejected sync position resets to a fresh sync. Snapshot cleared on logout.

- 2026-11-15, Claude: My Inbox Version 9. Added `APP_VERSION` in `my-inbox/web/index.html`, shown in Accounts and on the login screen. The app checks the server every 5 minutes and when reopened, and shows "Version N ready · Tap to update" when the deployed file has a higher number. RULE: bump `APP_VERSION` by 1 on every My Inbox change.

- 2026-11-15, Claude: My Inbox setup chats switch off auto-capitalise/autocorrect in the message box (an auto-capitalised Instagram profile name failed the exact-match option).

- 2026-11-15, Claude: My Inbox also turns bridge prompts like "Options: `Text message`, `WhatsApp`…" into tap buttons. Note: Instagram's "Notification on another device" 2FA step fails through the bridge; use Text message / WhatsApp / Authentication app codes.

- 2026-11-15, Claude: My Inbox setup chats turn the bridge bot's login-flow list into tap buttons (e.g. `login android`, `login phone`), so login commands don't have to be typed.

- 2026-11-15, Claude: My Inbox servers now auto-deploy: `my-inbox/auto-update.sh` runs every minute (cron, installed by update.sh/setup.sh; Version 12+), checks this repo's main with git ls-remote, and only when the my-inbox folder actually changed copies it in and runs docker compose up -d --build. data/ and .env are never touched. So a push to my-inbox/ on main goes live on Vijay's server within ~5 minutes.

- 2026-11-15, Claude: My Inbox redesigned to the shared Apps look: Apple-style light/dark tokens from Cinema Book, floating glass bottom dock (All / WhatsApp / Instagram / Messenger / Accounts) with unread dots, large left title, Accounts as a full page instead of a top-right button and sheet. Nothing important in the top-right corner (foldable clock/Wi-Fi pill); default status bar style; only top/bottom safe areas.

- 2026-11-15, Claude: My Inbox now ignores the hidden bridge bots when counting chat members, so one-to-one WhatsApp chats no longer show "3 members" or per-message sender names. Added `my-inbox/update.sh` (pull latest code from this repo and restart, keeping data/.env). First real install is live on Vijay's DigitalOcean server with WhatsApp linked.

- 2026-11-15, Claude: My Inbox setup can now run unattended as a DigitalOcean initialization script (env vars INBOX_DOMAIN/INBOX_USER/INBOX_PASS/DUCKDNS_TOKEN), points the DuckDNS address at the server itself, waits for the package lock on fresh servers, and installs a weekly Sunday 4am self-update cron.

- 2026-11-15, Claude: Added `my-inbox/`, a self-hosted unified inbox (private Matrix server with mautrix WhatsApp/Instagram/Messenger bridges, one-page PWA client, Web Push notifications via a small push gateway, security hardening in setup.sh). Server project, not served by Pages. Tested against a mock Matrix server only; not yet run on a real VPS or with real accounts.

- 2026-11-15, ChatGPT: Segue Version 41 fixes near-whole-song lyric selections: inspect stanzas/refrains inside explicit outer blocks, coalesce continuous repeated hooks, prefer one verse/refrain return, and reject over-half-recording or 65%-of-vocal-line candidates rather than truncate to a timer. Old lyric-v1 mappings refine once to v2 with previous ranges retained; other caches/queues/keys/manual marks preserved. Fixes manual-start-after-end fallback to full track duration and rejects oversized manual lyric expansions. 73 controller/selection cases plus seeded-v1 Chromium refinement/SDK/reload tests and existing player/catalog/file/layout checks pass. Still structural estimates, not audible hype or guaranteed vocal-completion detection.

- 2026-11-15, ChatGPT: Segue Version 40 defaults to automatic timed lyrics, replacing the matching-file prompt for existing installations once. Uses identified, sequential LRCLIB requests; strict title/credited-artist/duration matching; structural section boundaries rather than fixed clips; saved ID/ISRC reuse; ahead preparation; negative caching and Retry-After cooldown. Full lyrics are transient, not stored/displayed; no Gemini calls in default mode. Missing sections pause visibly rather than guessing/skipping/full-song fallback. Prior caches/keys/queues retained; manual file/Gemini methods stay optional. 64 unit/controller cases, automatic mocked Chromium album/migration/prefetch/SDK/reload tests and existing catalog/file/player/14-layout checks pass. Live API/CORS/example timing checked; lyrics cannot measure hype or certify a vocal ending, and actual iPhone/Spotify audio remains unverified.

- 2026-11-15, ChatGPT: Segue Version 39 adds matching audio files, local non-neural signal analysis in a cancellable Worker, variable suggested sections and editable review using the same Spotify player. Approval saves local-audio timings for recording/ISRC reuse; files never upload or persist. Local mode defaults on, makes no AI requests, preserves prior AI values and requires passages to be prepared before continuous listening. AI Reset retains approved local mappings. 55 controller cases, real WAV/Worker/cancel/mismatch/review/database browser checks, existing catalog/player flows and 14 responsive cases pass. Detector does not certify charanam/vocal completion; actual music and phone verification pending.

- 2026-11-15, ChatGPT: Segue Version 38 adds Settings “Reset AI timings for testing” as a separate action from list Clear. It backs up the previous nonempty AI cache, clears mappings/visible AI rows, resets queue timing readiness and waits for Play before fresh requests. Retains albums/order, sources, keys, recording identity metadata and manual start corrections. Persisted generation and callback guards reject pre-reset answers/queues so they cannot refill the cache or clobber fresh work. Confirms stop for active streams; works before first browser playback. No automatic/reset-on-deployment deletion on a user's phone. 50 controller/AI/library cases plus real mocked-browser reset/backup/durable fresh-request and phone playback checks passed.

- 2026-11-15, ChatGPT: Segue Version 37 explicitly requests ONE complete charanam and its final sung syllable, stopping before the following verse; rejects new whole-recording AI fallback ranges. Removes late-AI extension through the rest of the song: pause is verified at the selected passage end before waiting for the next answer. Shared pause verification and Retry pause avoid accidental resume after a failed stop. Existing cached timings are preserved without automatic AI re-spending; instruction applies to new selections. 46 controller/AI/library checks cover completion wording, exact ranges, whole-song rejection, late-next wait and ignored-pause recovery. Actual vocal endpoints remain AI estimates requiring listening verification.

- 2026-11-15, ChatGPT: Segue Version 36 follows Vijay's clarified simple flow: full album/available artist catalog, Gemini best-charanam-with-beat question, save returned timing and play. Removes count picker, 120-track sampling and capped artist search; preserves album order and pages all artist releases/tracks. Startup/playback AI batch sizes adapt to input budget and skip saved recordings; removes new lyric lookup and post-answer extensions. Reuses timings by Spotify ID or verified ISRC/duration across release IDs, with lazy metadata enrichment and no title-only copying. Adds IndexedDB timing/identity/library storage with legacy migration/backups, serialized writes and explicit post-migration open failure. Existing valid choices remain reused without automatic AI re-spending. Centers Play in both deck/compact player. 44 controller/AI/library checks, full-catalog/cache/database browser checks and 14 size/theme layout cases pass; real Gemini accuracy, Spotify catalog availability and phone background/CarPlay limits remain.

- 2026-11-15, ChatGPT: Segue Version 35 replaces the transport with one serialized SDK-only controller. Web API loads one URI; local SDK controls/state handle pause/resume/seek and reject a different song. Removes account-wide playback fallback, native queue adoption, volume/worker logic, ReccoBeats/genre/harmonic analysis, fixed 30–75s/45s fallbacks and technical player badges. AI selects variable complete passages; optional recording-matched LRCLIB timing markers inform endings. Eight-song prefetch continues current audio to a known marker/song end if next AI is late. Old AI values remain stored but capped picks revalidate once to schema 2; lists/corrections preserved. Notification Previous/Next registered, ten-second skip handlers removed; explicit stable Segue manifest identity added. Plate Log notification-launch report remains unverified; no web launch-URL setter exists. Cinema Book neutral palette retained with the right CD deck/left bounded queue. 36 rebuilt-controller/AI/library checks and full browser/layout simulations replace old controller-specific tests; real vocal completion, iPhone controls/routing, fades/CarPlay and gapless timing are not claimed.

- 2026-11-14, ChatGPT: Segue Version 34 switches to browser-only Spotify Web Playback SDK at Vijay's request; removes native output selection/discovery, legacy output preference, Open Spotify instructions and external fallback. SDK Media Session explicitly enabled; guarded custom actions refreshed after SDK events. Connection errors cancel preparation; reconnect reuses the SDK without autoplay. Playing now has a large rotating CD with the single transport inside its right-hand deck and a bounded scrolling queue/cut times on the left; the same controls float elsewhere. Saved mixes open directly in this listening view without autoplay. Rotation requires actual fresh progress and honors reduced motion. Saved mixes/AI mappings retained. All 84 controller checks cover browser-only mutations, reconnect, media actions and stale-poll cancellation during paused navigation/seek; 14 layout/theme cases and the complete mocked SDK/browser flow pass; actual iPhone/lock-screen/CarPlay/protected audio remains unverified and iOS limits documented.

- 2026-11-14, ChatGPT: Segue Version 33 places the wide Playing queue left and deck right, and adds a silent one-second cassette opening animation with no input/startup blocking and a reduced-motion skip. Spotify starts now carry current + up to 99 upcoming URIs; observed native Next in that submitted mix/output follows the selected song and seeks its saved AI passage without another Play. Paused selection stays silent; missing AI pauses while preparing; unrelated outputs/songs still detach. Browser SDK media actions refresh on state events, guard output ownership, include stop/skip-seek, and update metadata/position without clearing transient paused sessions. All 80 controller checks, 14 layout/theme cases and browser playback flows pass. Native queue snapshots/shuffle/history and iOS suspension/CarPlay limits are documented; real phone/CarPlay confirmation is pending. No Spotify playlist created; AI mappings retained.

Newest first. Add one line per change: date, who, version, what.

- 2026-11-15, Claude: SpeakNative Version 3: one voice for everything by default (per-character voices now opt-in, existing setting reset), working TTS request shape remembered, fallback request no longer carries style words that could be spoken, one retry then a 15-minute switch to the phone voice with a notice instead of alternating voices.

- 2026-11-15, Claude: SpeakNative Version 2: natural AI voice (Gemini TTS) replaces the robotic phone voice by default, with a male or female voice per Talk character, voice picker, Gemini voice key setting, audio cache, and automatic fallback to the phone voice.

- 2026-11-15, Claude: new app SpeakNative Version 1 in `speaknative/`: Talk (10 role-play scenarios, per-reply native rewrite, fixes, score, hands-free mode, repeat-after-coach check), Polish (three native versions of any sentence), Drills (6 decks plus a My mistakes deck, Listen and Say it pronunciation scoring), Me (streak, phrasebook, mistakes, voice/speed, AI key, sign out). Cinema Book look and floating tab bar, light/dark, top/bottom safe areas only. Firebase sign-in shared with the other apps.

- 2026-11-14, Claude: Version 26 in both test copy and real app. Rewatch button shows on every watched entry (not only dated ones). A new rewatch must have a place and date before saving. Every earlier watch is editable (date, where, language, rating). Numbers: counts every watch (monthly/yearly lists show rewatches, Where/Language bars include them), rewatches tile always shown, new hours-watched tile counting rewatches.

- 2026-11-14, Claude: moved Version 24 (rewatches) from the test copy into the real app. Both are now Version 24.

- 2026-11-14, Claude: test copy Version 24, "+ I had also watched it before" adds an earlier watch from before the app (`views` item with `before:true`, date optional, editable inline). Counts toward "Watched N times" and the rewatches tile; undated ones are left out of the monthly chart.

- 2026-11-14, Claude: test copy Version 23, rewatch support. Entry field `views` is a list of earlier watches `{on, where, lang, rating}`; the main fields stay the latest watch. Title page has "I watched it again" (moves the current watch into `views` and starts a new one dated today) and an "Earlier watches" list with Remove. Ticket shows "Watched N times"; Numbers counts every watch in the 12-month chart and adds a rewatches tile.

- 2026-11-14, ChatGPT: Segue Version 32 visual/foldable update: explicit 1120px content cap; wide Home/Create/Playing/Settings grids; compact wide artwork and player, bounded long names. Reuses Cinema Book Version 22 Liquid Glass capsule tokens/520px geometry and selected pill; floating shared player capped at 840px above it. Actual chrome heights reserve scroll room across rotation/status wrapping, with observer-free fallback; solid/reduced-transparency and reduced-motion fallbacks retained. 14 populated size/theme cases (including phone landscape and 1280×900 Duo), rotation, 44px targets, scroll clearance, glass/fallback checks passed. Playback controller is byte-identical to Version 31; all 72 regressions and phone playback browser flow pass. Other apps and saved mappings untouched.

- 2026-11-14, ChatGPT: Segue Version 31 deep player correction: replaces duplicate small/full controls with one persistent shared transport and central phases; busy is not playing. Moving track/device-matched progress is required, frozen/stale streams buffer/fail honestly, pause is verified and failures stay unconfirmed. Serialized/cancellable/coalesced actions prevent late-start races. Added upcoming-only shuffle, repeat Off/All/One, bounded seek, correct paused Next/Previous and restart/history semantics, checkpoint/mode persistence. Opening active mix and creating another mix do not restart current audio; live correction marks apply next play; rename is nonblocking. Filters unavailable tracks, supports short-song picks, rejects stale searches, reports muted output without forcing volume. 72 regressions plus all-view browser flows at four widths/both themes and phone fault injection passed. Full contract and live-phone limits in `segue/PLAYER_REQUIREMENTS.md`; actual Spotify/iPhone sound and locked-screen reliability remain unverified.

- 2026-11-14, ChatGPT: Segue Version 30, held for review before publishing: verifies actual Spotify track/device/playing position after play and resume, rather than trusting 204. One bounded corrective seek for ignored start/resume position or a later intro reset; never seeks another track/device and stops with retry if unconfirmed. Stale/erroring SDK state falls back to Web API. Restored undecided mixes wait for AI; cached timestamps are validated. Faster polling near a passage boundary, cancellation/device snapshot guards, and API budgets include token refresh. Version 29 Clear controls retained. 55 simulated regressions plus browser flows with deliberately ignored start/resume timestamps passed. Real Spotify/iPhone transport and AI musical accuracy remain unverified.

- 2026-11-14, ChatGPT: Segue Version 29: separate confirmed Clear controls for saved mixes and displayed AI song list. Mix clear detaches auto-save so it stays cleared while active playback continues. Song clear persists hidden IDs without modifying best-part mappings or manual corrections; newly created mixes can reuse/show those picks without AI calls. Source draft, setup and Spotify playlists remain intact. 40 simulated regressions and browser confirm/cancel/clear/reopen checks across four widths in light/dark verify retained AI cache.

- 2026-11-14, ChatGPT: Segue Version 28 complete listening-flow redesign: Home/Create/Playing/Settings, saved mix cards and Continue, searchable saved AI song picks, player output/status and mini-player, rename and fresh-order controls. Account-scoped local library persists selected sources, count, mix tracks/order and last recorded song/position; restores without autoplay or new AI requests. Retains existing keys/timings; Spotify-only metadata lookup can reveal older timing-only saved songs. Temporary Spotify outages no longer hide a known account's stored library. Runtime promises/credentials excluded from snapshots; no audio downloads or cloud sync. Added Reload app. 35 simulated regressions and browser create/save/search/rename/play/reopen/resume/outage flows passed across four widths in light/dark. Real Spotify/iPhone lock-screen playback still unverified.

- 2026-11-14, ChatGPT: Segue Version 27: fixes stale/phantom output selection, prefers active Spotify phone on iPhone, respects selected output, excludes restricted/failed devices and recovers a 404 by refreshing and retrying the same song. Handles disconnected/failed browser SDK and shows device lookup errors. Added Open Spotify / Refresh devices controls and foreground discovery without auto-play. Confirms existing per-song AI cache reuse across playlists/reopens, displays saved count, removes automatic old-pick eviction and reports storage failures. 26 simulated regression checks and Chromium device-recovery/layout checks at four widths in light/dark passed. Real Home Screen/iPhone playback still requires confirmation; native Spotify must expose a device.

- 2026-11-14, ChatGPT: Segue Version 26: waits for the first AI pick and uses eight-song batches ahead; exact AI passages, no timed fallback to estimates, finite quota retries and retained backup models. Stable current passage/order; no transition volume changes; retry the same failed song instead of silently skipping. Fresh matching-track/device state, external pause/resume, frozen pause position and explicit URI/position on resume, new-mix session reset, cancellation and late-start guards. Late AI pauses at the boundary rather than playing an unchosen passage. Added 19 simulated regression checks and updated the handoff/root README links. Chromium checks passed at four widths in light/dark with mocked Spotify, plus manifest/icons. Real Spotify/AI and iPhone background behavior remain unverified.

- 2026-11-14, Claude: rewrote `segue/README.md` as a full Segue handoff (goal, what Vijay rejected, limits, code map, current state, open items) and added Segue to the rules and Current state sections here. No code change.

- 2026-11-14, Claude: Segue Version 25 player fixes. Skips: after a song change the Spotify SDK briefly reports the previous song's position, which triggered an instant second change; position is now only accepted when the reported track matches, plus a 2.5 s guard. Overruns: song changes no longer wait for the AI (only Play / tapping a song waits, up to 45 s for the first song); a failed start is retried, then the next song is tried. AI looks 4 songs ahead. Prompt now asks for the best passage anywhere (charanam, interlude, reprise), not the opening pallavi; cache key ai4.

- 2026-11-14, Claude: Segue Version 24 redesign to match Cinema Book: fixed full-height shell with inner scrolling, rounded bottom tab bar (Mix, Playing, Settings), top/bottom safe areas only, nothing in the top-right corner, neutral black-and-white palette with automatic light and dark mode. AI key, Play-on device and Log out moved to Settings. Energy chart and technical transition notes hidden on phones. Version label is now set from APP_VERSION in JS (header and Settings). No logic changes.

- 2026-11-14, Claude: Segue Version 23: song-change clock is also driven by a Web Worker and re-checked when the page becomes visible, because a song played far past its end (likely Safari throttling timers while the page was not in front).

- 2026-11-14, Claude: Segue Version 22: Gemini free tier allows only 20 requests a day per model, so one request now covers the song about to play plus up to 7 after it (about 4 requests per 30 songs), and when a model's allowance is used up Segue moves to the next model (Flash-Lite etc.).

- 2026-11-14, Claude: Segue Version 21 fixes "AI error: Fetch is aborted" (Gemini Flash gave no answer within the time limit): 35 s limit per request, then it moves to the next model (newest Flash-Lite, then the -latest aliases) and remembers which one answered.

- 2026-11-14, Claude: Segue Version 20 respects Gemini's free limit (5 requests a minute): at least 13 s between AI requests, and on a 429 it waits the time Google gives and asks once more instead of failing.

- 2026-11-14, Claude: Segue Version 19: the AI is asked about one song at a time, just before it plays (current song plus the next two; `AI.one`, `aiAhead`), instead of the whole mix up front. Playback waits up to 12 s for the answer on the song about to start. Rows not yet decided say "AI decides just before it plays".

- 2026-11-14, Claude: Segue Version 18 (Vijay's request: just ask the AI and play). Lyrics lookup and the seconds picker are removed from the flow. The AI gets title, artists, length and bpm, and returns start, end (30-75 s), mood and reason per song; Segue plays exactly that part. Cache key ai3. Only option left is number of songs. Lyrics code remains in the file but is not called.

- 2026-11-14, Claude: Segue Version 17 fixes the AI failing on retired Gemini model names: it now lists the key's available models and uses the newest gemini-N-flash, falling back to gemini-3.8-flash and gemini-flash-latest; the error text names the model tried.

- 2026-11-14, Claude: Segue Version 16 shows an AI status box above the running order (off / working n of m / counts per method / error text). Empty AI answers are no longer cached, and the prompt now requires a numeric guess for songs without timed lyrics.

- 2026-11-14, Claude: Segue Version 15 removes the Vibe, Which part and Transition options from the screen (Vijay found them confusing). Only sources, seconds per song and number of songs remain; internally it uses smooth flow, peak part and DJ cut.

- 2026-11-13, Claude: Segue Version 14: clip length is now exact seconds (30/45/60/90/full). Running order shows "plays 1:34 → 2:19" and how each hook was chosen (it used to show only clip length, which read like a start time). AI now also handles songs without timed lyrics: untimed LRCLIB lyrics (line number) or its own estimate, labelled "AI estimate"; extra title-only lyric search; caches lrc3/ai2. AI card shows counts per source and any AI error. Order stays fixed once shown; AI works in play order in batches of 5 (thinking allowed, 90 s limit) while music plays and only updates songs not yet played. Tempo weight raised, arc weight lowered, to cut BPM jumps.

- 2026-11-13, Claude: Segue Version 13 fixes very slow builds: time limits on every outside call (ReccoBeats 10 s, AI 45 s, genres step 12 s, lyrics step 40 s with 6 parallel lookups), Gemini 2.5 "thinking" turned off, and the AI now runs in the background after the mix is ready (saved AI picks apply instantly; new ones update hooks, or the whole order if not yet playing).

- 2026-11-13, Claude: Segue Version 12 adds AI DJ: with a Gemini (AIza…) or Claude (sk-ant…) key saved in the browser (localStorage segue_aikey, never committed), songs are sent in batches of 10 with title/artist/bpm/energy/style and LRCLIB timed lyrics; the AI returns the best-loved start time (accepted only if it matches a real lyric line) plus mood. Results cached (segue_ai1). Hook priority: user > AI > lyrics chorus > estimate. Mood added to ordering cost and shown in tags and running order.

- 2026-11-13, Claude: Segue Version 11: "Which part" option, Peak chorus (default: last chorus occurrence that still fits, usually the 2nd/3rd and biggest) or First chorus. Lyrics matching widened (±8 s, fallback free-text search, new cache key lrc2 so earlier misses retry). No-lyrics estimate moved to ~50-60% of the song for Peak. Build summary shows how many choruses came from lyrics.

- 2026-11-13, Claude: Segue Version 10 orders by tempo and music type too: intensity = 72% energy + 28% tempo (Build-up speeds up), stronger BPM weight, and a style distance from the sound (dance, energy, acousticness, speechiness, mood, instrumental) plus Spotify artist genres when returned (cached, max 40 artist lookups). Shows a style tag per song and "same style / → new style" in the running order.

- 2026-11-13, Claude: Segue Version 9 finds each song's hook from time-stamped lyrics (LRCLIB search; chorus = most-repeated block of lines, first chorus after 20 s, minus one beat), with Set hook here / ±2s / Reset controls saved per song in the browser. Priority: user mark > lyrics > old estimate. Lyrics are only used for timing, never shown.

- 2026-11-13, Claude: Segue Version 8 removes the Mix in Spotify button (at Vijay's request) and never changes volume on phones/tablets (fades could leave the phone near silent); auto-picks this browser, else the active device, else the phone.

- 2026-11-13, Claude: Segue Version 7 adds Transition: DJ cut (default) / Smooth fade. DJ cut starts each song on its hook, ends the previous one at a phrase boundary with a quick 260 ms duck, and fires early by the measured Spotify play delay so the hook lands on the bar line.

- 2026-11-13, Claude: Segue Version 6 fixes a blank page when signed in: shows a "Connecting to Spotify" screen, times out Spotify calls after 15 s, stops waiting on long rate-limit (429) delays, and shows the reason with Try again / Log out.

- 2026-11-13, Claude: Segue Version 5 replaces "Save as playlist" with "Mix in Spotify": saves the DJ order as a private playlist, opens it in the Spotify app (open.spotify.com universal link) and shows how to use Spotify's Mix → Auto (or Crossfade) for real overlapping transitions.

- 2026-11-13, Claude: Segue Version 4 removes YouTube mode at Vijay's request (embedded YouTube showed ads even with Premium on iPhone Safari). Back to Spotify-only playback as in Version 2; clears the stored YouTube key and match cache from the device.

- 2026-11-13, Claude: Segue Version 3 adds "Play through: YouTube" (default). Spotify still supplies sources, order and key/tempo/energy; each song is matched to a YouTube video (YouTube Data API key typed into the app, stored only in the browser; matches cached) and played on two visible YouTube decks with real overlapping transitions chosen per pair: Blend (8 bars), Quick mix (4 bars) or Drop swap. Blends need a desktop browser; iPhone Safari ignores video volume so it switches on the beat. Spotify mode unchanged.

- 2026-11-13, Claude: Segue Version 2 always uses the exact address https://vijaykannan2020-del.github.io/Apps/segue/ as the Spotify redirect (moves the page there if opened at a different case/path), fixing "redirect_uri: Not matching configuration".

- 2026-11-13, Claude: added Segue Version 1 in `segue/`. Spotify auto-DJ: pick playlists/albums/artists/Liked, orders songs by key, tempo and energy arc (ReccoBeats data), plays the best part of each with beat-aligned fades, saves the running order as a playlist. No Firebase; Spotify Client ID typed into the app. Other apps unchanged.

- 2026-11-14, ChatGPT: Sideline Version 12 separates title discovery from stream providers: default Cinemeta movie/show metadata search (no playback provider auto-added), plus connected catalogs. All enabled providers remain in source filters even with zero results. Selected titles show per-provider checking, result count, empty, authorization/rate/server/network/timeout or unsupported-ID states. Stream requests allow 45 seconds and results update progressively; metadata retains 12-second limit. Stream resource ID-prefix guards prevent incompatible queries. No user's Flix account configuration was inspected; source output/playback availability still depends on provider. Mocked discovery/status/filter and provider regression checks passed.

- 2026-11-14, ChatGPT: Sideline Version 11 adds filters inside selected-title source results: configured add-on, reported quality, language, format, maximum size and minimum seeders. Combined filters retain provider configuration notices, show visible/total counts and an empty state, and support Clear filters. Resets filters on a new title; existing stream-order preference remains separate. Provider labels escaped; no source URLs or keys used as select values. Unknown metadata excluded when a matching constraint is requested. Mocked combined-filter and provider/movie/episode regressions passed.

- 2026-11-14, ChatGPT: Sideline Version 10 forwards a restricted set of browser-permitted add-on request headers (Authorization, Accept, Accept-Language, Range) to same-origin HLS/DASH manifest/segment requests. Forces JS HLS on supported Safari media-source paths when such headers are needed; uses Hls.js 1.6.15 and disables remote playback for ManagedMediaSource support. Does not spoof User-Agent/Referer/Origin/cookies, forward headers cross-origin or modify DRM license requests. Recognizes MKV/AVI filenames for external handoff. Playback details reports counts and safe restricted-header categories, never values. Added Firecore's official sample via Test app player. Native/progressive video with required headers, restricted headers, CORS rejection or incompatible codecs may still require an external relay; no relay has been hosted. Mocked policy, Safari routing, DASH/header filtering and provider regressions passed; actual user's MediaFusion URL/device could not be inspected or verified.

- 2026-11-14, ChatGPT: Sideline Version 9 adds a safe Playback details report (known add-on/cloud labels, format, header requirement, media states/error only; never URLs, titles, account IDs or tokens). Cloud labels are only identified if explicitly present in stream metadata; unknown is not proof of no configured provider. Added Copy safe report. Fixed repeated waiting events extending the buffering timeout indefinitely and stops stalled playback on terminal failure. User provider configuration remains on their device and was not inspected. Mocked diagnostics/privacy, stall and provider regression tests passed; actual MediaFusion stream not verified.

- 2026-11-14, ChatGPT: Sideline Version 8 recognizes Comet's explicit non-debrid-disabled/invalid-credential notices instead of offering misleading video/Infuse/copy controls for their placeholder URLs. Notices remain visible with the strict size filter. Clears stale copied source/magnet panels when results refresh or reorder. Valid media playback unchanged; no debrid service connected. Mocked notice and provider regression checks passed.

- 2026-11-14, ChatGPT: Sideline Version 7 adds stream order preference: under 3 GB first (default), only under 3 GB, or original add-on order. Size groups rank by reported seeders descending. Reads explicit byte sizes or GB/GiB/MB descriptions and reported seeder fields/common labels, never infers counts from trackers. Strict filter excludes unknown sizes and files >=3,000,000,000 bytes. Original results preserved for restoring order; saved preference uses account-scoped browser storage. Live stream metadata may be absent. Sorting applies to source results after choosing a title, not poster search or the backend downloader. Sorting and movie/show regression tests passed.

- 2026-11-14, ChatGPT: Sideline Version 6 adds lazy-loaded Shaka 4.16.8 clear-DASH playback with quality selection, teardown and stale-request guards. Empty proxyHeaders no longer block video; header-bearing HLS/DASH expose an explicit direct attempt plus Infuse handoff, warning that custom headers are not forwarded. Genuine DRM results remain unsupported without provider authorization. externalUrl results open provider pages. Improved media error messages; no stream relay, license keys, or provider credentials added. Mocked tests cover formats, header handling, handoffs, DASH lifecycle and movie/show regressions. Actual iPhone/provider playback unverified.

- 2026-11-14, ChatGPT: Sideline Version 5 adds generic Stremio `tv` catalog browsing via TV/Events, selectable catalogs and sport/language genres, including required genre parameters and catalogs beyond the first four. TV live streams use live playback semantics; replay/highlight catalogs remain on-demand. DASH-only/DRM results are not offered as browser video playback. No add-on preconfigured and no membership credentials committed. Mocked tests cover TV lookup, Tamil genre, replay defaults, live flag, plus movie/show regression checks.

- 2026-11-13, ChatGPT: Sideline Version 4 removes the left sidebar at every screen width in favor of a consistent floating bottom bar. Replaced native movie/show dropdown with touch tabs, aligned search actions, hid scrollbars, and hid the dock while the software keyboard is open. Search submission dismisses the keyboard. Firebase login preserved. Actual iPhone visual testing remains pending.

- 2026-11-13, ChatGPT: Sideline Version 3 reuses the existing Cinema Book Firebase email/password login and shared browser auth session. Before loading app scripts it reads only `apps/cinemabook/users/{uid}` from the server to verify access under existing Firestore rules; no Cinema Book diary/config writes and no rule changes. Sideline preferences remain browser-local, now scoped per UID, with legacy settings adopted by the first signed-in account. Server key remains session-only and is cleared at sign-out/account change. A shared Firebase sign-out also affects Cinema Book in that browser. No cross-device settings sync yet.

- 2026-11-13, ChatGPT: Sideline Version 2, phone/foldable fixed-height app shell with inner scrolling, safe-area spacing, floating bottom navigation on mobile, aligned source/server actions and search, responsive dialogs, and standalone Home Screen manifest. Existing color palette preserved. GitHub Sideline only; Cinema Book and other apps unchanged.

- 2026-11-13, ChatGPT: added Sideline v1 in `sideline/` at Vijay's request. Movie-first page, side-menu TV/cricket, Webtor handoff, optional separately hosted torrent server. Plain static HTML/JS with no Firebase integration or sign-in. Browser-local settings do not migrate from Sites. Bulk playlists and stream-health URLs excluded from public export; built-in channels and source controls retained. Existing apps unchanged.

- 2026-11-12, Claude: moved Version 22 from the test copy into the real app (`cinema-book/`) at Vijay's request. Real app and test copy are now the same version.

- 2026-11-12, Claude: test copy Version 22, bottom tabs are now a floating glass capsule (position fixed, inset from the edges, max 520px wide and centred on the unfolded Duo, blurred translucent background, glass highlight on the selected tab). Page content scrolls behind it, so `.app` has extra bottom padding. Solid fallback when blur or transparency is unavailable.

- 2026-11-12, Claude: test copy Version 21, neutral black-and-white streaming-app look at Vijay's request: black background in dark mode, white primary buttons, system font, no purple or background glow; subtle ticket tints kept. All in one "Version 21" block at the end of the style section, so it is easy to adjust or remove.

- 2026-11-12, Claude: test copy Version 20, diary entries back to the ticket-stub layout (small poster left, details, tear-off rating on the right, tinted by where watched) inside the Liquid Glass look. Vijay prefers tickets for the diary; do not turn them back into poster cards.

- 2026-11-12, ChatGPT: test copy Version 19, responsive bottom dock sizing: tabs fill ordinary phones and cap at 150px each, centered on the unfolded Duo; all five tabs remain visible.

- 2026-11-12, ChatGPT: test copy Version 18, fixed Post title search so it stays in-app, prevents the browser reload, and displays TMDB title results with selection and change controls.

- 2026-11-12, ChatGPT: test copy Version 17, Liquid Glass redesign with translucent blurred surfaces, poster-led diary grid and carousel, oversized editorial heading, glass dock, refreshed statistics and detail sheets; light/dark and reduced-transparency fallbacks, Firebase and Duo shell preserved.

- 2026-11-12, ChatGPT: test copy Version 16, premium cinematic interface with purple accents, poster cards, modern typography and light/dark styling; preserves Firebase, diary features and Duo layout.

- 2026-11-12, Claude: added this handoff file.
- 2026-11-12, Claude: test copy Version 15, full-width bottom bar.
- 2026-11-12, Claude: test copy Version 14 created, with Wikidata search,
  season tracking, dark mode and pinned bottom bar.
- Earlier: real app at Version 13 (search fixes, posters, Post page,
  AI reviews, multi-platform texts, saved reviews, self-update).
