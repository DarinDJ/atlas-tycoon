import type { MapDefinition, OwnableTile, PropertyTile, Tile } from '../types/map.js';
import { isOwnable, mortgageValue } from '../types/map.js';
import type { GameState, Player } from '../types/state.js';

export class GameError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GameError';
  }
}

export function fail(code: string, message?: string): never {
  throw new GameError(code, message);
}

export function tileAt(map: MapDefinition, index: number): Tile {
  const t = map.tiles[index];
  if (!t) fail('BAD_TILE', `No tile at index ${index}`);
  return t;
}

export function tileIndexById(map: MapDefinition, id: string): number {
  const i = map.tiles.findIndex((t) => t.id === id);
  if (i < 0) fail('BAD_TILE', `No tile with id ${id}`);
  return i;
}

export function findPlayer(state: GameState, id: string): Player {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) fail('NO_PLAYER', `Unknown player ${id}`);
  return p;
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.current];
  if (!p) fail('NO_PLAYER', 'No current player');
  return p;
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !p.bankrupt);
}

export function ownerOf(state: GameState, tile: number): string | null {
  return state.ownership[tile]?.owner ?? null;
}

/** Indices of all tiles in a colour group. */
export function groupTiles(map: MapDefinition, groupId: string): number[] {
  const out: number[] = [];
  map.tiles.forEach((t, i) => {
    if (t.type === 'property' && t.group === groupId) out.push(i);
  });
  return out;
}

export function ownsFullGroup(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  groupId: string,
): boolean {
  const tiles = groupTiles(map, groupId);
  return tiles.length > 0 && tiles.every((i) => state.ownership[i]?.owner === playerId);
}

export function countOwnedOfType(
  state: GameState,
  map: MapDefinition,
  playerId: string,
  type: 'transport' | 'utility',
): number {
  let n = 0;
  map.tiles.forEach((t, i) => {
    if (t.type === type && state.ownership[i]?.owner === playerId) n++;
  });
  return n;
}

export function ownedTiles(state: GameState, playerId: string): number[] {
  return Object.entries(state.ownership)
    .filter(([, o]) => o.owner === playerId)
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
}

export function housesInGroup(state: GameState, map: MapDefinition, groupId: string): number[] {
  return groupTiles(map, groupId).map((i) => state.ownership[i]?.houses ?? 0);
}

/** Total houses / hotels currently on the board (for limited supply rules). */
export function buildingSupplyUsed(state: GameState): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const o of Object.values(state.ownership)) {
    if (o.houses === 5) hotels++;
    else houses += o.houses;
  }
  return { houses, hotels };
}

export function netWorth(state: GameState, map: MapDefinition, playerId: string): number {
  const p = findPlayer(state, playerId);
  if (p.bankrupt) return 0;
  let total = p.cash;
  for (const i of ownedTiles(state, playerId)) {
    const t = tileAt(map, i);
    if (!isOwnable(t)) continue;
    const o = state.ownership[i]!;
    total += o.mortgaged ? mortgageValue(t) : t.price;
    if (t.type === 'property') total += o.houses * t.houseCost;
  }
  return total;
}

/** Cash a player could raise right now by selling houses and mortgaging everything. */
export function liquidationValue(state: GameState, map: MapDefinition, playerId: string): number {
  const p = findPlayer(state, playerId);
  let total = p.cash;
  for (const i of ownedTiles(state, playerId)) {
    const t = tileAt(map, i);
    if (!isOwnable(t)) continue;
    const o = state.ownership[i]!;
    if (!o.mortgaged) total += mortgageValue(t);
    if (t.type === 'property') total += Math.floor((o.houses * t.houseCost) / 2);
  }
  return total;
}

export function unmortgageCost(state: GameState, tile: OwnableTile): number {
  const base = mortgageValue(tile);
  return Math.ceil((base * (100 + state.rules.mortgageInterestPct)) / 100);
}

export function computeRent(
  state: GameState,
  map: MapDefinition,
  tileIdx: number,
  diceTotal: number,
): number {
  const tile = tileAt(map, tileIdx);
  const own = state.ownership[tileIdx];
  if (!own || !isOwnable(tile)) return 0;
  if (own.mortgaged) return 0;
  const owner = findPlayer(state, own.owner);
  if (owner.bankrupt) return 0;
  if (state.rules.noRentInJail && owner.inJail) return 0;
  switch (tile.type) {
    case 'property': {
      if (own.houses > 0) return tile.rent[own.houses] ?? tile.rent[5];
      const base = tile.rent[0];
      if (state.rules.doubleRentOnFullSet && ownsFullGroup(state, map, own.owner, tile.group))
        return base * 2;
      return base;
    }
    case 'transport': {
      const n = countOwnedOfType(state, map, own.owner, 'transport');
      return tile.rent[Math.min(n, tile.rent.length) - 1] ?? 0;
    }
    case 'utility': {
      const n = countOwnedOfType(state, map, own.owner, 'utility');
      const mult = tile.multipliers[Math.min(n, tile.multipliers.length) - 1] ?? 0;
      return mult * diceTotal;
    }
  }
}

export function propertyTile(map: MapDefinition, idx: number): PropertyTile {
  const t = tileAt(map, idx);
  if (t.type !== 'property') fail('NOT_PROPERTY', 'Tile is not a buildable property');
  return t;
}

export function ownableTile(map: MapDefinition, idx: number): OwnableTile {
  const t = tileAt(map, idx);
  if (!isOwnable(t)) fail('NOT_OWNABLE', 'Tile cannot be owned');
  return t;
}

/** Find the next tile index of a given type at or after `from` (wrapping, excluding `from`). */
export function nearestTileOfType(map: MapDefinition, from: number, type: Tile['type']): number | null {
  const n = map.tiles.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (map.tiles[i]!.type === type) return i;
  }
  return null;
}

let idCounter = 0;
/** Deterministic-enough id for trades (unique within a process). */
export function makeId(prefix: string, seq: number): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${seq}_${idCounter}`;
}
