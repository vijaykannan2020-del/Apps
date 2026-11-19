// First-visit tips for every screen (2–4 steps each). `target` = a <TourTarget id> on that screen;
// "help" is the "?" button itself. `help` = the matching topic in content/help.ts.
// Other engineers' screens can add their own entries here or pass steps to useTour() directly.
import type { TourStep } from '../core/tours';

export type TourDef = { steps: TourStep[]; help?: string };
const helpStep = (text = 'Tap ? any time to see these tips again and open the help topic.'): TourStep => ({ target: 'help', title: 'Help', text });

export const TOURS: Record<string, TourDef> = {
  home: { help: 'overview', steps: [
    { target: 'attention', title: 'Needs attention', text: 'The most urgent items for your family come first. Tap one to see what to do.' },
    { target: 'family', title: 'Your family', text: 'Each person’s status and how long they can stay. Tap a name for their page.' },
    { target: 'updates', title: 'Updates', text: 'Updates for your family’s visa types first, then everything else — filter by topic right here.' },
    helpStep(),
  ] },
  family: { help: 'family-docs', steps: [
    { target: 'list', title: 'One page per person', text: 'Tap someone to see their status, documents, cases and reminders.' },
    { target: 'add', title: 'Add family', text: 'Tap here to add your spouse, children or parents.' },
    { target: 'wallet', title: 'Wallet status cards', text: 'Add a reference card for anyone to Apple Wallet. It’s a reminder, not an official document.' },
    helpStep(),
  ] },
  person: { help: 'family-docs', steps: [
    { target: 'status', title: 'Status', text: 'How long this person can stay, worked out from their documents.' },
    { target: 'docs', title: 'Documents', text: 'Tap here to add a document — a photo or PDF is read on your phone.' },
    { target: 'filing', title: 'Next filing', text: 'This shows when to file next, the earliest date, and how long USCIS usually takes.' },
    helpStep(),
  ] },
  'flow-step': { help: 'family-docs', steps: [
    { target: 'upload', title: 'Add the document', text: 'Take a photo or pick a PDF. The text is read on this phone — nothing is uploaded.' },
    { target: 'type', title: 'Skip for now', text: 'No copy handy? Skip it and add it later from the person’s page. If a document can’t be read, you can type the dates.' },
    helpStep(),
  ] },
  document: { help: 'family-docs', steps: [
    { target: 'fields', title: 'What was read', text: 'Check the details read from the document and fix anything that looks wrong.' },
    { target: 'actions', title: 'Share or replace', text: 'Share a copy for your reference, or replace it with a newer one.' },
    helpStep(),
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
    helpStep(),
  ] },
  case: { help: 'cases', steps: [
    { target: 'check', title: 'Check status', text: 'This copies the receipt number and opens uscis.gov in Safari. Paste it, tap Check Status, then copy the result.' },
    { target: 'paste', title: 'Paste it back', text: 'Come back and tap here — the status, date and history update from what you copied.' },
    { target: 'history', title: 'History', text: 'Every status you saved, newest first.' },
    helpStep(),
  ] },
  'add-case': { help: 'cases', steps: [
    { target: 'receipt', title: 'Receipt number', text: 'Three letters and ten digits, from the top left of the I-797C notice.' },
    { target: 'who', title: 'Whose case', text: 'Pick the person the case is for, then save.' },
  ] },
  tools: { help: 'overview', steps: [
    { target: 'plan', title: 'Plan ahead', text: 'Check a trip, your priority date and how long USCIS is taking.' },
    { target: 'lookup', title: 'Look up', text: 'Fees, wages, the Visa Bulletin and employer data — each with its official source.' },
    helpStep(),
  ] },
  'tool-travel': { help: 'travel', steps: [
    { target: 'form', title: 'Your trip', text: 'Pick who is travelling and the dates.' },
    { target: 'result', title: 'The checks', text: 'Passport, visa stamp, pending cases and days outside the US — each with what to do.' },
    helpStep(),
  ] },
  'tool-pd': { help: 'priority-date', steps: [
    { target: 'input', title: 'Your priority date', text: 'Enter the date on your I-140 approval and pick your category and country.' },
    { target: 'result', title: 'Current or not', text: 'Shows this month’s cut-off and whether you can file the I-485.' },
    helpStep(),
  ] },
  'tool-vb': { help: 'priority-date', steps: [
    { target: 'picker', title: 'Which chart', text: 'Final Action (approval) or Dates for Filing (when you can file). Rows show India, China and all other countries.' },
    { target: 'source', title: 'Dated and sourced', text: 'The bulletin month, when it was fetched, and a link to travel.state.gov.' },
    helpStep(),
  ] },
  'tool-proc': { help: 'processing', steps: [
    { target: 'form', title: 'Pick a form', text: 'Times are USCIS’s published 8-in-10 figures.' },
    { target: 'source', title: 'As of', text: 'Live when our server answers, otherwise a dated built-in copy.' },
    helpStep(),
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
    helpStep('Tap ? to see this again.'),
  ] },
  layoff: { help: 'layoff', steps: [
    { target: 'date', title: 'Last day of work', text: 'Enter it to see the last day in status for everyone who depends on the job.' },
    { target: 'options', title: 'Your options', text: 'A new employer files, a change of status, or leaving the US.' },
    helpStep(),
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
    { target: 'widgets', title: 'Widgets', text: 'Choose initials or first names on Home Screen widgets, and hide details while Face ID lock is on.' },
    { target: 'notify', title: 'Notifications', text: 'See whether alerts are on, and turn them on in iOS Settings if needed.' },
    { target: 'backup', title: 'Backups', text: 'Your data is only on this phone — back it up to iCloud or a file.' },
    { target: 'helpsec', title: 'Help', text: 'Help topics, the example family and “Show all tips again”.' },
  ] },
  backup: { help: 'backups', steps: [
    { target: 'password', title: 'Pick a password', text: 'The backup file is locked with it. We can’t recover it if you forget.' },
    { target: 'save', title: 'Save the file', text: 'Save it to Files, Google Drive or AirDrop it to your new phone.' },
  ] },
  restore: { help: 'backups', steps: [
    { target: 'pick', title: 'Choose the file', text: 'Pick a .casedesk backup from Files or a cloud drive.' },
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
};

/** Every screen id that must have a tour (checked by tests/tours.test.ts). */
export const TOUR_SCREENS = Object.keys(TOURS);
