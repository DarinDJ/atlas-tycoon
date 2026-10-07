import { describe, expect, it } from 'vitest';
import { computeRent, netWorth } from '../src/engine/helpers.js';
import { legalActions } from '../src/engine/queries.js';
import { cur, fails, find, give, has, ok, player, roll, setCash, setPos, setup, testMap } from './helpers.js';

describe('buying', () => {
  it('offers an unowned property and buys it', () => {
    let s = setup();
    s = roll(s, 1, 2).state; // -> 3 (p2, $60)
    expect(s.phase).toBe('awaitBuy');
    expect(s.pendingBuy).toBe(3);
    expect(legalActions(s, testMap, 'p1').buy).toBe(true);
    expect(legalActions(s, testMap, 'p2').buy).toBe(false);
    const r = ok(s, { type: 'buy', playerId: 'p1' });
    s = r.state;
    expect(has(r.events, 'bought')).toBe(true);
    expect(s.ownership[3]).toEqual({ owner: 'p1', houses: 0, mortgaged: false });
    expect(player(s, 'p1').cash).toBe(1440);
    expect(s.phase).toBe('postRoll');
  });
  it('cannot buy without cash, cannot roll while a buy is pending', () => {
    let s = setup();
    s = setCash(s, 'p1', 30);
    s = roll(s, 1, 2).state;
    fails(s, { type: 'buy', playerId: 'p1' }, 'NO_CASH');
    fails(s, { type: 'roll', playerId: 'p1' }, 'BAD_PHASE');
    fails(s, { type: 'endTurn', playerId: 'p1' }, 'BAD_PHASE');
  });
  it('declining with auctions disabled just continues', () => {
    let s = setup(2, { auctionEnabled: false });
    s = roll(s, 1, 2).state;
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state;
    expect(s.phase).toBe('postRoll');
    expect(s.ownership[3]).toBeUndefined();
  });
  it('landing on your own property does nothing', () => {
    let s = give(setup(), 'p1', [3]);
    s = roll(s, 1, 2).state;
    expect(s.phase).toBe('postRoll');
    expect(player(s, 'p1').cash).toBe(1500);
  });
});

describe('rent', () => {
  it('charges base rent to the owner', () => {
    let s = give(setup(), 'p2', [3]);
    const r = roll(s, 1, 2);
    s = r.state;
    expect(find(r.events, 'rentDue')?.amount).toBe(4);
    expect(player(s, 'p1').cash).toBe(1496);
    expect(player(s, 'p2').cash).toBe(1504);
    expect(s.phase).toBe('postRoll');
  });
  it('doubles rent on a full set with no houses', () => {
    let s = give(setup(), 'p2', [1, 3]);
    s = roll(s, 1, 2).state;
    expect(player(s, 'p1').cash).toBe(1492);
    const noDouble = give(setup(2, { doubleRentOnFullSet: false }), 'p2', [1, 3]);
    expect(computeRent(noDouble, testMap, 3, 7)).toBe(4);
  });
  it('uses the house rent table', () => {
    let s = give(setup(), 'p2', [1, 3], 3);
    s = roll(s, 1, 2).state;
    expect(player(s, 'p1').cash).toBe(1500 - 180);
    const hotel = give(setup(), 'p2', [1, 3], 5);
    expect(computeRent(hotel, testMap, 3, 7)).toBe(450);
  });
  it('transport rent scales with the number owned', () => {
    expect(computeRent(give(setup(), 'p2', [5]), testMap, 5, 7)).toBe(25);
    expect(computeRent(give(setup(), 'p2', [5, 15]), testMap, 5, 7)).toBe(50);
    expect(computeRent(give(setup(), 'p2', [5, 15, 25, 35]), testMap, 5, 7)).toBe(200);
  });
  it('utility rent is dice-based', () => {
    expect(computeRent(give(setup(), 'p2', [12]), testMap, 12, 7)).toBe(28);
    expect(computeRent(give(setup(), 'p2', [12, 28]), testMap, 12, 7)).toBe(70);
    let s = give(setup(), 'p2', [12]);
    s = roll(s, 6, 6).state; // lands 12 with total 12 -> 48
    expect(player(s, 'p1').cash).toBe(1452);
  });
  it('no rent on mortgaged property or when owner is jailed (rule)', () => {
    expect(computeRent(give(setup(), 'p2', [3], 0, true), testMap, 3, 7)).toBe(0);
    let s = give(setup(2, { noRentInJail: true }), 'p2', [3]);
    s = s = structuredClone(s);
    s.players[1]!.inJail = true;
    expect(computeRent(s, testMap, 3, 7)).toBe(0);
  });
  it('net worth counts cash, properties and houses', () => {
    let s = give(setup(), 'p1', [1, 3], 2);
    s = give(s, 'p1', [5], 0, true);
    expect(netWorth(s, testMap, 'p1')).toBe(1500 + 60 + 60 + 4 * 50 + 100);
  });
});

