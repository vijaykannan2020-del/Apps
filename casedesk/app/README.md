# CaseDesk (v2, new codebase)

Expo SDK 58 · expo-router · TypeScript. Same app identity as the installed TestFlight build
(slug `casedesk`, bundle `com.vijaykannan.casedesk`, runtime policy `sdkVersion`), so it ships as an
over-the-air update. **Only the native modules already in that build are used** — `package.json`
lists the same modules at the same versions as the old app. The only additions are two pure-JS
libraries for backups: `@noble/ciphers` and `@noble/hashes` (no native code).

## Folders

| Folder | What lives there | Rules |
|---|---|---|
| `app/` | expo-router routes (screens only) | No business logic: read `useFamily()`, call store actions |
| `src/core/` | Pure TypeScript: model, document reading, records, steps, compliance engine | No React / React Native imports — everything is unit-testable |
| `src/data/` | Storage (`Store`, versioned `cd2.*` keys, migrations) and `FamilyProvider` | Reads never throw; corrupt blobs are moved to `<key>.bad` |
| `src/native/` | Guarded access to native modules (OCR, AsyncStorage, pickers…) | Every `require` is lazy and inside `try/catch`, so an OTA bundle can't crash an older build |
| `src/ui/` | Design system: `Screen, NavBar, Card, Row, Button, IconButton, Sheet, Field, DateField, Pill, EmptyState, Toast, ErrorBoundary` | Accessibility props on every touchable, 44-pt targets, colour always paired with words |
| `tests/` | Unit tests for core + storage (`node:test`) | Synthetic data only |

## Core in one picture

```
OCR text ──read/ (one module per document type) ──▶ Document { type, fields }
Documents + Person ──record.ts──▶ PersonRecord   (derived, order-independent: newest I-94 by issue date,
                                                    latest approval notice, latest passport…)
PersonRecords ──rules/engine.ts──▶ { findings, worst, facts (status until, grace, cap-gap, counters…) }
```

- `read/`: passport, visa, I-94, I-94 travel history, I-797 notices (approval / receipt / RFE, NOID,
  denial, appointments — by form), I-129S, EAD (incl. combo card), I-20, DS-2019, green card,
  Advance Parole / re-entry permit, naturalization certificate, LCA.
- `identity.ts`: whose document is it (passport number, then full passport name — never typed names).
- `steps.ts`: the waterfall of upload steps per status, and missing documents.
- `rules/`: one module per rule group (`stay`, `documents`, `petition`, `dependents`, `travel`,
  `student`, `greenCard`, `cases`). Every finding has a severity (act / review / info / good),
  "not legal advice" + "talk to an attorney" on act-now items, and an official source with the
  date it was last checked (`rules/catalog.ts` — update it when rules change, ship over the air).

## Screens (phase 2)

`app/` holds thin route files; the screens live in `src/screens/` and read everything from
`useFamily()` (`src/data/FamilyProvider.tsx`), which derives records, findings, missing steps and
cases from `src/core`. Changes go through `actions` (`src/data/actions.ts`).

- First run (owner change): **Welcome → About you → Home** — two screens, no account. Family setup
  and document steps start from Home cards whenever the user wants; every flow screen has **Home**,
  which saves what's done so far.
- Tabs: Home, Family, Cases, Tools (system tab bar on iOS 26 / Android via native tabs; a JS tab
  bar only in the web preview, `app/(tabs)/_layout.web.tsx`).
- Document flow: `src/data/flow.ts` (in-memory draft until Save; misfile + wrong-type moves).
- Layout: no fixed widths — content is centred with a max width on wide screens (fold open, iPad,
  landscape); rows and footers wrap at large Dynamic Type sizes; safe areas everywhere.
- Example family: Profile → Help → Example family (or `/demo` in the web preview) — made-up data.

## Backups (Settings → Backup & restore)

