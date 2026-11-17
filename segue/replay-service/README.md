# Segue replay trial backend

This is an **unconnected experimental integration**, not a deployed replay feed.
It serves the static Segue app without exposing the YTAPI provider key. No audio
is downloaded, no Spotify token is accepted/sent, and no Gemini call is made.

A YTAPI account/key and a backend host are required. The provider currently
advertises 200 free signup credits; no account was created or credits purchased
by this change. Its documented API was used to implement the adapter. Live
provider/Tamil-song coverage has not been tested without credentials.

## Cloudflare Worker (free hosting option)

From this directory, with your own Cloudflare account:

```sh
npx wrangler login
npx wrangler deploy
npx wrangler secret put YTAPI_API_KEY
npx wrangler secret put REPLAY_ACCESS_TOKEN
```

Enter the YTAPI key at the first secret prompt. Generate a separate random
32-byte connection token (for example `openssl rand -hex 32` in your own terminal)
and enter it at the second. Neither secret belongs in Git. The connection token
allows your personal app to use the service; it is not the provider key.

Optional shared durable cache: run `npx wrangler kv namespace create REPLAY_CACHE`
and add the returned namespace ID to `wrangler.jsonc` under:

```json
"kv_namespaces": [{ "binding": "REPLAY_CACHE", "id": "YOUR_NAMESPACE_ID" }]
```

Deploy again after adding that binding. Cached successful regions last 30 days.
Without KV, browser IndexedDB still keeps saved regions, but new browsers or
users repeat the provider lookup. Missing results are cached only by the app;
its explicit Retry can then actually request fresh data from the backend.

## Existing server option

Use Node 22+ with `node server.mjs`. Supply `YTAPI_API_KEY`, `REPLAY_ACCESS_TOKEN`
and optionally `PORT` through a private environment file/process manager. The
adapter binds only to `127.0.0.1:8787`; put an HTTPS reverse proxy in front of it.
No npm dependencies or new database are required. Provider credentials must stay
on that server. This adapter does not provide the optional Cloudflare KV cache.

`ALLOWED_ORIGIN` defaults to `https://vijaykannan2020-del.github.io`. Change it
only to the exact origin hosting your own Segue deployment. Authentication is
required even for `/health`; CORS alone is not authentication.

## Connect the app

Open Segue Version 42 → Settings → **Replay trial · setup**. Enter the backend's
HTTPS origin and the separate **connection token**. Click Connect and use replay.
This verifies the service configuration, saves the connection locally, then
switches methods after confirming pause. Provider access is tested by the first
actual lookup. Do not paste the YTAPI key into the phone app.

No setup means no automatic mode change and no provider requests. Existing
lyrics, file and saved queues keep working. Selecting Replay before setup opens
the connection panel rather than replacing the current method with a dead feed.

## Data and limitations

The backend searches YTAPI (`/v1/search`) then checks up to three duration-matched
videos using `/v1/videos/{id}/video-info`. Only Topic/auto-generated release audio,
with matching Music-section title/artist and duration within one second, proceeds
to `/v1/videos/{id}/heatmap`. Film edits, live versions, mismatches and unknown
metadata are rejected. Metadata/duration checks **do not prove identical audio
alignment**. No audio fingerprint comparison is possible through Spotify SDK.

The provider returns peaks and a condensed replay curve. The adapter requires
valid contiguous curve data, ignores opening-only peaks, and finds surrounding
valleys. A named verse/chorus chapter wholly within that region is preferred.
There is no fixed excerpt duration. A flat graph, unknown graph, malformed
response or region over half the recording does not become a guessed clip.
These are **replay-region estimates**, not proof of hype or a complete charanam,
and valleys can still cut across singing. The UI explicitly states this.

Each uncached successful song uses between 3 and 7 provider credits (one search,
then metadata and graph checks for up to three candidates). Missing graphs are
not charged by YTAPI, but search/metadata can still consume credits. No purchases,
auto top-up or unlimited scans are enabled. The app prepares at most three songs
ahead per invocation and caches successful results by recording on the device.
The worker spaces provider requests, limits a lookup to about 32 seconds, and honors Retry-After; account-wide traffic
from other apps/isolates can still hit provider limits. Errors are surfaced.

Client requests contain only song ID/name/artists/duration and the app connection
token. Provider requests use only the backend's YTAPI key. No arbitrary upstream
URL, Spotify authorization, cookies, audio stream or provider error body is
forwarded to the app. Keep the connection token private: holders can use credits.

`GET /health` returns configured status, not a successful live catalog test.
`POST /v1/replay` returns `status:ready` with a validated derived region or an
explicit `status:unavailable` reason. A missing region pauses playback; the
user has not authorized automatically skipping songs or playing whole songs.

## Checks

```sh
node worker.test.mjs
node ../tests/playback.test.cjs
python ../tests/replay_browser.py
```

Twelve backend tests cover matching, data-derived ranges, malformed/flat/absent
graphs, chapter boundaries, provider/auth isolation and missing-data behavior.
Browser tests use mocked service/Spotify responses: they are not a successful
live replay-data or audible Tamil-section test.

Provider docs: https://docs.ytapi.dev/videos/heatmap/,
https://docs.ytapi.dev/videos/info/ and https://docs.ytapi.dev/search/query/.
The legacy free replay endpoint returned 404 and direct YouTube access returned
403 during investigation; neither is used as a production dependency.
