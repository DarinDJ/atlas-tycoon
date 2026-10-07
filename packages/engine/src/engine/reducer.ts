import { produce, type Draft } from 'immer';
import type { Action } from '../types/actions.js';
import type { GameEvent, PayReason } from '../types/events.js';
import type { Card, CardEffect, MapDefinition, OwnableTile } from '../types/map.js';
import { isOwnable, mortgageValue } from '../types/map.js';
import type { Debt, GameState, Player, ResumePhase, TradeSide } from '../types/state.js';
import { rollDie, shuffle } from '../rng.js';
import * as C from './checks.js';
import {
  GameError,
  alivePlayers,
  computeRent,
  currentPlayer,
  fail,
  findPlayer,
  liquidationValue,
  nearestTileOfType,
  netWorth,
  ownableTile,
  ownedTiles,
  propertyTile,
  tileAt,
  tileIndexById,
  unmortgageCost,
} from './helpers.js';

export interface ApplyOptions {
  /** Test hook: force the next dice roll. Never exposed to clients. */
  forceDice?: [number, number];
  /** Wall-clock timestamp in ms (server supplies; defaults to Date.now()). */
  now?: number;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: string; message: string; events: [] };

const MAX_LOG = 300;

interface Ctx {
  s: Draft<GameState>;
  map: MapDefinition;
  events: GameEvent[];
  opts: ApplyOptions;
}

/**
 * Applies an action to the game state. Pure: never mutates `state`.
 * Returns the new state and the events generated, or an error with the unchanged state.
 */
export function applyAction(
  state: GameState,
  action: Action,
  map: MapDefinition,
  opts: ApplyOptions = {},
): ApplyResult {
  const events: GameEvent[] = [];
  try {
    const next = produce(state, (s) => {
      const ctx: Ctx = { s, map, events, opts };
      dispatch(ctx, action);
      s.seq += 1;
    });
    if (events.length === 0) return { ok: true, state: next, events };
    // The log is appended outside the draft: pushing/splicing a long array through immer proxies is the
    // single most expensive thing in the simulator.
    const entries = events.map((ev) => Object.freeze({ seq: next.seq, turn: next.turn, event: ev }));
    const keep = Math.max(0, MAX_LOG - entries.length);
    const log = state.log.length > keep ? state.log.slice(state.log.length - keep) : state.log;
    const withLog: GameState = Object.freeze({
      ...next,
      log: Object.freeze([...log, ...entries]),
    }) as GameState;
    return { ok: true, state: withLog, events };
  } catch (err) {
    if (err instanceof GameError) {
      return { ok: false, state, error: err.code, message: err.message, events: [] };
    }
    throw err;
  }
}

function dispatch(ctx: Ctx, action: Action): void {
  const { s } = ctx;
  if (isEnded(s) && !action.type.startsWith('sys:')) fail('GAME_OVER');
  switch (action.type) {
    case 'roll':
      return doRoll(ctx, action.playerId);
    case 'buy':
      return doBuy(ctx, action.playerId);
    case 'declineBuy':
      return doDeclineBuy(ctx, action.playerId);
    case 'bid':
      return doBid(ctx, action.playerId, action.amount);
    case 'passBid':
      return doPassBid(ctx, action.playerId);
    case 'build':
      return doBuild(ctx, action.playerId, action.tile);
    case 'sellHouse':
      return doSellHouse(ctx, action.playerId, action.tile);
    case 'mortgage':
      return doMortgage(ctx, action.playerId, action.tile);
    case 'unmortgage':
      return doUnmortgage(ctx, action.playerId, action.tile);
    case 'payJail':
      return doPayJail(ctx, action.playerId);
    case 'useJailCard':
      return doUseJailCard(ctx, action.playerId);
    case 'endTurn':
      return doEndTurn(ctx, action.playerId);
    case 'proposeTrade':
      return doProposeTrade(ctx, action.playerId, action.to, action.offer, action.request, undefined);
    case 'acceptTrade':
      return doAcceptTrade(ctx, action.playerId, action.tradeId);
    case 'declineTrade':
      return doDeclineTrade(ctx, action.playerId, action.tradeId);
    case 'cancelTrade':
      return doCancelTrade(ctx, action.playerId, action.tradeId);
    case 'counterTrade':
      return doCounterTrade(ctx, action.playerId, action.tradeId, action.offer, action.request);
    case 'declareBankrupt':
      return doDeclareBankrupt(ctx, action.playerId);
    case 'resign':
      return doResign(ctx, action.playerId);
    case 'sys:timeUp':
      return doTimeUp(ctx);
    case 'sys:tick':
      return doTick(ctx, action.elapsedMs);
    case 'sys:autoAct':
      return doAutoAct(ctx, action.playerId);
    case 'sys:setBot': {
      const p = findPlayer(s, action.playerId);
      p.isBot = action.isBot;
      p.botLevel = action.isBot ? (action.level ?? p.botLevel ?? 'medium') : undefined;
      if (action.isBot) emit(ctx, { type: 'replacedByBot', playerId: p.id });
      else emit(ctx, { type: 'connection', playerId: p.id, connected: true });
      return;
    }
    case 'sys:setConnected': {
      const p = findPlayer(s, action.playerId);
      p.connected = action.connected;
      emit(ctx, { type: 'connection', playerId: p.id, connected: action.connected });
      return;
    }
    default: {
      const never: never = action;
      fail('UNKNOWN_ACTION', `Unknown action ${(never as { type: string }).type}`);
    }
  }
}

