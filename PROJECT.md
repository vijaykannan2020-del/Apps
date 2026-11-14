# Apps: project handoff

Read this file first, whichever assistant you are (Claude, ChatGPT or other).
It says what is in this repository, how it is deployed, and the rules for
changing it safely. Update the "Change log" at the bottom after every change.

Owner: Vijay (GitHub: vijaykannan2020-del). Family use only, for now.
Last updated: 2026-11-13.

## What is here

| Folder | What it is | Live address |
|---|---|---|
| `cinema-book/` | Cinema Book, the real app the family uses | https://vijaykannan2020-del.github.io/Apps/cinema-book/ |
| `cinema-book-test/` | Test copy of Cinema Book, for trying changes | https://vijaykannan2020-del.github.io/Apps/cinema-book-test/ |
| `sideline/` | Sideline: movies, Webtor, server connection and live TV | https://vijaykannan2020-del.github.io/Apps/sideline/ |
| `plate-log/` | Plate Log, a separate food diary app | https://vijaykannan2020-del.github.io/Apps/plate-log/ |
| `segue/` | Segue, AI auto-DJ for Spotify (see `segue/README.md`) | https://vijaykannan2020-del.github.io/Apps/segue/ |

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

- Real app (`cinema-book/`): Version 22 (moved from the test copy on 2026-11-12).
- Test copy (`cinema-book-test/`): Version 22 (neutral black-and-white look, ticket stubs for the diary, floating glass tab bar). Adds over 13: Wikidata
  search, season tracking, dark mode, pinned full-width bottom bar.
  Waiting for Vijay to confirm the bottom bar on his phone.

## Open items

- Confirm the full-width bottom bar on the Duo, then move 15 to the real app.
- Wikidata search has not been tested against the live service.
- Post page title picker uses TMDB only, not Wikidata.
- Ideas not started: episode-level tracking, separate practice data for the
  test copy.
- Going commercial would need a paid TMDB licence and different hosting;
  GitHub Pages and the free TMDB terms are for non-commercial use.

## Change log

Newest first. Add one line per change: date, who, version, what.

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