"Back up now" writes one `.casedesk` file: people, documents (with the images / PDFs kept in the app)
and cases, encrypted on the phone with **AES-256-GCM**; the key comes from the user's password via
**scrypt** (N = 2^13, r = 8, p = 1 — 8 MB, about 2–4 s on a recent iPhone running Hermes without a JIT; random 16-byte salt; the parameters are stored in each file's header so they can be raised later without breaking old backups). A progress % shows while the key is derived. It is saved
through the share sheet (Files, iCloud Drive, Google Drive, AirDrop). "Restore" opens a file, asks for
the password, previews the counts and then replaces or merges — also from the Welcome screen ("Restore
from a backup"). On a phone with no data it simply restores everything; otherwise Replace is the
default, Merge is offered, and after a merge the app lists exactly what was added and skipped (the
backup's own "You" is never dropped: if it differs from this phone's, it's added as a family member).
"Last backup" is set only after the user confirms the file was saved (the share sheet doesn't report
it). Format: `src/core/backup.ts`.

## Sheets and native screens (v2.1, P0)

- Sheets are **not** React Native `<Modal>`s. A Modal is its own iOS view controller; presenting
  Safari (SFSafariViewController), the share sheet, a document/photo picker or Face ID while one is
  up can leave it in a state that swallows every touch afterwards (the app looked frozen after
  "Copy number & open uscis.gov"). Every sheet is now an overlay drawn by `OverlayHost`
  (`src/ui/kit.tsx`) above the app's root view, so native UI always presents on a normal view.
- Order rule anyway: native UI first, sheet after. `startCaseCheck` copies the receipt, awaits
  `openUrlAndWait` (resolves when Safari is dismissed, or when the app is active again), and only
  then opens "What did USCIS say?" with **Paste what USCIS says** (expo-clipboard, guarded; a paste
  box when the clipboard module isn't in the build). The parser is `src/core/uscis.ts`
  (unit-tested in `tests/v21.test.ts`).
- If a receipt can't be copied, the sheet shows it as selectable text.

## iCloud automatic backup (v2.2 native build)

- `react-native-cloud-storage` 3.3.0 (TurboModule, RN ≥ 0.76, built against RN 0.88 / React 19.3,
  Expo config plugin), `expo-secure-store` (password in the keychain) and `expo-network` (Only on
  Wi-Fi). All three are required lazily (`src/native/safe.ts`); older binaries show
  "Needs the latest app version from TestFlight".
- Pure logic `src/core/icloud.ts` (names, keep 3, when due — `tests/icloud.test.ts`), I/O in
  `src/native/icloud.ts`, scheduling in `src/data/icloudBackup.ts`, UI in `src/screens/icloud.tsx`.
- Apple setup and the developer.apple.com step: `ICLOUD.md`.

## Layout, contrast, help (v2.1)

- Big numbers and dates use `BigText` (one line, `adjustsFontSizeToFit`, line height ≥ 1.22×);
  `T` raises any line height below 1.22× its font size, so digits are never clipped on iOS.
- Light-mode tokens live in `src/ui/tokens.ts`; `tests/v21.test.ts` checks every text colour and
  tone "ink" against cards, the page and tinted pills for WCAG AA (≥ 4.5:1). Dark mode is unchanged.
- Width ≥ 700 (`useLayout().twoCol`): Home, Family, Cases, person page and Settings use two columns
  (`Columns`), Tools is a grid. Below 700 the phone layout is unchanged.
- Help: `src/content/help.ts` (Settings → Help, "?" buttons, first-time tab cards).

## Crash safety and drafts

- Every native module is required lazily in `try/catch`. SF Symbols are used only if the native
  `SymbolModule` view is registered in the running binary (`globalThis.expo.getViewConfig` +
  `requireOptionalNativeModule`); otherwise Ionicons (`src/ui/Icon.tsx`).
- The document flow draft is kept in `cd2.draft`, so closing the app mid-flow loses nothing; Home
  shows "N documents read, not saved yet" (Continue / Discard). A flow with nothing in it is never
  stored, and saving clears the draft.
- Kept files are referenced by NAME (`DocFile.file`, relative to `Documents/cd2-docs/`); the full
  path is rebuilt at runtime (`fileUri`), because iOS moves the app container on updates and
  reinstalls. Absolute paths from earlier builds are migrated to names on load (`core/files.ts`).
- On launch, files in `cd2-docs/` that no document or draft refers to are removed — compared by
  name only, skipped entirely if the documents or the draft failed to load or nothing is
  referenced, and only for files older than 24 h.
- The web preview accepts `?textScale=2` to simulate Dynamic Type for review screenshots.

`ITSAppUsesNonExemptEncryption` stays `false` in `app.json`: the app only encrypts the user's own
data for their own storage (no network encryption beyond the OS's HTTPS). Under US export rules
that's exempt; the lead should confirm this answer stays correct for App Store review.

## Run

```bash
npm ci --ignore-scripts          # same lockfile as the installed build
npm run typecheck                # tsc --noEmit
npm test                         # core unit tests (tsx + node:test)
npx expo export --platform ios   # proves the bundle builds
```

QA test families (immigration scenarios, public scenarios, the owner's private documents read in
place) run from `/home/claude/team/qa/new/run.sh` — outside this repo; no private data is stored here.