function emit(ctx: Ctx, ev: GameEvent): void {
  ctx.events.push(ev);
}

function must(code: string | null): void {
  if (code) fail(code);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Pay from a player to another player or the bank. Creates a debt if cash is insufficient. */
function charge(
  ctx: Ctx,
  payerId: string,
  amount: number,
  creditor: string | null,
  reason: PayReason,
  tile?: number,
): void {
  if (amount <= 0) return;
  const { s } = ctx;
  const payer = findPlayer(s, payerId);
  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (creditor) findPlayer(s, creditor).cash += amount;
    else if (s.rules.freeParkingJackpot && (reason === 'tax' || reason === 'card' || reason === 'jailFine')) {
      s.freeParkingPot += amount;
    }
    emit(ctx, { type: 'paid', from: payerId, to: creditor, amount, reason, tile });
  } else {
    const debt: Debt = { debtor: payerId, creditor, amount, reason };
    s.debts.push(debt);
    emit(ctx, { type: 'debt', playerId: payerId, creditor, amount });
  }
}

function credit(ctx: Ctx, playerId: string, amount: number, reason: PayReason, tile?: number): void {
  if (amount <= 0) return;
  findPlayer(ctx.s, playerId).cash += amount;
  emit(ctx, { type: 'paid', from: null, to: playerId, amount, reason, tile });
}

/**
 * Settle any debts that can now be paid; bankrupt debtors who can never pay.
 * Switches phase into/out of 'debt'.
 */
function settleDebts(ctx: Ctx): void {
  const { s, map } = ctx;
  let progress = true;
  while (progress) {
    progress = false;
    for (const debt of s.debts.slice()) {
      const debtor = findPlayer(s, debt.debtor);
      if (debtor.bankrupt) {
        s.debts = s.debts.filter((d) => d !== debt);
        progress = true;
        continue;
      }
      // Creditor may have gone bankrupt meanwhile: the bank inherits the claim.
      if (debt.creditor && findPlayer(s, debt.creditor).bankrupt) debt.creditor = null;
      if (debtor.cash >= debt.amount) {
        debtor.cash -= debt.amount;
        if (debt.creditor) findPlayer(s, debt.creditor).cash += debt.amount;
        else if (s.rules.freeParkingJackpot && (debt.reason === 'tax' || debt.reason === 'card')) {
          s.freeParkingPot += debt.amount;
        }
        emit(ctx, {
          type: 'paid',
          from: debt.debtor,
          to: debt.creditor,
          amount: debt.amount,
          reason: debt.reason as PayReason,
        });
        s.debts = s.debts.filter((d) => d !== debt);
        if (!s.debts.some((d) => d.debtor === debt.debtor))
          emit(ctx, { type: 'debtSettled', playerId: debt.debtor });
        progress = true;
      } else {
        const owedTotal = s.debts.filter((d) => d.debtor === debt.debtor).reduce((a, d) => a + d.amount, 0);
        if (liquidationValue(s, map, debt.debtor) < owedTotal) {
          bankrupt(ctx, debt.debtor, debt.creditor);
          progress = true;
        }
      }
    }
  }
  if (isEnded(s)) return;
  if (s.debts.length > 0) {
    if (s.phase !== 'debt') {
      if (s.phase === 'preRoll' || s.phase === 'postRoll') s.resumeAfterDebt = s.phase;
      s.phase = 'debt';
    }
  } else if (s.phase === 'debt') {
    s.phase = s.resumeAfterDebt;
    afterPhaseResume(ctx);
  }
}

/** After debts are cleared, continue anything that was waiting (queued auctions, current player bankrupt). */
function afterPhaseResume(ctx: Ctx): void {
  const { s } = ctx;
  if (isEnded(s)) return;
  if (s.auctionQueue.length > 0 && !s.auction) {
    startAuction(ctx, s.auctionQueue.shift()!, s.phase === 'preRoll' ? 'preRoll' : 'postRoll', 'bankruptcy');
    return;
  }
  if (currentPlayer(s).bankrupt) nextTurn(ctx);
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function resumePhase(s: Draft<GameState>): ResumePhase {
  const p = currentPlayer(s);
  return s.rolledDoubles && !p.inJail && !p.bankrupt ? 'preRoll' : 'postRoll';
}

/** Called after a landing fully resolves (no pending buy/auction). */
function finishResolution(ctx: Ctx): void {
  const { s } = ctx;
  if (isEnded(s)) return;
  const resume = resumePhase(s);
  if (s.debts.length > 0) {
    s.resumeAfterDebt = resume;
    s.phase = 'debt';
    settleDebts(ctx);
  } else {
    s.phase = resume;
    if (currentPlayer(s).bankrupt) nextTurn(ctx);
  }
}

function startTurn(ctx: Ctx): void {
  const { s } = ctx;
  s.dice = null;
  s.doubles = 0;
  s.rolledDoubles = false;
  s.hasRolled = false;
  s.pendingBuy = null;
  s.phase = 'preRoll';
  emit(ctx, { type: 'turnStarted', playerId: currentPlayer(s).id, turn: s.turn });
}

function nextTurn(ctx: Ctx): void {
  const { s } = ctx;
  if (checkGameOver(ctx)) return;
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (s.current + step) % n;
    if (!s.players[i]!.bankrupt) {
      s.current = i;
      s.turn += 1;
      startTurn(ctx);
      return;
    }
  }
}

