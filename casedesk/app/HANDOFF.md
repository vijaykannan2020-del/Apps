# CaseDesk — project handoff

**What it is:** an independent iPhone/Android app (Expo) that puts US immigration essentials in one place: USCIS case tracking, short news cards from official sources, a prevailing wage tool, a fee calculator, I-9 documents by visa type with reverification tracking, plain-English visa guides and H-1B employer charts.
**Store name:** CaseDesk – Tracker for USCIS. It must always show the "not affiliated with USCIS or any government agency" disclaimer (Settings screen + App Store description).

## Folders
```
app/      Expo SDK 58 app (expo-router, TypeScript)
server/   Node API for the Oracle server (no npm dependencies)
```

### app/
| Path | Purpose |
|---|---|
| `app/(tabs)/index.tsx` | Today: My Status summary, cases, quick tools, updates split into **Official** and **News & analysis** |
| `app/(tabs)/status.tsx`, `app/status/edit.tsx`, `app/status/vault.tsx` | My Status: personal compliance checks (I-94, 240-day rule, approval vs I-94, passport, visa stamp, EAD, max-stay clock), I-94 download help, **document vault stored only on the phone** (expo-file-system, Face ID lock) |
| `src/lib/compliance.ts`, `src/lib/profile.ts`, `src/lib/vault.ts` | Check rules, saved profile, on-device documents |
| `app/(tabs)/cases.tsx`, `app/case/add.tsx`, `app/case/[id].tsx` | Case tracker (receipt validation, 5-step progress, history) |
| `app/(tabs)/tools.tsx`, `app/tools/*` | Visa Bulletin by country + priority-date check, processing times (USCIS published), LCA/PERM/PWD status (FLAG link), prevailing wage (state → county/MSA → occupation, like FLAG), fees, I-9 |
| `app/guides.tsx`, `app/guide/[id].tsx` | Visa guides; can be updated from the server (`/api/content/guides`) |
| `app/(tabs)/data.tsx` | Employers: search-first — H-1B approvals by year, PERM certified, LCAs; small FY2025 top-sponsors view |
| `app/news/[id].tsx`, `app/about.tsx` | News detail, settings and disclaimer |
| `src/data/*.ts` | Built-in content: news, visas + I-9, fees, H-1B snapshot. **Update these when rules change.** |
| `src/lib/api.ts` | Talks to the server. With no `extra.apiBase` in `app.json`, the app runs in **demo mode** (sample case statuses, clearly labeled). |
| `src/theme.ts`, `src/components/*` | Design system: dark/light, minimal Offsuit-style, one accent colour |

### server/
See `../server/README.md` and `../README.md`.

## Status (17 Nov 2026, v2)
- App v2: My Status + document vault, official vs news updates, Visa Bulletin, processing times, DOL status, wage lookup by location, employer search. Type-checks clean; web preview screen-tested.
- External links use real `<a>` tags on web (`ExtLink` in `src/components/ui.tsx`) so they open from the preview.
- Server: tested locally with sample wage, H-1B, PERM and Visa Bulletin files. `npm run update-data` downloads the official files (links in `.env`). The live USCIS and Federal Register calls are untested until it runs on the Oracle server with keys.

## Next steps
1. Deploy the server on Oracle and set `extra.apiBase` in `app/app.json`.
2. Register at developer.uscis.gov → sandbox keys → request production access.
3. Load DOL wage files and H-1B Data Hub files (see `server/README.md`).
4. App icon and splash (replace `assets/icon.png` and `splash-icon.png`).
5. Push notifications when a case status changes (expo-notifications + server job).
6. Local reminders for I-9 reverification dates.
7. Build: `npx eas build -p ios --profile production`, then `npx eas submit -p ios`. Needs a privacy policy URL and the disclaimer in the App Store description.

## Content rules
- Facts come only from USCIS, DHS, DOL, State Department or Federal Register sources; every guide and news card links its source.
- Keep text short: a one-line summary plus 2–4 points.
- Fee amounts live in `src/data/fees.ts` (last checked Nov 2026). Recheck against G-1055 whenever USCIS announces a fee change.

