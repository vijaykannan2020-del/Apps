# App Store listing — Immigration Wallet

Everything App Store Connect asks for, matched to what the code does in v3.0 (Nov 20, 2026).
The texts live in `store/listing.json` (one source: `scripts/store-upload.py` sends that file to App Store Connect).
The launch plan and the owner's morning checklist are in `LAUNCH.md`.
Items marked **CONFIRM** need the owner before submission.

## App information

| Field | Value | Limit |
|---|---|---|
| Name | Immigration Wallet | 18 / 30 |
| Subtitle (recommended) | USCIS Case Status & Green Card | 30 / 30 |
| Subtitle (current, fine too) | USCIS Case Updates & Status | 27 / 30 |
| Bundle ID | com.vijaykannan.casedesk (unchanged) | |
| SKU | casedesk (unchanged) | |
| App ID | 6836097003 | |
| Primary category | Productivity | |
| Secondary category | Reference | |
| Price | Free, no in-app purchases, all countries (or US + India + Canada first, see LAUNCH.md) | |
| Privacy policy URL | https://vijaykannan2020-del.github.io/Apps/casedesk/site/privacy.html | |
| Support URL | https://vijaykannan2020-del.github.io/Apps/casedesk/site/support.html | |
| Marketing URL | https://vijaykannan2020-del.github.io/Apps/casedesk/site/get.html | |
| Copyright | 2026 OWNER_LEGAL_NAME (**CONFIRM**: your full legal name, or your company) | |

### Name and subtitle options (keyword reasoning)

Apple searches the name, subtitle and keyword field together, and gives the name the most weight, then the
subtitle. A word counts once wherever it is, so never repeat a word across the three. Plurals and simple word
combinations are matched (“green” + “card” finds “green card”).

| Option | Name (30) | Subtitle (30) | Why |
|---|---|---|---|
| **A (recommended)** | Immigration Wallet | USCIS Case Status & Green Card | “uscis case status” is the biggest search in this niche (people paste receipt numbers daily); “green card” is the second. Both get subtitle weight; “updates” searches almost nobody. Frees the keyword field for visa types and forms. |
| B (current) | Immigration Wallet | USCIS Case Updates & Status | Already set. Keeps “uscis case status” but spends 7 characters on “updates”. Use keyword set B below. |
| C | Immigration Wallet | H-1B, Green Card & USCIS Case | Pushes the visa type up; slightly weaker on “case status”. |
| D (if Apple objects to “USCIS”) | Immigration Wallet | Visa, Case & Green Card Tracker | No agency name in the listing title (Guideline 5.2: names must not suggest government affiliation). Move uscis into keywords. |

Name: keep “Immigration Wallet”. Longer names such as “Immigration Wallet: H-1B & GC” rank a little better for
those words but look like keyword stuffing and get cut on the Home Screen. Change the subtitle with the
existing workflow `casedesk-store-name.yml` (inputs name and subtitle) or in App Store Connect → App Information.

### Promotional text (170, can change any time without review)

> Your family’s US immigration status in one place: deadlines, document reminders, case status, green card and Visa Bulletin. Documents are read and kept on your phone.

(166 characters.)

### Description (2959 / 4,000)

Benefit first, then features as short scannable sections, then the privacy promise and the disclaimer. The
description is not indexed for search on the App Store, so it is written for people, not keywords. The
disclaimer is near the top too, so App Review sees it at once.