function checkGameOver(ctx: Ctx): boolean {
  const { s, map } = ctx;
  if (isEnded(s)) return true;
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    endGame(ctx, alive[0]?.id ?? null);
    return true;
  }
  void map;
  return false;
}

function endGame(ctx: Ctx, winner: string | null): void {
  const { s, map } = ctx;
  s.status = 'ended';
  s.phase = 'ended';
  s.winner = winner;
  s.endedAt = ctx.opts.now ?? Date.now();
  const alive = alivePlayers(s)
    .map((p) => ({ id: p.id, nw: netWorth(s, map, p.id) }))
    .sort((a, b) => b.nw - a.nw)
    .map((x) => x.id);
  const dead = s.players
    .filter((p) => p.bankrupt)
    .sort((a, b) => (b.bankruptOnTurn ?? 0) - (a.bankruptOnTurn ?? 0))
    .map((p) => p.id);
  s.ranking = winner ? [winner, ...alive.filter((id) => id !== winner), ...dead] : [...alive, ...dead];
  for (const t of s.trades) if (t.status === 'pending') t.status = 'expired';
  emit(ctx, { type: 'gameOver', winner, ranking: s.ranking });
}

// ---------------------------------------------------------------------------
// Rolling & movement
// ---------------------------------------------------------------------------

function roll2(ctx: Ctx): [number, number] {
  if (ctx.opts.forceDice) {
    const d = ctx.opts.forceDice;
    ctx.opts = { ...ctx.opts, forceDice: undefined };
    return [d[0], d[1]];
  }
  return [rollDie(ctx.s.rng), rollDie(ctx.s.rng)];
}

function doRoll(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkRoll(s, playerId));
  const p = currentPlayer(s);
  const dice = roll2(ctx);
  const isDouble = dice[0] === dice[1];
  const total = dice[0] + dice[1];
  s.dice = dice;
  s.hasRolled = true;
  s.stats.rolls += 1;
  emit(ctx, { type: 'rolled', playerId, dice, doubles: isDouble, inJail: p.inJail });

  if (p.inJail) {
    s.rolledDoubles = false;
    s.doubles = 0;
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      emit(ctx, { type: 'leftJail', playerId, how: 'doubles' });
      moveBy(ctx, p, total);
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= s.rules.maxJailTurns) {
        p.inJail = false;
        p.jailTurns = 0;
        charge(ctx, playerId, s.rules.jailFine, null, 'jailFine');
        emit(ctx, { type: 'leftJail', playerId, how: 'forced' });
        moveBy(ctx, p, total);
      } else {
        emit(ctx, { type: 'jailRollFailed', playerId, turnsLeft: s.rules.maxJailTurns - p.jailTurns });
        s.phase = 'postRoll';
      }
    }
    return;
  }

  if (isDouble) {
    s.doubles += 1;
    if (s.doubles >= 3) {
      s.rolledDoubles = false;
      sendToJail(ctx, p, 'doubles');
      s.phase = 'postRoll';
      return;
    }
    s.rolledDoubles = true;
  } else {
    s.rolledDoubles = false;
  }
  moveBy(ctx, p, total);
}

function moveBy(ctx: Ctx, p: Draft<Player>, steps: number): void {
  const n = ctx.map.tiles.length;
  const from = p.position;
  const to = (((from + steps) % n) + n) % n;
  const passedStart = steps > 0 && to < from;
  p.position = to;
  emit(ctx, { type: 'moved', playerId: p.id, from, to, passedStart });
  if (passedStart) paySalary(ctx, p);
  landOn(ctx, p, to);
}

function moveToIndex(ctx: Ctx, p: Draft<Player>, to: number, collectSalary: boolean): void {
  const from = p.position;
  const passedStart = collectSalary && to < from;
  p.position = to;
  emit(ctx, { type: 'moved', playerId: p.id, from, to, passedStart, teleport: false });
  if (passedStart) paySalary(ctx, p);
  landOn(ctx, p, to);
}

function paySalary(ctx: Ctx, p: Draft<Player>): void {
  const amt = ctx.s.rules.salary;
  if (amt > 0) {
    p.cash += amt;
    emit(ctx, { type: 'salary', playerId: p.id, amount: amt });
  }
}

function sendToJail(ctx: Ctx, p: Draft<Player>, reason: 'doubles' | 'tile' | 'card'): void {
  const jailIdx = ctx.map.tiles.findIndex((t) => t.type === 'jail');
  const from = p.position;
  p.position = jailIdx < 0 ? 0 : jailIdx;
  p.inJail = true;
  p.jailTurns = 0;
  ctx.s.rolledDoubles = false;
  ctx.s.doubles = 0;
  emit(ctx, { type: 'moved', playerId: p.id, from, to: p.position, passedStart: false, teleport: true });
  emit(ctx, { type: 'jailed', playerId: p.id, reason });
}

