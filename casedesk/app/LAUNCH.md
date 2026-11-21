# Launch plan — Immigration Wallet 1.0

Organic launch with near-zero budget. Listing texts: `STORE.md` and `store/listing.json`. Screenshots:
`/home/claude/team/launch/screenshots/` (outside the repo; see STORE.md → Screenshots).

Part 1 is the owner's morning checklist. Part 2 is the plan to reach people after approval.

---

# Launch build and updates (Nov 20, 2026 — read this first)

**Two kinds of iPhone build now.**
- **Store build** (build **13**): the one to submit to the App Store. It only gets app updates you
  release with the **CaseDesk release to App Store users** workflow. Settings shows `Version …` with no extra word.
- **Test build** (build **14**, the newest in TestFlight): gets every update right away. Settings shows
  `Version … · test`. You and your wife test on this one.

**After launch, every change goes like this:** Claude pushes → your test build updates → you check it →
you say “release” → Claude runs the release workflow (or you: GitHub → Actions → *CaseDesk release to App
Store users* → Run workflow) → App Store users get it the next time they open the app twice.

**Launch day, in order:**
1. Claude sets `LAUNCH_RESET=launch-<date>` in `casedesk/server/deploy.conf` and pushes. The server moves
   all test Community posts, accounts, shared timelines and notification sign-ups into a backup folder and
   starts clean with only the Welcome post. Nothing on anyone’s phone changes (documents never leave phones).
2. Claude runs the release workflow once, so the store build gets the newest update.
3. You tap **Release this version** in App Store Connect.

**Testing items** (Example family, tip switches) only show with developer tools on: Settings → tap the
version line at the bottom 7 times. On an empty phone the first screen still offers *Look around with an
example family* — that is the path in the review notes for Apple.

**Screenshots** are now in the repo: `store/screenshots/iphone-6.9` and `store/screenshots/ipad-13`
(made from the current app with the made-up example family).

---

# Part 1. Morning checklist (about 30 minutes, in this order)

Use the **App Store Connect** website in Safari (appstoreconnect.apple.com, tap **aA → Request Desktop Website**
if a page is cramped). The App Store Connect iPhone app can't upload screenshots or edit the privacy label.

**Before you start (2 minutes)**

1. Open these 3 links in Safari. Each must show a page, not an error:
   - https://vijaykannan2020-del.github.io/Apps/casedesk/site/privacy.html
   - https://vijaykannan2020-del.github.io/Apps/casedesk/site/support.html
   - https://casedeskapp.duckdns.org/support
   If the GitHub ones fail, use https://casedeskapp.duckdns.org/support as Support URL and tell Claude to fix
   hosting for privacy before submitting (Apple rejects a broken privacy link).
2. Set the moderator password on the server (Community needs working moderation for Guideline 1.2): tell
   Claude “set ADMIN_TOKEN”, or put a random value of 20+ characters as `ADMIN_TOKEN=` in `/opt/casedesk/.env`
   and restart the API. Without it, reports can't be reviewed with the admin endpoints.

**In App Store Connect → Apps → Immigration Wallet**

3. **App Information** (left menu):
   - Subtitle: `USCIS Case Status & Green Card` (recommended; or keep the current one and use keyword set B).
   - Category: Primary **Productivity**, Secondary **Reference**.
   - Content Rights: **Yes**, it shows third-party content (news headlines that link to the publisher, public US government data), and confirm you have the rights to show it (headline + link only, no full articles).
   - Age Rating → **Edit**: answer as in STORE.md → Age rating. Save.
   - Save.
4. **Pricing and Availability**: Price **Free** (USD 0). Availability: **All countries** (simplest). Save.
5. **App Privacy**:
   - Privacy Policy URL: the GitHub privacy link above.
   - **Get Started / Edit** → “Yes, we collect data” → tick **User ID**, **Device ID**, **Other User Content**,
     **Other Data**. For each: App Functionality; Linked: yes (Other Data: no); Tracking: no. Publish.
     (Full table in STORE.md → App Privacy.)
6. **iOS App → 1.0 Prepare for Submission** (the version page):
   - **Screenshots**: iPhone 6.9" Display → drag in the 8 files from `store/screenshots/iphone-6.9` in order 01…08.
     iPad 13" Display → the 8 files from `ipad-13`. (Or skip and tell Claude “upload the screenshots by API”;
     see “Upload by API” below.) 6.7" files are only a spare.
   - **Promotional Text**, **Description**, **Keywords**: copy from STORE.md (or from `store/listing.json`).
   - **Support URL**, **Marketing URL**: from STORE.md → App information.
   - **Version**: 1.0. **Copyright**: `2026 Your Full Legal Name`.
   - **Build**: tap **+ Add Build** → pick the **store build (13)**, not the newest test build → Done. If it asks about encryption:
     the build already says “no non-exempt encryption” (`ITSAppUsesNonExemptEncryption` false), so normally no
     question appears. See Decisions → Encryption.
   - **App Review Information**: Sign-in required **off**. Contact: your name, phone, email.
     **Notes**: paste the block from STORE.md → Review notes.
   - **Version Release**: “Manually release this version” (so you choose the launch day; see Part 2).
   - Save.
