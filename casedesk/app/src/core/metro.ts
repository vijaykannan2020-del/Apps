// US metro areas for H-1B work locations: a move to another metro needs an amended petition (C21).
import type { WorkLocation } from './model';

export const METROS = ['Dallas–Fort Worth', 'Houston', 'Austin', 'San Antonio', 'New York', 'New Jersey (Central)', 'San Francisco Bay Area', 'Los Angeles', 'Seattle', 'Chicago', 'Atlanta', 'Washington DC', 'Boston', 'Phoenix', 'Charlotte', 'Raleigh', 'Detroit', 'Minneapolis', 'Denver', 'Other'];

const CITIES: Record<string, string[]> = {
  'Dallas–Fort Worth': ['dallas', 'fort worth', 'frisco', 'plano', 'irving', 'richardson', 'arlington', 'mckinney', 'allen', 'addison', 'carrollton', 'denton', 'grapevine', 'coppell', 'lewisville', 'garland', 'prosper', 'little elm', 'southlake', 'flower mound', 'las colinas'],
  Houston: ['houston', 'sugar land', 'katy', 'the woodlands', 'pearland', 'spring'],
  Austin: ['austin', 'round rock', 'cedar park', 'georgetown', 'pflugerville'],
  'San Antonio': ['san antonio', 'new braunfels'],
  'New York': ['new york', 'brooklyn', 'manhattan', 'jersey city', 'newark', 'hoboken', 'white plains', 'stamford'],
  'New Jersey (Central)': ['edison', 'princeton', 'piscataway', 'iselin', 'somerset', 'bridgewater', 'parsippany'],
  'San Francisco Bay Area': ['san francisco', 'san jose', 'santa clara', 'sunnyvale', 'mountain view', 'palo alto', 'fremont', 'oakland', 'cupertino', 'milpitas', 'redwood city', 'menlo park', 'pleasanton'],
  'Los Angeles': ['los angeles', 'irvine', 'santa monica', 'long beach', 'pasadena', 'torrance'],
  Seattle: ['seattle', 'redmond', 'bellevue', 'kirkland', 'bothell', 'tacoma', 'everett'],
  Chicago: ['chicago', 'naperville', 'schaumburg', 'oak brook', 'deerfield', 'lisle'],
  Atlanta: ['atlanta', 'alpharetta', 'marietta', 'duluth', 'sandy springs'],
  'Washington DC': ['washington', 'arlington va', 'reston', 'herndon', 'mclean', 'bethesda', 'rockville', 'fairfax', 'ashburn'],
  Boston: ['boston', 'cambridge', 'burlington', 'waltham', 'quincy'],
  Phoenix: ['phoenix', 'tempe', 'scottsdale', 'chandler', 'mesa'],
  Charlotte: ['charlotte'],
  Raleigh: ['raleigh', 'durham', 'cary', 'morrisville'],
  Detroit: ['detroit', 'troy', 'southfield', 'dearborn', 'auburn hills'],
  Minneapolis: ['minneapolis', 'st paul', 'saint paul', 'bloomington', 'eden prairie'],
  Denver: ['denver', 'aurora', 'englewood', 'boulder'],
};

export function metroOf(city?: string, state?: string): string | undefined {
  const c = (city || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!c) return undefined;
  if (c === 'arlington') return state?.toUpperCase() === 'VA' ? 'Washington DC' : 'Dallas–Fort Worth';
  for (const [m, list] of Object.entries(CITIES)) if (list.includes(c)) return m;
  return undefined;
}

/** Different metro? Metros when both are known, else the state. Unknown = not different. */
export function differentMetro(a?: WorkLocation, b?: WorkLocation) {
  if (!a || !b) return false;
  const ma = metroOf(a.city, a.state) ?? a.metro, mb = metroOf(b.city, b.state) ?? b.metro;
  if (ma && mb && ma !== 'Other' && mb !== 'Other') return ma !== mb;
  if (a.state && b.state) return a.state.toUpperCase() !== b.state.toUpperCase();
  return false;
}

// v2.9: ZIP code → metro, by the first three digits (USPS sectional centers). Covers the metros above;
// any other ZIP gives no metro (the screen then says it couldn't tell).
const ZIP3: Record<string, string> = {};
const zips = (m: string, list: (number | [number, number])[]) => { for (const z of list) { const [a, b] = Array.isArray(z) ? z : [z, z]; for (let i = a; i <= b; i++) ZIP3[String(i).padStart(3, '0')] = m; } };
zips('Dallas–Fort Worth', [[750, 753], [760, 762]]);
zips('Houston', [770, [772, 775]]);
zips('Austin', [786, 787]);
zips('San Antonio', [[780, 782]]);
zips('New York', [[100, 107], [110, 114], [70, 73], [68, 69]]);
zips('New Jersey (Central)', [85, [88, 89]]);
zips('San Francisco Bay Area', [[940, 941], [943, 951]]);
zips('Los Angeles', [[900, 908], [910, 918], [926, 927]]);
zips('Seattle', [[980, 984]]);
zips('Chicago', [[600, 608]]);
zips('Atlanta', [[300, 301], 303, 311]);
zips('Washington DC', [[200, 209], [220, 223]]);
zips('Boston', [[18, 22], 24]);
zips('Phoenix', [850, [852, 853]]);
zips('Charlotte', [[280, 282]]);
zips('Raleigh', [[275, 277]]);
zips('Detroit', [[480, 483]]);
zips('Minneapolis', [[553, 555]]);
zips('Denver', [[800, 803]]);

export function metroOfZip(zip?: string): string | undefined {
  const z = (zip || '').trim().match(/^(\d{5})(?:-\d{4})?$/);
  return z ? ZIP3[z[1].slice(0, 3)] : undefined;
}

/** What someone typed for a work location: "Austin, TX", "Austin TX 78701", "78701". */
export function parsePlace(input: string): WorkLocation & { zip?: string } | undefined {
  const s = (input || '').trim();
  if (!s) return undefined;
  const zip = s.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  const rest = s.replace(/\b\d{5}(?:-\d{4})?\b/, '').replace(/[,\s]+$/, '').trim();
  const m = rest.match(/^([^,]+?)(?:\s*,\s*|\s+)([A-Za-z]{2})$/) ?? rest.match(/^([^,]+?)$/);
  const city = m?.[1]?.trim() || undefined;
  const state = m?.[2]?.toUpperCase();
  const metro = metroOf(city, state) ?? metroOfZip(zip);
  if (!city && !zip) return undefined;
  return { city, state, zip, metro };
}

/** One line for a saved work location: "Austin, TX" or "ZIP 78701". */
export const placeText = (w?: WorkLocation & { zip?: string }) => (w ? [w.city, w.state].filter(Boolean).join(', ') || (w.zip ? `ZIP ${w.zip}` : '') : '');
