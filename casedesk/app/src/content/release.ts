// The app's release number, shown in Settings and About so updates are easy to track.
// MAJOR.MINOR is set by hand for a feature round; the last part is the update number, written by the
// phone-update workflow (casedesk-update.yml) into release.json just before publishing.
import stamp from './release.json';

export const RELEASE_BASE = '2.9';
export const RELEASE_STAMP = stamp as { n: number; at?: string };
/** e.g. 2.9.41 */
export const RELEASE = `${RELEASE_BASE}.${RELEASE_STAMP.n || 0}`;

/** Which update lane this build listens to: 'main' = TestFlight / test builds (every push), 'production'
 *  = the App Store build (only releases you approve, via the CaseDesk release workflow). */
export const LANE: string = (() => { try { return (require('expo-updates') as { channel?: string | null }).channel ?? ''; } catch { return ''; } })();
