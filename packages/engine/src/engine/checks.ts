/**
 * Pure legality checks shared by the reducer (which throws) and the UI/bots (which query).
 * Each returns an error code string, or null when the action is allowed.
 */
import type { MapDefinition } from '../types/map.js';
import { isOwnable, mortgageValue } from '../types/map.js';
import type { GameState, TradeSide } from '../types/state.js';
import {
  buildingSupplyUsed,
  findPlayer,
  groupTiles,
  housesInGroup,
  ownsFullGroup,
  tileAt,
  unmortgageCost,
} from './helpers.js';

export function isCurrent(state: GameState, playerId: string): boolean {
  return state.players[state.current]?.id === playerId;
}

export function isDebtor(state: GameState, playerId: string): boolean {
  return state.debts.some((d) => d.debtor === playerId);
}

function playerActive(state: GameState, playerId: string): string | null {
  if (state.status !== 'playing') return 'GAME_OVER';
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 'NO_PLAYER';
  if (p.bankrupt) return 'BANKRUPT';
  return null;
}

/** Build/mortgage/trade may happen any time if the rule allows, else only on your turn between rolls. */
function canManage(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (state.phase === 'ended') return 'GAME_OVER';
  if (!state.rules.actionsAnytime) {
    if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
    if (state.phase !== 'preRoll' && state.phase !== 'postRoll' && state.phase !== 'debt') return 'BAD_PHASE';
  }
  return null;
}

export function checkRoll(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'preRoll') return 'BAD_PHASE';
  return null;
}

export function checkBuy(state: GameState, map: MapDefinition, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'awaitBuy' || state.pendingBuy === null) return 'BAD_PHASE';
  const tile = tileAt(map, state.pendingBuy);
  if (!isOwnable(tile)) return 'NOT_OWNABLE';
  if (findPlayer(state, playerId).cash < tile.price) return 'NO_CASH';
  return null;
}

export function checkDeclineBuy(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'awaitBuy') return 'BAD_PHASE';
  return null;
}

export function minBid(state: GameState): number {
  const a = state.auction;
  if (!a) return 0;
  return a.highBid === 0 ? state.rules.auctionMinIncrement : a.highBid + state.rules.auctionMinIncrement;
}

export function checkBid(state: GameState, playerId: string, amount: number): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (state.phase !== 'auction' || !state.auction) return 'BAD_PHASE';
  const a = state.auction;
  if (!a.active.includes(playerId)) return 'NOT_PARTICIPANT';
  if (a.passed.includes(playerId)) return 'ALREADY_PASSED';
  if (a.highBidder === playerId) return 'ALREADY_HIGH';
  if (!Number.isInteger(amount) || amount < minBid(state)) return 'BID_TOO_LOW';
  if (amount > findPlayer(state, playerId).cash) return 'NO_CASH';
  return null;
}

export function checkPassBid(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (state.phase !== 'auction' || !state.auction) return 'BAD_PHASE';
  const a = state.auction;
  if (!a.active.includes(playerId)) return 'NOT_PARTICIPANT';
  if (a.passed.includes(playerId)) return 'ALREADY_PASSED';
  if (a.highBidder === playerId) return 'ALREADY_HIGH';
  return null;
}

export function checkBuild(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  idx: number,
): string | null {
  const e = canManage(state, playerId);
  if (e) return e;
  if (isDebtor(state, playerId)) return 'IN_DEBT';
  const tile = map.tiles[idx];
  if (!tile || tile.type !== 'property') return 'NOT_PROPERTY';
  const own = state.ownership[idx];
  if (!own || own.owner !== playerId) return 'NOT_OWNER';
  if (!ownsFullGroup(state, map, playerId, tile.group)) return 'NEED_FULL_SET';
  const group = groupTiles(map, tile.group);
  if (group.some((i) => state.ownership[i]?.mortgaged)) return 'GROUP_MORTGAGED';
  if (own.houses >= 5) return 'MAX_BUILT';
  if (state.rules.evenBuild) {
    const min = Math.min(...housesInGroup(state, map, tile.group));
    if (own.houses > min) return 'EVEN_BUILD';
  }
  const supply = buildingSupplyUsed(state);
  if (own.houses === 4) {
    if (state.rules.hotelLimit !== null && supply.hotels >= state.rules.hotelLimit) return 'NO_HOTELS';
  } else if (state.rules.houseLimit !== null && supply.houses >= state.rules.houseLimit) return 'NO_HOUSES';
  if (findPlayer(state, playerId).cash < tile.houseCost) return 'NO_CASH';
  return null;
}

export function checkSellHouse(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  idx: number,
): string | null {
  const e = canManage(state, playerId);
  if (e) return e;
  const tile = map.tiles[idx];
  if (!tile || tile.type !== 'property') return 'NOT_PROPERTY';
  const own = state.ownership[idx];
  if (!own || own.owner !== playerId) return 'NOT_OWNER';
  if (own.houses <= 0) return 'NO_HOUSES';
  if (state.rules.evenBuild) {
    const max = Math.max(...housesInGroup(state, map, tile.group));
    if (own.houses < max) return 'EVEN_SELL';
  }
  return null;
}

