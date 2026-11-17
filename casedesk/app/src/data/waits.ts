// Built-in snapshot of State Department visa appointment wait times for the five posts in India
// (as published Sept 17, 2026). The app shows the server's live copy of all posts when it can.
export type WaitRow = { post: string; visitor?: string; visitorAvg?: string; student?: string; petition?: string; crew?: string };
export type Waits = { updated: string | null; source: string; posts: WaitRow[]; builtIn?: boolean };

export const WAITS_URL = 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/global-visa-wait-times.html';

export const WAITS_BUILT_IN: Waits = {
  updated: '17-SEP-2026',
  source: WAITS_URL,
  builtIn: true,
  posts: [
    { post: 'Chennai (Madras)', visitor: '7.5 months', petition: '1.5 months' },
    { post: 'Hyderabad', visitor: '12 months', petition: '5.5 months' },
    { post: 'Kolkata', visitor: '6.5 months', petition: '1 month' },
    { post: 'Mumbai (Bombay)', visitor: '11.5 months', petition: '1.5 months' },
    { post: 'New Delhi', visitor: '10 months', petition: '3 months' },
  ],
};

export const INTERVIEW_RULES: [string, string][] = [
  ['Interview waiver (“dropbox”)', 'Since Sept 2, 2025 most applicants — including H-1B, L-1, O-1, F-1 and first-time applicants — need an in-person interview. Waivers remain mainly for diplomatic/official visas and some B-1/B-2 (and H-2A) renewals within 12 months of the old visa’s expiry.'],
  ['Where to apply', 'The State Department expects you to apply in your country of nationality or residence. Third-country appointments may be harder to get.'],
  ['Wait time ≠ guarantee', 'Times are estimates for the next available appointment; check the official tool for your post before planning travel.'],
  ['Emergency appointment', 'Each post explains how to request an expedited appointment after you book the first available one.'],
];
