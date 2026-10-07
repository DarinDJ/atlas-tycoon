import { describe, expect, it } from 'vitest';
import { legalActions } from '../src/engine/queries.js';
import {
  cur,
  fails,
  find,
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

function jailed(n = 2) {
  return patch(setup(n), (s) => {
    const p = s.players[0]!;
    p.inJail = true;
    p.position = 10;
  });
}

describe('jail', () => {
  it('pays the fine and then rolls normally', () => {
    let s = jailed();
    s = ok(s, { type: 'payJail', playerId: 'p1' }).state;
    expect(player(s, 'p1').cash).toBe(1450);
    expect(player(s, 'p1').inJail).toBe(false);
    expect(s.phase).toBe('preRoll');
    s = roll(s, 2, 2).state; // doubles still count after paying; lands on unowned 14
    expect(s.phase).toBe('awaitBuy');
    expect(s.doubles).toBe(1);
    s = ok(s, { type: 'buy', playerId: 'p1' }).state;
    expect(s.phase).toBe('preRoll');
  });
  it('rolling doubles leaves jail with no extra turn', () => {
    let s = jailed();
    const r = roll(s, 3, 3);
    s = r.state;
    expect(find(r.events, 'leftJail')?.how).toBe('doubles');
    expect(player(s, 'p1').position).toBe(16); // offered p9
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    expect(s.phase).toBe('postRoll');
  });
  it('failing three times forces payment and movement', () => {
    let s = jailed();
    const r1 = roll(s, 1, 2);
    s = r1.state;
    expect(has(r1.events, 'jailRollFailed')).toBe(true);
    expect(s.phase).toBe('postRoll');
    expect(player(s, 'p1').position).toBe(10);
    s = ok(s, { type: 'endTurn', playerId: 'p1' }).state;
    s = roll(s, 1, 2).state; // p2 -> 3 awaitBuy
    s = ok(s, { type: 'buy', playerId: 'p2' }).state;
    s = ok(s, { type: 'endTurn', playerId: 'p2' }).state;
    s = roll(s, 1, 2).state; // p1 fail #2
    s = ok(s, { type: 'endTurn', playerId: 'p1' }).state;
    s = roll(s, 1, 3).state; // p2 -> 7 luck -> some card
    // get back to p1 regardless of what the card did
    if (s.phase === 'awaitBuy') s = ok(s, { type: 'declineBuy', playerId: 'p2' }).state;
    while (s.phase === 'auction') {
      const w = s.auction!.active.find(
        (id) => !s.auction!.passed.includes(id) && s.auction!.highBidder !== id,
      )!;
      s = ok(s, { type: 'passBid', playerId: w }).state;
    }
    if (s.phase === 'preRoll' && cur(s).id === 'p2') s = roll(s, 1, 3).state;
    if (s.phase === 'awaitBuy') s = ok(s, { type: 'declineBuy', playerId: 'p2' }).state;
    while (s.phase === 'auction') {
      const w = s.auction!.active.find(
        (id) => !s.auction!.passed.includes(id) && s.auction!.highBidder !== id,
      )!;
      s = ok(s, { type: 'passBid', playerId: w }).state;
    }
    if (cur(s).id === 'p2' && s.phase === 'postRoll') s = ok(s, { type: 'endTurn', playerId: 'p2' }).state;
    expect(cur(s).id).toBe('p1');
    const cashBefore = player(s, 'p1').cash;
    const r3 = roll(s, 1, 2); // fail #3 -> forced out, pays 50, moves to 13
    s = r3.state;
    expect(find(r3.events, 'leftJail')?.how).toBe('forced');
    expect(player(s, 'p1').inJail).toBe(false);
    expect(player(s, 'p1').position).toBe(13);
    expect(player(s, 'p1').cash).toBe(cashBefore - 50);
  });
  it('uses a get-out-of-jail card', () => {
    let s = patch(jailed(), (s) => {
      s.players[0]!.jailCards = 1;
      s.decks.luck.held = [3];
    });
    fails(s, { type: 'useJailCard', playerId: 'p2' }, 'NOT_YOUR_TURN');
    s = ok(s, { type: 'useJailCard', playerId: 'p1' }).state;
    expect(player(s, 'p1').jailCards).toBe(0);
    expect(player(s, 'p1').inJail).toBe(false);
    expect(s.decks.luck.held).toEqual([]);
    expect(s.decks.luck.discard).toContain(3);
    fails(s, { type: 'useJailCard', playerId: 'p1' }, 'NOT_IN_JAIL');
  });
  it('cannot pay the fine without cash', () => {
    const s = setCash(jailed(), 'p1', 10);
    fails(s, { type: 'payJail', playerId: 'p1' }, 'NO_CASH');
    expect(legalActions(s, testMap, 'p1').payJail).toBe(false);
    expect(legalActions(s, testMap, 'p1').roll).toBe(true);
  });
});

describe('auction', () => {
  function startAuction(n = 3) {
    let s = setup(n);
    s = roll(s, 1, 2).state; // p1 offered tile 3
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state;
    expect(s.phase).toBe('auction');
    expect(s.auction!.tile).toBe(3);
    expect(s.auction!.active).toEqual(['p1', 'p2', 'p3'].slice(0, n));
    return s;
  }
  it('runs a bidding war and sells to the high bidder', () => {
    let s = startAuction();
    fails(s, { type: 'bid', playerId: 'p2', amount: 5 }, 'BID_TOO_LOW');
    s = ok(s, { type: 'bid', playerId: 'p2', amount: 10 }).state;
    fails(s, { type: 'bid', playerId: 'p2', amount: 20 }, 'ALREADY_HIGH');
    fails(s, { type: 'bid', playerId: 'p3', amount: 15 }, 'BID_TOO_LOW');
    s = ok(s, { type: 'bid', playerId: 'p3', amount: 20 }).state;
    s = ok(s, { type: 'bid', playerId: 'p1', amount: 50 }).state;
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    expect(s.phase).toBe('auction');
    const r = ok(s, { type: 'passBid', playerId: 'p3' });
    s = r.state;
    expect(find(r.events, 'auctionEnded')?.winner).toBe('p1');
    expect(s.ownership[3]!.owner).toBe('p1');
    expect(player(s, 'p1').cash).toBe(1450);
    expect(s.phase).toBe('postRoll');
    expect(s.auction).toBeNull();
  });
  it('ends with no sale if everyone passes', () => {
    let s = startAuction();
    s = ok(s, { type: 'passBid', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p3' }).state;
    const r = ok(s, { type: 'passBid', playerId: 'p2' });
    expect(find(r.events, 'auctionEnded')?.winner).toBeNull();
    expect(r.state.ownership[3]).toBeUndefined();
    expect(r.state.phase).toBe('postRoll');
  });
  it('a passed player cannot bid again; bids are capped by cash', () => {
    let s = startAuction();
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    fails(s, { type: 'bid', playerId: 'p2', amount: 100 }, 'ALREADY_PASSED');
    fails(s, { type: 'bid', playerId: 'p3', amount: 2000 }, 'NO_CASH');
    fails(s, { type: 'passBid', playerId: 'p2' }, 'ALREADY_PASSED');
    const la = legalActions(s, testMap, 'p3');
    expect(la.bid).toEqual({ min: 10, max: 1500 });
  });
  it('a high bidder who is outbid can bid again', () => {
    let s = startAuction(2);
    s = ok(s, { type: 'bid', playerId: 'p1', amount: 10 }).state;
    s = ok(s, { type: 'bid', playerId: 'p2', amount: 20 }).state;
    s = ok(s, { type: 'bid', playerId: 'p1', amount: 30 }).state;
    const r = ok(s, { type: 'passBid', playerId: 'p2' });
    expect(r.state.ownership[3]!.owner).toBe('p1');
  });
  it('after an auction following doubles the player rolls again', () => {
    let s = setPos(setup(2), 'p1', 1);
    s = roll(s, 1, 1).state; // -> 3 offered, doubles
    s = ok(s, { type: 'declineBuy', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p1' }).state;
    s = ok(s, { type: 'passBid', playerId: 'p2' }).state;
    expect(s.phase).toBe('preRoll');
    expect(cur(s).id).toBe('p1');
  });
});