7. Tap **Add for Review** → **Submit to App Review**.

Review usually takes 1–2 days. If Apple replies with a question, answer in App Store Connect → App Review
(Resolution Center) on the same day; most first-version questions are about the Community (1.2), the use of
“USCIS” (5.2) or the disclaimer, all answered in the review notes.

**Upload by API (instead of dragging screenshots, or to paste the texts automatically)**

1. Tell Claude: “commit the screenshots to casedesk/app/store/screenshots and push” (it copies `iphone-6.9/`
   and `ipad-13/` there; the repo is public and the screenshots only show the made-up example family).
2. On GitHub → Actions → **CaseDesk store listing upload** → Run workflow (version 1.0; texts and screenshots
   ticked; replace ticked). First run with “dry run” ticked to see what it would change.
3. Refresh the 1.0 page after 5 minutes. Then do steps 3–5 and 7 above by hand (privacy, age rating, pricing,
   build and submit are not done by the script).

**Decisions left for you**

| Decision | Recommendation |
|---|---|
| Domain | `duckdns.org` works but looks temporary. Buy `immigrationwallet.app` or similar (~$15/yr) after approval, point it at the server and GitHub Pages, then update the URLs (they can change without a new review, except inside the app). |
| Moderator password (`ADMIN_TOKEN`) | Set it before launch (step 2). Check reports daily in launch week. |
| Subtitle | Option A (`USCIS Case Status & Green Card`). |
| Encryption answer | The build says “no non-exempt encryption”, but backups use AES-256 made by the app (STORE.md → Export compliance). Submitting as is usually passes; the clean fix is `true` + mass-market exemption in the next native build. |
| Copyright name | Your full legal name (or company, if you form one). |
| Release timing | Manual release; release on a Monday or Tuesday morning US Eastern time (Part 2). |
| In-app privacy link | `PRIVACY_URL` in `src/content/legal.ts` points at `casedeskapp.duckdns.org/privacy.html`, which the server doesn't serve. Approve an OTA update pointing it at the GitHub Pages copy. |
| HCL outside-work policy | Before posting on LinkedIn, check HCL’s policy on personal apps and outside activities, and never imply HCL endorses the app or use anything learned from work cases. |
| Google Play | Later (4–8 weeks after iOS): the Android build exists; Play needs a $25 account, a data safety form (same answers as the privacy label) and 12 testers for 14 days on new personal accounts. |

---

# Part 2. Reaching people

## Who it is for (in order of size and pain)

