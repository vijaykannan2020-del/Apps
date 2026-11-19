// First-time navigation help for the Community screens. The app-wide tour system (casedesk/app/TOURS.md,
// branch v2.3: useTour('screenId', steps) with refs, '?' in the nav bar replays it) wasn't on main
// when Community was built, so this file holds the step definitions plus a no-op useTour shim with
// the same shape. After merging v2.3: replace the shim body with
//   export { useTour } from './tour';   (or wherever TOURS.md says it lives)
// and the screens start showing the tours with no other change. Until then the '?' opens the
// 'How the community works' help topic.
import { useCallback, useRef } from 'react';

export type TourStep = { key: string; title: string; body: string };

export const COMMUNITY_TOURS: Record<string, TourStep[]> = {
  communityFeed: [
    { key: 'tabs', title: 'Pick a feed', body: 'For my visa shows questions tagged with your family’s visa types and forms. All shows everything; Unanswered is where you can help.' },
    { key: 'chips', title: 'Filter by tag', body: 'Tap a tag to see only H-1B, I-485, stamping and so on. Tap it again to clear.' },
    { key: 'compose', title: 'Ask a question', body: 'Reading is open to everyone. To ask, answer or upvote you sign in with Apple — others only see a made-up name.' },
    { key: 'account', title: 'Your account', body: 'Your questions, display name, notifications, blocked people and Delete account live here.' },
  ],
  communityPost: [
    { key: 'answer', title: 'Answer or say thanks', body: 'Share what happened in your case. Never post receipt numbers or other personal numbers.' },
    { key: 'vote', title: 'Upvote helpful answers', body: 'Upvotes move the most useful answers up. The asker can mark one as accepted.' },
    { key: 'menu', title: 'Report or block', body: 'The ••• menu reports a post or blocks its author. Blocked people disappear for you right away.' },
  ],
  communityCompose: [
    { key: 'title', title: 'A clear title', body: 'Say the visa, form and question in one line — for example “H-1B extension: RFE response 8 weeks ago, normal?”.' },
    { key: 'tags', title: 'Tag it', body: 'Pick up to 5 tags so people with the same visa or form find it.' },
    { key: 'privacy', title: 'Keep it private', body: 'Leave out names, receipt numbers, A-numbers, emails and phone numbers. Say the service center (EAC, WAC…) instead.' },
  ],
  communitySignIn: [
    { key: 'apple', title: 'Sign in with Apple', body: 'Only needed to post, answer or vote. We never see or show your email.' },
    { key: 'rules', title: 'Community rules', body: 'Read and accept the rules once before your first post.' },
  ],
  communityAccount: [
    { key: 'name', title: 'Your display name', body: 'This is all anyone sees. Change it any time — no real names needed.' },
    { key: 'mine', title: 'My questions', body: 'Everything you asked, including anything hidden while a moderator reviews it.' },
    { key: 'delete', title: 'Delete account', body: 'Removes your account and everything you posted. You can sign in again later as a new member.' },
  ],
};

/** Shim with the TOURS.md shape: ref(key) for each target, replay() for the '?' button. No-op for now. */
export function useTour(screenId: keyof typeof COMMUNITY_TOURS, steps: TourStep[] = COMMUNITY_TOURS[screenId]) {
  const refs = useRef<Record<string, unknown>>({});
  const ref = useCallback((key: string) => (node: unknown) => { refs.current[key] = node; }, []);
  const replay = useCallback(() => {}, []);
  void steps;
  return { ref, replay, active: false as boolean };
}
