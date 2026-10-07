import { expect } from 'vitest';
import { createGame } from '../src/engine/create.js';
import { applyAction, type ApplyOptions } from '../src/engine/reducer.js';
import type { Action } from '../src/types/actions.js';
import type { HouseRules } from '../src/types/rules.js';
import type { GameState } from '../src/types/state.js';
import type { GameEvent } from '../src/types/events.js';
import { testMap, cardIndex } from './fixtures/testMap.js';

export const COLORS = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#000', '#888'];

export function setup(n = 2, rules: Partial<HouseRules> = {}, seed = 42): GameState {
  const seats = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    avatar: 'a',
    token: 'coin',
    color: COLORS[i]!,
  }));
  return createGame(testMap, seats, { randomizeTurnOrder: false, turnTimerSeconds: 0, ...rules }, seed, 0);
}

/** Apply an action and assert it succeeded. */
export function ok(
  state: GameState,
  action: Action,
  opts: ApplyOptions = {},
): { state: GameState; events: GameEvent[] } {
  const res = applyAction(state, action, testMap, { now: 0, ...opts });
  if (!res.ok) throw new Error(`Expected ok, got ${res.error}: ${res.message} (action ${action.type})`);
  return { state: res.state, events: res.events };
}

/** Apply an action and assert it failed with the given code. */
export function fails(state: GameState, action: Action, code?: string, opts: ApplyOptions = {}): void {
  const res = applyAction(state, action, testMap, { now: 0, ...opts });
  expect(res.ok).toBe(false);
  if (code && !res.ok) expect(res.error).toBe(code);
}

/** Roll with forced dice for the current player. */
export function roll(state: GameState, d1: number, d2: number): { state: GameState; events: GameEvent[] } {
  const pid = state.players[state.current]!.id;
  return ok(state, { type: 'roll', playerId: pid }, { forceDice: [d1, d2] });
}

/** Return a modified copy of the state (states are frozen). */
export function patch(state: GameState, fn: (s: GameState) => void): GameState {
  const copy = structuredClone(state);
  fn(copy);
  return copy;
}

export function give(
  state: GameState,
  playerId: string,
  tiles: number[],
  houses = 0,
  mortgaged = false,
): GameState {
  return patch(state, (s) => {
    for (const t of tiles) s.ownership[t] = { owner: playerId, houses, mortgaged };
  });
}

export function setCash(state: GameState, playerId: string, cash: number): GameState {
  return patch(state, (s) => {
    s.players.find((p) => p.id === playerId)!.cash = cash;
  });
}

export function setPos(state: GameState, playerId: string, pos: number): GameState {
  return patch(state, (s) => {
    s.players.find((p) => p.id === playerId)!.position = pos;
  });
}

/** Put a specific card on top of a deck. */
export function topCard(state: GameState, deck: 'luck' | 'treasure', cardId: string): GameState {
  const idx = cardIndex(deck, cardId);
  if (idx < 0) throw new Error(`no card ${cardId}`);
  return patch(state, (s) => {
    const d = s.decks[deck];
    d.draw = [idx, ...d.draw.filter((i) => i !== idx)];
  });
}

export function cur(state: GameState) {
  return state.players[state.current]!;
}

export function player(state: GameState, id: string) {
  return state.players.find((p) => p.id === id)!;
}

export function has(events: GameEvent[], type: GameEvent['type']): boolean {
  return events.some((e) => e.type === type);
}

export function find<T extends GameEvent['type']>(
  events: GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }> | undefined {
  return events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

export { testMap };