function landOn(ctx: Ctx, p: Draft<Player>, idx: number): void {
  const { s, map } = ctx;
  const tile = tileAt(map, idx);
  switch (tile.type) {
    case 'property':
    case 'transport':
    case 'utility': {
      const own = s.ownership[idx];
      if (!own) {
        s.pendingBuy = idx;
        s.phase = 'awaitBuy';
        emit(ctx, { type: 'offeredProperty', playerId: p.id, tile: idx, price: tile.price });
        return; // wait for buy/decline
      }
      if (own.owner !== p.id) {
        const diceTotal = s.dice ? s.dice[0] + s.dice[1] : 7;
        const rent = computeRent(s, map, idx, diceTotal);
        if (rent > 0) {
          emit(ctx, { type: 'rentDue', playerId: p.id, owner: own.owner, tile: idx, amount: rent });
          s.stats.rentPaid += rent;
          charge(ctx, p.id, rent, own.owner, 'rent', idx);
        }
      }
      break;
    }
    case 'tax': {
      let amount = tile.amount;
      if (tile.percentOfNetWorth !== undefined) {
        const pct = Math.floor((netWorth(s, map, p.id) * tile.percentOfNetWorth) / 100);
        amount = Math.min(amount, pct);
      }
      emit(ctx, { type: 'tax', playerId: p.id, tile: idx, amount });
      charge(ctx, p.id, amount, null, 'tax', idx);
      break;
    }
    case 'luck':
    case 'treasure': {
      const card = drawCard(ctx, tile.type);
      if (card) {
        emit(ctx, { type: 'cardDrawn', playerId: p.id, deck: tile.type, cardId: card.id });
        applyEffect(ctx, p, card.effect, 'card');
        return; // applyEffect decides how to finish (it may move & land again)
      }
      break;
    }
    case 'gotojail':
      sendToJail(ctx, p, 'tile');
      break;
    case 'freeparking': {
      emit(ctx, { type: 'freeParking', playerId: p.id });
      if (s.rules.freeParkingJackpot && s.freeParkingPot > 0) {
        const amt = s.freeParkingPot;
        s.freeParkingPot = 0;
        p.cash += amt;
        emit(ctx, { type: 'jackpot', playerId: p.id, amount: amt });
      }
      break;
    }
    case 'start': {
      if (s.rules.landOnStartBonus > 0) credit(ctx, p.id, s.rules.landOnStartBonus, 'salary', idx);
      break;
    }
    case 'special': {
      emit(ctx, { type: 'special', playerId: p.id, tile: idx });
      applyEffect(ctx, p, tile.effect, 'special');
      return;
    }
    case 'jail':
      break;
  }
  finishResolution(ctx);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function drawCard(ctx: Ctx, deckName: 'luck' | 'treasure'): Card | null {
  const { s, map } = ctx;
  const deck = s.decks[deckName];
  const cards = map.cards[deckName];
  if (deck.draw.length === 0) {
    deck.draw = shuffle(s.rng, deck.discard);
    deck.discard = [];
  }
  const idx = deck.draw.shift();
  if (idx === undefined) return null;
  const card = cards[idx];
  if (!card) return null;
  if (card.effect.kind === 'jailFree') deck.held.push(idx);
  else deck.discard.push(idx);
  return card;
}

function applyEffect(ctx: Ctx, p: Draft<Player>, effect: CardEffect, source: 'card' | 'special'): void {
  const { s, map } = ctx;
  const reason: PayReason = source === 'card' ? 'card' : 'special';
  switch (effect.kind) {
    case 'money': {
      if (effect.amount >= 0) credit(ctx, p.id, effect.amount, reason);
      else charge(ctx, p.id, -effect.amount, null, reason);
      break;
    }
    case 'moveTo': {
      const to = tileIndexById(map, effect.tileId);
      const collect = (effect.collectSalary ?? true) && s.rules.salaryOnCardMove;
      moveToIndex(ctx, p, to, collect);
      return;
    }
    case 'moveBy': {
      moveBy(ctx, p, effect.steps);
      return;
    }
    case 'gotoJail': {
      sendToJail(ctx, p, 'card');
      break;
    }
    case 'jailFree': {
      p.jailCards += 1;
      break;
    }
    case 'repairs': {
      let cost = 0;
      for (const i of ownedTiles(s, p.id)) {
        const o = s.ownership[i]!;
        if (o.houses === 5) cost += effect.perHotel;
        else cost += o.houses * effect.perHouse;
      }
      if (cost > 0) charge(ctx, p.id, cost, null, 'repairs');
      break;
    }
    case 'eachPlayer': {
      const others = alivePlayers(s).filter((o) => o.id !== p.id);
      if (effect.amount >= 0) {
        for (const o of others) charge(ctx, o.id, effect.amount, p.id, reason);
      } else {
        for (const o of others) charge(ctx, p.id, -effect.amount, o.id, reason);
      }
      break;
    }
    case 'nearest': {
      const to = nearestTileOfType(map, p.position, effect.tileType);
      if (to === null) break;
      const from = p.position;
      const passedStart = to < from && s.rules.salaryOnCardMove;
      p.position = to;
      emit(ctx, { type: 'moved', playerId: p.id, from, to, passedStart });
      if (passedStart) paySalary(ctx, p);
      const own = s.ownership[to];
      const tile = tileAt(map, to) as OwnableTile;
      if (!own) {
        s.pendingBuy = to;
        s.phase = 'awaitBuy';
        emit(ctx, { type: 'offeredProperty', playerId: p.id, tile: to, price: tile.price });
        return;
      }
      if (own.owner !== p.id && !own.mortgaged) {
        let rent: number;
        if (tile.type === 'utility') {
          const d = roll2(ctx);
          s.dice = d;
          emit(ctx, { type: 'rolled', playerId: p.id, dice: d, doubles: false, inJail: false });
          rent = (d[0] + d[1]) * (effect.rentMultiplier ?? 10);
        } else {
          rent = computeRent(s, map, to, 7) * (effect.rentMultiplier ?? 2);
        }
        if (rent > 0) {
          emit(ctx, { type: 'rentDue', playerId: p.id, owner: own.owner, tile: to, amount: rent });
          s.stats.rentPaid += rent;
          charge(ctx, p.id, rent, own.owner, 'rent', to);
        }
      }
      break;
    }
  }
  finishResolution(ctx);
}

// ---------------------------------------------------------------------------
// Buying & auctions
// ---------------------------------------------------------------------------

function doBuy(ctx: Ctx, playerId: string): void {
  const { s, map } = ctx;
  must(C.checkBuy(s, map, playerId));
  const idx = s.pendingBuy!;
  const tile = ownableTile(map, idx);
  const p = findPlayer(s, playerId);
  p.cash -= tile.price;
  s.ownership[idx] = { owner: playerId, houses: 0, mortgaged: false };
  s.pendingBuy = null;
  s.stats.propertiesBought += 1;
  emit(ctx, { type: 'paid', from: playerId, to: null, amount: tile.price, reason: 'purchase', tile: idx });
  emit(ctx, { type: 'bought', playerId, tile: idx, price: tile.price });
  finishResolution(ctx);
}

function doDeclineBuy(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkDeclineBuy(s, playerId));
  const idx = s.pendingBuy!;
  s.pendingBuy = null;
  emit(ctx, { type: 'declined', playerId, tile: idx });
  if (s.rules.auctionEnabled && alivePlayers(s).length > 0) {
    startAuction(ctx, idx, resumePhase(s), 'declined');
  } else {
    finishResolution(ctx);
  }
}

