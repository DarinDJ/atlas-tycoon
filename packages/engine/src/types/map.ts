/**
 * Map definition format. A map is pure data: one file per map + optional assets.
 * Everything a client needs to render and everything the engine needs to play.
 */

export type LangCode = 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | (string & {});

export interface LocalizedText {
  name?: string;
  fact?: string;
  text?: string;
}

export interface TileBase {
  /** Stable id used by cards (e.g. "mumbai"). Unique within a map. */
  id: string;
  name: string;
  /** Emoji or short glyph shown on the tile. */
  emoji?: string;
  /** Short fun fact shown on the property card. */
  fact?: string;
  lat?: number;
  lng?: number;
  /** Optional path/URL for real artwork. Falls back to a generated gradient. */
  image?: string;
  i18n?: Partial<Record<LangCode, LocalizedText>>;
}

export interface PropertyTile extends TileBase {
  type: 'property';
  group: string;
  price: number;
  /** rent[0] = no houses, rent[1..4] = 1-4 houses, rent[5] = hotel */
  rent: [number, number, number, number, number, number];
  houseCost: number;
  /** Defaults to price / 2. */
  mortgage?: number;
}

export interface TransportTile extends TileBase {
  type: 'transport';
  price: number;
  /** Rent indexed by (number owned - 1). */
  rent: number[];
  mortgage?: number;
}

export interface UtilityTile extends TileBase {
  type: 'utility';
  price: number;
  /** Dice multiplier indexed by (number owned - 1). */
  multipliers: number[];
  mortgage?: number;
}

export interface TaxTile extends TileBase {
  type: 'tax';
  /** Flat amount. */
  amount: number;
  /** If set, player pays the LOWER of amount and percent of net worth. */
  percentOfNetWorth?: number;
}

export interface CardTile extends TileBase {
  type: 'luck' | 'treasure';
}

export interface StartTile extends TileBase {
  type: 'start';
}
export interface JailTile extends TileBase {
  type: 'jail';
}
export interface GoToJailTile extends TileBase {
  type: 'gotojail';
}
export interface FreeParkingTile extends TileBase {
  type: 'freeparking';
}

/** Map-specific special tile that applies a card-like effect on landing. */
export interface SpecialTile extends TileBase {
  type: 'special';
  effect: CardEffect;
  description: string;
}

export type Tile =
  | PropertyTile
  | TransportTile
  | UtilityTile
  | TaxTile
  | CardTile
  | StartTile
  | JailTile
  | GoToJailTile
  | FreeParkingTile
  | SpecialTile;

export type TileType = Tile['type'];
export type OwnableTile = PropertyTile | TransportTile | UtilityTile;

export type CardEffect =
  /** Positive = collect from bank, negative = pay bank (or jackpot). */
  | { kind: 'money'; amount: number }
  | { kind: 'moveTo'; tileId: string; collectSalary?: boolean }
  /** Negative steps move backwards. */
  | { kind: 'moveBy'; steps: number }
  | { kind: 'gotoJail' }
  | { kind: 'jailFree' }
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  /** Positive = collect from each other player, negative = pay each other player. */
  | { kind: 'eachPlayer'; amount: number }
  | { kind: 'nearest'; tileType: 'transport' | 'utility'; rentMultiplier?: number };

export interface Card {
  id: string;
  text: string;
  effect: CardEffect;
  i18n?: Partial<Record<LangCode, LocalizedText>>;
}

export interface PropertyGroup {
  id: string;
  name: string;
  /** Hex colour. */
  color: string;
  /** Short label used as a colour-blind-safe marker (e.g. "A", "B"). */
  marker?: string;
  i18n?: Partial<Record<LangCode, LocalizedText>>;
}

export interface CurrencyFormat {
  code: string;
  symbol: string;
  /**
   * plain: symbol + locale-grouped number (e.g. $1,500)
   * indian-lakh: amounts are stored in lakhs; 60 => ₹60 L, 150 => ₹1.5 Cr
   * compact: 1500 => $1.5K
   */
  style: 'plain' | 'indian-lakh' | 'compact';
  locale: string;
}

export interface MapTheme {
  primary: string;
  secondary: string;
  accent: string;
  boardBg: string;
  tileBg: string;
  text: string;
  /** Optional CSS gradient used for the board centre. */
  centerGradient?: string;
  /** Font family suggestion. */
  font?: string;
}

export interface MapEconomy {
  startingCash: number;
  salary: number;
  jailFine: number;
  auctionMinIncrement: number;
}

export interface MapAudio {
  /** Keys into the client's sound set; maps can point to custom files. */
  music?: string;
  dice?: string;
  ambient?: string;
}

export interface MapDefinition {
  /** Schema version. */
  schema: 1;
  id: string;
  name: string;
  tagline?: string;
  country: string;
  region?: string;
  flag?: string;
  /** Free maps are playable by guests; premium maps need an entitlement. */
  premium?: boolean;
  currency: CurrencyFormat;
  economy: MapEconomy;
  theme: MapTheme;
  audio?: MapAudio;
  groups: PropertyGroup[];
  tiles: Tile[];
  cards: {
    luck: Card[];
    treasure: Card[];
  };
  /** Display names for the card decks, e.g. "Luck" / "Treasure". */
  deckNames?: { luck: string; treasure: string };
  i18n?: Partial<
    Record<LangCode, { name?: string; tagline?: string; deckNames?: { luck: string; treasure: string } }>
  >;
  /** SEO text for the landing page. */
  seo?: { title?: string; description?: string; keywords?: string[] };
}

export function isOwnable(tile: Tile): tile is OwnableTile {
  return tile.type === 'property' || tile.type === 'transport' || tile.type === 'utility';
}

export function mortgageValue(tile: OwnableTile): number {
  return tile.mortgage ?? Math.floor(tile.price / 2);
}
