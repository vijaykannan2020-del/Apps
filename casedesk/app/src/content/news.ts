// Built-in news feed (from the first CaseDesk app). The live feed comes from the CaseDesk server (/api/news),
// which pulls the Federal Register API (USCIS, DHS, DOL-ETA) and USCIS/DOL newsroom feeds.
export type Tag = 'H-1B' | 'L-1' | 'TN' | 'OPT' | 'STEM OPT' | 'H-4' | 'L-2' | 'I-9' | 'Fees' | 'Wages' | 'Green card' | 'Citizenship';

export type NewsItem = {
  id: string;
  date: string; // ISO
  agency: string; // USCIS, DHS, DOL… or the publisher name for news
  kind?: 'official' | 'news'; // default official
  title: string;
  summary: string; // one-line executive summary
  points: string[]; // what it means, 2-4 bullets
  impact: 'high' | 'medium' | 'info';
  tags: Tag[];
  url: string;
  sources?: { name: string; url: string }[]; // same story from several outlets, merged into one card
};

export const STARTER_NEWS: NewsItem[] = [
  {
    id: 'pl114-extensions',
    date: '2026-09-09',
    agency: 'DHS',
    title: '$4,000 / $4,500 fee now applies to H-1B and L-1 extensions',
    summary: 'Covered employers now pay the 9-11 Biometric (PL 114-113) fee on same-employer extensions too.',
    points: [
      'Applies to employers with 50+ US employees where more than half hold H-1B or L-1 status.',
      '$4,000 per H-1B petition, $4,500 per L-1 petition. Effective for filings from Sept 9, 2026.',
      'Fee authority currently runs through Sept 30, 2027.',
    ],
    impact: 'high',
    tags: ['H-1B', 'L-1', 'Fees'],
    url: 'https://public-inspection.federalregister.gov/2026-16231.pdf',
  },
  {
    id: 'proclamation-100k',
    date: '2026-09-18',
    agency: 'White House',
    title: '$100,000 H-1B payment rule extended to Sept 2027',
    summary: 'The proclamation was renewed for 12 months, but a court order still blocks DHS from collecting it.',
    points: [
      'Targets new H-1B workers outside the US who need a visa to enter.',
      'Extensions, amendments, change of employer and change of status inside the US are generally not covered.',
      'A federal court vacated the DHS policy; the appeals court refused to pause that ruling (July 24, 2026).',
      'A separate DHS proposal would set a $103,265 fee on cap petitions — still only a proposal.',
    ],
    impact: 'high',
    tags: ['H-1B', 'Fees'],
    url: 'https://www.whitehouse.gov/presidential-actions/2026/09/restriction-on-entry-of-certain-nonimmigrant-workers-faad/',
  },
  {
    id: 'hr1-fy27',
    date: '2026-10-01',
    agency: 'USCIS',
    title: 'FY 2027 inflation adjustment to H.R. 1 immigration fees',
    summary: 'USCIS raised the statutory H.R. 1 fees for inflation, rounded down to the nearest $10.',
    points: [
      'Covers the fees created by H.R. 1 (asylum, parole, TPS and some EAD fees).',
      'Base filing fees on Form G-1055 for I-129, I-140, I-485 and N-400 are unchanged by this notice.',
    ],
    impact: 'medium',
    tags: ['Fees'],
    url: 'https://public-inspection.federalregister.gov/2026-20187.pdf',
  },
  {
    id: 'wage-year-26',
    date: '2026-07-01',
    agency: 'DOL',
    title: 'New prevailing wage year is live (July 2026 – June 2027)',
    summary: 'OFLC loaded new OEWS wages, based on BLS May 2025 data, for all LCAs and PWDs filed from July 1.',
    points: [
      'Any LCA or prevailing wage request filed on or after July 1, 2026 uses the new numbers.',
      'Most roles went up a little; about one in four sampled figures actually went down.',
      'Check your offered wage against the new Level I–IV before filing.',
    ],
    impact: 'medium',
    tags: ['Wages', 'H-1B', 'Green card'],
    url: 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/FINAL-OEWS-Technical-Release-Notes-for-July-2026-Wage-Year.pdf',
  },
  {
    id: 'dol-nprm',
    date: '2026-03-27',
    agency: 'DOL',
    title: 'DOL proposes higher prevailing wage levels',
    summary: 'A proposed rule would lift all four wage levels for H-1B, H-1B1, E-3 and PERM. Not final yet.',
    points: [
      'Would shift the OEWS percentiles used for Level I–IV.',
      'Applies only after a final rule is published — current levels still apply today.',
    ],
    impact: 'medium',
    tags: ['Wages', 'H-1B', 'Green card'],
    url: 'https://www.federalregister.gov/documents/2026/03/27/2026-06017/improving-wage-protections-for-the-temporary-and-permanent-employment-of-certain-foreign-nationals',
  },
  {
    id: 'fy27-cap',
    date: '2026-07-17',
    agency: 'USCIS',
    title: 'FY 2027 H-1B cap reached — no second lottery',
    summary: 'First season under the wage-weighted selection: 211,600 registrations, down about 38% from FY 2026.',
    points: [
      'Weighted selection (higher wage level = more chances) took effect Feb 27, 2026.',
      'Unselected registrations will show “Not Selected” and cannot carry over to FY 2028.',
      'Cap-exempt H-1B petitions continue as normal.',
    ],
    impact: 'info',
    tags: ['H-1B'],
    url: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations/h-1b-cap-season',
  },
  {
    id: 'premium-mar26',
    date: '2026-03-01',
    agency: 'USCIS',
    title: 'Premium processing fees went up',
    summary: 'I-129 and I-140 premium is now $2,965; I-539 is $2,075 and I-765 is $1,780.',
    points: ['Inflation adjustment under the USCIS Stabilization Act.', 'Filings with the old fee amount are rejected.'],
    impact: 'info',
    tags: ['Fees', 'H-1B', 'L-1', 'STEM OPT'],
    url: 'https://www.federalregister.gov/public-inspection/2026-00321/adjustment-to-premium-processing-fees',
  },
  {
    id: 'ead-auto-ext',
    date: '2025-10-30',
    agency: 'DHS',
    title: 'No automatic extension for most EAD renewals',
    summary: 'EAD renewals filed on or after Oct 30, 2025 no longer get the up-to-540-day automatic extension.',
    points: [
      'Hits H-4 EAD (C26), pending green card (C9) and many other categories.',
      'STEM OPT keeps its 180-day extension on timely filing.',
      'For I-9: a receipt for a renewal filed after Oct 30, 2025 is not proof of work authorization.',
    ],
    impact: 'high',
    tags: ['I-9', 'H-4', 'Green card'],
    url: 'https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=Removal+of+the+Automatic+Extension+of+Employment+Authorization+Documents',
  },
];

