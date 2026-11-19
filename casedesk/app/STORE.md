# App Store listing — Immigration Wallet

Everything App Store Connect asks for, matched to what the code does in v2.3 (Nov 18, 2026).
Items marked **CONFIRM** need the owner before submission; the full list is at the end.

## Name and text

| Field | Value | Limit |
|---|---|---|
| Name | Immigration Wallet | 18 / 30 |
| Subtitle | USCIS Case Updates & Status | 27 / 30 |
| Bundle ID | com.vijaykannan.casedesk (unchanged) | |
| SKU | casedesk (unchanged) | |
| Primary category | Productivity | |
| Secondary category | Reference | |
| Price | Free, no in-app purchases | |
| Privacy policy URL | https://casedeskapp.duckdns.org/privacy.html (**CONFIRM** hosting, see below) | |
| Support URL | https://casedeskapp.duckdns.org/support.html | |
| Copyright | 2026 Vijayakannan Krishnan (**CONFIRM** legal name / company) | |

### Promotional text (170)

> Your family’s US immigration status in one place: USCIS case updates, document expiry reminders, the Visa Bulletin and processing times. Private — stays on your phone.

(167 characters.)

### Description (4,000)

> Immigration Wallet keeps your family’s US immigration papers and dates in one place — on your phone, not in the cloud.
>
> SEE WHERE EVERYONE STANDS
> • How long each person can stay, worked out from their passport, I-94, approval notice, EAD or green card
> • “Needs attention” puts the most urgent items first: an I-94 ending, a passport expiring, an extension to file
> • The next filing for each person, the earliest date it can be filed, and how long USCIS usually takes
>
> TRACK USCIS CASES
> • Add receipt numbers from your I-797C notices, by person
> • Check status on uscis.gov in one tap: the app copies your receipt number and opens the official site; paste the result back and the status, date and history update
> • Key dates for biometrics, interviews and RFE deadlines
>
> ADD DOCUMENTS IN SECONDS
> • Take a photo or pick a PDF — the text is read on your phone, nothing is uploaded
> • Copies for your reference — not an official ID
>
> REMINDERS AND ALERTS
> • Reminders before passports, I-94s, approvals, EADs, visa stamps and green cards expire
> • Alerts when a case status changes and when a new Visa Bulletin is out
>
> TOOLS
> • Can I travel? — checks a trip against everyone’s documents
> • Priority date and Visa Bulletin, USCIS processing times, fees, prevailing wage levels, visa appointment waits, H-1B employer data, layoff plan, I-9 documents and a citizenship test practice
> • Every data screen shows its date, whether it is live or a built-in copy, and links the official source
>
> PRIVATE BY DESIGN
> • No account, no ads, no analytics, no tracking
> • Your documents, names and receipt numbers never leave your phone
> • Optional encrypted backups to your own iCloud or a file, locked with your password
> • Face ID lock
>
> Updates for your visa types — H-1B, H-4, L-1, L-2, F-1 OPT and STEM OPT, green card, citizenship — from USCIS, DHS, DOL and the State Department, plus news coverage, clearly labelled.
>
> Immigration Wallet is not affiliated with USCIS, DHS, DOL, the State Department or any government agency. Information comes from official public sources linked in the app. Not legal advice. For decisions, talk to an immigration attorney.

### Keywords (100)

```
uscis,case status,green card,h1b,visa bulletin,i-94,ead,priority date,h4,opt,receipt,tracker,i-797
```
(98 characters. “Immigration” and “Wallet” are already in the name; don’t repeat them.)

## Age rating (questionnaire answers)

| Question | Answer |
|---|---|
| Cartoon or fantasy violence / realistic violence / prolonged graphic violence | None |
| Sexual content or nudity / graphic sexual content | None |
| Profanity or crude humour | None |
| Alcohol, tobacco or drug use or references | None |
| Mature or suggestive themes / horror or fear themes | None |
| Simulated gambling / contests | None (the “H-1B lottery” tool explains the government selection process; no gambling) |
| Medical or treatment information | None |
| Unrestricted web access | **No** — links open specific official pages (uscis.gov, travel.state.gov, dol.gov, news articles) in the system browser sheet; there is no general browser or search |
| User-generated content / messaging / chat | No |
| Age assurance, parental controls | No |
| Result | **4+** |

## App Privacy (nutrition label)

Answer: **Data Not Collected.**

Why this is accurate (checked against the code):

- People, documents, files, cases, receipt numbers and settings are stored only on the device (`src/data/store.ts`, AsyncStorage + app files). OCR runs on the device (`src/native/ocr.ts`).
- The app’s only network calls are GETs to our server for public data (`src/data/api.ts`): `/api/news`, `/api/visa-bulletin`, `/api/processing-times`, `/api/visa-waits`, and the look-up tools `/api/wage*` (job title / state / county the user types) and `/api/employer` (employer name the user types). No identifiers, no receipt numbers, nothing saved in the app. The server keeps no request logs. Apple’s definition of “collect” excludes data processed only to serve a request in real time.
- No receipt number is ever sent to our server. USCIS case status is checked by the user on uscis.gov in Safari (`src/screens/sheets.tsx` → `startCaseCheck`).
- No push token is registered with our server in this build (no POST to `/api/alerts`); all reminders and alerts are local notifications.
- Backups are encrypted on the device and go to the user’s own iCloud container or to a file the user chooses; the developer never receives them.
- Diagnostics are shared only when the user taps Share (optional, user-initiated, no document details).
- No third-party analytics, ads or crash SDKs.
- **CONFIRM:** `expo-updates` contacts Expo’s update service (u.expo.dev) with platform, runtime version and an install-scoped client id used for update statistics. Expo’s guidance is that this needs no disclosure; re-check Expo’s current privacy manifest before submitting.

