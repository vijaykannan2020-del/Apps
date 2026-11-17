import { useWindowDimensions } from 'react-native';

// One layout for every screen size: small phones, big phones, foldables (folded / unfolded), tablets.
// Unfolding a foldable changes the window width and everything re-flows automatically.
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 700; // unfolded foldables, tablets, landscape
  const cols = width >= 1100 ? 3 : wide ? 2 : 1;
  const tiles = width >= 1100 ? 6 : wide ? 4 : 2; // small stat / quick-tool tiles per row
  return { width, height, wide, cols, tiles, maxContent: 1100, maxDetail: 760 };
}

// Width for one tile when `n` fit per row with a 10px gap
export const tileWidth = (n: number) => `${Math.floor(((100 - (n - 1) * 3) / n) * 10) / 10}%` as const;
