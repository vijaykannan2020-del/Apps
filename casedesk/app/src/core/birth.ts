// Country of birth (v2.9 gc2). The Visa Bulletin charges a green card to the country of birth
// ("chargeability"), not the passport. Typed on the person (setup / Edit details); otherwise read
// from a document that prints it (passport place of birth, EAD or green card country of birth);
// otherwise guessed from the passport nationality. Pure — tested in tests/gc2.test.ts.
import type { BulletinCountry } from './bulletin';

export const BIRTH_COUNTRIES: { code: string; label: string }[] = [
  { code: 'IND', label: 'India' }, { code: 'CHN', label: 'China (mainland)' }, { code: 'MEX', label: 'Mexico' }, { code: 'PHL', label: 'Philippines' },
  { code: 'PAK', label: 'Pakistan' }, { code: 'BGD', label: 'Bangladesh' }, { code: 'NPL', label: 'Nepal' }, { code: 'LKA', label: 'Sri Lanka' },
  { code: 'TWN', label: 'Taiwan' }, { code: 'HKG', label: 'Hong Kong' }, { code: 'KOR', label: 'South Korea' }, { code: 'VNM', label: 'Vietnam' },
  { code: 'CAN', label: 'Canada' }, { code: 'GBR', label: 'United Kingdom' }, { code: 'BRA', label: 'Brazil' }, { code: 'NGA', label: 'Nigeria' },
  { code: 'ARE', label: 'United Arab Emirates' }, { code: 'SGP', label: 'Singapore' }, { code: 'OTH', label: 'Another country' },
];
export const birthLabel = (code?: string) => BIRTH_COUNTRIES.find((c) => c.code === code)?.label;
export const BIRTH_NOTE = 'The Visa Bulletin goes by country of birth, not passport.';

/** Country of birth → Visa Bulletin column. Taiwan and Hong Kong born use the all-countries column (China is mainland born only). */
export const chargeabilityOf = (code?: string): BulletinCountry =>
  code === 'IND' ? 'india' : code === 'CHN' ? 'china' : code === 'MEX' ? 'mexico' : code === 'PHL' ? 'philippines' : 'all';

// Indian passports print the town and state ("CHENNAI, TAMIL NADU"), not the country.
const INDIA_PLACES = /\b(INDIA|ANDHRA PRADESH|ARUNACHAL|ASSAM|BIHAR|CHHATTISGARH|GOA|GUJARAT|HARYANA|HIMACHAL|JHARKHAND|KARNATAKA|KERALA|MADHYA PRADESH|MAHARASHTRA|MANIPUR|MEGHALAYA|MIZORAM|NAGALAND|ODISHA|ORISSA|PUNJAB|RAJASTHAN|SIKKIM|TAMIL ?NADU|TELANGANA|TRIPURA|UTTAR PRADESH|UTTARAKHAND|WEST BENGAL|DELHI|PUDUCHERRY|PONDICHERRY|CHANDIGARH|JAMMU|KASHMIR|LADAKH|MUMBAI|BOMBAY|CHENNAI|MADRAS|KOLKATA|CALCUTTA|BENGALURU|BANGALORE|HYDERABAD)\b/;
const NAMED: [RegExp, string][] = [
  [/\b(PEOPLE'?S REPUBLIC OF CHINA|CHINA|PRC)\b/, 'CHN'], [/\bHONG ?KONG\b/, 'HKG'], [/\bTAIWAN\b/, 'TWN'], [/\bMEXICO\b/, 'MEX'], [/\bPHILIPPINES\b/, 'PHL'],
  [/\bPAKISTAN\b/, 'PAK'], [/\bBANGLADESH\b/, 'BGD'], [/\bNEPAL\b/, 'NPL'], [/\bSRI ?LANKA\b/, 'LKA'], [/\b(SOUTH )?KOREA\b/, 'KOR'], [/\bVIET ?NAM\b/, 'VNM'],
  [/\bCANADA\b/, 'CAN'], [/\b(UNITED KINGDOM|ENGLAND|SCOTLAND|WALES|GREAT BRITAIN)\b/, 'GBR'], [/\bBRAZIL\b/, 'BRA'], [/\bNIGERIA\b/, 'NGA'],
  [/\b(UNITED ARAB EMIRATES|UAE|DUBAI|ABU DHABI)\b/, 'ARE'], [/\bSINGAPORE\b/, 'SGP'],
];
const ISO: Record<string, string> = Object.fromEntries(BIRTH_COUNTRIES.filter((c) => c.code !== 'OTH').map((c) => [c.code, c.code]));

/** A place of birth as printed → country code (undefined when it can't tell). */
export function countryFromPlace(place?: string): string | undefined {
  const U = (place ?? '').toUpperCase();
  if (!U.trim()) return undefined;
  const named = NAMED.find(([re]) => re.test(U));
  if (named) return named[1];
  if (INDIA_PLACES.test(U)) return 'IND';
  return undefined;
}

/** The printed value after a "Place of Birth" / "Country of Birth" label (same line, else the next line). */
export function placeAfter(T: string, label: RegExp): string | undefined {
  const lines = T.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const clean = (s: string) => s.split(/\s{2,}|\t/)[0].replace(/[^A-Za-z ,.'-]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.'-]+|[\s,.'-]+$/g, '');
    const bad = (s: string) => s.length < 2 || s.length > 40 || /\b(DATE|SEX|NATIONALITY|ISSUE|EXPIR|SURNAME|GIVEN|CATEGORY|CARD|USCIS|PLACE|COUNTRY|BIRTH)\b/i.test(s);
    const same = clean(lines[i].slice((m.index ?? 0) + m[0].length).replace(/^\s*[:/\-]\s*/, ''));
    if (!bad(same)) return same.toUpperCase();
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const next = clean(lines[j]);
      if (next && !bad(next)) return next.toUpperCase();
      if (next) break;
    }
  }
  return undefined;
}

export type BirthCountry = { code: string; from: 'typed' | 'document' | 'nationality' };
/** Typed country of birth, else a document's place of birth, else the passport nationality. */
export function birthCountryOf(typed: string | undefined, rec?: { birthPlace?: string; nationality?: string }): BirthCountry | undefined {
  if (typed && birthLabel(typed)) return { code: typed, from: 'typed' };
  const fromDoc = countryFromPlace(rec?.birthPlace);
  if (fromDoc) return { code: fromDoc, from: 'document' };
  const nat = rec?.nationality;
  if (nat) return { code: ISO[nat] ?? 'OTH', from: 'nationality' };
  return undefined;
}

/** The guess shown before anything is typed (Edit details pre-fill). */
export const birthCountryGuess = (rec?: { birthPlace?: string; nationality?: string }) => birthCountryOf(undefined, rec);