```
Immigration Wallet keeps your family’s US immigration papers, dates and next steps in one place, on your phone. Made for H-1B, H-4, L-1, L-2, F-1 OPT and STEM OPT families and green card applicants.

Not affiliated with USCIS or any government agency. Not legal advice.

SEE YOUR WHOLE FAMILY AT A GLANCE
• How long each person can stay, worked out from their passport, I-94, approval notice, EAD or green card
• Needs attention puts the most urgent items first: an I-94 ending, a passport expiring, an extension to file
• The next filing for each person, the earliest date it can be filed and how long it usually takes

DOCUMENTS, READ ON YOUR PHONE
• Take a photo or pick a PDF of an I-94, I-797, EAD, passport, visa stamp or green card
• The dates are read on your phone and fill in each person’s status. Nothing is uploaded
• Copies for your reference, not an official ID

ALERTS BEFORE DATES
• Reminders before passports, I-94s, approvals, EADs, visa stamps and green cards expire, at the times you choose
• Alerts when a new Visa Bulletin is out and for official updates on your visa types

CASE STATUS AND WHAT TO EXPECT
• Add receipt numbers from your notices, by person
• Check status on uscis.gov in one tap: the app copies the number and opens the official site; paste the result back to keep the history
• Key dates for biometrics, interviews and RFE deadlines, and how long similar cases usually take

GREEN CARD AND VISA BULLETIN
• Your stage from PERM to I-140, I-485 and interview, with what happens next
• Is your priority date current? Final action and dates for filing, by category and country

PLAN AHEAD
• Can I travel? checks a trip against everyone’s documents before you book
• I lost my job: your last day in status and the options, step by step
• Processing times, fees, prevailing wage, visa appointment waits, H-1B employer data, I-9 documents and citizenship test practice
• Every data screen shows its date and links the official source

SHARE WITH FAMILY, SECURELY
• Send documents to your spouse’s phone in a file locked with a one-time code. Nothing goes to our server

COMMUNITY
• Ask questions and share timelines with people on the same visa. Moderated, with report and block. Sign in with Apple to post; reading is open

ON YOUR HOME SCREEN
• Widgets for the next deadline, an optional Wallet card for each person, search across everything and 7 colour themes

PRIVATE BY DESIGN
• No account needed. No ads, no tracking
• Names, documents and receipt numbers stay on your phone
• Optional encrypted backup to your own iCloud or a file, locked with your password
• Face ID lock

Immigration Wallet is not affiliated with, endorsed by or connected to USCIS, DHS, CBP, the Department of State, the Department of Labor or any government agency. Information comes from official public sources linked in the app and may change. This app does not give legal advice; for decisions about your case, talk to an immigration attorney.
```

### Keywords (100, comma separated, no spaces)

Set A (with subtitle A, 96 characters):
```
h1b,h4,l1,f1,opt,stem,i94,ead,i485,i140,i797,visa,bulletin,priority,date,tracker,passport,travel
```
Set B (if you keep subtitle B, 97 characters):
```
h1b,h4,l1,f1,opt,green,card,i94,ead,i485,i140,visa,bulletin,priority,date,tracker,passport,travel
```
Rules followed: no word from the name or subtitle (immigration, wallet, uscis, case, status / updates, green,
card), no spaces, no plurals of words already there, no competitor names or trademarks (no Lawfully, Case
Tracker, MyUSCIS, Boundless), no “app”, “free” or “best”. Hyphens are dropped (h1b finds “H-1B”). Review after 4
weeks in App Store Connect → Analytics → Sources (search terms) and swap the weakest 2–3 words.

### What’s New (version 1.0)

Apple hides What’s New on an app’s first version (the field is not editable for 1.0). Kept ready for 1.0.1:

> Welcome to Immigration Wallet 1.0. See your family’s status at a glance, get reminders before documents expire, check case status, follow your green card and the Visa Bulletin, check trips, share documents with family securely and ask questions in the Community.

## Age rating (questionnaire answers)

Apple’s 2025 questionnaire (ratings 4+, 9+, 13+, 16+, 18+). Answer:

| Question | Answer |
|---|---|
| Violence (cartoon, realistic, prolonged / graphic) | None |
| Sexual content, nudity | None |
| Profanity or crude humour | None |
| Alcohol, tobacco or drug use or references | None |
| Mature or suggestive themes, horror or fear themes | None |
| Simulated gambling, contests | None (the H-1B lottery tool explains the government selection; no gambling) |
| Medical or treatment information, health or wellness topics | None |
| Unrestricted web access | **No**: links open specific official pages (uscis.gov, travel.state.gov, dol.gov, news articles) in the system browser sheet; there is no general browser |
| User-generated content | **Yes**: Community (moderated: rules to accept, report, block, hidden after reports, 24 h review, account deletion) |
| Messaging and chat | **No** private messages (public posts and comments only) |
| Advertising | No |
| Parental controls, age assurance | No |
| Expected result | **4+** or **13+**. If App Store Connect computes 13+ because of user-generated content, accept it: it fits a forum for adults and avoids a 1.2 back-and-forth. |

