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
