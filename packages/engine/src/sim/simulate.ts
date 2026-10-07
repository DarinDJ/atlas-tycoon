import { setAutoFreeze } from 'immer';
import { botDecide } from '../bots/index.js';
import { createGame, type SeatInput } from '../engine/create.js';
import { netWorth, ownedTiles } from '../engine/helpers.js';
import { waitingOn } from '../engine/queries.js';
import { applyAction } from '../engine/reducer.js';
import type { MapDefinition } from '../types/map.js';
import type { BotLevel, HouseRules } from '../types/rules.js';
import type { GameState } from '../types/state.js';

export interface SimOptions {
  players?: number;
  levels?: BotLevel[];
  seed?: number;
  rules?: Partial<HouseRules>;
  /** Hard stop so degenerate games finish. */
  maxTurns?: number;
  /** Collect per-tile stats. */
  tileStats?: boolean;
}

export interface SimResult {
  winner: string | null;
  winnerSeat: number | null;
  winnerLevel: BotLevel | null;
  turns: number;
  actions: number;
  hitTurnLimit: boolean;
  bankruptcies: number;
  stats: GameState['stats'];
  finalNetWorth: Record<string, number>;
  tileBought: Record<number, number>;
  tileRent: Record<number, number>;
  seed: number;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export function simulateGame(map: MapDefinition, opts: SimOptions = {}): SimResult {
  setAutoFreeze(false);
  const n = opts.players ?? 4;
  const levels = opts.levels ?? Array.from({ length: n }, () => 'medium' as BotLevel);
  const seed = opts.seed ?? 1;
  const seats: SeatInput[] = Array.from({ length: n }, (_, i) => ({
    id: `bot${i}`,
    name: `Bot ${i + 1}`,
    avatar: 'bot',
    token: 'coin',
    color: COLORS[i % COLORS.length]!,
    isBot: true,
    botLevel: levels[i % levels.length],
  }));
  let state = createGame(map, seats, { turnTimerSeconds: 0, ...(opts.rules ?? {}) }, seed, 0);
  const maxTurns = opts.maxTurns ?? 600;
  const tileBought: Record<number, number> = {};
  const tileRent: Record<number, number> = {};
  let actions = 0;
  let stall = 0;

  while (state.status === 'playing' && state.turn <= maxTurns) {
    const waiting = waitingOn(state);
    // Also let non-waiting players respond to trades addressed to them.
    const responders = state.trades.filter((t) => t.status === 'pending').map((t) => t.to);
    const actors = [...new Set([...responders, ...waiting])];
    let acted = false;
    for (const pid of actors) {
      const action = botDecide(state, map, pid);
      if (!action) continue;
      const res = applyAction(state, action, map, { now: 0 });
      actions++;
      if (!res.ok) continue;
      if (opts.tileStats) {
        for (const ev of res.events) {
          if (ev.type === 'bought' || (ev.type === 'auctionEnded' && ev.winner))
            tileBought[ev.tile] = (tileBought[ev.tile] ?? 0) + 1;
          if (ev.type === 'rentDue') tileRent[ev.tile] = (tileRent[ev.tile] ?? 0) + ev.amount;
        }
      }
      state = res.state;
      acted = true;
      break;
    }
    if (!acted) {
      // Nobody could act: force the first waiting player (same as the server's turn timer).
      const pid = waiting[0];
      if (!pid) break;
      const res = applyAction(state, { type: 'sys:autoAct', playerId: pid }, map, { now: 0 });
      actions++;
      if (!res.ok || res.state === state) {
        stall++;
        if (stall > 5) break;
      } else {
        stall = 0;
        state = res.state;
      }
    } else stall = 0;
    if (actions > maxTurns * 60) break;
  }
  const hitTurnLimit = state.status === 'playing';
  if (hitTurnLimit) {
    const res = applyAction(state, { type: 'sys:timeUp' }, map, { now: 0 });
    if (res.ok) state = res.state;
  }
  const winner = state.players.find((p) => p.id === state.winner) ?? null;
  const finalNetWorth: Record<string, number> = {};
  for (const p of state.players) finalNetWorth[p.id] = netWorth(state, map, p.id);
  return {
    winner: state.winner,
    winnerSeat: winner ? winner.seat : null,
    winnerLevel: winner?.botLevel ?? null,
    turns: state.turn,
    actions,
    hitTurnLimit,
    bankruptcies: state.players.filter((p) => p.bankrupt).length,
    stats: state.stats,
    finalNetWorth,
    tileBought,
    tileRent,
    seed,
  };
}

export interface AggregateReport {
  games: number;
  avgTurns: number;
  medianTurns: number;
  avgActions: number;
  turnLimitRate: number;
  winRateBySeat: number[];
  winRateByLevel: Partial<Record<BotLevel, number>>;
  avgBankruptcies: number;
  avgPropertiesBought: number;
  avgHousesBuilt: number;
  avgTrades: number;
  avgAuctions: number;
  /** Rent collected per tile across all games (for heat-maps). */
  tileRent: Record<number, number>;
  tileBought: Record<number, number>;
  elapsedMs: number;
}

export function runSimulations(map: MapDefinition, games: number, opts: SimOptions = {}): AggregateReport {
  const t0 = Date.now();
  const n = opts.players ?? 4;
  const results: SimResult[] = [];
  for (let g = 0; g < games; g++) {
    results.push(
      simulateGame(map, { ...opts, seed: (opts.seed ?? 1) + g, tileStats: opts.tileStats ?? true }),
    );
  }
  const turns = results.map((r) => r.turns).sort((a, b) => a - b);
  const seatWins = Array.from({ length: n }, () => 0);
  const levelWins: Partial<Record<BotLevel, number>> = {};
  const levelCounts: Partial<Record<BotLevel, number>> = {};
  const levels = opts.levels ?? Array.from({ length: n }, () => 'medium' as BotLevel);
  for (let i = 0; i < n; i++) {
    const l = levels[i % levels.length]!;
    levelCounts[l] = (levelCounts[l] ?? 0) + 1;
  }
  const tileRent: Record<number, number> = {};
  const tileBought: Record<number, number> = {};
  for (const r of results) {
    if (r.winnerSeat !== null) seatWins[r.winnerSeat] = (seatWins[r.winnerSeat] ?? 0) + 1;
    if (r.winnerLevel) levelWins[r.winnerLevel] = (levelWins[r.winnerLevel] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.tileRent)) tileRent[Number(k)] = (tileRent[Number(k)] ?? 0) + v;
    for (const [k, v] of Object.entries(r.tileBought))
      tileBought[Number(k)] = (tileBought[Number(k)] ?? 0) + v;
  }
  const winRateByLevel: Partial<Record<BotLevel, number>> = {};
  for (const [l, wins] of Object.entries(levelWins)) {
    // Normalise by number of seats at that level so mixed line-ups compare fairly.
    winRateByLevel[l as BotLevel] = wins / games / (levelCounts[l as BotLevel] ?? 1);
  }
  const avg = (f: (r: SimResult) => number) =>
    results.reduce((a, r) => a + f(r), 0) / Math.max(1, results.length);
  return {
    games,
    avgTurns: avg((r) => r.turns),
    medianTurns: turns[Math.floor(turns.length / 2)] ?? 0,
    avgActions: avg((r) => r.actions),
    turnLimitRate: avg((r) => (r.hitTurnLimit ? 1 : 0)),
    winRateBySeat: seatWins.map((w) => w / games),
    winRateByLevel,
    avgBankruptcies: avg((r) => r.bankruptcies),
    avgPropertiesBought: avg((r) => r.stats.propertiesBought),
    avgHousesBuilt: avg((r) => r.stats.housesBuilt),
    avgTrades: avg((r) => r.stats.tradesCompleted),
    avgAuctions: avg((r) => r.stats.auctions),
    tileRent,
    tileBought,
    elapsedMs: Date.now() - t0,
  };
}

export { ownedTiles };
