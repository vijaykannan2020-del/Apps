# Home Screen & Lock Screen widgets (v2.5)

Two widgets, in the next TestFlight build (native change; iOS 17+):

| Widget | Sizes | Shows | Tap opens |
|---|---|---|---|
| **Next deadline** (`NextDeadline`) | small; Lock Screen circular, rectangular, inline | who, what, days left — red ≤ 30 days, amber ≤ 90, green after | that person (`casedesk://person/<id>`) |
| **Family status** (`FamilyStatus`) | medium (4 people), large / iPad extra large (+ latest case update, next Visa Bulletin, next deadline) | status + valid-until per person | the person row / the case (`casedesk://open/case/<key>`) |

**v2.8 Edit Widget** (AppIntents `ConfigIntent`, `targets/widget/Intent.swift`): long-press → Edit Widget →
**Person** (Whole family by default, or one person — options read from the snapshot; only Whole family while
Face ID lock hides details) and **Show**: Current status (default), Next deadline, Passport, Visa stamp, I-94, EAD,
Advance parole, Green card stage, Latest case update, Priority date. Current status: in the US, valid until the latest
I-94 admit-until date with days left; outside the US, I-797 approval expiry, visa stamp yes/no and days left. Anything
not saved for that person shows “Not added yet — open the app”. Snapshot `items` / `familyItems`
(`src/core/widgets.ts` `personItems`, raw values = `WIDGET_KINDS`) carry dates, labels and yes/no flags only.
Pastel blocks (sage / butter / blush / sky with ink text) on true black.

Every size with room carries “For personal reference — not an official document”. Light/dark, tinted/accented
Home Screens (`widgetAccentable`), Dynamic Type (system text styles + `minimumScaleFactor`), iPad sizes.
Timeline: one entry per day for 7 days (days-left changes at midnight) plus a reload whenever the app writes.

## How it works

| Piece | File |
|---|---|
| SwiftUI widgets (target built by `@bacons/apple-targets` at prebuild) | `targets/widget/` (`index.swift`, `Provider.swift`, `Views.swift`, `Snapshot.swift`, `expo-target.config.js`, `Info.plist`) |
| Snapshot builder (pure, tested) | `src/core/widgets.ts` → `tests/native-v25.test.ts` |
| Writer: JSON string → App Group `group.com.vijaykannan.casedesk`, key `snapshot.v1`, then `WidgetCenter.reloadAllTimelines` | `src/native/widgets.ts` (ExtensionStorage native module from `@bacons/apple-targets`) |
| When to write (after any change, only if the widget would show something different) | `src/data/widgetSync.ts`, one line in `FamilyProvider.tsx` |
| Case link without a receipt number | `app/open/case/[key].tsx` |
| Settings → Widgets (names: **initials** default / first names; **Hide details on widgets when Face ID lock is on**, default on) | `src/screens/wallet.tsx` `WidgetRows` |

Privacy rules (enforced in `src/core/widgets.ts` and tested): initials or first names only; status labels,
dates, days left, a short case headline; anything that looks like a receipt, A-number, SSN or long ID number is
masked; case links use a random key instead of the receipt. With Face ID lock on (and the setting on) only
`{locked: true}` is written — the widget says “Open Immigration Wallet”.

Older builds: the OTA bundle runs there too. `widgetsAvailable()` checks for the native module first, so nothing
is written and Settings → Widgets says “Needs the latest app version from TestFlight”.

## Modules chosen (checked on npm, Nov 18 2026)
- `@bacons/apple-targets` **5.0.0** (published Jul 17 2026, peer `expo >=52`; Swift targets in `/targets`, App Group
  mirroring, EAS `appExtensions` + `ExtensionStorage` for shared UserDefaults and widget reloads). Prebuild with
  SDK 58 verified (target `widget`, bundle `com.vijaykannan.casedesk.widget`, iOS 17.0, entitlements generated).
- Not chosen: `expo-widgets` 58.0.29 (SDK 58, published Nov 17 2026) builds widgets from JSX via `@expo/ui`
  — the brief wants SwiftUI in `targets/widget/`; `react-native-shared-group-preferences` 1.1.24 (last publish
  Sep 2023, not needed — ExtensionStorage does the same).

## Signing (scripts/ios-credentials.py, VERSION `v4-widgets`)
- Turns on **App Groups** for `com.vijaykannan.casedesk` and `com.vijaykannan.casedesk.widget` only when Apple
  lists it as off (never re-posts it when the lookup fails — that could reset the group assignment).
- Reuses the widget App ID (registers it only if missing) and makes its own **App Store profile**.
- Both profiles must contain `group.com.vijaykannan.casedesk`; a new profile without it is deleted and the
  build stops with the exact portal steps (same pattern as the iCloud container).
- `credentials.json` lists both Xcode targets (`ImmigrationWallet`, `widget`) with the same distribution
  certificate; the workflow keeps `credentialsSource: local`. Tests: `python3 -m unittest scripts/test_ios_profile.py`.

## Owner portal steps — already done (Nov 18)
Apple’s API can’t create an App Group or assign one to an App ID. Done on developer.apple.com:
1. Identifiers → App Groups → **group.com.vijaykannan.casedesk** registered.
2. App IDs → **com.vijaykannan.casedesk** → App Groups ticked → Configure → group assigned → Save.
3. App IDs → **com.vijaykannan.casedesk.widget** registered with App Groups + the group.

If a build ever stops at “Signing” with *The App Group … is not assigned yet*, repeat step 2/3 for the App ID it
names, then bump `ios-build.txt` again.

## Check on the iPhone after the TestFlight build
1. Open the app once (writes the first snapshot). Home Screen → touch and hold → Edit → Add Widget →
   Immigration Wallet → Next deadline (small) and Family status (medium, large). Lock Screen → Customize → add
   the circular/rectangular widget.
2. Initials show; Settings → Widgets → First names → widgets change within a few seconds.
3. Tap a person row → that person opens; tap the large widget’s case → the case opens.
4. Settings → Face ID lock on → widgets show only “Open Immigration Wallet”. Turn “Hide details…” off → details return.
5. Dark mode, tinted Home Screen (Edit → Customize → Tinted), largest text size, iPad: nothing clipped.
6. Add a document with a nearer date → Next deadline updates.
7. Long-press a widget → Edit Widget: Person lists Whole family + each person; Show lists the ten options; pick a
   person and EAD with no EAD saved → “Not added yet — open the app”; pick Current status for someone outside the
   US → I-797 date, Visa stamp Yes/No, days left.

Not verifiable here (no Mac/device): Swift compile, on-device rendering, timeline reloads. Verified here: JS
types/tests, prebuild output (target, bundle id, deployment target, entitlements on both targets, EAS appExtensions).