// Unofficial: news and analysis from the web about these visa types (not government sources).
export const STARTER_WEB_NEWS: NewsItem[] = [
  {
    id: 'w-vb-nov26', kind: 'news', date: '2026-11-08', agency: 'Newsweek',
    title: 'November Visa Bulletin moves EB-2 and EB-3, India and China still backlogged',
    summary: 'EB-2 for most countries advanced three months; India EB-2 held at Nov 1, 2013.',
    points: ['USCIS is accepting I-485s by the Dates for Filing chart this month.', 'December’s bulletin is due mid-November.'],
    impact: 'medium', tags: ['Green card'],
    url: 'https://www.newsweek.com/green-card-update-visa-bulletin-november-2026-progress-applicants-12609565',
  },
  {
    id: 'w-eo-layoffs', kind: 'news', date: '2026-09-21', agency: 'Cato Institute / Forbes',
    title: 'New H-1B executive order adds layoff scrutiny alongside the $100K renewal',
    summary: 'Analysis: agencies are told to weigh an employer’s recent layoffs when reviewing H-1B petitions.',
    points: ['Separate from the $103,265 fee proposal, which is not final.', 'Employers with recent layoffs should expect closer review.'],
    impact: 'medium', tags: ['H-1B'],
    url: 'https://www.cato.org/commentary/trump-enacts-new-immigration-policies-against-h-1b-visa-holders',
  },
  {
    id: 'w-fee-plan', kind: 'news', date: '2026-08-24', agency: 'Bloomberg Government',
    title: 'New six-figure H-1B fee plan emerges while the $100K fee stays blocked',
    summary: 'DHS is reportedly also weighing a large fee on the OPT program used by students.',
    points: ['Nothing changes for OPT until a rule is proposed and finalized.'],
    impact: 'info', tags: ['H-1B', 'OPT', 'Fees'],
    url: 'https://news.bgov.com/immigration/trump-squeezes-h-1b-visa-program-as-100-000-fee-stays-on-ice',
  },
  {
    id: 'w-fy25-approvals', kind: 'news', date: '2025-12-02', agency: 'Business Standard',
    title: 'Amazon, Meta, Microsoft lead FY2025 H-1B approvals; Indian IT drops',
    summary: 'Analysis of USCIS Data Hub figures: US tech firms took the top four spots for new H-1B approvals.',
    points: ['Amazon had 4,644 approvals for initial employment.', 'TCS was the only India-based firm in the top five.'],
    impact: 'info', tags: ['H-1B'],
    url: 'https://www.business-standard.com/immigration/h-1b-visa-approvals-amazon-meta-microsoft-lead-indian-it-faces-70-fall-125120200461_1.html',
  },
];
