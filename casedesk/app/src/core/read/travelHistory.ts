// CBP "Travel History" (i94.cbp.dhs.gov → Get Travel History): rows of Arrival / Departure with dates.
// Turned into trips abroad (departure → next arrival) for day counters (absences, recapture, citizenship).
import type { DocFields } from '../model';
import { datesIn } from './text';

export const isTravelHistory = (U: string) => /TRAVEL HISTORY/.test(U) && /(ARRIVAL|DEPARTURE)/.test(U) && !/ADMIT UNTIL DATE\s*:/.test(U);

export function readTravelHistory(T: string): DocFields {
  const events: { date: string; kind: 'A' | 'D' }[] = [];
  for (const line of T.split('\n')) {
    const U = line.toUpperCase();
    const kind = /\bARRIVAL\b/.test(U) ? 'A' : /\bDEPARTURE\b/.test(U) ? 'D' : undefined;
    const d = datesIn(line)[0];
    if (kind && d) events.push({ date: d, kind });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const trips: { depart?: string; return?: string }[] = [];
  let open: { depart?: string; return?: string } | undefined;
  for (const e of events) {
    if (e.kind === 'D') { if (open) trips.push(open); open = { depart: e.date }; }
    else if (open) { open.return = e.date; trips.push(open); open = undefined; }
    // an arrival with no departure before it = first entry; not a trip
  }
  if (open) trips.push(open);
  return { trips };
}