## App Privacy (nutrition label) — checked against the code on Nov 20, 2026

Answer **Yes, we collect data**. Declare exactly these (all: **not** used for tracking, purpose **App Functionality** only):

| Data type | When | Linked to the user? | Where in the code |
|---|---|---|---|
| **Identifiers → User ID** | Community sign-in: hash of the Apple (or Google) user id and our random account id | Yes | `server/src/auth.mjs`, `server/src/forum.mjs` |
| **User Content → Other User Content** | Community posts, comments, display name, flair, reports, messages to moderators | Yes | `server/src/forum.mjs` |
| **Identifiers → Device ID** | Expo push token: kept with the account only if “Notify me of answers” is on; for news / Visa Bulletin alerts it is stored without any account (token + topics only) | Yes (the Community one) | `forum.mjs` pushToken, `server/src/push.mjs` |
| **Other Data** | Anonymous case timeline (form, office, dates, outcome), only if “Add my case anonymously” is on; random id, no account | No | `/api/community` |

Do **not** declare (not collected):
- Names, documents, files, photos, receipt numbers, dates, settings: stored only on the phone (`src/data/store.ts`); OCR runs on the phone (`src/native/ocr.ts`). Nothing from documents is sent anywhere.
- Contact info: the email in a sign-in token is never stored (`auth.mjs` keeps only a hash of the provider’s user id).
- Diagnostics: there is no crash or analytics SDK. The on-phone log (`src/native/diag.ts`, last 150 lines, no document contents) leaves the phone only if the user shares it by email, so it is not “collected”.
- Public-data requests (`/api/news`, `/api/visa-bulletin`, `/api/processing-times`, `/api/visa-waits`, `/api/wage*`, `/api/employer`, `/api/expect`): processed in real time, not stored.
- Wallet card: the card fields are sent once to be signed and are not stored or logged (`server/src/wallet.mjs`).
- Share with family: the locked file goes phone to phone through the share sheet; nothing goes to our server.
- Backups go only to the user’s own iCloud or a file.
- **CONFIRM:** `expo-updates` sends platform, runtime version and an install id to Expo’s update service. Expo’s privacy manifest treats this as not collected for tracking; keep “not collected” unless Expo’s current docs say otherwise.

Tracking: **No** (no App Tracking Transparency prompt). Account deletion is in the app (Community → Account → Delete account), as Guideline 5.1.1(v) requires.

## Export compliance (encryption)

`app.json` currently sets `ITSAppUsesNonExemptEncryption: false`.

The app uses HTTPS through iOS (exempt) **and** encrypts backups itself with AES-256-GCM and scrypt (`src/core/backup.ts`, `@noble/ciphers` / `@noble/hashes`) to keep the user’s own data confidential. Encryption that the app implements itself for data confidentiality is not one of Apple’s “exempt” cases (those cover encryption only inside Apple’s OS, authentication, or copy protection). So `false` is hard to defend.

**Recommendation (not changed in v2.3 — the owner should make the declaration):** set `ITSAppUsesNonExemptEncryption` to `true` at the next native build and answer App Store Connect’s questions as: uses standard encryption algorithms (AES, scrypt) instead of proprietary ones → qualifies for the mass-market exemption (EAR Category 5 Part 2, ECCN 5D992.c, License Exception ENC/mass market). Since March 2021 mass-market software with standard algorithms needs no BIS classification request or annual self-classification report, so no documents need uploading. Distribution in France may need an ANSSI declaration — exclude France or file it. The change only takes effect with a new native build (an OTA update can’t change Info.plist).


## Review notes (paste into App Review Information → Notes)

Sign-in required: **No** (leave “Sign-in required” unticked; no demo account is needed).