function startAuction(ctx: Ctx, idx: number, resume: ResumePhase, reason: 'declined' | 'bankruptcy'): void {
  const { s } = ctx;
  const participants = alivePlayers(s).map((p) => p.id);
  s.auction = { tile: idx, highBid: 0, highBidder: null, active: participants, passed: [], resume, reason };
  s.phase = 'auction';
  s.stats.auctions += 1;
  emit(ctx, { type: 'auctionStarted', tile: idx, participants });
  maybeEndAuction(ctx);
}

function doBid(ctx: Ctx, playerId: string, amount: number): void {
  const { s } = ctx;
  must(C.checkBid(s, playerId, amount));
  const a = s.auction!;
  a.highBid = amount;
  a.highBidder = playerId;
  emit(ctx, { type: 'bid', playerId, amount, tile: a.tile });
  maybeEndAuction(ctx);
}

function doPassBid(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkPassBid(s, playerId));
  const a = s.auction!;
  a.passed.push(playerId);
  emit(ctx, { type: 'passedBid', playerId, tile: a.tile });
  maybeEndAuction(ctx);
}

function maybeEndAuction(ctx: Ctx): void {
  const { s } = ctx;
  const a = s.auction;
  if (!a) return;
  const remaining = a.active.filter((id) => !a.passed.includes(id) && !findPlayer(s, id).bankrupt);
  const done =
    remaining.length === 0 ||
    (a.highBidder !== null && remaining.length === 1 && remaining[0] === a.highBidder);
  if (!done) return;
  if (a.highBidder) {
    const winner = findPlayer(s, a.highBidder);
    winner.cash -= a.highBid;
    s.ownership[a.tile] = { owner: a.highBidder, houses: 0, mortgaged: false };
    s.stats.propertiesBought += 1;
    emit(ctx, {
      type: 'paid',
      from: a.highBidder,
      to: null,
      amount: a.highBid,
      reason: 'auction',
      tile: a.tile,
    });
  }
  emit(ctx, { type: 'auctionEnded', tile: a.tile, winner: a.highBidder, amount: a.highBid });
  const resume = a.resume;
  s.auction = null;
  if (s.auctionQueue.length > 0) {
    startAuction(ctx, s.auctionQueue.shift()!, resume, 'bankruptcy');
    return;
  }
  s.phase = resume;
  if (s.debts.length > 0) {
    s.resumeAfterDebt = resume;
    s.phase = 'debt';
  }
  settleDebts(ctx);
  continueAfterElimination(ctx);
}

// ---------------------------------------------------------------------------
// Building & mortgaging
// ---------------------------------------------------------------------------

function doBuild(ctx: Ctx, playerId: string, idx: number): void {
  const { s, map } = ctx;
  must(C.checkBuild(s, map, playerId, idx));
  const tile = propertyTile(map, idx);
  const own = s.ownership[idx]!;
  findPlayer(s, playerId).cash -= tile.houseCost;
  own.houses += 1;
  s.stats.housesBuilt += 1;
  emit(ctx, { type: 'paid', from: playerId, to: null, amount: tile.houseCost, reason: 'build', tile: idx });
  emit(ctx, { type: 'built', playerId, tile: idx, houses: own.houses, cost: tile.houseCost });
}

