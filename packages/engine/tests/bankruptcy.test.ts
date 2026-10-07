import { describe, expect, it } from 'vitest';
import { legalActions, waitingOn } from '../src/engine/queries.js';
import {
  cur,
  fails,
  find,
  give,
  has,
  ok,
  patch,
  player,
  roll,
  setCash,
  setPos,
  setup,
  testMap,
} from './helpers.js';

/** p1 at 35 with little cash, p2 owns hotels on tile 39 (rent 2000). */
function broke(n = 2, cash = 100) {
  let s = give(setup(n), 'p2', [37, 39], 5);
  s = setCash(s, 'p1', cash);
  s = setPos(s, 'p1', 35);
  return s;
}

describe('debt & bankruptcy', () => {
  it('enters the debt phase when rent cannot be paid and resolves by mortgaging', () => {
    let s = give(broke(), 'p1', [5, 15, 25, 35, 12, 28]); // 4 transports + 2 utilities -> 550 mortgage value
    s = give(s, 'p1', [31, 32, 34], 5); // hotels: 15 houses-equiv * 200 / 2 = 1500 refund
    s = roll(s, 1, 3).state; // -> 39
    expect(s.phase).toBe('debt');
    expect(waitingOn(s)).toEqual(['p1']);
    expect(legalActions(s, testMap, 'p1').declareBankrupt).toBe(true);
    fails(s, { type: 'endTurn', playerId: 'p1' }, 'BAD_PHASE');
    fails(s, { type: 'build', playerId: 'p1', tile: 31 }, 'IN_DEBT');
    // sell hotels one by one (even sell) then mortgage
    for (const t of [31, 32, 34, 31, 32, 34, 31, 32, 34, 31, 32, 34, 31, 32, 34]) {
      if (s.phase !== 'debt') break;
      s = ok(s, { type: 'sellHouse', playerId: 'p1', tile: t }).state;
    }
    for (const t of [5, 15, 25, 35, 12, 28]) {
      if (s.phase !== 'debt') break;
      s = ok(s, { type: 'mortgage', playerId: 'p1', tile: t }).state;
    }
    expect(s.phase).toBe('postRoll');
    expect(s.debts).toHaveLength(0);
    expect(player(s, 'p2').cash).toBe(3500);
    expect(player(s, 'p1').bankrupt).toBe(false);
  });
  it('auto-bankrupts a player whose liquidation value cannot cover the debt', () => {
    let s = give(broke(3), 'p1', [5]);
    const r = roll(s, 1, 3);
    s = r.state;
    expect(has(r.events, 'bankrupt')).toBe(true);
    expect(player(s, 'p1').bankrupt).toBe(true);
    // creditor gets cash + the transport
    expect(player(s, 'p2').cash).toBe(1600);
    expect(s.ownership[5]!.owner).toBe('p2');
    expect(player(s, 'p1').cash).toBe(0);
    // turn moves on
    expect(cur(s).id).toBe('p2');
    expect(s.phase).toBe('preRoll');
    expect(s.status).toBe('playing');
  });
  it('ends the game when only one player remains', () => {
    const s = give(broke(2), 'p1', [5]);
    const r = roll(s, 1, 3);
    expect(r.state.status).toBe('ended');
    expect(r.state.winner).toBe('p2');
    expect(r.state.ranking).toEqual(['p2', 'p1']);
    expect(find(r.events, 'gameOver')?.winner).toBe('p2');
    fails(r.state, { type: 'roll', playerId: 'p2' }, 'GAME_OVER');
  });
  it('declareBankrupt hands assets to the creditor, houses are sold first', () => {
    let s = give(broke(3, 100), 'p1', [1, 3], 2); // 4 houses * 50 / 2 = 100 refund -> total 200 cash
    s = give(s, 'p1', [5], 0, true);
    s = roll(s, 1, 3).state;
    // liquidation (100 + 100 + 60) < 2000, so the engine auto-bankrupts immediately
    expect(player(s, 'p1').bankrupt).toBe(true);
    expect(s.phase).toBe('preRoll');
    expect(s.ownership[1]).toMatchObject({ owner: 'p2', houses: 0 });
    expect(s.ownership[5]).toMatchObject({ owner: 'p2', mortgaged: true });
    expect(player(s, 'p2').cash).toBe(1500 + 100 + 100);
  });
  it('a player can voluntarily declare bankruptcy while solvent-by-liquidation', () => {
    let s = give(broke(3, 100), 'p1', [5, 15, 25, 35, 12, 28]);
    s = give(s, 'p1', [31, 32, 34], 5);
    s = roll(s, 1, 3).state;
    expect(s.phase).toBe('debt');
    const r = ok(s, { type: 'declareBankrupt', playerId: 'p1' });
    s = r.state;
    expect(player(s, 'p1').bankrupt).toBe(true);
    expect(s.ownership[31]).toMatchObject({ owner: 'p2', houses: 0 });
    expect(player(s, 'p2').cash).toBe(1500 + 100 + 1500); // cash + house refunds
    expect(cur(s).id).toBe('p2');
  });
  it('bankruptcy to the bank returns properties to the bank', () => {
    let s = setCash(setup(3), 'p1', 10);
    s = give(s, 'p1', [1, 3], 1);
    s = roll(s, 1, 3).state; // tax: min(200, 10% nw) = 10% of (10+120+100)=23 -> can pay. Use luxury tax instead.
    s = setCash(setup(3), 'p1', 10);
    s = give(s, 'p1', [5]);
    s = setPos(s, 'p1', 34);
    const r = roll(s, 1, 3); // -> 38 luxury tax 100; liquidation = 10 + 100 >= 100 so phase debt
    s = r.state;
    expect(s.phase).toBe('debt');
    s = ok(s, { type: 'resign', playerId: 'p1' }).state;
    expect(player(s, 'p1').bankrupt).toBe(true);
    expect(s.ownership[5]).toBeUndefined();
    expect(cur(s).id).toBe('p2');
    expect(s.debts).toHaveLength(0);
  });
  it('bankruptcy to the bank can queue auctions for the properties', () => {
    let s = setCash(setup(3, { bankruptcyAuction: true }), 'p1', 10);
    s = give(s, 'p1', [5, 15]);
    s = setPos(s, 'p1', 34);
    s = roll(s, 1, 3).state; // debt 100
    s = ok(s, { type: 'declareBankrupt', playerId: 'p1' }).state;
    expect(s.phase).toBe('auction');
    expect(s.auction!.tile).toBe(5);
    expect(s.auction!.active).toEqual(['p2', 'p3']);
    s = ok(s, { type: 'bid', playerId: 'p2', amount: 50 }).state;
    s = ok(s, { type: 'passBid', playerId: 'p3' }).state;
    expect(s.ownership[5]!.owner).toBe('p2');
    expect(s.phase).toBe('auction');
    expect(s.auction!.tile).toBe(15);
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p3' }).state;
    expect(s.phase).toBe('preRoll');
    expect(cur(s).id).toBe('p2');
  });
  it('resigning outside your turn removes you and the game continues', () => {
    let s = setup(3);
    s = give(s, 'p3', [1]);
    const r = ok(s, { type: 'resign', playerId: 'p3' });
    s = r.state;
    expect(player(s, 'p3').bankrupt).toBe(true);
    expect(s.ownership[1]).toBeUndefined();
    expect(cur(s).id).toBe('p1');
    expect(s.phase).toBe('preRoll');
    s = roll(s, 1, 2).state;
    s = ok(s, { type: 'buy', playerId: 'p1' }).state;
    s = ok(s, { type: 'endTurn', playerId: 'p1' }).state;
    expect(cur(s).id).toBe('p2');
    s = ok(s, { type: 'resign', playerId: 'p2' }).state;
    expect(s.status).toBe('ended');
    expect(s.winner).toBe('p1');
  });
  it('resigning during your own auction ends it cleanly', () => {
    let s = setup(3);
    s = roll(s, 1, 2).state;
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state;
    s = ok(s, { type: 'bid', playerId: 'p2', amount: 10 }).state;
    s = ok(s, { type: 'resign', playerId: 'p1' }).state;
    expect(s.phase).toBe('auction');
    expect(s.auction!.active).toEqual(['p2', 'p3']);
    s = ok(s, { type: 'passBid', playerId: 'p3' }).state;
    expect(s.ownership[3]!.owner).toBe('p2');
    expect(cur(s).id).toBe('p2');
    expect(s.phase).toBe('preRoll');
  });
  it('sys:autoAct liquidates an AFK debtor and bankrupts if still short', () => {
    let s = give(broke(3), 'p1', [5, 15], 0);
    s = give(s, 'p1', [1, 3], 2);
    s = roll(s, 1, 3).state;
    expect(player(s, 'p1').bankrupt).toBe(true); // can't cover 2000 anyway -> auto
    expect(s.phase).toBe('preRoll');
    // Now a case where liquidation covers it
    let t = give(broke(3, 1000), 'p1', [5, 15, 25, 35]);
    t = give(t, 'p1', [31, 32, 34], 3);
    t = roll(t, 1, 3).state;
    expect(t.phase).toBe('debt');
    t = ok(t, { type: 'sys:autoAct', playerId: 'p1' }).state;
    expect(t.debts).toHaveLength(0);
    expect(player(t, 'p1').bankrupt).toBe(false);
    expect(t.phase).toBe('postRoll');
  });
  it('timed mode ends with the richest player winning', () => {
    let s = give(setup(3, { timeLimitMinutes: 1 }), 'p3', [37, 39]);
    s = ok(s, { type: 'sys:tick', elapsedMs: 30_000 }).state;
    expect(s.status).toBe('playing');
    s = ok(s, { type: 'sys:tick', elapsedMs: 60_000 }).state;
    expect(s.status).toBe('ended');
    expect(s.winner).toBe('p3');
    expect(s.ranking[0]).toBe('p3');
  });
  it('eachPlayer debts from a card put several players into debt at once', () => {
    let s = setup(3);
    s = setCash(s, 'p2', 10);
    s = setCash(s, 'p3', 10);
    s = give(s, 'p2', [5]);
    s = patch(s, (x) => {
      x.decks.treasure.draw = [1, ...x.decks.treasure.draw.filter((i) => i !== 1)]; // collect 50 from each
    });
    s = roll(s, 1, 1).state; // -> 2 treasure
    expect(s.phase).toBe('debt');
    expect(waitingOn(s).sort()).toEqual(['p2']); // p3 has nothing to liquidate -> auto bankrupt
    expect(player(s, 'p3').bankrupt).toBe(true);
    s = ok(s, { type: 'mortgage', playerId: 'p2', tile: 5 }).state;
    expect(s.phase).toBe('preRoll'); // p1 rolled doubles, continues
    expect(cur(s).id).toBe('p1');
    expect(player(s, 'p1').cash).toBe(1500 + 50 + 10); // p3 paid what they had via bankruptcy transfer
  });
});