## Screen sizes (all iPhones, Android phones, foldables, tablets)
- `src/lib/layout.ts` `useLayout()`: width ≥ 700 = wide (unfolded foldable, tablet, landscape). Wide screens get their own layout, not stretched phone boxes: a left sidebar instead of the bottom tab bar, and two-pane pages via `<Columns>` (Today: status/cases/tools | updates; My Status: checks | dates, documents, records; Cases: list | other case types; Employers: search | sponsors; Tools: 3-column grid). Detail pages are centered at max 760. Unfolding re-flows live.
- Header actions sit next to the title / Back button (left), never the top-right corner (camera + status pill on the iPhone Duo and Android foldables).
- `app.json`: orientation "default" (rotates), iOS `supportsTablet: true`, `requireFullScreen: false` (iPad split view). Android activities are resizable by default.

## Document scanning (on-device OCR)
- `src/lib/ocr.ts`: photos → Apple Vision / Google ML Kit on-device (`expo-text-extractor`), PDFs → the PDF's own text (`expo-pdf-text-extract`, PDFKit / PDFBox). No network. Needs the real app build (not Expo Go / web preview).
- `parseDocument()` recognises I-94 (Admit Until, class), I-797A/B approval (Valid from … to …, receipt), I-797C receipt (receipt number, Received Date), EAD (Card Expires, category), passport (MRZ expiry), visa stamp (Expiration Date), LCA (period). Tested against sample texts.
- Vault "Add or scan a document": camera / Photos / PDF → reads it → pre-fills type, receipt, valid-until, shows "Found on the document", and (toggle) updates My Status dates. My Status edit has "Scan a document to fill dates".
- Scanned PDFs without a text layer can't be read — the app asks for a clear photo instead.

## Native look (same approach as the Inbox app)
- Tabs: `app/(tabs)/_layout.tsx` uses expo-router **NativeTabs** → iOS system tab bar (Liquid Glass on iOS 26+, shrinks on scroll, can become a sidebar on iPad/large screens) and Android Material 3 bottom navigation. SF Symbols on iOS, Material icons on Android. The web preview uses `_layout.web.tsx` (JS tabs).
- Detail pages (`DetailScreen`) use the system navigation bar on iOS/Android (Liquid Glass back button, swipe-back, Material top bar); web draws its own.
- `src/components/Glass.tsx` = `expo-glass-effect` GlassView on iOS 26+, blur on older iOS, tonal surface on Android/web. Header buttons use `GlassButton`.
- Colours are Apple system colours (`src/theme.ts`), same palette as Inbox; light and dark follow the phone.
- iOS scroll views use `contentInsetAdjustmentBehavior="automatic"`, so safe areas and the tab bar are handled by iOS (no manual top/bottom padding on iOS).

## Alerts (app/alerts.tsx, src/lib/alerts.ts, src/lib/background.ts, server/src/push.mjs)
- User chooses everything on the Alerts screen (bell on Today, Settings, My Status).
- Date reminders = LOCAL notifications on the phone (expo-notifications): I-94 / approval / EAD / passport / visa from My Status at chosen days-before and hour; saved-document expiry; team I-9 reverification. Rescheduled whenever dates, documents or I-9 records change and on every launch (iOS keeps max 64 → next 60).
- Case status changes: background task (expo-background-task, ~every 4 h, OS decides) looks up tracked cases and notifies on change. Receipts stay on the phone.
- News + Visa Bulletin: Expo push from the server. App POST /api/alerts {token, platform, news:{enabled,tags,importantOnly,webNews}, bulletin:{enabled,country,categories}} — no personal data. Server sends on new official items matching topics (first run only records, no blast) and on a new monthly bulletin (per country/category change). Big web stories (3+ outlets) only if chosen.
- Push tokens need the EAS project id (set when the TestFlight build is created) and APNs/FCM keys via EAS.

## Case status (Nov 17 2026)
- USCIS Case Status Online (egov.uscis.gov) is behind Cloudflare: servers get 403 and the in-app WebView stalls on "Verifying…". We do not try to get around it.
- Flow now (`src/lib/uscisSafari.ts`): the case page's "Check status on USCIS" copies the receipt, opens egov.uscis.gov in Safari (SFSafariViewController via expo-web-browser), the person pastes + checks + copies the result; on return the clipboard is parsed (`parseCaseText`: heading + "On <date>, we …" sentence, form, date). Fallback: paste box.
- Automatic checks/push for case changes need the official USCIS Case Status API (server already supports it; needs a US-incorporated org, affidavit and demo).
