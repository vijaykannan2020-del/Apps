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
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
let ver = 0;
export function setCollapsed(c: boolean) { if (c !== collapsed) { collapsed = c; ver++; emit(); } }
export function setCurrentChat(id: string | null) { if (id !== current) { current = id; ver++; emit(); } }
export const isCollapsed = () => collapsed;
export const currentChat = () => current;
export function useLayout() {
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ver, () => ver);
  return { collapsed, current };
}

// Right edge of the list column in window coordinates — the detail column keeps its content clear of it
// (on iOS 26+ the sidebar floats over the detail column, which extends underneath it).
let sidebarRight = 0;
export function setSidebarRight(x: number) { if (Math.abs(x - sidebarRight) > 0.5) { sidebarRight = x; ver++; emit(); } }
export const getSidebarRight = () => sidebarRight;

/** Show the detail column (on iPhone this slides it in; on the open Duo it's already beside the list). */
export function showDetail() { try { split?.show('secondary'); } catch {} }
/** Back to the list (one-column layouts only). */
export function showList() { try { split?.show('primary'); } catch {} }

/** Open a chat from anywhere: list taps, notifications, banners, family. */
export function openChat(id: string) {
  setCurrentChat(id);
  router.navigate({ pathname: '/chat/[id]', params: { id } });
  setTimeout(showDetail, 0);
}
/** Open another screen in the detail column (Accounts etc.). */
export function openDetail(href: any) {
  router.navigate(href);
  setTimeout(showDetail, 0);
}
