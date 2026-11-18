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
