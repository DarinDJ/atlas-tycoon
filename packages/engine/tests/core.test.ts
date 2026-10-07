import { describe, expect, it } from 'vitest';
import { formatMoney } from '../src/money.js';
import { nextInt, rollDie, seedFromString, shuffle } from '../src/rng.js';
import { cur, fails, find, has, ok, player, roll, setPos, setup, testMap } from './helpers.js';

describe('rng', () => {
  it('is deterministic for the same seed/count', () => {
    const a = { seed: 123, count: 0 };
    const b = { seed: 123, count: 0 };
    const xs = Array.from({ length: 20 }, () => rollDie(a));
    const ys = Array.from({ length: 20 }, () => rollDie(b));
    expect(xs).toEqual(ys);
    expect(a.count).toBe(20);
  });
  it('rolls dice in range with a roughly uniform distribution', () => {
    const rng = { seed: 7, count: 0 };
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[rollDie(rng) - 1]!++;
    for (const c of counts) expect(c).toBeGreaterThan(9000);
    for (const c of counts) expect(c).toBeLessThan(11000);
  });
  it('shuffles into a permutation', () => {
    const rng = { seed: 9, count: 0 };
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(rng, arr);
    expect(out.slice().sort()).toEqual(arr);
    expect(nextInt(rng, 3, 3)).toBe(3);
    expect(seedFromString('abc')).toBe(seedFromString('abc'));
    expect(seedFromString('abc')).not.toBe(seedFromString('abd'));
  });
});

describe('money formatting', () => {
  it('formats Indian lakh/crore', () => {
    const inr = { code: 'INR', symbol: '₹', style: 'indian-lakh' as const, locale: 'en-IN' };
    expect(formatMoney(60, inr)).toBe('₹60 L');
    expect(formatMoney(150, inr)).toBe('₹1.5 Cr');
    expect(formatMoney(1500, inr)).toBe('₹15 Cr');
    expect(formatMoney(-25, inr)).toBe('-₹25 L');
  });
  it('formats plain and compact', () => {
    expect(formatMoney(1500, testMap.currency)).toBe('$1,500');
    expect(formatMoney(12500, testMap.currency, { short: true })).toBe('$12.5K');
    expect(formatMoney(2500, { code: 'USD', symbol: '$', style: 'compact', locale: 'en-US' })).toBe('$2.5K');
  });
});

describe('game creation', () => {
  it('creates players with starting cash on Start', () => {
    const s = setup(3);
    expect(s.players).toHaveLength(3);
    for (const p of s.players) {
      expect(p.cash).toBe(1500);
      expect(p.position).toBe(0);
    }
    expect(s.phase).toBe('preRoll');
    expect(s.decks.luck.draw).toHaveLength(testMap.cards.luck.length);
  });
  it('randomises turn order when enabled', () => {
    const s = setup(6, { randomizeTurnOrder: true }, 5);
    expect(s.players.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const t = setup(6, { randomizeTurnOrder: true }, 5);
    expect(t.players.map((p) => p.id)).toEqual(s.players.map((p) => p.id));
  });
});

describe('movement', () => {
  it('moves by the dice total and lands on the tile', () => {
    const s = setup();
    const { state, events } = roll(s, 3, 4);
    expect(cur(state).position).toBe(7); // luck tile
    expect(find(events, 'rolled')?.dice).toEqual([3, 4]);
  });
  it('only the current player may roll and only in preRoll', () => {
    const s = setup();
    fails(s, { type: 'roll', playerId: 'p2' }, 'NOT_YOUR_TURN');
    const { state } = roll(s, 1, 1); // doubles; lands on p2 (idx 2 = treasure) -> card
    // after doubles the player can roll again (unless a card moved them)
    expect(['preRoll', 'awaitBuy', 'postRoll', 'debt']).toContain(state.phase);
  });
  it('collects salary when passing Start and ends turn without doubles', () => {
    let s = setPos(setup(), 'p1', 38);
    const r = roll(s, 2, 3); // 38 -> 3 (passes start) -> p2 property offered
    s = r.state;
    expect(has(r.events, 'salary')).toBe(true);
    expect(player(s, 'p1').cash).toBe(1700);
    expect(s.phase).toBe('awaitBuy');
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state; // auction
    expect(s.phase).toBe('auction');
    s = ok(s, { type: 'passBid', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    expect(s.phase).toBe('postRoll');
    s = ok(s, { type: 'endTurn', playerId: 'p1' }).state;
    expect(cur(s).id).toBe('p2');
    expect(s.turn).toBe(2);
  });
  it('doubles grant another roll; three doubles sends to jail', () => {
    let s = setup();
    s = roll(s, 2, 2).state; // -> tax at 4
    expect(s.phase).toBe('preRoll');
    expect(s.doubles).toBe(1);
    s = roll(s, 3, 3).state; // -> 10 jail (visiting)
    expect(s.phase).toBe('preRoll');
    expect(s.doubles).toBe(2);
    const r = roll(s, 1, 1);
    s = r.state;
    expect(has(r.events, 'jailed')).toBe(true);
    expect(cur(s).inJail).toBe(true);
    expect(cur(s).position).toBe(10);
    expect(s.phase).toBe('postRoll');
    fails(s, { type: 'roll', playerId: 'p1' }, 'BAD_PHASE');
  });
  it('cannot end turn before rolling', () => {
    const s = setup();
    fails(s, { type: 'endTurn', playerId: 'p1' }, 'BAD_PHASE');
  });
  it('go to jail tile jails the player without an extra roll', () => {
    let s = setPos(setup(), 'p1', 28);
    const r = roll(s, 1, 1); // 30 = go to jail, doubles
    s = r.state;
    expect(cur(s).inJail).toBe(true);
    expect(s.phase).toBe('postRoll');
  });
  it('pays tax: the lower of flat and percent of net worth', () => {
    let s = setup();
    s = roll(s, 1, 3).state; // tax at 4: min(200, 10% of 1500 = 150)
    expect(player(s, 'p1').cash).toBe(1350);
    expect(s.phase).toBe('postRoll');
  });
  it('free parking jackpot collects taxes when enabled', () => {
    let s = setup(2, { freeParkingJackpot: true });
    s = roll(s, 1, 3).state; // tax 150
    expect(s.freeParkingPot).toBe(150);
    s = ok(s, { type: 'endTurn', playerId: 'p1' }).state;
    s = setPos(s, 'p2', 15);
    const r = roll(s, 2, 3); // -> 20 free parking
    expect(has(r.events, 'jackpot')).toBe(true);
    expect(player(r.state, 'p2').cash).toBe(1650);
    expect(r.state.freeParkingPot).toBe(0);
  });
});
