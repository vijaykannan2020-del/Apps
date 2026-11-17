// App layout on top of Apple's split view (UISplitViewController).
// iOS decides by itself whether to show one column (iPhone, Duo closed/tent) or list + chat side by side
// (Duo open — 50/50 on the fold when folded like a book), exactly like other Duo-optimized apps.
import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';

/** On iPhone Duo's front screen the clock/Wi-Fi sit in a tall strip at the top-right; keep header controls clear of it. */
export function useStatusGutter() { const { width, height } = useWindowDimensions(); return width < 600 && Math.abs(width - 466) < 8 && height < 760 ? 74 : 0; }

type SplitRef = { show: (column: 'primary' | 'supplementary' | 'secondary') => void } | null;
let split: SplitRef = null;
export function setSplitRef(r: SplitRef) { split = r; }

// Whether the split view currently shows one column (iPhone / Duo closed) — reported by iOS via onCollapse/onExpand.
let collapsed = true;
let current: string | null = null; // chat open in the right-hand column
export type ListTab = 'all' | 'whatsapp' | 'instagram' | 'messenger';
let tab: ListTab = 'all'; // which apps the chat list shows
// The screen the user just asked for in the right-hand page. On one-column screens iOS only updates that page once it
// slides into view, so the previous screen (an old chat, Accounts) would flash first — screens that aren't the target
// stay blank instead.
let target: string | null = null;
function setTarget(t: string) { if (t !== target) { target = t; ver++; emit(); } }
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
let ver = 0;
export function setCollapsed(c: boolean) { if (c !== collapsed) { collapsed = c; ver++; emit(); } }
export function setCurrentChat(id: string | null) { if (id !== current) { current = id; ver++; emit(); } }
export const isCollapsed = () => collapsed;
export function setListTab(t: ListTab) { if (t !== tab) { tab = t; ver++; emit(); } }
export const currentChat = () => current;
export function useLayout() {
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ver, () => ver);
  return { collapsed, current, tab, target };
}

// Right edge of the list column in window coordinates — the detail column keeps its content clear of it
// (on iOS 26+ the sidebar floats over the detail column, which extends underneath it).
let sidebarRight = 0;
export function setSidebarRight(x: number) { if (Math.abs(x - sidebarRight) > 0.5) { sidebarRight = x; ver++; emit(); } }
export const getSidebarRight = () => sidebarRight;

// The real top inset of the screen (the list column adds room for a title bar Inbox doesn't use).
let rootTop = -1;
export function setRootTop(n: number) { if (n !== rootTop) { rootTop = n; ver++; emit(); } }
export const getRootTop = () => rootTop;

/** Show the detail column (on iPhone this slides it in; on the open Duo it's already beside the list). */
export function showDetail() { try { split?.show('secondary'); } catch {} }
/** Back to the list (one-column layouts only). */
export function showList() { try { split?.show('primary'); } catch {} }

/** Open a chat from anywhere: list taps, notifications, banners, family. */
// One column: reveal the right-hand page only once the new screen is on top of it, otherwise the previous
// chat slides in first and is then swapped (seen when opening Accounts on the folded Duo).
let pendingShow: ReturnType<typeof setTimeout> | null = null;
function showWhenReady() {
  if (!collapsed) { showDetail(); return; }
  if (pendingShow) clearTimeout(pendingShow);
  pendingShow = setTimeout(flushShow, 400); // fallback, e.g. the same screen was already on top
}
/** Called by the right-hand stack when a screen becomes the top one. */
export function flushShow() { if (pendingShow) { clearTimeout(pendingShow); pendingShow = null; requestAnimationFrame(showDetail); } }
export function openChat(id: string) {
  setTarget('chat:' + id);
  setCurrentChat(id);
  router.navigate({ pathname: '/chat/[id]', params: { id } });
  showWhenReady();
}
/** Open another screen in the detail column (Accounts etc.). */
export function openDetail(href: any) {
  setTarget(href === '/accounts' ? 'accounts' : JSON.stringify(href));
  router.navigate(href);
  showWhenReady();
}
