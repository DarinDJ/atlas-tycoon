/**
 * Bot AI. Pure function of (state, map, playerId, level) -> action | null.
 * Randomness is derived from state.seq + playerId so replays are deterministic.
 */
import type { PlayerAction } from '../types/actions.js';
import type { MapDefinition, OwnableTile, PropertyTile } from '../types/map.js';
import { isOwnable, mortgageValue } from '../types/map.js';
import type { GameState, TradeOffer, TradeSide } from '../types/state.js';
import type { BotLevel } from '../types/rules.js';
import * as C from '../engine/checks.js';
import { findPlayer, groupTiles, ownedTiles, unmortgageCost } from '../engine/helpers.js';
import { legalActions } from '../engine/queries.js';
import { seedFromString } from '../rng.js';

function botRandom(state: GameState, playerId: string, salt = 0): number {
  const h = seedFromString(`${state.seq}:${playerId}:${salt}:${state.rng.count}`);
  return (h % 10_000) / 10_000;
}

interface Profile {
  /** Cash the bot tries to keep in hand (multiple of salary). */
  reserveSalaries: number;
  /** Max fraction of list price to pay at auction for a plain property. */
  auctionCap: number;
  /** Probability to buy a plain property it can afford. */
  buyChance: number;
  builds: boolean;
  trades: boolean;
  /** Minimum net gain (fraction of value given) to accept a trade. */
  tradeAcceptMargin: number;
  smartJail: boolean;
}

const PROFILES: Record<BotLevel, Profile> = {
  easy: {
    reserveSalaries: 0.5,
    auctionCap: 0.6,
    buyChance: 0.65,
    builds: true,
    trades: false,
    tradeAcceptMargin: 0.4,
    smartJail: false,
  },
  medium: {
    reserveSalaries: 1,
    auctionCap: 1.0,
    buyChance: 0.9,
    builds: true,
    trades: true,
    tradeAcceptMargin: 0.15,
    smartJail: true,
  },
  hard: {
    reserveSalaries: 1.25,
    auctionCap: 1.35,
    buyChance: 1,
    builds: true,
    trades: true,
    tradeAcceptMargin: 0.0,
    smartJail: true,
  },
};

/** How much a tile is worth to a given player, in cash terms. */
export function valueOf(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  idx: number,
  level: BotLevel,
): number {
  const tile = map.tiles[idx];
  if (!tile || !isOwnable(tile)) return 0;
  let v = tile.price;
  const own = state.ownership[idx];
  if (own?.mortgaged) v -= unmortgageCost(state, tile);
  if (level === 'easy') return v;
  if (tile.type === 'property') {
    const group = groupTiles(map, tile.group);
    const mine = group.filter((i) => i !== idx && state.ownership[i]?.owner === playerId).length;
    const others = group.filter(
      (i) => i !== idx && state.ownership[i] && state.ownership[i]!.owner !== playerId,
    );
    const completes = mine === group.length - 1;
    if (completes) v *= level === 'hard' ? 2.2 : 1.6;
    else if (mine > 0) v *= 1.3;
    // Blocking value: an opponent owns the rest of the set.
    const opp = others[0] ? state.ownership[others[0]]!.owner : null;
    if (opp && others.length === group.length - 1 && others.every((i) => state.ownership[i]!.owner === opp))
      v *= 1.5;
    // Houses already on it.
    v += (own?.houses ?? 0) * tile.houseCost * 0.8;
  } else if (tile.type === 'transport') {
    const mine = ownedTiles(state, playerId).filter(
      (i) => map.tiles[i]!.type === 'transport' && i !== idx,
    ).length;
    v *= 1 + mine * 0.25;
  } else {
    const mine = ownedTiles(state, playerId).filter(
      (i) => map.tiles[i]!.type === 'utility' && i !== idx,
    ).length;
    v *= 1 + mine * 0.3;
  }
  return Math.round(v);
}

function sideValue(
  state: GameState,
  map: MapDefinition,
  forPlayer: string,
  side: TradeSide,
  level: BotLevel,
): number {
  let v = side.cash + side.jailCards * state.rules.jailFine;
  for (const idx of side.properties) v += valueOf(state, map, forPlayer, idx, level);
  return v;
}

function reserve(state: GameState, profile: Profile): number {
  return Math.round(state.rules.salary * profile.reserveSalaries);
}

