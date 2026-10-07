/**
 * Everything brand-specific lives here so the game can be renamed in one place.
 * (Also update index.html <title>/<meta> and vite.config.ts manifest name.)
 */
export const BRAND = {
  name: 'Atlas Tycoon',
  shortName: 'Tycoon',
  tagline: 'Buy the world, one city at a time.',
  domain: 'atlastycoon.example',
  supportEmail: 'hello@atlastycoon.example',
  /** Used in share text. */
  hashtag: '#AtlasTycoon',
  /** Shown as the Luck/Treasure deck names when a map does not override them. */
  defaultDeckNames: { luck: 'Luck', treasure: 'Treasure' },
  version: '0.1.0',
};
