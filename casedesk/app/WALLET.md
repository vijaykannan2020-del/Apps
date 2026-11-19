# Apple Wallet “Immigration status card” (v2.5)

A generic Wallet pass per person — **for personal reference, NOT an official document**. Front: name (full,
first or initials — chosen in the preview), status (e.g. “L-2S dependent”), valid until (I-94 / card), visa
stamp until, passport until, next deadline, and “For personal reference — Not an official document”. Back: the
full disclaimer, where the dates come from, when it was made, and the privacy note. No barcode. Never passport,
receipt, A-numbers, USCIS or SEVIS numbers (the app refuses to build such a card and the server refuses to sign
it). Colour by status type (work blue, dependent teal, student indigo, green card green, citizen navy, unknown
grey — a pass can’t change colour as days pass). `relevantDate` = valid-until so Wallet surfaces it. Re-adding
after a change replaces the old card (same opaque serial per person).

## App
- Person page (under the status card) and Family → **Wallet status cards** → pick a person → **preview first**
  (`src/screens/wallet.tsx`): name style, the card as it will look, what is sent, the back disclaimer.
- The button is Apple’s own **PKAddPassButton** (Apple’s guidelines say apps use this class, not badge artwork):
  local Expo module `modules/add-pass-button` (Swift). Older builds without it get a plain “Add to Apple Wallet”
  text button (no imitation of Apple’s badge).
- Presenting: `react-native-wallet-manager` **2.2.0** (published Oct 16 2026, TurboModule / New Architecture —
  RN 0.88 is New Architecture only; `showAddPassControllerFromFile` → PKAddPassesViewController). Older builds
  (no module): the `.pkpass` goes to the share sheet, where iOS offers Wallet. Hidden on Android/web.
- The button only shows when `GET /api/wallet/status` says `enabled: true` (server answers 503 otherwise).
- Card fields: `src/core/walletPass.ts` (tested). Request: `src/data/walletApi.ts`. No pass entitlement is needed
  in the app to add passes.

## Server (`casedesk/server/src/wallet.mjs`)
`POST /api/wallet/pass` validates a whitelist of fields (lengths, ISO dates, no document numbers), builds
`pass.json` + images (`server/wallet/*.png`), `manifest.json` (SHA-1 of every file), a **PKCS#7 detached
signature** (SHA-256, signing cert + WWDR intermediate) with `node-forge` 1.4.3 (pure JS, no dependencies), zips
it in memory and returns it. **Stores nothing, logs nothing** (privacy.html says so). 10 cards/hour per IP (plus
the server-wide 60/min). Tests sign with certificates generated in the test and verify with `openssl smime`.

Signing material, in order: `PASS_CERT_P12`+`PASS_CERT_PASSWORD`, or `PASS_CERT_PEM`+`PASS_KEY_PEM`, or (default)
the **server’s own key** `data/wallet/pass.key` (made on first start, mode 600, never leaves the server) + the
public certificate `server/wallet/pass.cer`. WWDR: `PASS_WWDR_PEM`, `server/wallet/AppleWWDRCAG4.cer`, or
downloaded from apple.com on first start. `PASS_TYPE_ID` defaults to `pass.com.vijaykannan.casedesk`;
`PASS_TEAM_ID` defaults to the certificate’s OU.

## Getting the certificate — owner has only an iPhone, so no openssl on a Mac
The Pass Type ID **pass.com.vijaykannan.casedesk is already registered** (owner, Nov 18). What’s left is its
certificate, which needs a CSR. The server already makes the key + CSR itself.

**Route A — automatic (try first).** After this branch is on `main` (server auto-updates within minutes):
GitHub → Actions → **CaseDesk Wallet certificate** → Run workflow. It fetches the server’s CSR, finds the Pass
Type ID, asks Apple for a `PASS_TYPE_ID` certificate (App Store Connect API: `POST /v1/certificates` with the
`passTypeId` relationship — documented by Apple), and commits the public `pass.cer` + WWDR certificate to
`casedesk/server/wallet/`. A few minutes later `https://casedeskapp.duckdns.org/api/wallet/status` says
`"enabled": true` and the app shows the button. (Some accounts get **403 FORBIDDEN** for this call since early
2026 — Apple forum thread 825289 — then the run ends with a warning and Route B.)

**Route B — 3 taps on the iPhone (if Apple refuses the API).**
1. Safari → `https://casedeskapp.duckdns.org/api/wallet/csr` → Download → saved to Files as
   `ImmigrationWallet-pass.certSigningRequest` (also attached to the workflow run as `wallet-csr`).
2. developer.apple.com/account → Certificates, Identifiers & Profiles → **Certificates → +** → **Pass Type ID
   Certificate** → Continue → choose **pass.com.vijaykannan.casedesk** → Continue → upload the file from Files →
   Continue → **Download** (`pass.cer`, saved to Files).
3. github.com → repo → `casedesk/server/wallet` → **Add file → Upload files** → pick `pass.cer` → Commit to `main`.
   (Then run the workflow once more, or just wait: if `AppleWWDRCAG4.cer` isn’t committed, the server downloads it.)

Nothing goes in `.env`. The private key stays in `/opt/casedesk/data/wallet/pass.key` on the server — back that
folder up with the server data; if it is lost, delete `wallet/pass.cer`, restart (a new key + CSR is made) and
repeat. The certificate is valid ~1 year: re-run the workflow with `force = 1` (or Route B) before it expires;
`/api/wallet/status` shows `certExpires`.

## App Store privacy label
Card fields are sent only when the user taps Add, used once to sign the pass and not retained — Apple’s “data
not collected” definition covers data processed in real time and not stored. STORE.md’s label stays as is;
the review notes can mention the optional Wallet card.

## Check on the iPhone after the TestFlight build
1. Person → **Add to Apple Wallet** (Apple’s black button) → preview → change name style → Add → Wallet sheet →
   Add. Wallet shows the card with the right colour, dates and “Not an official document”; back shows the disclaimer.
2. Change a document → add again → the card is replaced (not duplicated).
3. Turn off Wi-Fi → button stays but tapping says it needs a connection; server without certificate → button hidden.

Not verifiable here (no Mac/device/real certificate): Wallet accepting the pass (the signature is verified with
OpenSSL against a test CA; Apple’s WWDR chain only on device), PKAddPassButton rendering, the ASC API answer.