function doSellHouse(ctx: Ctx, playerId: string, idx: number): void {
  const { s, map } = ctx;
  must(C.checkSellHouse(s, map, playerId, idx));
  const tile = propertyTile(map, idx);
  const own = s.ownership[idx]!;
  const refund = Math.floor(tile.houseCost / 2);
  own.houses -= 1;
  findPlayer(s, playerId).cash += refund;
  emit(ctx, { type: 'paid', from: null, to: playerId, amount: refund, reason: 'sellHouse', tile: idx });
  emit(ctx, { type: 'soldHouse', playerId, tile: idx, houses: own.houses, refund });
  settleDebts(ctx);
}

function doMortgage(ctx: Ctx, playerId: string, idx: number): void {
  const { s, map } = ctx;
  must(C.checkMortgage(s, map, playerId, idx));
  const tile = ownableTile(map, idx);
  const amount = mortgageValue(tile);
  s.ownership[idx]!.mortgaged = true;
  findPlayer(s, playerId).cash += amount;
  emit(ctx, { type: 'paid', from: null, to: playerId, amount, reason: 'mortgage', tile: idx });
  emit(ctx, { type: 'mortgaged', playerId, tile: idx, amount });
  settleDebts(ctx);
}

function doUnmortgage(ctx: Ctx, playerId: string, idx: number): void {
  const { s, map } = ctx;
  must(C.checkUnmortgage(s, map, playerId, idx));
  const tile = ownableTile(map, idx);
  const cost = unmortgageCost(s, tile);
  s.ownership[idx]!.mortgaged = false;
  findPlayer(s, playerId).cash -= cost;
  emit(ctx, { type: 'paid', from: playerId, to: null, amount: cost, reason: 'unmortgage', tile: idx });
  emit(ctx, { type: 'unmortgaged', playerId, tile: idx, amount: cost });
}

// ---------------------------------------------------------------------------
// Jail
// ---------------------------------------------------------------------------

function doPayJail(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkPayJail(s, playerId));
  const p = findPlayer(s, playerId);
  charge(ctx, playerId, s.rules.jailFine, null, 'jailFine');
  p.inJail = false;
  p.jailTurns = 0;
  emit(ctx, { type: 'leftJail', playerId, how: 'paid' });
}

function doUseJailCard(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkUseJailCard(s, playerId));
  const p = findPlayer(s, playerId);
  p.jailCards -= 1;
  p.inJail = false;
  p.jailTurns = 0;
  returnJailCard(ctx);
  emit(ctx, { type: 'leftJail', playerId, how: 'card' });
}

function returnJailCard(ctx: Ctx): void {
  const { s } = ctx;
  for (const name of ['luck', 'treasure'] as const) {
    const d = s.decks[name];
    const idx = d.held.shift();
    if (idx !== undefined) {
      d.discard.push(idx);
      return;
    }
  }
}

function doEndTurn(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkEndTurn(s, playerId));
  emit(ctx, { type: 'turnEnded', playerId });
  nextTurn(ctx);
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function normalizeSide(side: TradeSide): TradeSide {
  return {
    cash: Math.max(0, Math.floor(side.cash || 0)),
    properties: [...new Set((side.properties ?? []).map((n) => Math.floor(n)))],
    jailCards: Math.max(0, Math.floor(side.jailCards || 0)),
  };
}

function doProposeTrade(
  ctx: Ctx,
  from: string,
  to: string,
  offerIn: TradeSide,
  requestIn: TradeSide,
  counterOf: string | undefined,
): void {
  const { s, map } = ctx;
  const offer = normalizeSide(offerIn);
  const request = normalizeSide(requestIn);
  must(C.checkProposeTrade(s, map, from, to, offer, request));
  // Replace any existing pending offer between the same two players in the same direction.
  for (const t of s.trades) {
    if (t.status === 'pending' && t.from === from && t.to === to) {
      t.status = 'cancelled';
      emit(ctx, { type: 'tradeCancelled', tradeId: t.id, by: from });
    }
  }
  const pendingFrom = s.trades.filter((t) => t.status === 'pending' && t.from === from).length;
  if (pendingFrom >= 6) fail('TOO_MANY_TRADES');
  const id = `trade_${s.seq + 1}`;
  s.trades.push({ id, from, to, offer, request, status: 'pending', createdTurn: s.turn, counterOf });
  // Keep the trade list bounded.
  const closed = s.trades.filter((t) => t.status !== 'pending');
  if (closed.length > 20) {
    const drop = new Set(closed.slice(0, closed.length - 20).map((t) => t.id));
    s.trades = s.trades.filter((t) => !drop.has(t.id));
  }
  emit(ctx, { type: 'tradeProposed', tradeId: id, from, to });
}

