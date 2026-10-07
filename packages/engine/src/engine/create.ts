import type { MapDefinition } from '../types/map.js';
import { DEFAULT_RULES, type BotLevel, type HouseRules } from '../types/rules.js';
import type { GameState, Player } from '../types/state.js';
import { shuffle } from '../rng.js';

export interface SeatInput {
  id: string;
  name: string;
  avatar: string;
  token: string;
  color: string;
  isBot?: boolean;
  botLevel?: BotLevel;
}

/** Combine engine defaults, the map's economy, and room overrides. */
export function resolveRules(map: MapDefinition, overrides: Partial<HouseRules> = {}): HouseRules {
  const rules: HouseRules = {
    ...DEFAULT_RULES,
    startingCash: map.economy.startingCash,
    salary: map.economy.salary,
    jailFine: map.economy.jailFine,
    auctionMinIncrement: map.economy.auctionMinIncrement,
    ...overrides,
  };
  rules.maxPlayers = Math.min(8, Math.max(2, rules.maxPlayers));
  return rules;
}

export function createGame(
  map: MapDefinition,
  seats: SeatInput[],
  overrides: Partial<HouseRules> = {},
  seed: number = Date.now() >>> 0,
  now: number = Date.now(),
): GameState {
  if (seats.length < 2) throw new Error('Need at least 2 players');
  const rules = resolveRules(map, overrides);
  if (seats.length > rules.maxPlayers) throw new Error('Too many players');
  const rng = { seed: seed >>> 0, count: 0 };
  const ordered = rules.randomizeTurnOrder ? shuffle(rng, seats) : seats.slice();
  const players: Player[] = ordered.map((s, i) => ({
    id: s.id,
    name: s.name,
    avatar: s.avatar,
    token: s.token,
    color: s.color,
    seat: i,
    cash: rules.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    isBot: !!s.isBot,
    botLevel: s.isBot ? (s.botLevel ?? 'medium') : undefined,
    connected: true,
  }));
  const luck = shuffle(
    rng,
    map.cards.luck.map((_, i) => i),
  );
  const treasure = shuffle(
    rng,
    map.cards.treasure.map((_, i) => i),
  );
  const state: GameState = {
    version: 1,
    mapId: map.id,
    rules,
    rng,
    players,
    ownership: {},
    current: 0,
    phase: 'preRoll',
    resumeAfterDebt: 'postRoll',
    dice: null,
    doubles: 0,
    rolledDoubles: false,
    hasRolled: false,
    turn: 1,
    decks: {
      luck: { draw: luck, discard: [], held: [] },
      treasure: { draw: treasure, discard: [], held: [] },
    },
    auction: null,
    auctionQueue: [],
    trades: [],
    debts: [],
    freeParkingPot: 0,
    pendingBuy: null,
    status: 'playing',
    winner: null,
    ranking: [],
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    stats: { rolls: 0, rentPaid: 0, propertiesBought: 0, housesBuilt: 0, auctions: 0, tradesCompleted: 0 },
    log: [],
    seq: 0,
  };
  state.log.push({ seq: 0, turn: 1, event: { type: 'gameStarted', order: players.map((p) => p.id) } });
  state.log.push({ seq: 0, turn: 1, event: { type: 'turnStarted', playerId: players[0]!.id, turn: 1 } });
  return state;
}