```
Thank you for reviewing Immigration Wallet.

NO ACCOUNT NEEDED. Every feature works without an account. The only sign-in is Sign in with Apple (Google too where set up), and only to post in Community (reading Community is open). All family data is typed or scanned by the user and stays on the device.

QUICKEST WAY TO SEE THE APP WITH DATA (no real documents needed):
On the first screen tap "Look around with an example family" at the bottom. (Later, with a family already added: Settings > tap the version line at the bottom 7 times to turn on developer tools > Help & tips > Example family.) This loads a made-up H-1B family (Arun, Meera, Leela) with documents, cases and reminders. Everything is fictional.

THINGS TO TRY
- Home: status, Needs attention, next deadline.
- Family > a person > a document: dates read from the document; "Copies for your reference - not an official ID".
- Cases > a case > "Copy number & open uscis.gov": opens the official USCIS site in Safari. The app never logs in to USCIS or reads the site; the user pastes the result back.
- Tools > Can I travel?, Priority date, Visa Bulletin, I lost my job.
- Family > Share with family: makes a file locked with a one-time code, sent through the share sheet. Nothing goes to our server.
- Community: browse without signing in; to post, Sign in with Apple and accept the rules. Moderation: report and block on every post, comment and profile; content reported by several people is hidden until a moderator reviews it, and reports are acted on within 24 hours; Community > Account > Delete account removes the account.

SCANNING: the camera or a photo/PDF is read on the device with Apple Vision; nothing is uploaded. To test, photograph any page with printed dates, or use the example family.

NOTIFICATIONS: document reminders are local notifications. Optional push alerts for a new Visa Bulletin and official updates (only a push token and chosen topics are stored, no account). Permission is asked only after an explanation screen: the Get alerts step in setup, or after the first document or case is added if setup was skipped.

WIDGETS: long-press the Home Screen > + > Immigration Wallet > choose a size. The widget shows the next deadline for the person chosen in Edit Widget (data shared through an App Group; nothing leaves the device).

WALLET CARD (shown when the server's Wallet signing is on): Family > Wallet status cards > pick a person > preview > Add to Apple Wallet. A personal-reference card, clearly marked "Not an official document"; no passport, receipt or A-numbers; the server signs it in memory and stores nothing.

Immigration Wallet is not affiliated with USCIS or any government agency. The disclaimer is on the first screen, in Settings > About and on Updates; every data screen ends with a source line (Source · as of date · Not legal advice) that opens the official source and the full disclaimer. Not legal advice.

Contact: immigrationwallet@gmail.com
```

## Screenshots

Made from the web export with the example family (made-up data only), headline + one line on black with a pastel
block and a simple drawn device frame (no Apple artwork). Files are outside the repo:

| Folder | Size | App Store Connect slot |
|---|---|---|
| `/home/claude/team/launch/screenshots/iphone-6.9/` | 1320 x 2868 | iPhone 6.9" (also covers 6.7", 6.5", 6.3", 6.1" by scaling) |
| `/home/claude/team/launch/screenshots/iphone-6.7/` | 1290 x 2796 | spare: use only if App Store Connect asks for 6.7" separately |
| `/home/claude/team/launch/screenshots/ipad-13/` | 2064 x 2752 | iPad 13" (required: supportsTablet is true) |
| `/home/claude/team/launch/screenshots/contact-sheet.png` | | all 24 on one page to check |

Order (same on every device): 01 Your family at a glance · 02 Documents, read privately · 03 Alerts before dates ·
04 Know where your case is · 05 Track your green card · 06 Safe to travel? · 07 Share with family, securely ·
08 Ask people on your visa. The first three show in search results, so they carry the main promise.
Scripts that made them: `/home/claude/team/launch/work/capture.mjs` (app screens) and `compose.mjs` (frames).

To upload by API instead of by hand: copy `iphone-6.9/` and `ipad-13/` into `casedesk/app/store/screenshots/`,
commit, push, then run the workflow **CaseDesk store listing upload** (see LAUNCH.md).

## Data to confirm before launch

### Built-in data (each is replaced by the live copy when our server answers; dates are shown in the app)