function doAcceptTrade(ctx: Ctx, playerId: string, tradeId: string): void {
  const { s, map } = ctx;
  const t = s.trades.find((x) => x.id === tradeId);
  if (!t) fail('NO_TRADE');
  if (t.to !== playerId) fail('NOT_RECIPIENT');
  must(C.tradeStillValid(s, map, tradeId));
  const from = findPlayer(s, t.from);
  const to = findPlayer(s, t.to);
  // cash
  from.cash -= t.offer.cash;
  to.cash += t.offer.cash;
  to.cash -= t.request.cash;
  from.cash += t.request.cash;
  if (t.offer.cash)
    emit(ctx, { type: 'paid', from: from.id, to: to.id, amount: t.offer.cash, reason: 'trade' });
  if (t.request.cash)
    emit(ctx, { type: 'paid', from: to.id, to: from.id, amount: t.request.cash, reason: 'trade' });
  // properties
  for (const idx of t.offer.properties) s.ownership[idx]!.owner = to.id;
  for (const idx of t.request.properties) s.ownership[idx]!.owner = from.id;
  // jail cards
  from.jailCards -= t.offer.jailCards;
  to.jailCards += t.offer.jailCards;
  to.jailCards -= t.request.jailCards;
  from.jailCards += t.request.jailCards;
  t.status = 'accepted';
  s.stats.tradesCompleted += 1;
  emit(ctx, { type: 'tradeAccepted', tradeId, from: from.id, to: to.id });
  // Other pending trades involving the moved properties are now invalid.
  const moved = new Set([...t.offer.properties, ...t.request.properties]);
  for (const other of s.trades) {
    if (other.status !== 'pending') continue;
    const touches = [...other.offer.properties, ...other.request.properties].some((i) => moved.has(i));
    if (touches || C.tradeStillValid(s, map, other.id)) {
      other.status = 'expired';
      emit(ctx, { type: 'tradeExpired', tradeId: other.id });
    }
  }
  settleDebts(ctx);
}

function doDeclineTrade(ctx: Ctx, playerId: string, tradeId: string): void {
  const t = ctx.s.trades.find((x) => x.id === tradeId);
  if (!t) fail('NO_TRADE');
  if (t.status !== 'pending') fail('TRADE_CLOSED');
  if (t.to !== playerId) fail('NOT_RECIPIENT');
  t.status = 'declined';
  emit(ctx, { type: 'tradeDeclined', tradeId, by: playerId });
}

function doCancelTrade(ctx: Ctx, playerId: string, tradeId: string): void {
  const t = ctx.s.trades.find((x) => x.id === tradeId);
  if (!t) fail('NO_TRADE');
  if (t.status !== 'pending') fail('TRADE_CLOSED');
  if (t.from !== playerId) fail('NOT_PROPOSER');
  t.status = 'cancelled';
  emit(ctx, { type: 'tradeCancelled', tradeId, by: playerId });
}

function doCounterTrade(
  ctx: Ctx,
  playerId: string,
  tradeId: string,
  offer: TradeSide,
  request: TradeSide,
): void {
  const { s } = ctx;
  const t = s.trades.find((x) => x.id === tradeId);
  if (!t) fail('NO_TRADE');
  if (t.status !== 'pending') fail('TRADE_CLOSED');
  if (t.to !== playerId) fail('NOT_RECIPIENT');
  t.status = 'countered';
  const before = s.trades.length;
  doProposeTrade(ctx, playerId, t.from, offer, request, tradeId);
  const created = s.trades[s.trades.length - 1];
  if (s.trades.length > before && created) {
    emit(ctx, { type: 'tradeCountered', tradeId, newTradeId: created.id, by: playerId });
  }
}

// ---------------------------------------------------------------------------
// Bankruptcy
// ---------------------------------------------------------------------------

function doDeclareBankrupt(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkDeclareBankrupt(s, playerId));
  const debt = s.debts.find((d) => d.debtor === playerId)!;
  bankrupt(ctx, playerId, debt.creditor);
  settleDebts(ctx);
  continueAfterElimination(ctx);
}

/** After a player is eliminated: advance the turn unless an auction or debt is still pending. */
function continueAfterElimination(ctx: Ctx): void {
  const { s } = ctx;
  if (isEnded(s)) return;
  if (s.phase === 'auction' || s.phase === 'debt') return;
  if (currentPlayer(s).bankrupt) nextTurn(ctx);
}

function doResign(ctx: Ctx, playerId: string): void {
  const { s } = ctx;
  must(C.checkResign(s, playerId));
  emit(ctx, { type: 'resigned', playerId });
  const wasAwaiting = s.phase === 'awaitBuy' && C.isCurrent(s, playerId);
  if (wasAwaiting) s.pendingBuy = null;
  bankrupt(ctx, playerId, null);
  if (isEnded(s)) return;
  if (s.auction) {
    maybeEndAuction(ctx);
    if (isEnded(s) || s.phase === 'auction') return;
  }
  if (s.phase === 'awaitBuy' && currentPlayer(s).bankrupt) s.phase = 'postRoll';
  settleDebts(ctx);
  continueAfterElimination(ctx);
}

