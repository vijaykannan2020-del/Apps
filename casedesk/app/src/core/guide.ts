// v3.0 Guided tour: a 1-minute walk through the app itself (owner: after setup, show people where the
// important things are instead of a list of tools). Pure logic, no React — tested in tests/guide.test.ts.
// The UI (navigation, spotlight, tooltip card, widget how-to drawings) is src/screens/guide.tsx.
//
// Each stop opens a real screen and points at a real element: `target` is "<screen tour id>:<TourTarget id>"
// (every <TourTarget> also registers under that key). A target that is not on screen shows a centred card.
import type { Settings } from './model';
import { setupOpen, showContinueCard } from './onboarding';

export type GuideTab = 'index' | 'family' | 'cases' | 'forum' | 'tools';
/** A tab, or a pushed page opened from a tab (`via`), like the user would. */
export type GuideRoute = { tab: GuideTab } | { push: string; via: GuideTab };

export const END_LINE = 'Take this tour again any time: Settings → Help → Take the tour.';
export type GuideStopId = 'home' | 'search' | 'status' | 'documents' | 'wallet' | 'cases' | 'community' | 'tools' | 'widget' | 'share' | 'end';
export type GuideStop = {
  id: GuideStopId;
  route: GuideRoute;
  /** "<tour id>:<target id>"; none = a centred card */
  target?: string;
  title: string;
  text: string;
  /** widget = the illustrated how-to; wallet = a drawn card when the button is not on screen */
  art?: 'widget' | 'wallet';
  /** no ring (or the target is missing): bring this element on screen behind the card */
  near?: string;
};

export type GuideInput = {
  /** the main person (or the first person); no person = no tour */
  person?: { id: string; name: string; self: boolean };
  /** the person has at least one saved document */
  hasDocs: boolean;
  /** the person's status card has a Review / Act now chip */
  review?: boolean;
  /** cases saved for the family */
  cases: number;
  /** the person is on a work visa (H-1B, L-1, TN, E-3, O-1, OPT): I lost my job applies */
  work: boolean;
  /** a green card process is likely (work visas, their dependents, applicants) */
  gc: boolean;
  /** Add to Apple Wallet is offered on this device */
  wallet: boolean;
  /** Home Screen widgets exist on this device (iPhone) */
  widgets: boolean;
};

/** About a minute: never more than 10 stops. */
export const MAX_STOPS = 10;
const SHARE_LINE = 'To send documents to your spouse’s phone, use Share with family here or on a person’s page.';

export const WORK_VISAS = /H-1B|L-1|TN|E-3|O-1|OPT/;
export const GC_LIKELY = /H-1B|L-1|L-2|H-4|TN|E-3|O-1|green.card.applicant|Green card pending|I-485/i;

