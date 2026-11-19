// Keeps the home-screen widgets in step with the app (v2.5): rebuilds the snapshot whenever people,
// documents, cases, settings or the Visa Bulletin change, and writes it only when something the
// widget shows changed. No-op on builds without the widget module (src/native/widgets.ts).
import { useEffect, useRef } from 'react';
import { buildWidgetSnapshot, sameSnapshot, type WidgetInput, type WidgetSnapshot } from '../core/widgets';
import { widgetsAvailable, writeWidgetSnapshot } from '../native/widgets';

export function useWidgetSync(ready: boolean, input: Omit<WidgetInput, 'today' | 'now'>) {
  const last = useRef<WidgetSnapshot | null>(null);
  const { people, records, results, caseList, settings, bulletin } = input;
  useEffect(() => {
    if (!ready || !widgetsAvailable()) return;
    const t = setTimeout(() => {
      try {
        const snap = buildWidgetSnapshot({ people, records, results, caseList, settings, bulletin });
        if (sameSnapshot(last.current, snap)) return;
        if (writeWidgetSnapshot(snap)) last.current = snap;
      } catch { /* a widget must never break the app */ }
    }, 400); // saves come in bursts (a document flow saves several things)
    return () => clearTimeout(t);
  }, [ready, people, records, results, caseList, settings, bulletin]);
}