describe('building', () => {
  it('requires a full set and even build', () => {
    let s = give(setup(), 'p1', [1]);
    fails(s, { type: 'build', playerId: 'p1', tile: 1 }, 'NEED_FULL_SET');
    s = give(s, 'p1', [1, 3]);
    s = ok(s, { type: 'build', playerId: 'p1', tile: 1 }).state;
    expect(s.ownership[1]!.houses).toBe(1);
    expect(player(s, 'p1').cash).toBe(1450);
    fails(s, { type: 'build', playerId: 'p1', tile: 1 }, 'EVEN_BUILD');
    s = ok(s, { type: 'build', playerId: 'p1', tile: 3 }).state;
    s = ok(s, { type: 'build', playerId: 'p1', tile: 1 }).state;
    expect(legalActions(s, testMap, 'p1').build).toEqual([3]);
  });
  it('builds up to a hotel and respects supply limits', () => {
    let s = give(setup(2, { houseLimit: 5 }), 'p1', [1, 3], 4);
    s = ok(s, { type: 'build', playerId: 'p1', tile: 1 }).state;
    expect(s.ownership[1]!.houses).toBe(5);
    fails(s, { type: 'build', playerId: 'p1', tile: 1 }, 'MAX_BUILT');
    const limited = give(setup(2, { houseLimit: 1 }), 'p1', [1, 3]);
    const one = ok(limited, { type: 'build', playerId: 'p1', tile: 1 }).state;
    fails(one, { type: 'build', playerId: 'p1', tile: 3 }, 'NO_HOUSES');
    const hotels = give(setup(2, { hotelLimit: 0 }), 'p1', [1, 3], 4);
    fails(hotels, { type: 'build', playerId: 'p1', tile: 1 }, 'NO_HOTELS');
  });
  it('cannot build when a group member is mortgaged or by non-owner', () => {
    let s = give(setup(), 'p1', [1, 3]);
    s = ok(s, { type: 'mortgage', playerId: 'p1', tile: 3 }).state;
    fails(s, { type: 'build', playerId: 'p1', tile: 1 }, 'GROUP_MORTGAGED');
    fails(s, { type: 'build', playerId: 'p2', tile: 1 }, 'NOT_OWNER');
    fails(s, { type: 'build', playerId: 'p1', tile: 5 }, 'NOT_PROPERTY');
  });
  it('sells houses for half price with even-sell', () => {
    let s = give(setup(), 'p1', [1, 3], 2);
    s = ok(s, { type: 'sellHouse', playerId: 'p1', tile: 1 }).state;
    expect(player(s, 'p1').cash).toBe(1525);
    fails(s, { type: 'sellHouse', playerId: 'p1', tile: 1 }, 'EVEN_SELL');
    s = ok(s, { type: 'sellHouse', playerId: 'p1', tile: 3 }).state;
    expect(s.ownership[3]!.houses).toBe(1);
  });
  it('actionsAnytime=false restricts building to your own turn', () => {
    const s = give(setup(2, { actionsAnytime: false }), 'p2', [1, 3]);
    fails(s, { type: 'build', playerId: 'p2', tile: 1 }, 'NOT_YOUR_TURN');
    const t = give(setup(2, { actionsAnytime: false }), 'p1', [1, 3]);
    expect(ok(t, { type: 'build', playerId: 'p1', tile: 1 }).state.ownership[1]!.houses).toBe(1);
  });
});

describe('mortgage', () => {
  it('mortgages for half price and unmortgages with interest', () => {
    let s = give(setup(), 'p1', [5]);
    s = ok(s, { type: 'mortgage', playerId: 'p1', tile: 5 }).state;
    expect(player(s, 'p1').cash).toBe(1600);
    expect(s.ownership[5]!.mortgaged).toBe(true);
    fails(s, { type: 'mortgage', playerId: 'p1', tile: 5 }, 'ALREADY_MORTGAGED');
    s = ok(s, { type: 'unmortgage', playerId: 'p1', tile: 5 }).state;
    expect(player(s, 'p1').cash).toBe(1490);
    expect(s.ownership[5]!.mortgaged).toBe(false);
  });
  it('cannot mortgage when the group has houses', () => {
    let s = give(setup(), 'p1', [1, 3]);
    s = ok(s, { type: 'build', playerId: 'p1', tile: 1 }).state;
    fails(s, { type: 'mortgage', playerId: 'p1', tile: 3 }, 'GROUP_HAS_HOUSES');
  });
  it('cannot unmortgage without cash', () => {
    let s = give(setup(), 'p1', [5], 0, true);
    s = setCash(s, 'p1', 50);
    fails(s, { type: 'unmortgage', playerId: 'p1', tile: 5 }, 'NO_CASH');
  });
});

describe('legal actions', () => {
  it('reports what the current player can do', () => {
    const s = setup();
    const la = legalActions(s, testMap, 'p1');
    expect(la.roll).toBe(true);
    expect(la.endTurn).toBe(false);
    expect(la.mustAct).toBe(true);
    const other = legalActions(s, testMap, 'p2');
    expect(other.roll).toBe(false);
    expect(other.mustAct).toBe(false);
    expect(cur(s).id).toBe('p1');
    expect(setPos(s, 'p1', 5).players[0]!.position).toBe(5);
  });
});
