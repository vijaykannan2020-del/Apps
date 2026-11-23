# Sideline

Live: https://vijaykannan2020-del.github.io/Apps/sideline/

Static HTML/JavaScript. No build step. Public Pages hosting has no built-in login. Personal settings stay in browser storage and do not transfer from the Sites domain. No movie providers preconfigured. Bulk playlists and stream-check URLs excluded from this public export; built-in channels remain available. Webtor opens externally. Own-server playback requires separate hosting (package in downloads/) and CORS origin https://vijaykannan2020-del.github.io. Never commit private source URLs or keys.

Torrentio / Debridio: Movies → Sources. "Play Torrentio inside the app" adds a debrid key to the Torrentio source (keeps its other options); the Debridio box connects Debridio. Enter the Debridio API key, debrid service and its key; the app builds the add-on link itself (stored only in the browser, never in the repo).

Version: on every change raise the number in `version.json`, and in `index.html` (`window.SIDELINE_VERSION`, `auth.js?v=`, the two "Version N" labels). Phones with an older copy see the newer `version.json` and reload themselves once.

Live TV / Cricket / Saved (Version 19+): built only from the user's add-ons (`live.js`). Live TV = every non-movie/series catalog; Cricket = cricket catalogs, a "Cricket" genre option, or items mentioning cricket/IPL/T20/ODI. The old built-in channels and public playlists are no longer shown or loaded (files kept in the repo).

Browse by add-on (Version 20+, `discover.js`): Home has Add-on / Type / List / Genre pickers (Cinemeta's full manifest plus every enabled add-on's catalogs) with Load more paging via `skip`.

Debrid account (Version 21+): Add-ons → "Your debrid account" stores one debrid key (`sideline-debrid`, device only) and writes `service=KEY` into every Torrentio-style source (Torrentio, KnightCrawler, any link with a debrid slot), including ones added later; Debridio uses it as provider key. Real-Debrid's API has no CORS, so plain magnets from other add-ons can't be resolved in the browser.

Language filter (Version 25, `lang.js`): Home has Cinema Book-style language chips (Tamil default, Malayalam, Telugu, Hindi, Kannada, English, Korean, All languages) and Movies/Shows. Rows (New releases, Popular, Top rated, All-time favourites) come from TMDB using Cinema Book's saved key (`apps/cinemabook/config/tmdb`, read at runtime, never in the repo). Tapping a title looks up its IMDb id so add-ons can find streams. With a language chosen, the generic Cinemeta rows are hidden; add-on rows stay. Choice saved per account on the device.
