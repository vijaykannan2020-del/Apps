# Case status sync and myUSCIS (v2.6)

Case → **Status & sync** (`app/case/sync.tsx` → `src/screens/myuscisSync.tsx`). Every way of checking
saves a snapshot **on the phone**. The newest snapshot is the case's cached status
("From myUSCIS · synced …"), shown offline too, with "Changes since last sync" and silent updates.

## Ways to check (in the order shown)

| Way | Who | How | Leaves the phone |
|---|---|---|---|
| **Sync with myUSCIS (sign in here)**, Experimental | IOE (online-filed) cases; default button on their case page | In-app `react-native-webview`, **incognito**. The person signs in on USCIS's page. When the URL has been a signed-in `my.uscis.gov/account…` page for 2.5 s (or they tap *Read my case*), one pass reads the 4 JSON links: **method A** injected `fetch(path, {credentials:'include'})`; for any link that gave `data:null`/401/non-JSON, **method B** opens the link in the WebView and reads the page text. Then the WebView cache is cleared and the window closes. | Nothing to our server. The WebView talks to USCIS directly. |
| **Check public status in the app** | Every receipt | `egov.uscis.gov` in a WebView, receipt filled in (React input setter; the receipt is also on the clipboard). The **person taps Check Status**; the page text is posted back after their tap and read by `parseCaseText`. One check per tap. | Nothing to our server. |
| Live check | Every receipt, **only if** `GET /api/health` → `uscis: true` and `uscisMode: 'production'` | Our server's `GET /api/case/:receipt` (Torch API). Opt-in *Check my cases automatically*: on app open (≥3 h apart) + background task `iw-live-check` (expo-background-task, ~4 h). | Receipt number → our server → USCIS. Not stored or logged (`redactPath`); answer cached in memory ≤3 h. |
| Safari + paste | Every receipt | Existing flow (`startCaseCheck`). | Nothing. |
| Paste / import | Every receipt | Paste the **myUSCIS case page text** (status card, Case history, Documents), a uscis.gov result, or JSON; import `.json`/`.txt` via the document picker. | Nothing. |
| Advanced: JSON links | IOE | The 4 links open in the **Safari app** (`Linking.openURL`), not SFSafariViewController: SFSafariViewController doesn't share the Safari app's cookies, so the myUSCIS session isn't there. | Nothing. |

Share-into-app (iOS share extension) was **not** added: it needs a new native target. Paste and file import cover it.

### myUSCIS links

```
/account/case-service/api/cases/{R}              case: events, updatedAt, flags, documents, notices
/account/case-service/api/case_status/{R}        status notice
/secure-messaging/api/case-service/receipt_info/{R}   location
/account/case-service/api/cases/{R}/documents    notices list
```

All four are internal and undocumented. Owner tests (19 Nov 2026) with a real account: opened directly in Safari,
all four returned `{"data":null,"error":{…all null…,"requestId":"…"}}`, even for a case he filed himself while signed in.
Likely reason: the myUSCIS web app calls them with extra headers or tokens. The in-app method A/B pass is the experiment to
find out. **Sync details** on the sync page shows each endpoint's method, HTTP status, data-null, size and requestId, and
**Share raw data for support** shares the last raw answers through the share sheet. They are saved on the phone only, and
it is always the person's own choice to share.

**Session length:** the app keeps no session (incognito WebView, cleared after each sync), so every sync means signing in
again, MFA included. That is deliberate (owner decision, 19 Nov). We haven't observed how long a myUSCIS session lasts inside
the WebView. Not needed while nothing is kept.

## Parser (`src/core/myuscis.ts`) — pure, tested

- `parseMyuscis(text, hint?)` never throws. Result kinds: `case` `receipt` `documents` `page` `live` `egov` (ok) or
  `empty` `notSignedIn` (login page / 401 words) `html` `malformed` (cut-off JSON, including Safari's partial copies) `notMyuscis` **`noData`**.
- `noData` = the `{data:null, error:{requestId}}` envelope. It shows `NO_DATA_MESSAGE` with `NO_DATA_REASONS` (not linked to this account,
  e.g. an employer/attorney filed it; session expired; too new or archived; opened directly). The requestId can be copied, and
  *Check the public status instead* opens right there. **noData is never saved, never a status change and never a silent update.**
- Accepts wrapped `data` (once or twice), flat objects, arrays, renamed fields (case-insensitive, snake_case), epoch or US dates.
- Snapshots keep **sources apart** (`myuscis`, `page`, `live`, `egov`). Each source is diffed only with its own previous values,
  and the first read of a source is a baseline. Mixing ways never invents "new" events.
- **Silent update** = a source's last-updated date moved (compared at date precision when one side has no time) with no new
  public-kind event, no status change and no new evidence request. Background-check codes (FTA0…) still count as silent.
  `touchedAfterLastEvent` also flags a record touched after its newest event on any sync.
- `applySync` writes history lines into the case. Public statuses (Live check, uscis.gov) keep their own words; myUSCIS
  events get the `myUSCIS: ` prefix, plus a silent-update line. It also sets form, received date, status and checkedAt.
  Status comes from the newest official status first, then only event codes marked sure (IEA, IKA, LDA…; never "likely" ones like SA).

## Event codes (`src/core/myuscisCodes.ts`)

USCIS doesn't publish these codes. The meanings come from public write-ups: r/USCIS "API code timeline" threads,
Lawfully/Trackitt posts, and community code tables derived from the NIEM benefit-status list. Where those disagree or guess
(e.g. FTA0 = "background or fingerprint checks done", IFA, SA, H008, PRE), the code has `sure: false` and the app shows "Likely: …".
Unknown codes show as "USCIS update (code XYZ)" with the date. To add a code, add one line.

## Storage (`src/data/myuscis.ts`)

`cd2.myuscis.v1`: per case the last 12 snapshots, last changes, unseen badge, dismissed checklist entries, last Live check,
last sync report; prefs (weekly reminder, Live check, first-use notice seen). `cd2.myuscis.raw.v1`: raw answers of the last
in-app sync (one case). Both use the `cd2.` prefix, so **Delete all data** wipes them. They are **not** in backups (a resync rebuilds them).

## Notifications

- After a sync with changes: a local notification (tap → Status & sync) and a blue dot on the case row. In the foreground a pure
  status change is left to the existing case-change alert, so there are no doubles.
- **Weekly "Check your open cases"**: local, Saturday 10:00, only while a case is pending and notifications are allowed.
  Toggle on the sync page (default on). Tagged `cd2weekly` and kept apart from the date reminders (`cd2`).

## Installed-build guard

`react-native-webview` has been in package.json since 17 Nov 2026 and is autolinked in builds made after that. `src/native/webview.ts`
checks the `RNCWebViewModule` TurboModule before requiring the JS, so an OTA bundle on an older binary hides the WebView options
and shows Safari and paste instead. On the web preview the WebView options are hidden.

**Cloudflare:** egov.uscis.gov is behind Cloudflare (see HANDOFF "Case status"). An earlier in-app WebView test stalled on
"Verifying…". If that still happens on a device, the person can finish the challenge in the window or use Safari + paste.
The app doesn't try to get around it.

## Not done / owner checks on a device

- The myUSCIS in-app sync is untested against a real account: whether method A or B returns data is exactly what the Sync details panel will show.
- Whether egov's receipt box accepts the fill on the current site (field id `receipt_number` and fallbacks). The receipt is on the clipboard either way.
- The page-text parser is built from the myUSCIS layout as described publicly (status card, Case history, Documents). Paste a real copy and check.