1. Indian H-1B / H-4 families (largest group; green card backlog; WhatsApp groups; Reddit r/h1b).
2. F-1 OPT and STEM OPT students (unemployment days, SEVP reporting; university offices).
3. Green card applicants of every nationality (priority dates, Visa Bulletin every month).
4. L-1 / L-2 families.
5. HR and mobility people (the owner's own network) who can recommend it.

The message, everywhere: **“Your family’s visa dates in one place. Reminders before anything expires. Private:
your documents stay on your phone.”** Privacy is the difference from case-tracker apps that ask for logins.

## ASO plan and keyword reasoning

- Searches in this niche are task words, not brand words: “uscis case status”, “green card”, “visa bulletin”,
  “h1b”, “i94”, “priority date”, “ead”, “opt”. Big names own “uscis” alone; long-tail terms (“visa bulletin”,
  “priority date”, “i94”, “h4”, “stem opt”) are winnable for a new app.
- Name keeps the brand; subtitle carries the 2 biggest terms; the keyword field carries visa types and form
  numbers (short, high intent, few competitors). Rationale per word in STORE.md → Keywords.
- Ratings drive ranking more than anything else after keywords: the review prompt (below) matters.
- Week 2: App Store Connect → **Product Page Optimization**: test screenshot 1 headline “Your family at a
  glance” against “Never miss an I-94 date” (90 days, 50/50). Week 4: swap the 2–3 keywords with no impressions.
- **Promotional text** changes without review: update it every month for the Visa Bulletin (“January 2027
  Visa Bulletin is in: check your priority date”).
- **In-App Events** (free, appear in search): create one each month “New Visa Bulletin — is your date
  current?” and one for H-1B registration season in March.
- Localise later: Hindi and Telugu screenshots/text cost nothing extra in App Store Connect and add a separate
  keyword field per locale (English (UK) and English (Australia) locales also add 100 more keyword characters
  that the US store reads).

## Launch-week calendar

D0 = the day you press Release (suggested Monday Nov 30, 2026: the week of Thanksgiving, Nov 23–27, is quiet).

| Day | What |
|---|---|
| Before D0 | Ask 10–20 friends and colleagues on TestFlight to install from the App Store on D0 and leave an honest rating. Never offer anything for reviews (Guideline 5.6.3). Prepare posts below. |
| D0 Mon | Release 8 am ET. LinkedIn post 1. WhatsApp message to your own groups. Product Hunt page scheduled for D1. |
| D1 Tue | Product Hunt launch (12:01 am PT). Reddit post 1 (only where self-promotion is allowed). X thread. |
| D2 Wed | Show HN (8–10 am ET). Reply to every comment for 6 hours. |
| D3 Thu | Short video 1 (Reels / Shorts / TikTok). Email 5 university international offices. |
| D4 Fri | LinkedIn post 2 (the privacy story). Telegram and Facebook groups (where rules allow). |
| D5–6 | Reply to every review and post. Fix the top bug, ship an OTA update. |
| D7 | Look at the numbers (below). Write “week 1: what I learned” for LinkedIn. |
| Weeks 2–4 | One useful post a week tied to news: the January Visa Bulletin (mid-December), H-1B registration (March), layoffs. |

## Channels and ready drafts

### Reddit
Subreddits: r/h1b, r/USCIS, r/greencard, r/immigration, r/f1visa, r/OPT, r/L1Visa, r/stemopt, r/abroadstudies,
r/IndiansinUSA. Most ban advertising or limit it (common: no promotion, or 1 in 10 posts, or a weekly thread).
**Read each sidebar and message the moderators first**: “I built a free, no-login app for H-1B families; may I
post it once?” Post only where allowed; elsewhere just answer questions and mention the app only when it
directly helps (and say you made it).

Draft (where allowed):
> **I built a free app to keep my family’s visa dates in one place (no login, documents stay on the phone)**
> After years of tracking H-1B, H-4 and EAD dates in spreadsheets, I made Immigration Wallet. It reads the
> dates from your I-94, I-797, EAD and passport on the phone (nothing uploaded), reminds you before anything
> expires, checks a trip against everyone’s documents and shows your priority date against the Visa Bulletin.
> Free, no ads, no account. Not legal advice. Feedback very welcome: what would you add?
> [App Store link]

### LinkedIn (owner; global immigration compliance manager)
Post 1 (launch):
> After 10+ years in immigration compliance, the question I hear most from families isn’t legal. It’s “when
> does my I-94 end, and did my spouse’s EAD get renewed?”
> So in my own time I built Immigration Wallet, a free iPhone app for H-1B, L-1, F-1 and green card families:
> • everyone’s status and deadlines on one screen
> • reminders before passports, I-94s, EADs and visas expire
> • documents read on the phone; nothing uploaded, no account
> It’s not legal advice and not a replacement for your attorney or HR team; it helps you ask them the right
> question at the right time.
> Link in the first comment. I’d value feedback from people who live this every day.

Post 2 (privacy story, D4):
> Most immigration apps ask you to upload your passport or log in with your USCIS account. I chose the
> opposite: the documents never leave the phone. Here’s why, and what it cost to build it that way… [3 short
> lessons]. Link in comments.

Personal posts only; no employer name, no client stories, and check the outside-activity policy first.

### X
> I made a free iPhone app for visa families: every H-1B / H-4 / EAD / I-94 date in one place, reminders
> before they expire, and your priority date vs the Visa Bulletin. Documents stay on your phone. No login.
> [link]
Then a 4-post thread with screenshots 1, 3, 5, 6. Reply under big immigration accounts' Visa Bulletin posts
only with something useful (“January bulletin: EB-2 India moved X; here’s how to check yours”).

### WhatsApp, Facebook and Telegram groups (Indian professionals in the US)
Ask the admin first. Short, personal, one time:
> Hi all, I built a free app for our visa paperwork: keeps H-1B / H-4 / EAD / I-94 / passport dates for the
> whole family, reminds before expiry, and checks if your green card date is current. Nothing uploaded, no
> login. If it helps anyone: [link]. Feedback welcome.
Facebook: groups for H-1B / H-4 spouses and city groups (“Indians in Dallas”, “Desis in Bay Area”).
Telegram: H-1B / OPT channels (admin permission first).

### Short videos (Reels, YouTube Shorts, TikTok): 20–30 s, screen recording of the example family
1. “3 dates every H-1B family forgets” → I-94 vs approval end, spouse’s passport, EAD renewal window → app shows all 3.
2. “Is my priority date current?” → open the app, Priority date, 5 seconds.
3. “Can I travel for Christmas on H-1B?” → Can I travel? with a December trip (expired visa stamp warning).
4. “Laid off on H-1B: your 60-day clock” → I lost my job tile (careful, factual, link to official sources).
5. “Send your spouse your documents without WhatsApp-ing your passport” → Share with family.
Hook in the first second, captions on, no music with lyrics, end card “Immigration Wallet, free on the App Store”.

### Product Hunt
Tagline (60): `Your family’s visa dates and documents, private on your phone`. First comment: the personal
story + what's different (no login, on-device). Schedule 12:01 am PT Tuesday; ask friends to visit and comment,
not to upvote (PH penalises vote rings).

### Hacker News (Show HN)
> **Show HN: Immigration Wallet – visa dates and documents for families, all on-device**
> Text: why (families track dates in spreadsheets), how (on-device OCR with Vision, rules engine for status
> dates, AES-GCM encrypted backups, share files locked with a one-time code, no account), what's open (public
> repo), and limits (not legal advice). Be there to answer for hours. HN likes the privacy architecture.

