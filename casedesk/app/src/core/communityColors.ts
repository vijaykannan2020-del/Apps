// The Community pastels (v2.7 pastel-on-black look). ONE place on purpose: when the app-wide pastel
// theme lands (src/ui/theme.tsx, branch v2.7-pastel) swap these for its tokens and delete this file.
// Pastel surfaces always carry dark INK text (all four pass 4.5:1 with ink), in dark and light mode.
export const PASTEL = { sage: '#A9CDB9', blush: '#F8D2D3', butter: '#FDD78C', sky: '#BFD9F8' } as const;
export const INK = '#1D2A24';
export type PastelName = keyof typeof PASTEL;
export const PASTEL_NAMES: PastelName[] = ['sage', 'blush', 'butter', 'sky'];
/** Post cards: radius from the pastel design (30); the card colour comes from the theme (t.card). */
export const CARD_RADIUS = 30;
/** Up / down vote colours on dark and light cards (text-safe on both). */
export const VOTE = { upDark: '#7FE0A8', upLight: '#17702F', downDark: '#F58B8B', downLight: '#B3150F' } as const;
