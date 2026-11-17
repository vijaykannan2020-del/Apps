// Government fees from the USCIS fee schedule (Form G-1055), premium processing
// (effective Mar 1, 2026) and statutory employer fees. The server can push updates.
export const FEES_AS_OF = 'Nov 2026';

export type EmployerSize = 'large' | 'small' | 'nonprofit';
export type Line = { label: string; amount: number; optional?: boolean; note?: string };

export type FeeCase = {
  id: string;
  label: string;
  group: 'Employer' | 'Student' | 'Family' | 'Green card';
  employer: boolean; // depends on employer size / covered status
  build: (o: { size: EmployerSize; acwiaSmall: boolean; covered: boolean; online: boolean; premium: boolean }) => Line[];
  alert?: string;
};

const asylum = (s: EmployerSize) => (s === 'nonprofit' ? 0 : s === 'small' ? 300 : 600);
const i129 = (base: number, small: number, s: EmployerSize) => (s === 'large' ? base : small);

export const FEE_CASES: FeeCase[] = [
  {
    id: 'h1b-new',
    label: 'H-1B new (cap)',
    group: 'Employer',
    employer: true,
    build: ({ size, acwiaSmall, covered, premium }) => [
      { label: 'Registration', amount: 215 },
      { label: 'I-129 filing fee', amount: i129(780, 460, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      { label: 'ACWIA training fee', amount: size === 'nonprofit' ? 0 : acwiaSmall ? 750 : 1500, note: 'Some employers are exempt' },
      { label: 'Fraud prevention fee', amount: 500 },
      ...(covered ? [{ label: 'PL 114-113 fee', amount: 4000 }] : []),
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
    alert: '$100K payment for workers outside the US is currently blocked by a court order — not added.',
  },
  {
    id: 'h1b-ext',
    label: 'H-1B extension',
    group: 'Employer',
    employer: true,
    build: ({ size, acwiaSmall, covered, premium }) => [
      { label: 'I-129 filing fee', amount: i129(780, 460, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      { label: 'ACWIA training fee', amount: size === 'nonprofit' ? 0 : acwiaSmall ? 750 : 1500, note: 'First extension only' },
      ...(covered ? [{ label: 'PL 114-113 fee', amount: 4000, note: 'On extensions since Sept 9, 2026' }] : []),
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'h1b-transfer',
    label: 'H-1B transfer',
    group: 'Employer',
    employer: true,
    build: ({ size, acwiaSmall, covered, premium }) => [
      { label: 'I-129 filing fee', amount: i129(780, 460, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      { label: 'ACWIA training fee', amount: size === 'nonprofit' ? 0 : acwiaSmall ? 750 : 1500 },
      { label: 'Fraud prevention fee', amount: 500 },
      ...(covered ? [{ label: 'PL 114-113 fee', amount: 4000 }] : []),
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'l1-new',
    label: 'L-1 new',
    group: 'Employer',
    employer: true,
    build: ({ size, covered, premium }) => [
      { label: 'I-129 filing fee', amount: i129(1385, 695, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      { label: 'Fraud prevention fee', amount: 500 },
      ...(covered ? [{ label: 'PL 114-113 fee', amount: 4500 }] : []),
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'l1-ext',
    label: 'L-1 extension',
    group: 'Employer',
    employer: true,
    build: ({ size, covered, premium }) => [
      { label: 'I-129 filing fee', amount: i129(1385, 695, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      ...(covered ? [{ label: 'PL 114-113 fee', amount: 4500, note: 'On extensions since Sept 9, 2026' }] : []),
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'tn',
    label: 'TN (in US)',
    group: 'Employer',
    employer: true,
    build: ({ size, premium }) => [
      { label: 'I-129 filing fee', amount: i129(1015, 510, size) },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'opt',
    label: 'OPT / STEM OPT',
    group: 'Student',
    employer: false,
    build: ({ online, premium }) => [
      { label: 'I-765 filing fee', amount: online ? 470 : 520 },
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 1780, optional: true }] : []),
    ],
  },
  {
    id: 'h4',
    label: 'H-4 / L-2 extension',
    group: 'Family',
    employer: false,
    build: ({ online }) => [{ label: 'I-539 filing fee', amount: online ? 420 : 470 }],
  },
  {
    id: 'h4ead',
    label: 'H-4 EAD',
    group: 'Family',
    employer: false,
    build: ({ online }) => [{ label: 'I-765 filing fee', amount: online ? 470 : 520 }],
  },
  {
    id: 'i140',
    label: 'I-140',
    group: 'Green card',
    employer: true,
    build: ({ size, premium }) => [
      { label: 'I-140 filing fee', amount: 715 },
      { label: 'Asylum Program Fee', amount: asylum(size) },
      ...(premium ? [{ label: 'Premium processing (I-907)', amount: 2965, optional: true }] : []),
    ],
  },
  {
    id: 'i485',
    label: 'I-485 package',
    group: 'Green card',
    employer: false,
    build: ({ online }) => [
      { label: 'I-485 adjustment', amount: 1440 },
      { label: 'I-765 work permit (with I-485)', amount: 260 },
      { label: 'I-131 travel document', amount: online ? 580 : 630, optional: true },
    ],
  },
  {
    id: 'n400',
    label: 'Citizenship',
    group: 'Green card',
    employer: false,
    build: ({ online }) => [{ label: 'N-400 filing fee', amount: online ? 710 : 760, note: 'Reduced fee $380 on paper if eligible' }],
  },
];