export function checkMortgage(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  idx: number,
): string | null {
  const e = canManage(state, playerId);
  if (e) return e;
  const tile = map.tiles[idx];
  if (!tile || !isOwnable(tile)) return 'NOT_OWNABLE';
  const own = state.ownership[idx];
  if (!own || own.owner !== playerId) return 'NOT_OWNER';
  if (own.mortgaged) return 'ALREADY_MORTGAGED';
  if (tile.type === 'property') {
    const group = groupTiles(map, tile.group);
    if (group.some((i) => (state.ownership[i]?.houses ?? 0) > 0)) return 'GROUP_HAS_HOUSES';
  }
  return null;
}

export function checkUnmortgage(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  idx: number,
): string | null {
  const e = canManage(state, playerId);
  if (e) return e;
  if (isDebtor(state, playerId)) return 'IN_DEBT';
  const tile = map.tiles[idx];
  if (!tile || !isOwnable(tile)) return 'NOT_OWNABLE';
  const own = state.ownership[idx];
  if (!own || own.owner !== playerId) return 'NOT_OWNER';
  if (!own.mortgaged) return 'NOT_MORTGAGED';
  if (findPlayer(state, playerId).cash < unmortgageCost(state, tile)) return 'NO_CASH';
  return null;
}

export function checkPayJail(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'preRoll') return 'BAD_PHASE';
  const p = findPlayer(state, playerId);
  if (!p.inJail) return 'NOT_IN_JAIL';
  if (p.cash < state.rules.jailFine) return 'NO_CASH';
  return null;
}

export function checkUseJailCard(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'preRoll') return 'BAD_PHASE';
  const p = findPlayer(state, playerId);
  if (!p.inJail) return 'NOT_IN_JAIL';
  if (p.jailCards <= 0) return 'NO_CARD';
  return null;
}

export function checkEndTurn(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (!isCurrent(state, playerId)) return 'NOT_YOUR_TURN';
  if (state.phase !== 'postRoll') return 'BAD_PHASE';
  return null;
}

export function checkTradeSide(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  side: TradeSide,
): string | null {
  const p = findPlayer(state, playerId);
  if (!Number.isInteger(side.cash) || side.cash < 0) return 'BAD_CASH';
  if (side.cash > p.cash) return 'NO_CASH';
  if (!Number.isInteger(side.jailCards) || side.jailCards < 0 || side.jailCards > p.jailCards)
    return 'NO_CARD';
  if (new Set(side.properties).size !== side.properties.length) return 'DUPLICATE_PROPERTY';
  for (const idx of side.properties) {
    const tile = map.tiles[idx];
    if (!tile || !isOwnable(tile)) return 'NOT_OWNABLE';
    const own = state.ownership[idx];
    if (!own || own.owner !== playerId) return 'NOT_OWNER';
    if (tile.type === 'property') {
      const group = groupTiles(map, tile.group);
      if (group.some((i) => (state.ownership[i]?.houses ?? 0) > 0)) return 'GROUP_HAS_HOUSES';
    }
  }
  return null;
}

export function checkProposeTrade(
  state: GameState,
  map: MapDefinition,
  from: string,
  to: string,
  offer: TradeSide,
  request: TradeSide,
): string | null {
  const e = canManage(state, from);
  if (e) return e;
  if (from === to) return 'SELF_TRADE';
  const other = playerActive(state, to);
  if (other) return other;
  const empty = (s: TradeSide) => s.cash === 0 && s.properties.length === 0 && s.jailCards === 0;
  if (empty(offer) && empty(request)) return 'EMPTY_TRADE';
  const e1 = checkTradeSide(state, map, from, offer);
  if (e1) return e1;
  const e2 = checkTradeSide(state, map, to, request);
  if (e2) return e2;
  return null;
}

export function tradeStillValid(state: GameState, map: MapDefinition, tradeId: string): string | null {
  const t = state.trades.find((x) => x.id === tradeId);
  if (!t) return 'NO_TRADE';
  if (t.status !== 'pending') return 'TRADE_CLOSED';
  return checkProposeTrade(state, map, t.from, t.to, t.offer, t.request);
}

export function checkDeclareBankrupt(state: GameState, playerId: string): string | null {
  const e = playerActive(state, playerId);
  if (e) return e;
  if (state.phase !== 'debt' || !isDebtor(state, playerId)) return 'NOT_IN_DEBT';
  return null;
}

export function checkResign(state: GameState, playerId: string): string | null {
  return playerActive(state, playerId);
}

export function mortgageValueOf(map: MapDefinition, idx: number): number {
  const t = tileAt(map, idx);
  return isOwnable(t) ? mortgageValue(t) : 0;
}
