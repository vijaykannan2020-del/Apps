import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

/** Unfolded iPhone Duo / iPad / landscape: list + chat side by side. */
export const WIDE_AT = 600;
/** iPhone Duo: front screen 466×678pt (one pane), inner screen ~669×951pt (two panes). */
export function isWide(w: number, _h?: number) { return w >= WIDE_AT; }
/** On iPhone Duo the clock/Wi-Fi sit in a tall strip at the top-right; keep header controls clear of it. */
export function useStatusGutter() { const { width, height } = useWindowDimensions(); return width < WIDE_AT && Math.abs(width - 466) < 8 && height < 760 ? 74 : 0; }
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
