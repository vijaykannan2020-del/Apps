// Green-card search entries for the Home search (v2.9). Local only — nothing is sent anywhere.
// Routes that need a person use the main person's id: the search screen replaces ':pid'.
export type SearchEntry = { id: string; title: string; subtitle?: string; synonyms: string[]; route: string; section: 'Green card' };

const GC = ['gc', 'green card', 'greencard', 'permanent residence', 'i-485', 'i485', 'i-140', 'i140', 'perm', 'adjustment of status', 'aos'];

export const GC_SEARCH: SearchEntry[] = [
  { id: 'gc-track', title: 'Green card tracking', subtitle: 'Stage, priority date and what happens next', synonyms: [...GC, 'gc tracking', 'gc status', 'stage'], route: '/gc/:pid', section: 'Green card' },
  { id: 'gc-plan', title: 'Green card planner', subtitle: 'Expected wait and when to gather documents', synonyms: ['gc planner', 'green card planner', 'wait', 'expected wait', 'how long', 'priority date', 'visa bulletin', 'eta', ...GC], route: '/gc/plan/:pid', section: 'Green card' },
  { id: 'gc-interview', title: 'Green card interview prep', subtitle: 'What to bring and common questions', synonyms: ['interview', 'gc interview', 'i-485 interview', 'interview checklist', 'interview questions', 'field office'], route: '/gc/interview/:pid', section: 'Green card' },
  { id: 'gc-status', title: 'H-1B / L-1 or EAD while the I-485 is pending', subtitle: 'Keep status or work on the EAD (C9)', synonyms: ['ead', 'work permit', 'c9', 'c09', 'i-765', 'combo card', 'h-1b or ead', 'keep h1b', 'switch to ead', 'dual intent'], route: '/gc/:pid', section: 'Green card' },
  { id: 'gc-ap', title: 'Advance parole', subtitle: 'Travel with the I-485 pending', synonyms: ['ap', 'advance parole', 'i-131', 'i131', 'i-512', 'travel document', 'combo card', 'travel'], route: '/gc/:pid', section: 'Green card' },
  { id: 'gc-pd', title: 'Priority date', subtitle: 'Is the date current this month?', synonyms: ['priority date', 'pd', 'current', 'visa bulletin', 'final action date', 'dates for filing', 'retrogression', 'eb-2', 'eb-3', 'eb-1'], route: '/tools/pd', section: 'Green card' },
  { id: 'gc-vb', title: 'Visa Bulletin', subtitle: 'This month’s dates by category and country', synonyms: ['visa bulletin', 'bulletin', 'vb', 'cut-off', 'cutoff', 'final action date', 'dates for filing'], route: '/tools/vb', section: 'Green card' },
  { id: 'gc-medical', title: 'Medical exam (I-693)', subtitle: 'Filed with the I-485', synonyms: ['medical', 'i-693', 'i693', 'civil surgeon', 'vaccination'], route: '/gc/plan/:pid', section: 'Green card' },
];
