# Google sign-in for Community

Community works with **Sign in with Apple**. A **Sign in with Google** button appears beside it once
a Google client id exists. Everything else is already built: the app (`expo-auth-session`, in the
current TestFlight build), the server check (`server/src/auth.mjs`, verifies Google's signature,
issuer and that the token's `aud` is our client id) and the URL-scheme plugin
(`plugins/withGoogleSignIn.js`).

You do three things: make the client id, paste it in **two places**, and ship the next iOS build.

**Status (Nov 2026): steps 1 and 2 are done** — the client id `885132086293-472ihidqbu0ki9kst5aav0nqumie3l2g.apps.googleusercontent.com` is in `app.json` and `deploy.conf`. Only step 3 (the next TestFlight build) is left; until then the button stays hidden.

## 1. Make the client id (works in Safari on the iPhone, about 10 minutes)

1. Open **console.cloud.google.com** in Safari and sign in. If the page is cramped, tap **aA →
   Request Desktop Website**.
2. Top bar → project picker → **New project** → name it `Immigration Wallet` → **Create**, then
   select it.
3. Menu (☰) → **APIs & Services → OAuth consent screen** (Google may call it **Google Auth
   Platform → Branding**) → **Get started**:
   - App name `Immigration Wallet`, your support email.
   - Audience: **External**.
   - Contact email → agree → **Create**.
   - Under **Audience**, tap **Publish app** (otherwise only test users can sign in).
   - Nothing to add under scopes: the app asks only for `openid` — no email, no profile.
4. Menu → **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create
   credentials → OAuth client ID**:
   - Application type: **iOS**
   - Name: `Immigration Wallet iOS`
   - Bundle ID: `com.vijaykannan.casedesk`
   - App Store ID and Team ID can stay empty → **Create**.
5. Copy the **Client ID**. It looks like `1234567890-abcdefg.apps.googleusercontent.com`.
   There is no secret for an iOS client, and the client id is not a secret — it is fine in GitHub.

## 2. Paste the client id in exactly two places

Both are plain text files; the GitHub app or github.com in Safari can edit them (pencil icon).

| # | File | What to change |
|---|---|---|
| 1 | `casedesk/app/app.json` | `"googleIosClientId": ""` → `"googleIosClientId": "1234567890-abcdefg.apps.googleusercontent.com"` (under `expo.extra`) |
| 2 | `casedesk/server/deploy.conf` | `GOOGLE_CLIENT_ID=` → `GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com` (last line) |

Commit both to `main`. The server updates itself within a minute or two (`auto-update.sh`); it then
accepts Google tokens made for that client id and refuses any other. (A `GOOGLE_CLIENT_ID` in the
server's `.env` still works and wins over `deploy.conf`.)

## 3. Ship the next iOS build

Google sends people back to the app through a URL scheme made from the client id
(`com.googleusercontent.apps.1234567890-abcdefg`). A URL scheme lives inside the installed app, so
it needs a **new TestFlight build** — an over-the-air update cannot add it. You do not type the
scheme anywhere: `plugins/withGoogleSignIn.js` derives it from `googleIosClientId` at build time.

Until people install that build, the Google button stays **hidden**: the app asks iOS whether the
scheme is in the installed build and only then shows the button. Nobody sees a button that cannot work.

Check after installing the new build: Community → New post → the join sheet shows **Sign in with
Apple** and **Sign in with Google**.

### Optional: try it before the next build
The current build already has the bundle-id URL scheme (`com.vijaykannan.casedesk`), which Google
iOS clients have also accepted as a return address. To try that without a new build, add
`"googleUseBundleScheme": true` next to `googleIosClientId` in `app.json` and publish. If Google
shows a “redirect” error instead of returning to the app, remove the line and wait for the build.

## Notes
- Apple's rule 4.8: an app that offers Google sign-in must also offer Sign in with Apple — it does.
- Only Google's stable user id is used, hashed on the server. Email and name are never requested or stored.
- Turn it off again: empty both values. The button disappears and `/api/auth/google` answers
  “Google sign-in is not set up yet”.
- Android later: create an **Android** OAuth client (package `com.vijaykannan.casedesk` + signing
  SHA-1), pass `androidClientId` in `src/screens/communityAccount.tsx` (`GoogleButton`), allow it in
  `googleRedirect` (`src/core/community.ts`) and add the id to `GOOGLE_CLIENT_ID`, comma-separated.
- Tests: `server/test/forum-v27.test.mjs` (client id from deploy.conf, `aud` check) and
  `app/tests/community-v27.test.ts` (button hidden without the id or without the scheme in the build).
