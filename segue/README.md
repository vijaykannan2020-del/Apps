# Segue — AI auto-DJ for Spotify

Live: https://vijaykannan2020-del.github.io/Apps/segue/

One file (`index.html`), plain HTML/CSS/JS, no Firebase, no backend.

- Sign-in: Spotify PKCE. The Spotify Client ID is typed into the app and kept in the browser (localStorage `segue_cid`). It is not a secret, but do not commit it.
- Spotify app settings (developer.spotify.com/dashboard): Web API + Web Playback SDK ticked; Redirect URI exactly `https://vijaykannan2020-del.github.io/Apps/segue/`. Dev mode: Premium, max 5 users, add each user under User Management.
- Song data: ReccoBeats `GET https://api.reccobeats.com/v1/audio-features` (free, no key) for tempo/key/energy. Spotify's own audio-features is closed to new apps. If ReccoBeats fails the app runs in "basic mode".
- Spotify Feb 2026 dev-mode limits handled: playlist items only for owned/collab playlists (`/playlists/{id}/items`), no artist top-tracks (uses search), search limit 10.
- Playback: Web Playback SDK in desktop browsers; on iPhone pick another Spotify Connect device under "Play on". Transitions are volume fades (one stream, no true overlap).
- DJ brain: `buildOrder()` (energy-arc matching + key/tempo/artist cost, swap/reverse refinement) and `planSegments()` (hook estimate, 8-bar phrase snapping, fade lengths).
- Raise `APP_VERSION` and the "Version N" label in the header on every change.