/** Which stops apply to this family, in order, with their words. */
export function guideStops(g: GuideInput): GuideStop[] {
  const p = g.person;
  if (!p) return [];
  const first = p.name.trim().split(/\s+/)[0] || p.name;
  const whose = p.self ? 'Your' : `${first}’s`;
  const person: GuideRoute = { push: `/person/${p.id}`, via: 'family' };
  const settings: GuideRoute = { push: '/settings', via: 'index' };
  const tools = ['Can I travel? checks a trip against everyone’s documents.'];
  if (g.gc) tools.push('Green card planner shows the expected wait.');
  if (g.work) tools.push('I lost my job shows the last day in status and what to do.');

  const all: (GuideStop | false)[] = [
    { id: 'home', route: { tab: 'index' }, target: 'home:hero', title: 'What needs attention', text: 'This card is the one thing that matters most right now, with the days left. Tap it for what to do.' },
    { id: 'search', route: { tab: 'index' }, target: 'home:search', title: 'Find anything', text: 'Search people, documents, cases and tools from here.' },
    { id: 'status', route: person, target: 'person:card', title: `${whose} status card`,
      text: g.hasDocs
        ? `How long ${p.self ? 'you' : first} can stay, worked out from the documents.${g.review ? ' Tap Review under it to see why.' : ''}`
        : `Add a document and this card shows how long ${p.self ? 'you' : first} can stay.` },
    { id: 'documents', route: person, target: 'person:docs', title: 'Documents', text: 'Add or renew a document here: scan it with the camera or upload a photo or PDF. Everything stays on this phone.' },
    g.wallet && g.hasDocs && { id: 'wallet', route: person, target: 'person:wallet', near: 'person:card', art: 'wallet', title: 'Add to Apple Wallet', text: 'Puts this status card in Apple Wallet for a quick look. It’s a reminder for you, not an official document.' },
    g.cases > 0 && { id: 'cases', route: { tab: 'cases' }, target: 'cases:list', title: 'Check a case', text: 'Open a case and tap Copy number & open uscis.gov. Paste it in Safari, copy what USCIS says and paste it back. What to expect shows the usual next steps.' },
    { id: 'community', route: { tab: 'forum' }, target: 'communityFeed:chips', title: 'Ask the community', text: 'Ask people on the same visa about stamping, extensions and timelines. Read the pinned rules first.' },
    { id: 'tools', route: { tab: 'tools' }, target: 'tools:plan', title: 'Tools', text: tools.join(' ') },
    g.widgets && { id: 'widget', route: settings, near: 'settings:widgets', art: 'widget', title: 'Add the Home Screen widget', text: 'See days left without opening the app.' },
    { id: 'share', route: settings, target: 'settings:share', title: 'Share with family', text: 'Send documents to your spouse’s phone, encrypted, with a code you tell them.' },
  ];
  let stops = all.filter((s): s is GuideStop => !!s);
  if (stops.length > MAX_STOPS) {
    // keep it to about a minute: Share with family becomes one line on the card before it
    stops = stops.filter((s) => s.id !== 'share');
    const i = stops.length - 1;
    stops[i] = { ...stops[i], text: `${stops[i].text} ${SHARE_LINE}` };
  }
  // v3.0 (owner): no separate closing card; the last stop says where to find the tour again
  const last = stops.length - 1;
  stops[last] = { ...stops[last], text: `${stops[last].text} ${END_LINE}` };
  return stops;
}

/** The widget how-to, one short line per drawing. */
export const WIDGET_STEPS: { art: 'hold' | 'gallery' | 'size' | 'edit'; text: string }[] = [
  { art: 'hold', text: 'Touch and hold the Home Screen, tap Edit, then Add Widget.' },
  { art: 'gallery', text: 'Search Immigration Wallet.' },
  { art: 'size', text: 'Pick a size and tap Add Widget.' },
  { art: 'edit', text: 'Touch and hold the widget, tap Edit Widget to choose the person and what it shows.' },
];
export const WIDGET_LOCK_LINE = 'Lock Screen too: touch and hold it, tap Customize, then add the widget.';

/** "Step 2 of 9" and what VoiceOver reads. */
export const guideStep = (i: number, n: number) => `Step ${i + 1} of ${n}`;
export const guideLabel = (s: GuideStop, i: number, n: number) => `${guideStep(i, n)}. ${s.title}. ${s.text}`;

/** One-time Home card "Take a 1-minute tour" for people who finished setup before the tour existed. */
export function showGuideCard(s: Pick<Settings, 'setupDone' | 'setup' | 'guideSeen'>, people: number): boolean {
  if (people < 1 || s.guideSeen) return false;
  if (setupOpen(s) || showContinueCard(s, people)) return false;
  return true;
}

/** Facts for the stops from the family (the screen layer passes what it knows about the device). */
export function guideInput(f: {
  people: { id: string; name: string; relation: string; isMain?: boolean; status?: string }[];
  records: Record<string, { docTypes: string[]; visa?: string } | undefined>;
  results: Record<string, { worst?: string } | undefined>;
  cases: number;
}, device: { wallet: boolean; widgets: boolean }): GuideInput {
  const me = f.people.find((p) => p.isMain) ?? f.people.find((p) => p.relation === 'self') ?? f.people[0];
  if (!me) return { hasDocs: false, cases: 0, work: false, gc: false, ...device };
  const rec = f.records[me.id];
  const st = `${rec?.visa ?? ''} ${me.status ?? ''}`;
  const worst = f.results[me.id]?.worst;
  return {
    person: { id: me.id, name: me.name, self: me.relation === 'self' },
    hasDocs: !!rec && rec.docTypes.length > 0,
    review: worst === 'review' || worst === 'act',
    cases: f.cases,
    work: WORK_VISAS.test(st),
    gc: GC_LIKELY.test(st),
    ...device,
  };
}
