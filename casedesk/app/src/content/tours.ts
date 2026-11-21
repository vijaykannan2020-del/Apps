// First-visit tips for every screen (2–4 steps each). `target` = a <TourTarget id> on that screen;
// "help" is the "?" button itself. `help` = the matching topic in content/help.ts.
// Other engineers' screens can add their own entries here or pass steps to useTour() directly.
import type { TourStep } from '../core/tours';

export type TourDef = { steps: TourStep[]; help?: string };

export const TOURS: Record<string, TourDef> = {
  home: { help: 'overview', steps: [
    { target: 'hero', title: 'Am I OK?', text: 'The big card answers that: the one thing that matters most, or All good. Anything else that needs you is listed just below.' },
    { target: 'search', title: 'Search', text: 'Find any person, document, case, tool or setting. The same button is on Family, Updates, Tools and Cases.' },
    { target: 'cases', title: 'Green card and cases', text: 'Your green card shows here once you add your priority date. Add a receipt number to follow a USCIS case.' },
  ] },
  family: { help: 'family-docs', steps: [
    { target: 'list', title: 'One page per person', text: 'Tap someone to see their status, documents, cases and reminders.' },
    { target: 'add', title: 'Add family', text: 'Tap here to add your spouse, children or parents.' },
  ] },
  person: { help: 'family-docs', steps: [
    { target: 'status', title: 'Status', text: 'How long this person can stay, worked out from their documents.' },
    { target: 'docs', title: 'Documents', text: 'Tap here to add a document — a photo or PDF is read on your phone.' },
    { target: 'filing', title: 'Next filing', text: 'This shows when to file next, the earliest date, and how long USCIS usually takes.' },
  ] },
  'flow-step': { help: 'family-docs', steps: [
    { target: 'upload', title: 'Add the document', text: 'Take a photo or pick a PDF. The text is read on this phone — nothing is uploaded.' },
    { target: 'type', title: 'Skip for now', text: 'No copy handy? Skip it and add it later from the person’s page. If a document can’t be read, you can type the dates.' },
  ] },
  document: { help: 'family-docs', steps: [
    { target: 'fields', title: 'What was read', text: 'Check the details read from the document and fix anything that looks wrong.' },
    { target: 'actions', title: 'Share or replace', text: 'Share a copy for your reference, or replace it with a newer one.' },
  ] },
  review: { help: 'family-docs', steps: [
    { target: 'list', title: 'Check before saving', text: 'Everything you added, per person. Tap an item to change it.' },
    { target: 'save', title: 'Save', text: 'Nothing is saved until you tap Save.' },
  ] },
  summary: { help: 'statuses', steps: [
    { target: 'cards', title: 'What we found', text: 'Each person’s status and anything that needs attention, from the documents you added.' },
    { target: 'home', title: 'Back to Home', text: 'Home keeps this up to date as dates come closer.' },
  ] },
  cases: { help: 'cases', steps: [
    { target: 'add', title: 'Add a case', text: 'Tap + to add a receipt number from an I-797C notice.' },
    { target: 'list', title: 'Pending first', text: 'Pending cases are at the top. Tap one to check its status on uscis.gov.' },
  ] },
  case: { help: 'cases', steps: [
    { target: 'check', title: 'Check status', text: 'This copies the receipt number and opens uscis.gov in Safari. Paste it, tap Check Status, then copy the result.' },
    { target: 'paste', title: 'Paste it back', text: 'Come back and tap here — the status, date and history update from what you copied.' },
    { target: 'history', title: 'History', text: 'Every status you saved, newest first.' },
  ] },
  'check-status': { help: 'cases', steps: [
    { target: 'paste', title: 'Paste the status', text: 'On uscis.gov, select the status and its explanation, tap Copy, then tap here.' },
    { target: 'pick', title: 'Or pick it', text: 'No text copied? Choose what the page said and it is saved with today’s date.' },
  ] },
  'add-case': { help: 'cases', steps: [
    { target: 'receipt', title: 'Receipt number', text: 'Three letters and ten digits, from the top left of the I-797C notice.' },
    { target: 'who', title: 'Whose case', text: 'Pick the person the case is for, then save.' },
  ] },
  tools: { help: 'overview', steps: [
    { target: 'plan', title: 'Picked for your family', text: 'The Visa Bulletin, a trip check, your priority date, LCA / PERM status and more — the tools that fit your family’s visas.' },
    { target: 'lookup', title: 'Every other tool', text: 'Listed below under My plans, Look up and Learn — fees, wages, employer data, I-9 documents and guides, each with what it does.' },
  ] },
  'tool-travel': { help: 'travel', steps: [
    { target: 'form', title: 'Your trip', text: 'Pick who is travelling and the dates.' },
    { target: 'result', title: 'The checks', text: 'Passport, visa stamp, pending cases and days outside the US — each with what to do.' },
  ] },
  'tool-pd': { help: 'priority-date', steps: [
    { target: 'input', title: 'Your priority date', text: 'Enter the date on your I-140 approval and pick your category and country.' },
    { target: 'result', title: 'Current or not', text: 'Shows this month’s cut-off and whether you can file the I-485.' },
  ] },
  'tool-vb': { help: 'priority-date', steps: [
    { target: 'picker', title: 'Which chart', text: 'Final Action (approval) or Dates for Filing (when you can file). Rows show India, China and all other countries.' },
    { target: 'source', title: 'Dated and sourced', text: 'The bulletin month, when it was fetched, and a link to travel.state.gov.' },
  ] },
  'tool-proc': { help: 'processing', steps: [
    { target: 'form', title: 'Pick a form', text: 'Times are USCIS’s published 8-in-10 figures.' },
    { target: 'source', title: 'As of', text: 'Live when our server answers, otherwise a dated built-in copy.' },
  ] },
  'tool-fees': { help: 'overview', steps: [
    { target: 'case', title: 'What you’re filing', text: 'Pick the filing and employer size — the total updates as you go.' },
    { target: 'source', title: 'Check before paying', text: 'Fees change. Always confirm on uscis.gov/fees.' },
  ] },
  'tool-civics': { help: 'citizenship', steps: [
    { target: 'answers', title: 'Pick an answer', text: 'Green with ✓ means correct; red with ✕ means not quite, and the right one turns green.' },
    { target: 'next', title: 'Next question', text: 'Ten questions, then your score and the ones to review.' },
  ] },
  'tool-i9': { help: 'i9', steps: [
    { target: 'lists', title: 'Tick what you have', text: 'One from List A, or one from List B and one from List C.' },
    { target: 'result', title: 'The answer', text: 'This tells you if your documents work for the I-9.' },
  ] },
  'tool-wage': { help: 'overview', steps: [
    { target: 'search', title: 'Job and place', text: 'Search the job title, then pick the state and county.' },
    { target: 'source', title: 'Official wage levels', text: 'Levels I–IV from the Department of Labor’s wage data.' },
  ] },
  'tool-h1b': { help: 'overview', steps: [
    { target: 'search', title: 'Search an employer', text: 'H-1B approvals, PERM and LCA counts by year.' },
    { target: 'source', title: 'Source', text: 'From the USCIS H-1B Employer Data Hub.' },
  ] },
  tool: { help: 'overview', steps: [
    { target: 'body', title: 'This tool', text: 'Everything here is general information from official sources.' },
  ] },
  layoff: { help: 'layoff', steps: [
    { target: 'date', title: 'Last day of work', text: 'Enter it to see the last day in status for everyone who depends on the job.' },
    { target: 'options', title: 'Your options', text: 'A new employer files, a change of status, or leaving the US.' },
  ] },
  'news-list': { help: 'overview', steps: [
    { target: 'kind', title: 'Official or news', text: 'Official updates come from USCIS, DHS, DOL and State; news is coverage and analysis.' },
    { target: 'chips', title: 'Filter by topic', text: '“For my family” shows only your visa types.' },
  ] },
  'news-item': { help: 'overview', steps: [
    { target: 'body', title: 'What it means', text: 'A short summary and what it means for you.' },
    { target: 'source', title: 'Read the source', text: 'Always check the official source before you act.' },
  ] },
  settings: { help: 'privacy', steps: [
    { target: 'backup', title: 'Backup', text: 'Your data is only on this phone. Backup shows when you last backed up, with Back up now and Restore.' },
    { target: 'share', title: 'Share with family', text: 'Send documents to your spouse’s phone, encrypted, or invite them to the app.' },
    { target: 'helpsec', title: 'Help & tips, About', text: 'Help & tips has the guides, the tour and Run setup again. About has diagnostics, HR tools and the example family.' },
  ] },
  backup: { help: 'backups', steps: [
    { target: 'password', title: 'Pick a password', text: 'The backup file is locked with it. We can’t recover it if you forget.' },
    { target: 'save', title: 'Save the file', text: 'Save it to Files, Google Drive or AirDrop it to your new phone.' },
  ] },
  restore: { help: 'backups', steps: [
    { target: 'pick', title: 'Choose the file', text: 'Pick the Immigration Wallet backup you saved, from Files or a cloud drive.' },
    { target: 'password', title: 'Type its password', text: 'Then choose to replace or merge with what’s on this phone.' },
  ] },
  'wallet-preview': { help: 'wallet-card', steps: [
    { target: 'name-style', title: 'Name on the card', text: 'Pick full name, first name or initials. No document numbers ever go on the card.' },
    { target: 'card', title: 'Check the preview', text: 'This is what the Wallet card shows. It’s for your reference — not an official document.' },
    { target: 'add', title: 'Add to Apple Wallet', text: 'Tap to add it. After a change, add it again to update the card.' },
  ] },
  icloud: { help: 'backups', steps: [
    { target: 'toggle', title: 'Automatic iCloud backup', text: 'Backs up to your own iCloud every day and after changes, and keeps the last 3.' },
    { target: 'password', title: 'Locked with your password', text: 'Apple can’t read the file, and neither can we.' },
  ] },
  // ---- v2.4: What to expect / Cases like mine (case page cards) ----
  'case-expect': { help: 'expect', steps: [
    { target: 'window', title: 'Your typical window', text: 'When cases like yours are usually decided, counted from the day USCIS received it. The dot is today. An estimate, not a promise.' },
    { target: 'numbers', title: 'Where the numbers come from', text: 'Official USCIS statistics first — form reports, I-129 approval and RFE rates, processing times. Each shows its quarter or date.' },
    { target: 'options', title: 'Premium and visa class', text: 'Tap Premium if you paid for it — the window becomes the USCIS business-day clock. Pick the visa class for its rates.' },
    { target: 'office', title: 'The receipt prefix', text: 'EAC, WAC, LIN, SRC or IOE shows where USCIS received the case. Centers share work, so any of them may decide it.' },
  ] },
  'case-community': { help: 'expect', steps: [
    { target: 'community', title: 'Cases like mine', text: 'Timelines other app users shared anonymously for the same form and office. Nothing shows until 10 similar cases are decided.' },
    { target: 'share', title: 'Share anonymously', text: 'Adds only the form, office code, dates, outcome, premium and visa class — never your receipt number or name. Turn off to delete.' },
  ] },
  // ---- v2.7: Community (Reddit-style). ONE first-visit tip, on the feed; the other screens only show tips from their ? button. ----
  communityFeed: { help: 'community', steps: [
    { target: 'sort', title: 'Your feed', text: 'Hot shows what’s active now — switch to New, Top or Unanswered. Tap a post to read; sign in to vote, comment or post.' },
  ] },
  communityPost: { help: 'community', steps: [
    { target: 'vote', title: 'Vote, share, save', text: 'Up or down vote, share the link or repost it, bookmark it for later. ••• reports the post or blocks its author.' },
    { target: 'answer', title: 'Join the thread', text: 'Comment here, or tap Reply under a comment. Never post receipt numbers or other personal numbers.' },
  ] },
  communityCompose: { help: 'community', steps: [
    { target: 'type', title: 'Pick a type', text: 'Question, Discussion, Timeline (your case dates as a small card) or Poll with 2–4 choices.' },
    { target: 'title', title: 'A clear title', text: 'Say the visa, form and point in one line — e.g. “H-1B extension: RFE answered 8 weeks ago, normal?”.' },
    { target: 'tags', title: 'Tag it', text: 'Pick up to 5 tags so people with the same visa or form find it.' },
    { target: 'privacy', title: 'Keep it private', text: 'Leave out names, receipt numbers, A-numbers, emails and phone numbers. Say the service center (EAC, WAC…) instead.' },
  ] },
  communitySignIn: { help: 'community', steps: [
    { target: 'apple', title: 'Sign in with Apple', text: 'Only needed to post, comment or vote. We never see or show your email.' },
    { target: 'rules', title: 'Community rules', text: 'Read and accept the rules once before your first post.' },
  ] },
  communityAccount: { help: 'community', steps: [
    { target: 'avatar', title: 'Your avatar', text: 'Your initials on a pastel circle, or one of 24 built-in avatars. No photos.' },
    { target: 'name', title: 'Your display name', text: 'A made-up name is all anyone sees. Change it any time — no real names needed.' },
    { target: 'mine', title: 'Your activity', text: 'Your public profile, the posts you saved and your notifications.' },
    { target: 'delete', title: 'Delete account', text: 'Removes your account. Threads others replied to stay, with your name and words replaced by [deleted].' },
  ] },
  communityProfile: { help: 'community', steps: [
    { target: 'who', title: 'A member', text: 'A made-up name, an optional visa flair and karma — the upvotes on their posts and comments.' },
    { target: 'more', title: 'Report or block', text: 'The ••• menu reports this profile or blocks the person, so you stop seeing them.' },
  ] },
};

/** Every screen id that must have a tour (checked by tests/tours.test.ts). */
export const TOUR_SCREENS = Object.keys(TOURS);
