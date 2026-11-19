# Google sign-in for Community (optional, off for now)

Community works with **Sign in with Apple** only. The Google button stays hidden until the steps
below are done. The code is already in place: the app uses `expo-auth-session` (plus `expo-crypto`,
both in the v2.4 build), and the server checks Google ID tokens (`server/src/auth.mjs`).

## 1. Make the OAuth client (Google Cloud Console, about 10 minutes)
1. Go to console.cloud.google.com → pick or create a project (for example "Immigration Wallet").
2. **APIs & Services → OAuth consent screen**: User type *External*, app name *Immigration Wallet*,
   support email, the privacy policy URL and `https://casedeskapp.duckdns.org/support` as the home
   page. Scopes: only `openid` (no email or profile needed). Publish the app.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **iOS**
   - Bundle ID: `com.vijaykannan.casedesk`
   - Create. Copy the **Client ID** (looks like `1234-abcd.apps.googleusercontent.com`) and the
     **iOS URL scheme** (the reversed id, `com.googleusercontent.apps.1234-abcd`).

## 2. Put it in the app (casedesk/app/app.json)
```json
"scheme": ["casedesk", "com.googleusercontent.apps.1234-abcd"],
"extra": { "googleIosClientId": "1234-abcd.apps.googleusercontent.com", ... }
```
The extra URL scheme lets Google send the person back to the app, so this needs a **new TestFlight
build** (not just an over-the-air update).

## 3. Put it on the server (.env on the Oracle server)
```
GOOGLE_CLIENT_ID=1234-abcd.apps.googleusercontent.com
```
Restart the server (`docker compose up -d` in casedesk/server). `/api/auth/google` answers
"Google sign-in is not set up yet" until this is set.

## Notes
- Apple's rule 4.8: an app that offers Google sign-in must also offer Sign in with Apple — it does.
- Only Google's stable user id is used (hashed on the server). Email and name are never requested or stored.
- Android later: add an Android OAuth client (package `com.vijaykannan.casedesk` + the signing SHA-1)
  and pass `androidClientId` in `src/screens/communityAccount.tsx` (`GoogleButton`); add that id to `GOOGLE_CLIENT_ID` (comma-separated).
