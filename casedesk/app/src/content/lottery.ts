// H-1B cap season facts. Reviewed Nov 17, 2026 — update when USCIS announces the FY 2028 registration.
export const LOTTERY_AS_OF = 'Nov 17, 2026';

// null until USCIS announces it (it must announce at least 30 days before registration opens).
export const NEXT_SEASON: { fy: string; opens: string | null; closes: string | null; expected: string } = {
  fy: 'FY 2028', opens: null, closes: null, expected: 'March 2027 (not announced yet)',
};

export const WEIGHTS = [
  { level: 'Level IV', entries: 4, odds: '≈ 61%' },
  { level: 'Level III', entries: 3, odds: '≈ 46%' },
  { level: 'Level II', entries: 2, odds: '≈ 31%' },
  { level: 'Level I', entries: 1, odds: '≈ 15%' },
];
export const WEIGHT_NOTE = 'Odds are DHS projections from past registration patterns, published with the weighted-selection rule. Actual odds depend on how many register at each level.';

export const STEPS: [string, string][] = [
  ['Employer registers you', 'Online, in March. $215 per person. The registration now includes the offered wage level from the prevailing wage tables.'],
  ['Weighted selection', 'Each person is entered 1–4 times by wage level (Level IV = 4 entries … Level I = 1). Registrations from several employers for the same person count once.'],
  ['Regular cap, then master’s', 'USCIS first picks for the 65,000 regular cap from everyone, then picks for the 20,000 U.S. master’s cap from the remaining eligible people.'],
  ['File the petition', 'Selected employers file Form I-129 from April 1, usually within a 90-day window (to June 30).'],
  ['Start date', 'Cap H-1B employment can start October 1.'],
];

export const LAST_SEASON: [string, string][] = [
  ['FY 2027 registration', 'March 4–19, 2026 · $215 per registration'],
  ['Selection', 'Completed March 31, 2026 — first season with weighted (wage-level) selection'],
  ['Eligible registrations', '211,600 (down from 343,981 for FY 2026)'],
  ['Cap reached', 'July 17, 2026 — no second selection'],
];

export const CAP_GAP = [
  'F-1 OPT students with a timely-filed cap petition requesting change of status keep status and work authorization (cap-gap) while it is pending.',
  'Cap-gap now runs until April 1 of the next fiscal year (not just Sept 30) if the petition is still pending or approved for Oct 1.',
  'If the petition is denied, rejected or withdrawn, cap-gap ends — talk to your DSO the same day.',
];

export const FEE_STATUS: [string, string][] = [
  ['$100,000 payment (Proclamation)', 'Applies on paper to new H-1B petitions for workers outside the US, but blocked by federal courts — USCIS is not collecting it. Appeals pending; the proclamation was extended to Sept 21, 2027.'],
  ['$103,265 cap-subject fee (proposed)', 'DHS proposed it on Aug 25, 2026 for cap-subject petitions. Comments closed Sept 24, 2026. Not in effect.'],
];