/** Decide the next action for a bot. Returns null when the bot has nothing to do. */
export function botDecide(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  levelIn?: BotLevel,
): PlayerAction | null {
  const p = findPlayer(state, playerId);
  if (p.bankrupt || state.status !== 'playing') return null;
  const level: BotLevel = levelIn ?? p.botLevel ?? 'medium';
  const profile = PROFILES[level];
  const la = legalActions(state, map, playerId);
  const rnd = (salt: number) => botRandom(state, playerId, salt);

  // 1. Respond to trades addressed to me.
  const incoming = state.trades.find((t) => t.status === 'pending' && t.to === playerId);
  if (incoming) return respondToTrade(state, map, playerId, incoming, level, profile);

  // 2. Debt: liquidate or go bankrupt.
  if (state.phase === 'debt' && C.isDebtor(state, playerId)) {
    const owed = state.debts.filter((d) => d.debtor === playerId).reduce((a, d) => a + d.amount, 0);
    if (p.cash >= owed) return null; // engine settles automatically
    if (la.sellHouse.length > 0) {
      const best = [...la.sellHouse].sort(
        (a, b) => valueOf(state, map, playerId, a, level) - valueOf(state, map, playerId, b, level),
      )[0]!;
      return { type: 'sellHouse', playerId, tile: best };
    }
    if (la.mortgage.length > 0) {
      const best = [...la.mortgage].sort(
        (a, b) => valueOf(state, map, playerId, a, level) - valueOf(state, map, playerId, b, level),
      )[0]!;
      return { type: 'mortgage', playerId, tile: best };
    }
    if (la.declareBankrupt) return { type: 'declareBankrupt', playerId };
    return null;
  }

  // 3. Auction.
  if (state.phase === 'auction' && state.auction) {
    if (la.bid) {
      const idx = state.auction.tile;
      const tile = map.tiles[idx] as OwnableTile;
      const cap = Math.min(
        p.cash - reserve(state, profile) * 0.5,
        valueOf(state, map, playerId, idx, level) * profile.auctionCap,
      );
      const jitter = level === 'easy' ? rnd(1) * 0.3 : rnd(1) * 0.1;
      const myCap = Math.floor(cap * (1 - jitter));
      const bid = Math.min(
        la.bid.max,
        Math.max(la.bid.min, Math.min(myCap, la.bid.min + Math.ceil(tile.price * 0.05))),
      );
      if (bid >= la.bid.min && bid <= myCap && bid <= la.bid.max)
        return { type: 'bid', playerId, amount: bid };
    }
    if (la.passBid) return { type: 'passBid', playerId };
    return null;
  }

  if (!C.isCurrent(state, playerId)) return null;

  // 4. My turn.
  switch (state.phase) {
    case 'preRoll': {
      if (p.inJail) {
        if (la.useJailCard) return { type: 'useJailCard', playerId };
        if (profile.smartJail && la.payJail) {
          // Early game: get out and buy. Late game (board mostly owned): stay in jail.
          const owned = Object.keys(state.ownership).length;
          const ownable = map.tiles.filter(isOwnable).length;
          const lateGame = owned / ownable > 0.7;
          if (!lateGame && p.cash > state.rules.jailFine + reserve(state, profile))
            return { type: 'payJail', playerId };
        }
      }
      // Build before rolling when flush.
      const build = chooseBuild(state, map, playerId, la.build, profile, level);
      if (build !== null) return { type: 'build', playerId, tile: build };
      const unm = chooseUnmortgage(state, map, playerId, la.unmortgage, profile);
      if (unm !== null) return { type: 'unmortgage', playerId, tile: unm };
      if (la.roll) return { type: 'roll', playerId };
      return null;
    }
    case 'awaitBuy': {
      const idx = state.pendingBuy!;
      const tile = map.tiles[idx] as OwnableTile;
      if (la.buy) {
        const v = valueOf(state, map, playerId, idx, level);
        const after = p.cash - tile.price;
        const want = v >= tile.price && after >= reserve(state, profile) * (level === 'hard' ? 0.6 : 1);
        const cheapAlways = after >= reserve(state, profile) * 2;
        if ((want || cheapAlways) && rnd(2) < profile.buyChance) return { type: 'buy', playerId };
        if (level === 'hard' && v > tile.price * 1.4 && after >= 0) return { type: 'buy', playerId };
      }
      if (la.declineBuy) return { type: 'declineBuy', playerId };
      return null;
    }
    case 'postRoll': {
      const build = chooseBuild(state, map, playerId, la.build, profile, level);
      if (build !== null) return { type: 'build', playerId, tile: build };
      const unm = chooseUnmortgage(state, map, playerId, la.unmortgage, profile);
      if (unm !== null) return { type: 'unmortgage', playerId, tile: unm };
      if (profile.trades && la.trade) {
        const t = proposeTrade(state, map, playerId, level);
        if (t) return t;
      }
      if (la.endTurn) return { type: 'endTurn', playerId };
      return null;
    }
    default:
      return null;
  }
}

