/**
 * Everything brand-specific lives here so the game can be renamed in one place.
 * (Also update index.html <title>/<meta> and vite.config.ts manifest name.)
 */
export const BRAND = {
  name: 'Bharat Tycoon',
  shortName: 'Tycoon',
  tagline: 'Every map is a real place.',
  domain: 'bharattycoon.example',
  supportEmail: 'hello@bharattycoon.example',
  /** Used in share text. */
  hashtag: '#BharatTycoon',
  /** Shown as the Luck/Treasure deck names when a map does not override them. */
  defaultDeckNames: { luck: 'Luck', treasure: 'Treasure' },
  version: '0.1.0',
};
