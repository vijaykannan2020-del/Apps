// Every screen and sub-screen a person might look for, for the Home search (v2.9). Local only.
// `who` picks the person a screen opens for (the main person, or the one with that visa);
// `to: 'case'` opens the first case (or the Cases tab when there is none).
import type { SearchSection } from '../core/search';

export type ScreenEntry = {
  id: string; section: SearchSection; title: string; sub: string; path: string; params?: Record<string, string>; keywords: string[];
  who?: 'main' | 'L-1' | 'H-1B' | 'work'; to?: 'case' | 'pending-case';
};

export const APP_SCREENS: ScreenEntry[] = [
  // tabs
  { id: 'home', section: 'Screens', title: 'Home', sub: 'What needs attention, family and cases', path: '/(tabs)', keywords: ['start', 'main', 'dashboard'] },
  { id: 'family', section: 'Screens', title: 'Family', sub: 'Everyone, their status and valid until', path: '/(tabs)/family', keywords: ['people', 'spouse', 'children', 'members'] },
  { id: 'cases', section: 'Screens', title: 'Cases', sub: 'USCIS receipts and case status', path: '/(tabs)/cases', keywords: ['receipt', 'case status', 'uscis', 'biometrics', 'rfe', 'interview notice', 'key dates', 'approved', 'pending'] },
  { id: 'tools', section: 'Screens', title: 'Tools', sub: 'Travel, Visa Bulletin, processing times and more', path: '/(tabs)/tools', keywords: ['calculators', 'look up'] },
  // family and people
  { id: 'add-member', section: 'Screens', title: 'Add family member', sub: 'Spouse, child or parent', path: '/add-member', keywords: ['add spouse', 'add child', 'add person', 'new person'] },
  { id: 'family-setup', section: 'Screens', title: 'Who’s in your family?', sub: 'Names, relationships and status', path: '/family-setup', keywords: ['family setup', 'edit family', 'relationship'] },
  { id: 'profile', section: 'Screens', title: 'Profile', sub: 'You, your family and reminders for each person', path: '/profile', keywords: ['me', 'my profile', 'reminders per person'] },
  { id: 'reminders', section: 'Settings', title: 'Reminders', sub: 'Per document type and person', path: '/reminders/:pid', who: 'main', keywords: ['notifications', 'alerts', 'lead time', 'remind me', 'days before'] },
  { id: 'work-location', section: 'Screens', title: 'Work location changed?', sub: 'City or ZIP → metro; amendment check', path: '/person/:pid', who: 'work', keywords: ['work location', 'worksite', 'moved', 'new city', 'remote', 'work from home', 'amendment', 'lca', 'metro'] },
  { id: 'layoff', section: 'Screens', title: 'I lost my job', sub: 'Last day in status for everyone, and what to do', path: '/layoff/:pid', who: 'work', keywords: ['layoff', 'laid off', 'job ended', 'grace period', '60 day', 'fired', 'resigned'] },
  { id: 'l1-limit', section: 'Screens', title: 'L-1 time limit (7 years L-1A, 5 years L-1B)', sub: 'Day counter on the person page', path: '/person/:pid', who: 'L-1', keywords: ['7 year', '5 year', 'max out', 'time used', 'day counter', 'l-1a limit', 'recapture'] },
  { id: 'h1b-limit', section: 'Screens', title: 'H-1B 6-year limit', sub: 'Day counter and recapture on the person page', path: '/person/:pid', who: 'H-1B', keywords: ['6 year', 'six year', 'max out', 'time used', 'day counter', 'recapture', 'ac21 extension'] },
  { id: 'trips', section: 'Screens', title: 'Days outside the US', sub: 'Trips and the day counters', path: '/person/:pid', who: 'main', keywords: ['trips', 'days abroad', 'travel history', 'continuous residence', 'physical presence'] },
  // cases
  { id: 'add-case', section: 'Cases', title: 'Add a case', sub: 'Type a receipt number from an I-797C', path: '/(tabs)/cases', params: { add: '1' }, keywords: ['new case', 'receipt number', 'track case', 'i-797c'] },
  { id: 'check-status', section: 'Cases', title: 'Check case status', sub: 'Open uscis.gov, paste the result back', path: '/(tabs)/cases', to: 'pending-case', keywords: ['case status', 'uscis status', 'update case', 'check status'] },
  { id: 'expect', section: 'Cases', title: 'What to expect', sub: 'Typical decision window for a case', path: '/(tabs)/cases', to: 'pending-case', keywords: ['estimate', 'when will', 'decision date', 'how long', 'premium processing'] },
  { id: 'like-mine', section: 'Cases', title: 'Cases like mine', sub: 'Anonymous timelines from other users', path: '/(tabs)/cases', to: 'pending-case', keywords: ['similar cases', 'other people', 'timelines', 'tracker'] },
  // tools (every entry of the Tools tab)
  { id: 't-travel', section: 'Tools', title: 'Can I travel?', sub: 'Check a trip against everyone’s documents', path: '/tools/travel', keywords: ['travel', 'trip', 'reentry', 'visa stamp', 'advance parole'] },
  { id: 't-pd', section: 'Tools', title: 'Priority date', sub: 'GC tracking: is your green card date current?', path: '/tools/pd', keywords: ['gc tracking', 'priority date', 'current', 'i-140', 'perm'] },
  { id: 't-gcp', section: 'Tools', title: 'Green card planner', sub: 'Expected wait and when to gather documents', path: '/tools/gcp', keywords: ['gc planner', 'gc', 'i-485', 'perm', 'i-140'] },
  { id: 't-vb', section: 'Tools', title: 'Visa Bulletin', sub: 'This month’s dates by category and country', path: '/tools/vb', keywords: ['vb', 'final action', 'dates for filing', 'eb-2', 'eb-3', 'india', 'priority date'] },
  { id: 't-proc', section: 'Tools', title: 'Processing times', sub: 'How long USCIS is taking, by form', path: '/tools/proc', keywords: ['i-129', 'i-485', 'i-765', 'i-131', 'i-539', 'how long'] },
  { id: 't-wage', section: 'Tools', title: 'Prevailing wage', sub: 'Wage levels for a job and area', path: '/tools/wage', keywords: ['salary', 'wage level', 'oflc', 'lca'] },
  { id: 't-fees', section: 'Tools', title: 'Fees', sub: 'Filing fees by form', path: '/tools/fees', keywords: ['filing fee', 'cost', 'i-129 fee', 'premium processing fee'] },
  { id: 't-waits', section: 'Tools', title: 'Visa appointment waits', sub: 'Wait times at consulates', path: '/tools/waits', keywords: ['stamping', 'consulate', 'appointment', 'wait time', 'dropbox'] },
  { id: 't-lca', section: 'Tools', title: 'LCA / PERM status', sub: 'Labor filings by case number', path: '/tools/lca', keywords: ['lca', 'perm', 'flag', 'dol', 'labor certification'] },
  { id: 't-emp', section: 'Tools', title: 'Employer H-1B data', sub: 'Approvals by employer', path: '/tools/emp', keywords: ['employer data', 'sponsor', 'approval rate'] },
  { id: 't-guides', section: 'Tools', title: 'Visa guides', sub: 'Plain-English guides with sources', path: '/tools/guides', keywords: ['guide', 'explain', 'what is'] },
  { id: 't-lottery', section: 'Tools', title: 'H-1B lottery', sub: 'How selection works and the odds', path: '/tools/lottery', keywords: ['lottery', 'registration', 'cap', 'selection', 'odds'] },
  { id: 't-civics', section: 'Tools', title: 'Citizenship test', sub: 'Practise the civics questions', path: '/tools/civics', keywords: ['civics', 'n-400', 'naturalization', 'citizenship'] },
  { id: 't-i9', section: 'Tools', title: 'I-9 documents', sub: 'What to show a new employer', path: '/tools/i9', keywords: ['i-9', 'list a', 'list b', 'reverify'] },
  { id: 't-hr', section: 'Tools', title: 'Expiring documents (HR)', sub: 'Every date coming up across the family', path: '/tools/hr', keywords: ['hr', 'expiring', 'expiry list'] },
  // green card screens
  { id: 'gc', section: 'Green card', title: 'Green card tracking', sub: 'Stage, priority date and what happens next', path: '/gc/:pid', who: 'main', keywords: ['gc', 'i-485', 'i-140', 'perm', 'stage'] },
  { id: 'gc-plan', section: 'Green card', title: 'Green card planner', sub: 'Expected wait and when to gather documents', path: '/gc/plan/:pid', who: 'main', keywords: ['gc planner', 'wait', 'priority date'] },
  { id: 'gc-interview', section: 'Green card', title: 'Green card interview prep', sub: 'What to bring and common questions', path: '/gc/interview/:pid', who: 'main', keywords: ['interview', 'checklist', 'questions'] },
  // updates and help
  { id: 'news', section: 'Updates', title: 'Updates', sub: 'USCIS, DOS and DOL news for your visa types', path: '/news', keywords: ['news', 'headlines', 'policy', 'rule change'] },
  { id: 'help', section: 'Help', title: 'Help topics', sub: 'Short guides to every part of the app', path: '/help', keywords: ['how to', 'guide', 'faq'] },
  { id: 'tour', section: 'Help', title: 'How Immigration Wallet works', sub: 'A short tour', path: '/tour', keywords: ['tour', 'intro', 'tutorial', 'walkthrough'] },
  { id: 'about', section: 'Help', title: 'About and support', sub: 'Data sources, privacy, licences, version', path: '/about', keywords: ['about', 'support', 'contact', 'version', 'licences', 'data sources', 'feedback'] },
  // settings
  { id: 'settings', section: 'Settings', title: 'Settings', sub: 'Appearance, Face ID, reminders, backup', path: '/settings', keywords: ['preferences', 'options'] },
  { id: 's-appearance', section: 'Settings', title: 'Appearance', sub: 'System, light or dark', path: '/settings', keywords: ['dark mode', 'light mode', 'theme'] },
  { id: 's-colour', section: 'Settings', title: 'Colour', sub: 'Pastel and other colour themes', path: '/settings', keywords: ['color', 'colour theme', 'accent'] },
  { id: 's-lock', section: 'Settings', title: 'Face ID lock', sub: 'Lock the app and hide it in the app switcher', path: '/settings', keywords: ['lock', 'touch id', 'passcode', 'app lock'] },
  { id: 's-privacy', section: 'Settings', title: 'Privacy', sub: 'Your documents stay on this phone', path: '/help/privacy', keywords: ['privacy', 'data', 'tracking'] },
  { id: 's-reminders', section: 'Settings', title: 'Default reminders', sub: 'Days before each date', path: '/settings', params: { open: 'reminders' }, keywords: ['notifications', 'lead time'] },
  { id: 's-notify', section: 'Settings', title: 'Notifications', sub: 'Case changes, expiry, new Visa Bulletin', path: '/settings', keywords: ['alerts', 'push', 'notifications permission'] },
  { id: 's-backup', section: 'Settings', title: 'Back up to a file', sub: 'Files, Google Drive or AirDrop', path: '/settings', params: { backup: '1' }, keywords: ['backup', 'export', 'save a copy', 'password backup'] },
  { id: 's-restore', section: 'Settings', title: 'Restore from backup', sub: 'From a backup file', path: '/settings', params: { open: 'restore' }, keywords: ['restore', 'import backup', 'new phone'] },
  { id: 's-icloud', section: 'Settings', title: 'iCloud backup', sub: 'Automatic backup and restore from iCloud', path: '/restore-icloud', keywords: ['icloud', 'automatic backup', 'cloud'] },
  { id: 's-invite', section: 'Settings', title: 'Invite family', sub: 'Send the app link, no documents', path: '/settings', keywords: ['invite', 'install', 'app link', 'download', 'spouse'] },
  { id: 's-import', section: 'Settings', title: 'Import shared documents', sub: 'Open a package your family sent', path: '/share-import', keywords: ['import', 'shared package', 'receive', 'code'] },
  { id: 's-share', section: 'Settings', title: 'Share with family', sub: 'Send documents to your spouse’s phone, encrypted', path: '/share', keywords: ['share', 'share with spouse', 'airdrop', 'send documents'] },
  { id: 's-widgets', section: 'Settings', title: 'Widgets and Wallet card', sub: 'Home Screen widgets and the Apple Wallet status card', path: '/settings', keywords: ['widget', 'wallet', 'apple wallet', 'pass'] },
  { id: 's-wipe', section: 'Settings', title: 'Delete all data', sub: 'Removes everything from this phone', path: '/settings', params: { open: 'wipe' }, keywords: ['delete', 'erase', 'wipe', 'remove everything', 'reset'] },
  { id: 's-diag', section: 'Settings', title: 'Diagnostics', sub: 'Send this if something goes wrong', path: '/settings', params: { open: 'diag' }, keywords: ['bug', 'problem', 'log', 'support'] },
  { id: 's-tips', section: 'Settings', title: 'Tips on every screen', sub: 'Show or replay the tips', path: '/settings', keywords: ['tips', 'tutorial', 'hints', 'question mark'] },
  // community
  { id: 'c-feed', section: 'Community', title: 'Community', sub: 'Ask people on the same visa', path: '/(tabs)/forum', keywords: ['forum', 'feed', 'questions', 'posts'] },
  { id: 'c-compose', section: 'Community', title: 'Write a post', sub: 'Ask a question or share a timeline', path: '/community/compose', keywords: ['new post', 'ask a question', 'compose', 'poll'] },
  { id: 'c-account', section: 'Community', title: 'Community profile', sub: 'Your name, sign in and answer alerts', path: '/community/account', keywords: ['profile', 'sign in', 'account', 'username'] },
  { id: 'c-saved', section: 'Community', title: 'Saved posts', sub: 'Posts you saved', path: '/community/saved', keywords: ['bookmarks', 'saved'] },
  { id: 'c-notes', section: 'Community', title: 'Community notifications', sub: 'Replies and answers', path: '/community/notifications', keywords: ['replies', 'answers', 'mentions'] },
  { id: 'c-rules', section: 'Community', title: 'Community rules', sub: 'How to post and what is not allowed', path: '/community/rules', keywords: ['guidelines', 'rules', 'moderation'] },
  { id: 'c-pushed', section: 'Community', title: 'All community posts', sub: 'The full feed', path: '/community', keywords: ['all posts', 'browse'] },
];

/** Routes that are never a search destination, and why (checked by tests/search.test.ts). */
export const NOT_SEARCHABLE: Record<string, string> = {
  '/_layout': 'layout', '/(tabs)/_layout': 'layout', '/(tabs)/_layout.web': 'layout', '/+not-found': 'error page', '/+native-intent': 'link handler',
  '/index': 'start redirect', '/demo': 'replaces all data with the example family', '/welcome': 'first run only', '/about-you': 'first run only',
  '/flow/step': 'inside a running document flow', '/flow/review': 'inside a running document flow', '/flow/summary': 'inside a running document flow',
  '/open/case/[key]': 'deep link from a notification', '/restore': 'opened from a backup file',
  '/search': 'this screen',
  '/community/post/[id]': 'server posts are not stored for search', '/community/user/[id]': 'server profiles are not stored for search',
};
