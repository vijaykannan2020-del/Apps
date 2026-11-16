import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

/** Unfolded iPhone Duo / iPad / landscape: list + chat side by side. */
export const WIDE_AT = 600;
/** Unfolded = wide screen, or a near-square screen (the open iPhone Duo is ~3:4, a folded phone ~9:19.5). */
export function isWide(w: number, h: number) { return w >= WIDE_AT || (w >= 400 && w / h >= 0.6); }
export function useWide() { const { width, height } = useWindowDimensions(); return isWide(width, height); }

// The chat open in the right-hand pane — shared so folding/unfolding keeps the same chat open.
let selected: string | null = null;
const subs = new Set<() => void>();
export function getSelected() { return selected; }
export function setSelected(id: string | null) { if (id === selected) return; selected = id; subs.forEach(f => f()); }
export function useSelected() {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => selected, () => selected);
}

import { router } from 'expo-router';
import { Dimensions } from 'react-native';
/** Open a chat from anywhere: right-hand pane when unfolded, full screen when folded. */
export function openChat(id: string) {
  const d = Dimensions.get('window'); if (isWide(d.width, d.height)) { setSelected(id); router.navigate('/inbox'); }
  else router.push({ pathname: '/chat/[id]', params: { id } });
}
