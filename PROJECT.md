# Apps: project handoff

Read this file first, whichever assistant you are (Claude, ChatGPT or other).
It says what is in this repository, how it is deployed, and the rules for
changing it safely. Update the "Change log" at the bottom after every change.

Owner: Vijay (GitHub: vijaykannan2020-del). Family use only, for now.
Last updated: 2026-11-12.

## What is here

| Folder | What it is | Live address |
|---|---|---|
| `cinema-book/` | Cinema Book, the real app the family uses | https://vijaykannan2020-del.github.io/Apps/cinema-book/ |
| `cinema-book-test/` | Test copy of Cinema Book, for trying changes | https://vijaykannan2020-del.github.io/Apps/cinema-book-test/ |
| `plate-log/` | Plate Log, a separate food diary app | https://vijaykannan2020-del.github.io/Apps/plate-log/ |

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
  scroll, `.app` scrolls inside it, `.nav` is pinned at the bottom.
- Use only top and bottom safe-area insets. Left and right insets squeezed
  the bottom bar and were removed in Version 15.
- Check both light and dark mode after any colour change.

## Current state

- Real app (`cinema-book/`): Version 13.
- Test copy (`cinema-book-test/`): Version 15. Adds over 13: Wikidata
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

- 2026-11-12, ChatGPT: test copy Version 16, premium cinematic interface with purple accents, poster cards, modern typography and light/dark styling; preserves Firebase, diary features and Duo layout.

- 2026-11-12, Claude: added this handoff file.
- 2026-11-12, Claude: test copy Version 15, full-width bottom bar.
- 2026-11-12, Claude: test copy Version 14 created, with Wikidata search,
  season tracking, dark mode and pinned bottom bar.
- Earlier: real app at Version 13 (search fixes, posters, Post page,
  AI reviews, multi-platform texts, saved reviews, self-update).
