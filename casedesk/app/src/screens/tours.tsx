// Binds the coach-mark system (ui/tour.tsx) to the family's settings and the help topics.
import React, { useCallback } from 'react';
import { TourProvider, registerTours } from '../ui';
import { TOURS } from '../content/tours';
import { markSeen } from '../core/tours';
import { setupOpen } from '../core/onboarding';
import { useFamily } from '../data/FamilyProvider';
import { go } from './common';
import { useGuide } from './guide';

registerTours(TOURS);

export function Tours({ children }: { children: React.ReactNode }) {
  const f = useFamily();
  const guide = useGuide();
  const onSeen = useCallback((id: string) => { f.actions.updateSettings({ toursSeen: markSeen(f.settings.toursSeen, id) }).catch(() => {}); }, [f.actions, f.settings.toursSeen]);
  return (
    <TourProvider seen={f.settings.toursSeen ?? []} ready={f.ready && f.people.length > 0 && !setupOpen(f.settings) /* v3.0: no tips while the onboarding is open */ && !guide.active /* nor during the guided tour */} off={f.settings.toursOff} all={f.settings.toursAll} onSeen={onSeen} onHelp={(topic) => go(`/help/${topic}`)}>
      {children}
    </TourProvider>
  );
}
