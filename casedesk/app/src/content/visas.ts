// Plain-language summaries of USCIS/DOL rules. Each guide links to the official source page.
export const GUIDES_REVIEWED = 'Nov 17, 2026';

export type I9Doc = { list: 'A' | 'B + C'; docs: string; reverify: string };

export type Visa = {
  id: string;
  code: string;
  name: string;
  tagline: string;
  icon: 'briefcase' | 'swap-horizontal' | 'layers' | 'flag' | 'school' | 'flask' | 'people' | 'heart' | 'card' | 'ribbon';
  facts: { label: string; value: string }[];
  steps: string[];
  keyPoints: string[];
  alert?: string;
  i9?: I9Doc[];
  source: string;
};

export const VISAS: Visa[] = [
  {
    id: 'h1b',
    code: 'H-1B',
    name: 'Specialty occupation',
    tagline: 'Bachelor’s-level professional jobs, sponsored by a US employer.',
    icon: 'briefcase',
    facts: [
      { label: 'Stay', value: '6 yrs (3 + 3)' },
      { label: 'Annual cap', value: '65,000 + 20,000 US master’s' },
      { label: 'Key forms', value: 'LCA · I-129' },
      { label: 'Family', value: 'H-4 (EAD in some cases)' },
    ],
    steps: [
      'Employer registers you in March (cap cases only).',
      'Selected? Employer files an LCA with DOL.',
      'Employer files Form I-129 with USCIS (Apr 1 – Jun 30 for cap).',
      'Approval → visa stamp abroad or change of status in the US.',
      'Start work (cap cases on Oct 1).',
    ],
    keyPoints: [
      'Lottery is now weighted by wage level — higher offered wage, more chances (since FY 2027).',
      'Stay past 6 years is possible with an approved I-140 or a PERM/I-140 pending 365+ days.',
      'You can start with a new H-1B employer once they file (portability).',
      'Covered employers (50+ US staff, >50% H/L) pay an extra $4,000 — now on extensions too.',
    ],
    alert: '$100K payment for new workers abroad: renewed to Sept 2027 but blocked by a court order. Not for in-US extensions or transfers.',
    i9: [
      { list: 'A', docs: 'Foreign passport + Form I-94 showing H-1B', reverify: 'When the I-94 expires' },
      { list: 'A', docs: 'Extension filed on time (same employer)', reverify: 'Can keep working up to 240 days past I-94 expiry' },
      { list: 'A', docs: 'Changing employers (portability): passport + prior I-94, note “AC-21”', reverify: 'When the new approval’s I-94 ends' },
    ],
    source: 'https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations',
  },
  {
    id: 'l1',
    code: 'L-1A / L-1B',
    name: 'Intracompany transfer (individual)',
    tagline: 'Managers, executives and specialized-knowledge staff moving within the same company.',
    icon: 'swap-horizontal',
    facts: [
      { label: 'Stay', value: 'L-1A 7 yrs · L-1B 5 yrs' },
      { label: 'Work abroad', value: '1 yr in last 3 yrs' },
      { label: 'Key form', value: 'I-129 (L supplement)' },
      { label: 'Family', value: 'L-2 (spouse can work)' },
    ],
    steps: [
      'Confirm 1 continuous year with the foreign affiliate in the last 3 years.',
      'US employer files Form I-129 with USCIS.',
      'Approval → L-1 visa stamp at the consulate.',
      'Enter the US and start work.',
    ],
    keyPoints: [
      'Initial approval up to 3 years (1 year for a new US office).',
      'No annual cap and no lottery.',
      'L-1A can lead to an EB-1C green card (no PERM needed).',
      'Covered employers pay an extra $4,500 — now on extensions too.',
    ],
    i9: [
      { list: 'A', docs: 'Foreign passport + Form I-94 showing L-1', reverify: 'When the I-94 expires' },
      { list: 'A', docs: 'Extension filed on time (same employer)', reverify: 'Up to 240 days past I-94 expiry' },
    ],
    source: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager',
  },
  {
    id: 'lblanket',
    code: 'L Blanket',
    name: 'Blanket L petition',
    tagline: 'Large companies pre-qualify once, then employees apply directly at the consulate.',
    icon: 'layers',
    facts: [
      { label: 'Work abroad', value: '6 months in last 3 yrs' },
      { label: 'Employee form', value: 'I-129S at consulate' },
      { label: 'Validity', value: 'Up to 3 yrs per entry' },
      { label: 'Family', value: 'L-2' },
    ],
    steps: [
      'Company gets a blanket L approval from USCIS (once).',
      'Employer prepares Form I-129S for the employee.',
      'Employee interviews at the US consulate with I-129S + blanket approval.',
      'Consulate approves → enter on L-1.',
    ],
    keyPoints: [
      'Company must have 3+ related offices and a US office running 1+ year.',
      'Plus one of: 10+ L approvals in 12 months, $25M US sales, or 1,000+ US staff.',
      'L-1B under blanket is only for specialized-knowledge professionals.',
      'Extensions inside the US are filed on Form I-129 like an individual L.',
    ],
    i9: [{ list: 'A', docs: 'Foreign passport + Form I-94 showing L-1', reverify: 'When the I-94 expires' }],
    source: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager',
  },
  {
    id: 'tn',
    code: 'TN',
    name: 'USMCA professional',
    tagline: 'Canadian and Mexican citizens in listed professions.',
    icon: 'flag',
    facts: [
      { label: 'Stay', value: 'Up to 3 yrs, renewable' },
      { label: 'Who', value: 'Canada · Mexico citizens' },
      { label: 'Key form', value: 'I-129 (in US)' },
      { label: 'Family', value: 'TD (no work)' },
    ],
    steps: [
      'Get a job offer in a USMCA-listed profession.',
      'Canadians: apply at the border or pre-clearance. Mexicans: visa at a consulate.',
      'Extensions or changes inside the US: employer files Form I-129.',
    ],
    keyPoints: ['No cap and no lottery.', 'No limit on renewals, but you must keep nonimmigrant intent.', 'Profession must match the USMCA list exactly.'],
    i9: [
      { list: 'A', docs: 'Foreign passport + Form I-94 showing TN', reverify: 'When the I-94 expires' },
      { list: 'A', docs: 'Extension filed on time (same employer)', reverify: 'Up to 240 days past I-94 expiry' },
    ],
    source: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/tn-usmca-professionals',
  },
  {
    id: 'opt',
    code: 'F-1 OPT',
    name: 'Optional Practical Training',
    tagline: '12 months of work after your US degree, in your field of study.',
    icon: 'school',
    facts: [
      { label: 'Length', value: '12 months' },
      { label: 'Apply', value: '90 days before to 60 after' },
      { label: 'Key form', value: 'I-765 (c)(3)(B)' },
      { label: 'Unemployment', value: '90 days max' },
    ],
    steps: [
      'School DSO recommends OPT in SEVIS (new I-20).',
      'File Form I-765 online.',
      'Get the EAD card, then start work.',
      'Report employer details to your DSO / SEVP portal.',
    ],
    keyPoints: [
      'Job must relate directly to your major.',
      'Cap-gap: if an H-1B cap petition is filed for you, status and work can continue up to April 1.',
    ],
    i9: [
      { list: 'A', docs: 'EAD card (Form I-766)', reverify: 'When the EAD expires' },
      { list: 'A', docs: 'Cap-gap: expired EAD + Form I-20 with cap-gap endorsement', reverify: 'When H-1B starts or cap-gap ends' },
    ],
    source: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students',
  },
  {
    id: 'stem',
    code: 'STEM OPT',
    name: '24-month STEM extension',
    tagline: 'Two more years of OPT for STEM degree holders at an E-Verify employer.',
    icon: 'flask',
    facts: [
      { label: 'Length', value: '24 months' },
      { label: 'Employer', value: 'Must use E-Verify' },
      { label: 'Key forms', value: 'I-765 (c)(3)(C) · I-983' },
      { label: 'Unemployment', value: '150 days total' },
    ],
    steps: [
      'Employer and student complete the I-983 training plan.',
      'DSO recommends STEM OPT in SEVIS.',
      'File I-765 within 90 days before the OPT EAD expires.',
      'Report to DSO every 6 months; yearly self-evaluation.',
    ],
    keyPoints: [
      'Timely filing still gives a 180-day automatic extension (not affected by the 2025 EAD rule).',
      'Degree must be on the DHS STEM Designated Degree list.',
    ],
    i9: [
      { list: 'A', docs: 'EAD card (Form I-766)', reverify: 'When the EAD expires' },
      { list: 'A', docs: 'Timely filed: expired OPT EAD + I-20 endorsed for STEM OPT', reverify: 'Within 180 days or when the new EAD arrives' },
    ],
    source: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt',
  },
  {
    id: 'h4ead',
    code: 'H-4 EAD',
    name: 'Work permit for H-4 spouses',
    tagline: 'H-4 spouses can work once the H-1B holder is on the green card path.',
    icon: 'people',
    facts: [
      { label: 'Eligible if', value: 'H-1B has approved I-140' },
      { label: 'Or', value: 'H-1B extended past 6 yrs (AC21)' },
      { label: 'Key form', value: 'I-765 (c)(26)' },
      { label: 'Auto-extension', value: 'None (since Oct 30, 2025)' },
    ],
    steps: [
      'Confirm the H-1B spouse qualifies (approved I-140 or AC21 extension).',
      'File I-765 — best together with the H-4 extension (I-539).',
      'Get the EAD card before starting work.',
    ],
    keyPoints: [
      'Renewals filed on or after Oct 30, 2025 get no automatic extension — work stops on the card’s end date.',
      'File the renewal as early as allowed and bundle it with the H-1B extension.',
    ],
    alert: 'Gap risk: without the new card in hand, the H-4 spouse must stop work on the EAD expiry date.',
    i9: [{ list: 'A', docs: 'EAD card (Form I-766), category C26', reverify: 'On the EAD expiry date — no receipt bridge' }],
    source: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/employment-authorization-for-certain-h-4-dependent-spouses',
  },
  {
    id: 'l2s',
    code: 'L-2S',
    name: 'L-2 spouse, work by status',
    tagline: 'L-2 spouses can work without a separate EAD.',
    icon: 'heart',
    facts: [
      { label: 'Proof', value: 'I-94 marked “L-2S”' },
      { label: 'EAD needed?', value: 'No' },
      { label: 'Since', value: 'Jan 2022' },
      { label: 'Children', value: 'L-2 children cannot work' },
    ],
    steps: ['Enter or change status to L-2 as a spouse.', 'Check the I-94 shows “L-2S”.', 'Use the I-94 + an ID for the I-9.'],
    keyPoints: ['Applies to spouses only.', 'If the I-94 says just “L-2”, ask CBP or USCIS for a corrected I-94.'],
    i9: [{ list: 'B + C', docs: 'ID (e.g. driver’s licence) + unexpired I-94 with L-2S', reverify: 'When the I-94 expires' }],
    source: 'https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager',
  },
  {
    id: 'gc',
    code: 'Green card',
    name: 'Employment-based (EB-2 / EB-3)',
    tagline: 'Permanent residence through your employer.',
    icon: 'card',
    facts: [
      { label: 'Step 1', value: 'PERM (DOL)' },
      { label: 'Step 2', value: 'I-140 (USCIS)' },
      { label: 'Step 3', value: 'I-485 when date is current' },
      { label: 'Check', value: 'Monthly Visa Bulletin' },
    ],
    steps: [
      'Prevailing wage request with DOL.',
      'Recruitment, then PERM labor certification.',
      'Employer files Form I-140.',
      'When your priority date is current, file I-485 (+ optional I-765, I-131).',
      'Biometrics, possible interview, then the card.',
    ],
    keyPoints: [
      'Your priority date is the PERM filing date.',
      'EAD renewals filed after Oct 30, 2025 get no automatic extension — keep H-1B/L-1 status if you can.',
      'AC21: change jobs in a similar role once the I-485 is pending 180+ days.',
    ],
    i9: [
      { list: 'A', docs: 'Green card (Form I-551)', reverify: 'Never for a 10-year card' },
      { list: 'A', docs: 'Pending I-485: EAD card (C9)', reverify: 'When the EAD expires' },
    ],
    source: 'https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-employment-based-immigrants',
  },
  {
    id: 'n400',
    code: 'Citizenship',
    name: 'Naturalization (N-400)',
    tagline: 'Become a US citizen after holding a green card.',
    icon: 'ribbon',
    facts: [
      { label: 'Wait', value: '5 yrs (3 if married to a citizen)' },
      { label: 'Apply early', value: '90 days before' },
      { label: 'Fee', value: '$710 online · $760 paper' },
      { label: 'Test', value: 'English + civics' },
    ],
    steps: ['Check eligibility and physical presence.', 'File Form N-400 (online is cheaper).', 'Biometrics.', 'Interview with English and civics test.', 'Oath ceremony.'],
    keyPoints: [
      'Physically present at least half the time (30 months of 5 years).',
      'Trips over 6 months can break continuous residence.',
      'Reduced fee ($380) for some lower-income applicants filing on paper.',
    ],
    source: 'https://www.uscis.gov/citizenship/learn-about-citizenship/citizenship-and-naturalization',
  },
];

export const visaById = (id: string) => VISAS.find((v) => v.id === id);