| Data | Built-in as of | Status | What to confirm |
|---|---|---|---|
| Visa Bulletin (EB) | November 2026 | Partly checked | India EB-1/2/3 final action and filing dates confirmed by the owner against travel.state.gov (Nov 19, 2026). Other EB-1/2/3 final action and filing dates match two summaries (cilawgroup.com Oct 22, 2026; Newsweek). Not confirmed: Other Workers and EB-5 filing dates; EB-3 Mexico filing (one summary says Mar 15, 2026 — left blank); Other Workers / EB-5 Mexico & Philippines filing (blank). Confirm on travel.state.gov. |
| Which chart USCIS uses (Nov 2026) | Dates for Filing | Unverified | Summaries disagree; confirm on uscis.gov “Adjustment of status filing charts”. |
| EB-2 India vs news | — | Resolved | The Nov 2026 news item quotes the **final action** date (Nov 1, 2013); the app used to show only the **filing** date (Jan 15, 2015) on Priority date. It now shows both, labels which one USCIS uses this month, and explains that news usually quotes the final action date. Built-in values match the bulletin. |
| Processing times | Oct 19, 2026 | Unverified | 20 rows in `src/content/processing.ts` against egov.uscis.gov/processing-times. |
| Fees | Nov 2026 | Partly checked | Premium processing $2,965 (I-129/I-140) and $1,780 (I-765 OPT) from Mar 1, 2026 checked. Other lines (I-129 $780/$460, I-140 $715, I-485 $1,440, I-765 $260, Asylum Program Fee $600/$300, H-1B registration $215, ACWIA $750/$1,500, fraud fee $500) follow the Apr 1, 2024 rule — recheck G-1055. PL 114-113 fee “$4,000 / $4,500 on extensions since Sept 9, 2026” not confirmed. |
| Visa appointment waits | Sep 17, 2026 | Unverified | Five India posts only. |
| Prevailing wage | Live only | — | No built-in copy; the server shows the OFLC wage year. |
| H-1B employer data | FY 2025 | Unverified | Top-employer counts in `src/content/h1b.ts` against the Data Hub. |
| H-1B lottery facts | Nov 17, 2026 | Unverified | FY 2028 season dates when USCIS announces them (`src/content/lottery.ts` NEXT_SEASON). |
| Citizenship questions | 2025 test (M-1778 09/25) | Checked | — |
| Status rules | Nov 18, 2026 | Checked | — |

### Launch settings

1. **Support email** — done: `immigrationwallet@gmail.com` in `casedesk/site/*.html`, `src/content/legal.ts` and the server (`MODERATION_EMAIL` in `deploy.conf`).
2. **Host the pages** (Nov 20 check: the API server serves only `/support`, not `/privacy.html` or `/support.html`; GitHub Pages serves `casedesk/site/*` from `main`, so use the Pages URLs above in App Store Connect, and point `PRIVACY_URL` in `src/content/legal.ts` at the Pages copy in the next OTA update): `casedesk/site/privacy.html`, `support.html`, `style.css` must be reachable at the Privacy / Support URLs above (the API server doesn’t serve static files yet — add a Caddy `file_server` route or use GitHub Pages and update `SITE_BASE` in `src/content/legal.ts`). A `duckdns.org` domain works but a own domain looks more trustworthy to reviewers and users.
3. **Encryption declaration** — see Export compliance (recommend `true` + mass-market exemption).
4. **Copyright holder** name.
5. **Home-screen name**: `app.json` `name` is now “Immigration Wallet”; the icon label changes only with the next native build (OTA can’t change it).
6. Kept on purpose (not user-visible or would break existing installs): slug/scheme `casedesk`, bundle id, iCloud container `iCloud.com.vijaykannan.casedesk` and its private folder “CaseDesk Backups”, iCloud backup file names `CaseDesk-<date>.casedesk`, storage keys `cd2.*`, backup format id `CASEDESK-BACKUP 1`, the `.casedesk` extension, the server’s User-Agent string.
7. `expo-updates` privacy (see App Privacy).