function bankrupt(ctx: Ctx, playerId: string, creditor: string | null): void {
  const { s, map } = ctx;
  const p = findPlayer(s, playerId);
  if (p.bankrupt) return;
  // Sell buildings back to the bank first.
  for (const idx of ownedTiles(s, playerId)) {
    const own = s.ownership[idx]!;
    const tile = tileAt(map, idx);
    if (tile.type === 'property' && own.houses > 0) {
      p.cash += Math.floor((own.houses * tile.houseCost) / 2);
      own.houses = 0;
    }
  }
  const creditorPlayer = creditor ? findPlayer(s, creditor) : null;
  if (creditorPlayer && !creditorPlayer.bankrupt) {
    if (p.cash > 0)
      emit(ctx, { type: 'paid', from: playerId, to: creditor, amount: p.cash, reason: 'bankruptcy' });
    creditorPlayer.cash += p.cash;
    creditorPlayer.jailCards += p.jailCards;
    for (const idx of ownedTiles(s, playerId)) s.ownership[idx]!.owner = creditorPlayer.id;
  } else {
    const tiles = ownedTiles(s, playerId);
    for (const idx of tiles) delete s.ownership[idx];
    if (s.rules.bankruptcyAuction && s.rules.auctionEnabled) {
      for (const idx of tiles) if (isOwnable(tileAt(map, idx))) s.auctionQueue.push(idx);
    }
    // Held jail cards go back to the decks.
    for (let i = 0; i < p.jailCards; i++) returnJailCard(ctx);
  }
  p.cash = 0;
  p.jailCards = 0;
  p.bankrupt = true;
  p.inJail = false;
  p.bankruptOnTurn = s.turn;
  s.debts = s.debts.filter((d) => d.debtor !== playerId);
  for (const d of s.debts)
    if (d.creditor === playerId) d.creditor = creditor && !creditorPlayer?.bankrupt ? creditor : null;
  for (const t of s.trades) {
    if (t.status === 'pending' && (t.from === playerId || t.to === playerId)) {
      t.status = 'expired';
      emit(ctx, { type: 'tradeExpired', tradeId: t.id });
    }
  }
  if (s.auction) {
    s.auction.active = s.auction.active.filter((id) => id !== playerId);
    if (s.auction.highBidder === playerId) {
      s.auction.highBidder = null;
      s.auction.highBid = 0;
    }
  }
  emit(ctx, { type: 'bankrupt', playerId, creditor });
  checkGameOver(ctx);
}

// ---------------------------------------------------------------------------
// System actions
// ---------------------------------------------------------------------------

function doTimeUp(ctx: Ctx): void {
  const { s, map } = ctx;
  if (isEnded(s)) return;
  emit(ctx, { type: 'timeUp' });
  const alive = alivePlayers(s);
  let best: Player | null = null;
  let bestNw = -1;
  for (const p of alive) {
    const nw = netWorth(s, map, p.id);
    if (nw > bestNw) {
      bestNw = nw;
      best = p;
    }
  }
  endGame(ctx, best?.id ?? null);
}

function doTick(ctx: Ctx, elapsedMs: number): void {
  const { s } = ctx;
  s.elapsedMs = elapsedMs;
  if (s.rules.timeLimitMinutes > 0 && elapsedMs >= s.rules.timeLimitMinutes * 60_000) doTimeUp(ctx);
}

/** What the server does for an AFK/disconnected player when their timer expires. */
function doAutoAct(ctx: Ctx, playerId: string): void {
  const { s, map } = ctx;
  if (isEnded(s)) return;
  const p = findPlayer(s, playerId);
  if (p.bankrupt) return;
  // Decline any trades waiting on this player.
  for (const t of s.trades) {
    if (t.status === 'pending' && t.to === playerId) {
      t.status = 'declined';
      emit(ctx, { type: 'tradeDeclined', tradeId: t.id, by: playerId });
    }
  }
  if (s.phase === 'debt' && C.isDebtor(s, playerId)) {
    autoLiquidate(ctx, playerId);
    if (C.isDebtor(s, playerId) && !isEnded(s)) {
      const debt = s.debts.find((d) => d.debtor === playerId)!;
      bankrupt(ctx, playerId, debt.creditor);
      settleDebts(ctx);
      continueAfterElimination(ctx);
    }
    return;
  }
  if (s.phase === 'auction' && s.auction && !C.checkPassBid(s, playerId)) {
    doPassBid(ctx, playerId);
    return;
  }
  if (!C.isCurrent(s, playerId)) return;
  switch (s.phase) {
    case 'preRoll':
      if (p.inJail && p.jailCards > 0) doUseJailCard(ctx, playerId);
      doRoll(ctx, playerId);
      return;
    case 'awaitBuy':
      doDeclineBuy(ctx, playerId);
      return;
    case 'postRoll':
      doEndTurn(ctx, playerId);
      return;
    default:
      return;
  }
  void map;
}

function autoLiquidate(ctx: Ctx, playerId: string): void {
  const { s, map } = ctx;
  const owed = () => s.debts.filter((d) => d.debtor === playerId).reduce((a, d) => a + d.amount, 0);
  const p = findPlayer(s, playerId);
  // Sell houses (highest first, respecting even-sell) until solvent.
  let guard = 200;
  while (p.cash < owed() && guard-- > 0) {
    const candidates = ownedTiles(s, playerId).filter((i) => !C.checkSellHouse(s, map, playerId, i));
    if (candidates.length === 0) break;
    candidates.sort((a, b) => (s.ownership[b]!.houses ?? 0) - (s.ownership[a]!.houses ?? 0));
    doSellHouse(ctx, playerId, candidates[0]!);
    if (p.bankrupt || isEnded(s)) return;
  }
  while (p.cash < owed() && guard-- > 0) {
    const candidates = ownedTiles(s, playerId).filter((i) => !C.checkMortgage(s, map, playerId, i));
    if (candidates.length === 0) break;
    doMortgage(ctx, playerId, candidates[0]!);
    if (p.bankrupt || isEnded(s)) return;
  }
}

/** Type-narrowing-proof check (immer drafts get mutated by callees). */
function isEnded(s: Draft<GameState>): boolean {
  return (s.status as string) === 'ended';
}
