/**
 * Data-driven cosmetics. `premium` items need an entitlement id in the player's list (granted by the store).
 * Tokens/avatars are emoji so they ship with zero assets; swap `glyph` for an SVG path later.
 */
export interface Cosmetic {
  id: string;
  name: string;
  glyph: string;
  premium?: string; // entitlement id required
}

export const TOKENS: Cosmetic[] = [
  { id: 'auto', name: 'Auto-rickshaw', glyph: '🛺' },
  { id: 'bike', name: 'Motorbike', glyph: '🏍️' },
  { id: 'kite', name: 'Kite', glyph: '🪁' },
  { id: 'tabla', name: 'Tabla', glyph: '🥁' },
  { id: 'lotus', name: 'Lotus', glyph: '🪷' },
  { id: 'tiger', name: 'Tiger', glyph: '🐯' },
  { id: 'cricket', name: 'Cricket bat', glyph: '🏏' },
  { id: 'chai', name: 'Chai', glyph: '🫖' },
  { id: 'coin', name: 'Coin', glyph: '🪙' },
  { id: 'rocket', name: 'Rocket', glyph: '🚀' },
  { id: 'peacock', name: 'Peacock', glyph: '🦚', premium: 'token-peacock' },
  { id: 'elephant', name: 'Royal elephant', glyph: '🐘', premium: 'token-elephant' },
  { id: 'crown', name: 'Crown', glyph: '👑', premium: 'token-lotus' },
];

export const AVATARS: Cosmetic[] = [
  { id: 'tiger', name: 'Tiger', glyph: '🐯' },
  { id: 'fox', name: 'Fox', glyph: '🦊' },
  { id: 'panda', name: 'Panda', glyph: '🐼' },
  { id: 'cow', name: 'Cow', glyph: '🐮' },
  { id: 'monkey', name: 'Monkey', glyph: '🐵' },
  { id: 'owl', name: 'Owl', glyph: '🦉' },
  { id: 'parrot', name: 'Parrot', glyph: '🦜' },
  { id: 'camel', name: 'Camel', glyph: '🐪' },
  { id: 'cobra', name: 'Cobra', glyph: '🐍' },
  { id: 'peacock', name: 'Peacock', glyph: '🦚' },
  { id: 'ninja', name: 'Ninja', glyph: '🥷' },
  { id: 'astronaut', name: 'Astronaut', glyph: '🧑‍🚀' },
  { id: 'bot', name: 'Bot', glyph: '🤖' },
  { id: 'queen', name: 'Maharani', glyph: '👸', premium: 'badge-supporter' },
];

export const DICE_SKINS: Cosmetic[] = [
  { id: 'ivory', name: 'Ivory', glyph: '⚀' },
  { id: 'saffron', name: 'Saffron', glyph: '🟧' },
  { id: 'midnight', name: 'Midnight', glyph: '⬛' },
  { id: 'gold', name: 'Gold', glyph: '🟨', premium: 'dice-gold' },
];

export interface BoardTheme {
  id: string;
  name: string;
  premium?: string;
  vars: Record<string, string>;
}

export const THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Classic', vars: {} },
  {
    id: 'midnight',
    name: 'Midnight',
    premium: 'theme-midnight',
    vars: {
      '--board-bg': '#0f172a',
      '--tile-bg': '#1e293b',
      '--ink': '#f1f5f9',
      '--board-line': '#334155',
      '--panel': '#111827',
    },
  },
  {
    id: 'monsoon',
    name: 'Monsoon',
    vars: {
      '--board-bg': '#e0f2fe',
      '--tile-bg': '#f0f9ff',
      '--ink': '#0c4a6e',
      '--board-line': '#bae6fd',
      '--panel': '#ffffff',
    },
  },
];

export function glyphFor(list: Cosmetic[], id: string, fallback = '●'): string {
  return list.find((c) => c.id === id)?.glyph ?? fallback;
}

export function isUnlocked(item: { premium?: string }, entitlements: string[]): boolean {
  return !item.premium || entitlements.includes(item.premium) || entitlements.includes('map-all');
}