### Blogs, newsletters, podcasts
Pitch a 3-line email with screenshots to: immigration newsletters and Substacks, Indian-American media
(desi news sites), student-focused immigration YouTubers, and immigration law firm blogs (they like tools that
make clients organised; offer a “made for your clients” mention, never anything paid). Subject: “Free,
private visa-date app for your readers (no login)”.

### University international student offices (F-1 / OPT)
Email the international student and scholar office (ISSS / OISS) at 10–20 universities with many Indian
students (e.g. in Texas, Illinois, California, New York, Massachusetts):
> Subject: Free tool for OPT students to track unemployment days and SEVP reporting
> Hello, I built a free iPhone app that helps F-1 / OPT / STEM OPT students track their EAD dates,
> unemployment days and the 10-day SEVP reporting window. No login, nothing uploaded, not legal advice, and it
> links your office's guidance as the authority. If useful, please consider listing it among student
> resources. Happy to change anything you'd want students to see. [link]

## Referral loops built into the app

- **Share with family**: every share sends a file plus a message with the install link and 3 steps
  (`get.html`). The spouse has to install to open it: each active user brings a second phone.
- **Settings → Invite family**: one tap to send the install link.
- **Community**: posts and timelines are shareable; “Cases like mine” gives a reason to come back and to invite
  people on the same visa.
- **Wallet card and widget**: visible daily reminders that keep the app in use (retention, which helps ranking).
- Ideas for 1.1: “Share my timeline” image for Reddit / WhatsApp with a small app mark; a monthly Visa
  Bulletin push that links to the Community thread for that month.

## Asking for ratings (SKStoreReviewController)

Not in the app yet. Add `expo-store-review` in the next native build (it is a native module, so not by OTA),
and call `StoreReview.requestReview()` only after a success moment, at most once per 60 days, never on first
launch and never after an error:
- after the first document is read and the person's status appears (“Status valid until …”), or
- after the user pastes a case status that is **Approved**, or
- after a Can I travel? check that comes back all clear, or
- on the 5th app open across at least 3 different days.
Apple shows the prompt at most 3 times a year per user. Answer every App Store review in App Store Connect
(replies are public and help conversion).

## Metrics to watch (App Store Connect → Analytics, and Trends)

| Metric | Where | Week-1 target | What it tells you |
|---|---|---|---|
| Impressions (search vs browse) | Analytics → Acquisition | rising daily | Is ASO working? |
| Product page conversion rate (page views → downloads) | Analytics → Overview | 30%+ | Are screenshots and subtitle convincing? |
| Search terms | Analytics → Sources → App Store Search | — | Which keywords bring people; swap the rest |
| Downloads by source (search, browse, web referrer, app referrer) | Analytics → Sources | — | Which channel to double down on |
| Day-1 / Day-7 retention | Analytics → Retention | 40% / 20% | Do people add documents and come back? |
| Crashes | Analytics → Crashes, Xcode Organizer | under 0.5% sessions | Fix before more promotion |
| Ratings and reviews | Ratings and Reviews | 4.5+ | Reply to every one |
| Community reports | admin endpoints (server README) | handled within 24 h | Guideline 1.2 compliance |

Use **campaign links** to see which channel works: App Store Connect → Analytics → Campaigns gives a link like
`https://apps.apple.com/app/apple-store/id6836097003?pt=PROVIDER_ID&ct=reddit&mt=8`. Make one per channel
(`ct=reddit`, `ct=linkedin`, `ct=whatsapp`, `ct=producthunt`, `ct=hn`, `ct=uni`).
