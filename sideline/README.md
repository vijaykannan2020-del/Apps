# Sideline

Live: https://vijaykannan2020-del.github.io/Apps/sideline/

Static HTML/JavaScript. No build step. Public Pages hosting has no built-in login. Personal settings stay in browser storage and do not transfer from the Sites domain. No movie providers preconfigured. Bulk playlists and stream-check URLs excluded from this public export; built-in channels remain available. Webtor opens externally. Own-server playback requires separate hosting (package in downloads/) and CORS origin https://vijaykannan2020-del.github.io. Never commit private source URLs or keys.

Torrentio / Debridio: Movies → Sources. "Play Torrentio inside the app" adds a debrid key to the Torrentio source (keeps its other options); the Debridio box connects Debridio. Enter the Debridio API key, debrid service and its key; the app builds the add-on link itself (stored only in the browser, never in the repo).

Version: on every change raise the number in `version.json`, and in `index.html` (`window.SIDELINE_VERSION`, `auth.js?v=`, the two "Version N" labels). Phones with an older copy see the newer `version.json` and reload themselves once.
