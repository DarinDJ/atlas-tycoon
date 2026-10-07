import type { HouseRules, BotLevel } from './rules.js';
import type { GameEvent } from './events.js';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  /** Cosmetic token id. */
  token: string;
  /** Player colour (hex) for badges and ownership markers. */
  color: string;
  seat: number;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  /** Turn number on which this player went bankrupt (for rankings). */
  bankruptOnTurn?: number;
}

export interface OwnedProperty {
  owner: string;
  /** 0-4 houses, 5 = hotel. */
  houses: number;
  mortgaged: boolean;
}

export interface TradeSide {
  cash: number;
  /** Tile indices. */
  properties: number[];
  jailCards: number;
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'countered' | 'expired';

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  offer: TradeSide;
  request: TradeSide;
  status: TradeStatus;
  createdTurn: number;
  /** Id of the trade this one countered, if any. */
  counterOf?: string;
}

export interface AuctionState {
  tile: number;
  highBid: number;
  highBidder: string | null;
  /** Players still allowed to bid. */
  active: string[];
  passed: string[];
  /** Phase to resume after the auction. */
  resume: ResumePhase;
  /** Reason: a player declined to buy, or bankruptcy liquidation. */
  reason: 'declined' | 'bankruptcy';
}

export interface Debt {
  debtor: string;
  /** null = bank. */
  creditor: string | null;
  amount: number;
  reason: string;
}

export type Phase = 'preRoll' | 'awaitBuy' | 'auction' | 'debt' | 'postRoll' | 'ended';
export type ResumePhase = 'preRoll' | 'postRoll';

export interface DeckState {
  draw: number[];
  discard: number[];
  /** Card indices held by players (jail-free cards). */
  held: number[];
}

export interface RngState {
  seed: number;
  count: number;
}

export interface GameStats {
  rolls: number;
  rentPaid: number;
  propertiesBought: number;
  housesBuilt: number;
  auctions: number;
  tradesCompleted: number;
}

export interface LogEntry {
  seq: number;
  turn: number;
  event: GameEvent;
}

export interface GameState {
  version: 1;
  mapId: string;
  rules: HouseRules;
  rng: RngState;
  players: Player[];
  ownership: Record<number, OwnedProperty>;
  /** Index into players of the current player. */
  current: number;
  phase: Phase;
  /** Phase to return to after debt resolution. */
  resumeAfterDebt: ResumePhase;
  dice: [number, number] | null;
  /** Consecutive doubles this turn. */
  doubles: number;
  rolledDoubles: boolean;
  /** Set when the current player has rolled at least once this turn. */
  hasRolled: boolean;
  turn: number;
  decks: { luck: DeckState; treasure: DeckState };
  auction: AuctionState | null;
  /** Queue of auction tiles still to be auctioned (bankruptcy liquidation). */
  auctionQueue: number[];
  trades: TradeOffer[];
  debts: Debt[];
  freeParkingPot: number;
  pendingBuy: number | null;
  status: 'playing' | 'ended';
  winner: string | null;
  /** Finishing order, winner first. */
  ranking: string[];
  startedAt: number;
  endedAt: number | null;
  /** Elapsed game time in ms (server-driven for timed mode). */
  elapsedMs: number;
  stats: GameStats;
  /** Last N events, for late joiners / reconnects. */
  log: LogEntry[];
  /** Monotonic counter, incremented on every applied action. */
  seq: number;
}
