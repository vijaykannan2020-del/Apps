# iCloud automatic backup — setup (v2.2)

CaseDesk backs up to the user's own iCloud (WhatsApp-style): the same password-protected `.casedesk`
file as Settings → Back up to a file, written daily and a little after changes to CaseDesk's
private iCloud container (`iCloud.com.vijaykannan.casedesk`, app-data scope — not visible in the
Files app), keeping the newest 3. The password is kept in this iPhone's keychain.

## What the code already does
- `react-native-cloud-storage` 3.3.0 (config plugin in `app.json`) adds the iCloud Documents
  entitlements: `icloud-container-identifiers`, `icloud-services = CloudDocuments`,
  `ubiquity-container-identifiers`, environment `Production`.
- `expo-secure-store` keeps the backup password; `expo-network` powers "Only on Wi-Fi".
- `scripts/ios-credentials.py` (VERSION `v2-icloud`) turns on the **iCloud** capability for the App
  ID through the App Store Connect API (`bundleIdCapabilities`, `ICLOUD`, setting
  `ICLOUD_VERSION = XCODE_6`) and makes a new App Store profile. It stops with a clear error if the
  profile doesn't contain the container yet.
- Older TestFlight builds (no iCloud module) show "Needs the latest app version from TestFlight".

## The one thing Apple's API can't do — do this once on developer.apple.com (owner)
Apple doesn't allow creating an iCloud container, or assigning it to an App ID, through the API.

1. Sign in at https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
2. **Identifiers** → the filter at the top right → **iCloud Containers** → **+**.
3. Choose **iCloud Containers** → Continue.
   - Description: `CaseDesk backups`
   - Identifier: `iCloud.com.vijaykannan.casedesk` (exactly; Apple adds nothing)
   → Continue → **Register**.
4. **Identifiers** → filter **App IDs** → **com.vijaykannan.casedesk** (CaseDesk).
5. Under Capabilities, **iCloud** should already be ticked (the build script turns it on; tick it if
   not) with **Include CloudKit support (requires Xcode 6)** selected. Click **Edit** (or
   **Configure**) next to iCloud.
6. Tick **iCloud.com.vijaykannan.casedesk** → **Continue** → **Save** → confirm **Confirm** on the
   "modify app capabilities" warning (existing profiles become invalid — the build makes a new one).
7. Tell the lead "iCloud container done". The lead bumps `ios-build.txt`, which runs the GitHub
   build; the script makes a new profile that includes the container.

Nothing to do in App Store Connect. If the build stops at "Signing" with *The new profile has no
iCloud container*, step 6 wasn't saved — repeat it and re-run the build.

## After the new build is on TestFlight (check on the iPhone)
1. iOS Settings → your name → iCloud → **iCloud Drive** on (and, for cellular backups, "Use
   Cellular Data" on).
2. CaseDesk → Settings → Backup & restore → **iCloud backup** on → set the password → the first
   backup runs. "Last iCloud backup" shows the time.
3. Change something; within a few minutes (after 2 minutes without changes, at most every 30
   minutes) another backup runs. Only the newest 3 are kept.
4. Restore test: Settings → **Restore from iCloud** → Latest backup → password → Replace/Merge.
   On a new phone: Welcome → **Restore from iCloud**.
5. iOS Settings → your name → iCloud → Manage Account Storage should list CaseDesk.

## Notes
- The file is encrypted on the phone (scrypt + AES-256-GCM) before iOS uploads it; Apple can't read it.
- Automatic backups run while CaseDesk is open or comes back to the foreground (no background job).
- Google Drive (Android) later: the same module supports it with a Google sign-in token.
