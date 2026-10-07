/**
 * Data-driven cosmetics. `premium` items need an entitlement id in the player's list (granted by the store).
 * Avatars are emoji so they ship with zero assets. Pawns are the player's avatar on a disc in the player's
 * colour; "token" skins change the disc's shape/finish (see `.pawn[data-skin]` in app.css).
 */
export interface Cosmetic {
  id: string;
  name: string;
  glyph: string;
  premium?: string; // entitlement id required
}

/** Pawn skins. `glyph` is only used as a preview label. */
export const TOKENS: Cosmetic[] = [
  { id: 'auto', name: 'Classic disc', glyph: '●' },
  { id: 'shield', name: 'Shield', glyph: '⛊' },
  { id: 'gem', name: 'Gem', glyph: '◆' },
  { id: 'hex', name: 'Hex', glyph: '⬢' },
  { id: 'badge', name: 'Badge', glyph: '✪' },
  { id: 'ring', name: 'Ring', glyph: '◎' },
  { id: 'gold', name: 'Gold finish', glyph: '◉', premium: 'dice-gold' },
  { id: 'crown', name: 'Crowned', glyph: '♛', premium: 'token-lotus' },
  { id: 'neon', name: 'Neon glow', glyph: '✦', premium: 'token-peacock' },
];

export const AVATARS: Cosmetic[] = [
  { id: 'tiger', name: 'Tiger', glyph: '🐯' },
  { id: 'fox', name: 'Fox', glyph: '🦊' },
  { id: 'panda', name: 'Panda', glyph: '🐼' },
  { id: 'cat', name: 'Cat', glyph: '🐱' },
  { id: 'monkey', name: 'Monkey', glyph: '🐵' },
  { id: 'owl', name: 'Owl', glyph: '🦉' },
  { id: 'frog', name: 'Frog', glyph: '🐸' },
  { id: 'koala', name: 'Koala', glyph: '🐨' },
  { id: 'lion', name: 'Lion', glyph: '🦁' },
  { id: 'unicorn', name: 'Unicorn', glyph: '🦄' },
  { id: 'alien', name: 'Alien', glyph: '👽' },
  { id: 'ninja', name: 'Ninja', glyph: '🥷' },
  { id: 'astronaut', name: 'Astronaut', glyph: '🧑‍🚀' },
  { id: 'ghost', name: 'Ghost', glyph: '👻' },
  { id: 'bot', name: 'Bot', glyph: '🤖' },
  { id: 'queen', name: 'Royal', glyph: '👸', premium: 'badge-supporter' },
];

export const DICE_SKINS: Cosmetic[] = [
  { id: 'ivory', name: 'Ivory', glyph: '⚀' },
  { id: 'ruby', name: 'Ruby', glyph: '🟥' },
  { id: 'midnight', name: 'Midnight', glyph: '⬛' },
  { id: 'gold', name: 'Gold', glyph: '🟨', premium: 'dice-gold' },
];

export interface BoardTheme {
  id: string;
  name: string;
  premium?: string;
}

/** CSS variables live in app.css under `[data-theme=...]`. */
export const THEMES: BoardTheme[] = [
  { id: 'night', name: 'Night (default)' },
  { id: 'classic', name: 'Daylight' },
  { id: 'midnight', name: 'Neon midnight', premium: 'theme-midnight' },
];

/** Eight high-contrast, colour-blind-friendlier player colours (also used for pawns and ownership). */
export const PLAYER_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#f97316',
  '#14b8a6',
  '#ec4899',
];

export function glyphFor(list: Cosmetic[], id: string, fallback = '●'): string {
  return list.find((c) => c.id === id)?.glyph ?? fallback;
}

export function isUnlocked(item: { premium?: string }, entitlements: string[]): boolean {
  return !item.premium || entitlements.includes(item.premium) || entitlements.includes('map-all');
}
