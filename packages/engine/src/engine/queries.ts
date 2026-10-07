import type { MapDefinition } from '../types/map.js';
import type { GameState } from '../types/state.js';
import * as C from './checks.js';
import { findPlayer, netWorth, ownedTiles } from './helpers.js';

export interface LegalActions {
  roll: boolean;
  buy: boolean;
  declineBuy: boolean;
  /** Null when the player cannot bid. */
  bid: { min: number; max: number } | null;
  passBid: boolean;
  payJail: boolean;
  useJailCard: boolean;
  endTurn: boolean;
  build: number[];
  sellHouse: number[];
  mortgage: number[];
  unmortgage: number[];
  trade: boolean;
  declareBankrupt: boolean;
  resign: boolean;
  /** True if this player must act before the game can continue. */
  mustAct: boolean;
}

/** Everything a player may do right now. Used by the UI to enable buttons and by bots. */
export function legalActions(state: GameState, map: MapDefinition, playerId: string): LegalActions {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.bankrupt || state.status !== 'playing') {
    return {
      roll: false,
      buy: false,
      declineBuy: false,
      bid: null,
      passBid: false,
      payJail: false,
      useJailCard: false,
      endTurn: false,
      build: [],
      sellHouse: [],
      mortgage: [],
      unmortgage: [],
      trade: false,
      declareBankrupt: false,
      resign: false,
      mustAct: false,
    };
  }
  const owned = ownedTiles(state, playerId);
  const canBid = !C.checkBid(state, playerId, C.minBid(state));
  const la: LegalActions = {
    roll: !C.checkRoll(state, playerId),
    buy: !C.checkBuy(state, map, playerId),
    declineBuy: !C.checkDeclineBuy(state, playerId),
    bid: canBid ? { min: C.minBid(state), max: p.cash } : null,
    passBid: !C.checkPassBid(state, playerId),
    payJail: !C.checkPayJail(state, playerId),
    useJailCard: !C.checkUseJailCard(state, playerId),
    endTurn: !C.checkEndTurn(state, playerId),
    build: owned.filter((i) => !C.checkBuild(state, map, playerId, i)),
    sellHouse: owned.filter((i) => !C.checkSellHouse(state, map, playerId, i)),
    mortgage: owned.filter((i) => !C.checkMortgage(state, map, playerId, i)),
    unmortgage: owned.filter((i) => !C.checkUnmortgage(state, map, playerId, i)),
    trade: state.rules.actionsAnytime || (C.isCurrent(state, playerId) && state.phase !== 'auction'),
    declareBankrupt: !C.checkDeclareBankrupt(state, playerId),
    resign: !C.checkResign(state, playerId),
    mustAct: false,
  };
  la.mustAct =
    la.roll ||
    la.buy ||
    la.declineBuy ||
    la.passBid ||
    la.endTurn ||
    la.declareBankrupt ||
    (state.phase === 'preRoll' && C.isCurrent(state, playerId));
  return la;
}

/** Players whose input the game is currently waiting on. */
export function waitingOn(state: GameState): string[] {
  if (state.status !== 'playing') return [];
  switch (state.phase) {
    case 'auction': {
      const a = state.auction!;
      return a.active.filter(
        (id) => !a.passed.includes(id) && a.highBidder !== id && !findPlayer(state, id).bankrupt,
      );
    }
    case 'debt':
      return [...new Set(state.debts.map((d) => d.debtor))];
    default:
      return [state.players[state.current]!.id];
  }
}

export interface PlayerSummary {
  id: string;
  name: string;
  cash: number;
  netWorth: number;
  properties: number;
  houses: number;
  bankrupt: boolean;
}

export function summarize(state: GameState, map: MapDefinition): PlayerSummary[] {
  return state.players.map((p) => {
    const tiles = ownedTiles(state, p.id);
    const houses = tiles.reduce((a, i) => a + (state.ownership[i]?.houses ?? 0), 0);
    return {
      id: p.id,
      name: p.name,
      cash: p.cash,
      netWorth: netWorth(state, map, p.id),
      properties: tiles.length,
      houses,
      bankrupt: p.bankrupt,
    };
  });
}
