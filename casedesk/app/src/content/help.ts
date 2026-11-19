// Help topics (Settings → Help, the "?" buttons, and "Learn more" on each tab's first-time card).
// Plain English, short paragraphs. General information, not legal advice.
export type HelpTopic = { id: string; title: string; sub: string; body: string[]; steps?: string[] };
import { EXPECT_HELP } from '../core/expect';

export const HELP: HelpTopic[] = [
  {
    id: 'overview', title: 'What Immigration Wallet covers', sub: 'Everything the app does, in one page',
    body: [
      'Immigration Wallet keeps your family’s US immigration papers in one place, on this phone, and tells you what needs attention.',
      'Home: everyone’s status at a glance, what needs attention first, your cases and the latest updates for your visa types.',
      'Family: one page per person — their status, documents, cases, reminders, job and travel plans, and their next filing with the earliest date and typical processing time.',
      'Cases: every USCIS receipt by person. Check the status on uscis.gov in Safari and paste the result back.',
      'Tools: Can I travel?, priority date and Visa Bulletin, processing times, green card planner, prevailing wage, fees, consulate waits, LCA/PERM status, employer H-1B data, visa guides, the H-1B lottery, the citizenship test and I-9 documents.',
      'Settings: appearance, Face ID, reminders, backup & restore, help and the app’s sources.',
    ],
  },
  {
    id: 'family-docs', title: 'Adding family and documents', sub: 'People, passports, I-94s, approvals',
    body: [
      'Add each person once — you, a spouse, children, parents — with the status they hold now. People outside the US (for example in India) can be added too.',
      'Then add documents step by step: passport, visa stamp, I-94, approval notice and any receipts. Take a photo, pick one from Photos or a PDF from Files. The text is read on this phone.',
      'Skip anything you don’t have. Each document makes the checks more accurate. If a document looks like someone else’s (a different passport number), Immigration Wallet asks before saving it.',
    ],
    steps: ['Family → Add family member', 'Home → Add documents (or “Continue adding documents”)', 'A person’s page → Add or renew a document'],
  },
  {
    id: 'statuses', title: 'How statuses and alerts work', sub: 'Act now, Review, Info, Good',
    body: [
      'Each person’s status comes from their documents: the newest I-94 sets how long they can stay; approvals, receipts, EADs and green cards add to it.',
      'Act now (red): something has ended or will soon cause a problem — talk to an attorney. Review (amber): plan ahead, a date is coming up. Info (blue): good to know. Good (green): nothing to do.',
      'A dependent’s status follows the principal’s, so “I-94 ends first” is shown once for the family, not once per person.',
      'Every alert shows its official source and when the rule was last checked. Alerts are general information, not legal advice.',
    ],
  },
  {
    id: 'cases', title: 'Adding a case and checking USCIS', sub: 'Copy the receipt → Safari → copy the result → paste back',
    body: [
      'A receipt notice (I-797C) adds a case automatically. You can also add one by hand: Cases → +, then type the 13-character receipt number.',
      'Immigration Wallet never logs in to USCIS or reads the site for you. Instead it makes the official check quick:',
    ],
    steps: [
      'Open the case and tap “Copy number & open uscis.gov”. The receipt number is copied.',
      'Safari opens Case Status Online. Paste the number and tap Check Status.',
      'Select the status heading and the sentence under it, and tap Copy.',
      'Tap Done to come back. Tap “Paste what USCIS says” — Immigration Wallet reads the status, date and form and updates the case, its history and key dates.',
    ],
  },
  {
    id: 'citizenship', title: 'Citizenship test', sub: 'Practise the civics questions',
    body: [
      'Tools → Citizenship test asks the official civics questions in random order. For N-400s filed on or after Oct 20, 2025 the officer asks up to 20 questions and you need 12 right.',
      'Answers that depend on where you live or who is in office change — check them on uscis.gov before the interview.',
    ],
  },
  {
    id: 'i9', title: 'I-9 documents', sub: 'What to show a new employer',
    body: [
      'Tools → I-9 documents lists which documents prove identity and work permission for each visa type (List A, or List B + C).',
      'Your employer decides which to accept from the official lists; you choose which to show. Some statuses need reverification before a work permit ends.',
    ],
  },
  {
    id: 'backups', title: 'Backups', sub: 'Keep everything safe when you change phones',
    body: [
      'iCloud backup (Settings → Backup & restore): turn it on once and set a password. Like WhatsApp, Immigration Wallet then backs up to your own iCloud every day and after changes, and keeps the last 3. Restore from iCloud on a new phone from the Welcome screen.',
      'Settings → Back up to a file makes one password-protected .casedesk file with every person, document (images and PDFs) and case. Save it to Files, iCloud Drive or Google Drive, or AirDrop it to your new phone.',
      'To restore, choose the file and type its password. On a new phone everything is restored; on a phone that already has data you can replace it or merge (you’ll see exactly what was added).',
      'Nobody can open the file without the password — and we can’t recover it, so keep it somewhere safe.',
    ],
  },
  {
    id: 'privacy', title: 'Privacy', sub: 'Your documents stay on this phone',
    body: [
      'Documents are read and stored only on this phone. No account is needed, and there are no ads and no tracking.',
      'Community Q&A is the one optional exception: to post you sign in with Apple, and only a made-up display name and what you type into questions and answers is stored on the Immigration Wallet server. Delete it any time in Community → Account.',
      'Immigration Wallet never logs in to USCIS, CBP or SEVP. Updates, the Visa Bulletin and processing times come from the Immigration Wallet server or a built-in copy — nothing about you is sent.',
      'Turn on Face ID in Settings to lock the app and hide documents in the app switcher.',
    ],
  },
  {
    id: 'priority-date', title: 'Priority date', sub: 'Is your green card date current?',
    body: [
      'Your priority date is on the I-140 (or PERM) approval. Each month the State Department’s Visa Bulletin lists a cut-off date for each category and country of birth.',
      'If your date is earlier than the cut-off, it is “current”. USCIS says each month whether it uses the Final Action dates or the Dates for Filing chart for I-485 filings — Immigration Wallet uses the chart USCIS picked.',
    ],
  },
  {
    id: 'processing', title: 'Processing times', sub: 'How long USCIS is taking',
    body: [
      'USCIS publishes how long it takes to decide 8 in 10 cases of each form and category. Immigration Wallet shows those numbers, live when the server answers and a dated built-in copy otherwise.',
      'For each person, Immigration Wallet shows the next filing their status needs, the earliest date it can be filed, and — if filed that day — when a decision is likely. Premium processing, where it exists, gives a decision within the listed time for an extra fee.',
      'Times change month to month and differ by service center. Plan with the earliest date, not the deadline.',
    ],
  },
  {
    id: 'travel', title: 'Can I travel?', sub: 'Checking a trip',
    body: [
      'Pick who is travelling, the dates and the country. Immigration Wallet runs the same checks it uses on Home with the trip added: passport validity on return, visa stamp, pending cases that abandon on travel, advance parole, and days outside the US for citizenship.',
      'If a new visa stamp is needed, you get a stamping checklist. Trips under 30 days to Canada or Mexico may use automatic visa revalidation.',
    ],
  },
  {
    id: 'layoff', title: 'Layoff plan', sub: 'If a job ends',
    body: [
      'Enter the last day of work. Immigration Wallet shows the last day in status for everyone who depends on that job (up to 60 days of grace, never past the I-94), and the options: a new employer files, change of status, or leaving the US.',
      'Dependents’ status follows the principal’s. Talk to an attorney as early as you can — options narrow as the grace period runs out.',
    ],
  },
  EXPECT_HELP,
  {
    id: 'widgets', title: 'Widgets', sub: 'Next deadline and family status on your Home Screen',
    body: [
      'Immigration Wallet has two widgets. Next deadline (small, and on the Lock Screen) shows who, what and how many days are left, coloured by how close it is: red within 30 days, amber within 90. Family status (medium and large) lists up to 4 people with their status and valid-until date; the large size adds the latest case update and when the next Visa Bulletin is expected.',
      'To add one: touch and hold an empty part of the Home Screen → Edit → Add Widget → Immigration Wallet → pick a size. For the Lock Screen: touch and hold the Lock Screen → Customize → Lock Screen → tap the widget area. Tapping a widget opens that person or case.',
      'Widgets show only a short summary — initials or first names (Settings → Widgets), status labels and dates. Never passport, receipt or A-numbers. When Face ID lock is on, widgets hide everything and only say “Open Immigration Wallet” (you can change this in Settings → Widgets).',
      'Widgets update when you change something in the app and once a day. They are for your reference — not an official document, and not legal advice. Widgets need the latest app version from TestFlight and iOS 17 or later.',
    ],
    steps: ['Home Screen → touch and hold → Edit → Add Widget → Immigration Wallet', 'Settings → Widgets → Show names on widgets'],
  },
  {
    id: 'wallet-card', title: 'Wallet card', sub: 'A status reminder card in Apple Wallet',
    body: [
      'Each person can have an “Immigration status card” in Apple Wallet: name (full, first or initials — you choose), status (for example L-2S dependent), valid until (I-94), visa stamp until, passport until and the next deadline. Wallet brings it up on your Lock Screen as the valid-until date gets close.',
      'It is for your personal reference only — NOT an official document, ID or proof of status, and not issued or checked by any government agency. The front says so, and the back has the full disclaimer and where the dates come from. Always carry and rely on your original documents.',
      'No passport, receipt or A-numbers ever go on the card. To make it, the card fields are sent once to our server, which signs the pass so Wallet accepts it, and stores nothing.',
      'The card doesn’t change by itself. After you add a new document, open the person and tap Add to Apple Wallet again — the new card replaces the old one. To remove it, open it in Wallet → ••• → Remove Pass.',
    ],
    steps: ['A person’s page → Add to Apple Wallet → check the preview → Add', 'Family → Wallet status cards → pick a person'],
  },
  {
    id: 'community', title: 'How the community works', sub: 'Posts, threads and votes with people on the same visa',
    body: [
      'Community (Tools → Community Q&A) is where people share real experience: stamping, RFEs, transfers, green card steps. Anyone can read. Community answers are from other users, not lawyers — not legal advice.',
      'The feed: Hot shows what is active now, New the latest, Top the most upvoted (today, this week or all time) and Unanswered is where you can help. For my visa keeps it to your family’s visa types and case forms. Tap a tag to filter, or search. Pull down to refresh.',
      'Four kinds of post: a Question (you can mark one answer as accepted), a Discussion, a Timeline share (form, office and dates shown as a small card — never the receipt number) and a Poll with 2–4 choices, one vote each.',
      'Comments are threaded: reply to a comment to answer that person, tap the arrow on a comment to collapse its thread, and sort by Best or New. Up and down votes move the most useful posts and comments up. Karma on a profile is the upvotes that person received.',
      'Share sends a link through the iPhone share sheet, or reposts it to the community with your comment above the original. The bookmark saves a post to Community → Account → Saved posts.',
      'To post, comment or vote, sign in with Apple. Others only see a made-up display name, an avatar (your initials or one of 24 built-in ones — no photos) and an optional visa flair. Never your email or anything from your documents. Accept the community rules once before your first post.',
      'Keep it private: never post receipt numbers, A-numbers, passport numbers, emails or phone numbers. Say the form and service center instead (for example I-129 at EAC).',
      'Every post, comment and profile has a ••• menu: Report sends it to the moderators and hides it for you; Block hides everything from that person. Content reported by several people is hidden until reviewed — moderators act within 24 hours and ban accounts that break the rules. Contact moderators from Community → Account.',
      'Notifications tell you about replies to you and upvote milestones; turn push on or off in Community → Account. Delete account removes your account: posts and comments nobody replied to are deleted, and where others replied your name and words become [deleted] so their thread still reads.',
    ],
    steps: ['Tools → Community Q&A', 'New post → sign in with Apple → accept the rules', 'Post or comment → ••• → Report or Block', 'Community → Account → Delete account'],
  },
];

export const helpTopic = (id?: string) => HELP.find((h) => h.id === id);

/** First-time card at the top of each tab. */
export const TAB_HELP: Record<string, { text: string; topic: string }> = {
  home: { text: 'Everyone’s status, what needs attention first, your cases and updates for your visa types — all from the documents on this phone.', topic: 'overview' },
  family: { text: 'One page per person: status, documents, cases, reminders and the next filing with its earliest date and typical processing time.', topic: 'family-docs' },
  cases: { text: 'Every USCIS receipt by person. Check status on uscis.gov in Safari, then paste what it says back here.', topic: 'cases' },
  tools: { text: 'Plan a trip, check your priority date and processing times, and look up wages, fees and guides.', topic: 'overview' },
  settings: { text: 'Appearance, Face ID, reminders, backups and help. Your data stays on this phone.', topic: 'privacy' },
};