Tracking: **No** (no ATT prompt needed).

## Export compliance (encryption)

`app.json` currently sets `ITSAppUsesNonExemptEncryption: false`.

The app uses HTTPS through iOS (exempt) **and** encrypts backups itself with AES-256-GCM and scrypt (`src/core/backup.ts`, `@noble/ciphers` / `@noble/hashes`) to keep the user’s own data confidential. Encryption that the app implements itself for data confidentiality is not one of Apple’s “exempt” cases (those cover encryption only inside Apple’s OS, authentication, or copy protection). So `false` is hard to defend.

**Recommendation (not changed in v2.3 — the owner should make the declaration):** set `ITSAppUsesNonExemptEncryption` to `true` at the next native build and answer App Store Connect’s questions as: uses standard encryption algorithms (AES, scrypt) instead of proprietary ones → qualifies for the mass-market exemption (EAR Category 5 Part 2, ECCN 5D992.c, License Exception ENC/mass market). Since March 2021 mass-market software with standard algorithms needs no BIS classification request or annual self-classification report, so no documents need uploading. Distribution in France may need an ANSSI declaration — exclude France or file it. The change only takes effect with a new native build (an OTA update can’t change Info.plist).

## Review notes (paste into App Review Information)

> No account or login — the app has none. All data is entered by the user and stays on the device.
>
> Quickest way to see the app with data: on the Welcome screen tap Get started, type any name, pick “H-1B”, then go to Settings → Help → Example family → Load example. This loads a made-up H-1B family (Arun, Meera, Leela) with documents, cases, reminders and items that need attention. Everything is fictional.
>
> Things to try: Home (Needs attention, updates for the family’s visa types); Family → a person → a document (shows “Copies for your reference — not an official ID”); Cases → a case → “Copy number & open uscis.gov” opens the official USCIS site in Safari (the app never logs in to USCIS or reads the site; the user pastes the result back with “Paste what USCIS says”); Tools → Can I travel?, Priority date, Visa Bulletin, Citizenship test; Settings → Notifications and About (data sources, version, licences). Each screen shows short first-visit tips (tap ? to replay).
>
> Notifications are local only (document expiry reminders, case status changes, new Visa Bulletin). The permission is asked after the first document or case is added, with an explanation first.
>
> Immigration Wallet is not affiliated with USCIS or any government agency; every data screen links its official government source and the disclaimer appears on Welcome, in Settings → About and on each data screen.

## Screenshots

6.9" and 6.5" iPhone, 13" iPad (supportsTablet is on). Use the example family only — never real family data. Suggested order: Home, a person page, Cases + case page, Visa Bulletin / priority date, Can I travel?, Settings → About (privacy).

## Data to confirm before launch

### Built-in data (each is replaced by the live copy when our server answers; dates are shown in the app)

| Data | Built-in as of | Status | What to confirm |
|---|---|---|---|
| Visa Bulletin (EB) | November 2026 | Partly checked | EB-1/2/3 final action and filing dates match two summaries (cilawgroup.com Oct 22, 2026; Newsweek). Not confirmed: Other Workers and EB-5 filing dates; EB-3 Mexico filing (one summary says Mar 15, 2026 — left blank); Other Workers / EB-5 Mexico & Philippines filing (blank). Confirm on travel.state.gov. |
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

1. **CONTACT_EMAIL** placeholder in `casedesk/site/*.html` and `src/content/legal.ts`.
2. **Host the pages**: `casedesk/site/privacy.html`, `support.html`, `style.css` must be reachable at the Privacy / Support URLs above (the API server doesn’t serve static files yet — add a Caddy `file_server` route or use GitHub Pages and update `SITE_BASE` in `src/content/legal.ts`). A `duckdns.org` domain works but a own domain looks more trustworthy to reviewers and users.
3. **Encryption declaration** — see Export compliance (recommend `true` + mass-market exemption).
4. **Copyright holder** name.
5. **Home-screen name**: `app.json` `name` is now “Immigration Wallet”; the icon label changes only with the next native build (OTA can’t change it).
6. Kept on purpose (not user-visible or would break existing installs): slug/scheme `casedesk`, bundle id, iCloud container `iCloud.com.vijaykannan.casedesk` and its private folder “CaseDesk Backups”, iCloud backup file names `CaseDesk-<date>.casedesk`, storage keys `cd2.*`, backup format id `CASEDESK-BACKUP 1`, the `.casedesk` extension, the server’s User-Agent string.
7. `expo-updates` privacy (see App Privacy).