function chooseBuild(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  options: number[],
  profile: Profile,
  level: BotLevel,
): number | null {
  if (!profile.builds || options.length === 0) return null;
  const p = findPlayer(state, playerId);
  // Score each option by rent gain per cost.
  let best: number | null = null;
  let bestScore = 0;
  for (const idx of options) {
    const tile = map.tiles[idx] as PropertyTile;
    const houses = state.ownership[idx]!.houses;
    if (p.cash - tile.houseCost < reserve(state, profile)) continue;
    const gain =
      (tile.rent[houses + 1] ?? tile.rent[5]) - (houses === 0 ? tile.rent[0] * 2 : tile.rent[houses]!);
    let score = gain / tile.houseCost;
    if (level !== 'easy' && houses < 3) score *= 1.3; // 3 houses is the sweet spot
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function chooseUnmortgage(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  options: number[],
  profile: Profile,
): number | null {
  const p = findPlayer(state, playerId);
  for (const idx of options) {
    const tile = map.tiles[idx] as OwnableTile;
    const cost = unmortgageCost(state, tile);
    if (p.cash - cost >= reserve(state, profile) * 2) return idx;
  }
  return null;
}

/** 0 early in the game, rising to 1 once the game has dragged on (bots get more willing to deal). */
function urgency(state: GameState): number {
  const n = Math.max(2, state.players.filter((p) => !p.bankrupt).length);
  const start = 35 * n;
  const span = 60 * n;
  return Math.max(0, Math.min(1, (state.turn - start) / span));
}

/** Would `pid` own the complete group of `tile` after receiving `tiles`? */
function completesSet(state: GameState, map: MapDefinition, pid: string, tiles: number[]): boolean {
  for (const idx of tiles) {
    const t = map.tiles[idx];
    if (!t || t.type !== 'property') continue;
    const group = groupTiles(map, t.group);
    if (group.every((i) => tiles.includes(i) || state.ownership[i]?.owner === pid)) return true;
  }
  return false;
}

function respondToTrade(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  t: TradeOffer,
  level: BotLevel,
  profile: Profile,
): PlayerAction {
  const p = findPlayer(state, playerId);
  const other = findPlayer(state, t.from);
  if (t.request.cash > p.cash - reserve(state, profile) * 0.5)
    return { type: 'declineTrade', playerId, tradeId: t.id };
  // What I receive vs what I give, valued from my perspective.
  const gain = sideValue(state, map, playerId, t.offer, level);
  const give = sideValue(state, map, playerId, t.request, level);
  if (give <= 0) return { type: 'acceptTrade', playerId, tradeId: t.id };
  const theySet = completesSet(state, map, t.from, t.request.properties);
  const iSet = completesSet(state, map, playerId, t.offer.properties);
  const u = urgency(state);
  const myWorth = netWorthOf(state, map, playerId);
  const theirWorth = netWorthOf(state, map, t.from);
  const behind = myWorth < theirWorth * 0.5;
  let required = level === 'hard' ? 1.2 : level === 'medium' ? 1.1 : 1.0;
  if (theySet) required += level === 'hard' ? 0.45 : level === 'medium' ? 0.3 : 0.1;
  if (iSet) required -= 0.3;
  required -= u * 0.35;
  if (behind && t.offer.cash >= give) required -= 0.2;
  required = Math.max(0.85, required);
  const ratio = gain / give;
  if (ratio >= required) return { type: 'acceptTrade', playerId, tradeId: t.id };
  if (level !== 'easy' && !t.counterOf && gain > 0) {
    // Counter: ask for the cash that would make it worth it.
    const shortfall = Math.ceil(give * required - gain);
    if (shortfall > 0 && t.offer.cash + shortfall <= other.cash) {
      return {
        type: 'counterTrade',
        playerId,
        tradeId: t.id,
        offer: t.request,
        request: { ...t.offer, cash: t.offer.cash + shortfall },
      };
    }
  }
  return { type: 'declineTrade', playerId, tradeId: t.id };
}

function netWorthOf(state: GameState, map: MapDefinition, pid: string): number {
  const p = findPlayer(state, pid);
  let total = p.cash;
  for (const i of ownedTiles(state, pid)) {
    const t = map.tiles[i]!;
    if (!isOwnable(t)) continue;
    total += state.ownership[i]!.mortgaged ? mortgageValue(t) : t.price;
    if (t.type === 'property') total += state.ownership[i]!.houses * t.houseCost;
  }
  return total;
}

/**
 * Look for a colour set the bot is one or two tiles short of (all held by other players) and offer
 * cash, optionally sweetened with a spare property the other side has a partial set in.
 */
function proposeTrade(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  level: BotLevel,
): PlayerAction | null {
  if (state.trades.some((t) => t.status === 'pending' && t.from === playerId)) return null;
  const u = urgency(state);
  const cooldown = Math.max(2, Math.round((level === 'hard' ? 5 : 9) * (1 - u * 0.6)));
  if (state.trades.some((t) => t.from === playerId && state.turn - t.createdTurn < cooldown)) return null;
  const p = findPlayer(state, playerId);
  const mult = (level === 'hard' ? 1.5 : 1.3) + u * 0.6;

  interface Candidate {
    missing: number;
    owner: string;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (const g of map.groups) {
    const tiles = groupTiles(map, g.id);
    const mine = tiles.filter((i) => state.ownership[i]?.owner === playerId);
    if (mine.length === 0 || mine.length === tiles.length) continue;
    const missing = tiles.filter((i) => state.ownership[i]?.owner !== playerId);
    if (missing.length > 2) continue;
    if (missing.some((i) => !state.ownership[i])) continue; // still buyable from the bank
    if (tiles.some((i) => (state.ownership[i]?.houses ?? 0) > 0)) continue;
    for (const m of missing) {
      const owner = state.ownership[m]!.owner;
      const op = findPlayer(state, owner);
      if (op.bankrupt) continue;
      // Recently declined by this player? Back off for a while.
      const declined = state.trades.some(
        (t) =>
          t.from === playerId &&
          t.to === owner &&
          t.status === 'declined' &&
          state.turn - t.createdTurn < 20 * (1 - u),
      );
      if (declined) continue;
      const tile = map.tiles[m] as PropertyTile;
      const score =
        (tile.price * (missing.length === 1 ? 2 : 1)) / (1 + mine.length === tiles.length - 1 ? 1 : 2);
      candidates.push({ missing: m, owner, score });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const tile = map.tiles[c.missing] as PropertyTile;
    const other = findPlayer(state, c.owner);
    const offer: TradeSide = { cash: 0, properties: [], jailCards: 0 };
    let cash = Math.round(tile.price * mult);
    // Sweetener: a lone property of mine in a group where they already hold something.
    const spare = ownedTiles(state, playerId).find((i) => {
      const t = map.tiles[i]!;
      if (!isOwnable(t) || state.ownership[i]!.mortgaged) return false;
      if (t.type !== 'property') return false;
      const gt = groupTiles(map, t.group);
      const mineInGroup = gt.filter((k) => state.ownership[k]?.owner === playerId).length;
      if (mineInGroup !== 1) return false;
      const theirs = gt.filter((k) => state.ownership[k]?.owner === other.id).length;
      if (theirs === 0) return false;
      // Don't hand them a complete set unless we are desperate.
      if (theirs === gt.length - 1 && u < 0.5) return false;
      return gt.every((k) => (state.ownership[k]?.houses ?? 0) === 0);
    });
    if (spare !== undefined) {
      offer.properties.push(spare);
      cash = Math.max(0, Math.round(cash - (map.tiles[spare] as PropertyTile).price * 0.9));
    }
    offer.cash = Math.min(cash, Math.max(0, p.cash - state.rules.salary));
    if (offer.cash + offer.properties.length === 0) continue;
    if (offer.properties.length === 0 && offer.cash < tile.price * 1.05) continue;
    const request: TradeSide = { cash: 0, properties: [c.missing], jailCards: 0 };
    if (C.checkProposeTrade(state, map, playerId, other.id, offer, request)) continue;
    return { type: 'proposeTrade', playerId, to: other.id, offer, request };
  }
  return null;
}

export { PROFILES as BOT_PROFILES };
export { mortgageValue };
