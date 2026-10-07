import { describe, expect, it } from 'vitest';
import { fails, find, give, has, ok, patch, player, setCash, setup } from './helpers.js';

const side = (cash = 0, properties: number[] = [], jailCards = 0) => ({ cash, properties, jailCards });

describe('trading', () => {
  it('proposes and accepts a trade, moving cash, properties and jail cards', () => {
    let s = give(setup(3), 'p1', [1]);
    s = give(s, 'p2', [3, 5]);
    s = patch(s, (x) => {
      x.players[1]!.jailCards = 1;
    });
    const r = ok(s, {
      type: 'proposeTrade',
      playerId: 'p1',
      to: 'p2',
      offer: side(100, [1]),
      request: side(0, [3], 1),
    });
    s = r.state;
    const id = find(r.events, 'tradeProposed')!.tradeId;
    expect(s.trades[0]!.status).toBe('pending');
    fails(s, { type: 'acceptTrade', playerId: 'p3', tradeId: id }, 'NOT_RECIPIENT');
    fails(s, { type: 'acceptTrade', playerId: 'p1', tradeId: id }, 'NOT_RECIPIENT');
    const a = ok(s, { type: 'acceptTrade', playerId: 'p2', tradeId: id });
    s = a.state;
    expect(has(a.events, 'tradeAccepted')).toBe(true);
    expect(s.ownership[1]!.owner).toBe('p2');
    expect(s.ownership[3]!.owner).toBe('p1');
    expect(s.ownership[5]!.owner).toBe('p2');
    expect(player(s, 'p1').cash).toBe(1400);
    expect(player(s, 'p2').cash).toBe(1600);
    expect(player(s, 'p1').jailCards).toBe(1);
    expect(player(s, 'p2').jailCards).toBe(0);
    expect(s.stats.tradesCompleted).toBe(1);
  });
  it('validates ownership, cash, and empty trades', () => {
    const s = give(setup(), 'p1', [1]);
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [3]), request: side() },
      'NOT_OWNER',
    );
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(5000), request: side() },
      'NO_CASH',
    );
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(), request: side() },
      'EMPTY_TRADE',
    );
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p1', offer: side(10), request: side() },
      'SELF_TRADE',
    );
    // duplicates are normalised away rather than rejected
    expect(
      ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1, 1]), request: side() }).state
        .trades[0]!.offer.properties,
    ).toEqual([1]);
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(), request: side(0, [], 1) },
      'NO_CARD',
    );
  });
  it('cannot trade properties in a group with houses', () => {
    const s = give(setup(), 'p1', [1, 3], 1);
    fails(
      s,
      { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1]), request: side(10) },
      'GROUP_HAS_HOUSES',
    );
  });
  it('declines and cancels', () => {
    let s = give(setup(), 'p1', [1]);
    let r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1]), request: side(10) });
    s = r.state;
    const id = find(r.events, 'tradeProposed')!.tradeId;
    fails(s, { type: 'cancelTrade', playerId: 'p2', tradeId: id }, 'NOT_PROPOSER');
    s = ok(s, { type: 'declineTrade', playerId: 'p2', tradeId: id }).state;
    expect(s.trades.find((t) => t.id === id)!.status).toBe('declined');
    fails(s, { type: 'acceptTrade', playerId: 'p2', tradeId: id }, 'TRADE_CLOSED');
    r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1]), request: side(10) });
    s = r.state;
    const id2 = find(r.events, 'tradeProposed')!.tradeId;
    s = ok(s, { type: 'cancelTrade', playerId: 'p1', tradeId: id2 }).state;
    expect(s.trades.find((t) => t.id === id2)!.status).toBe('cancelled');
  });
  it('counter-offers create a reversed pending trade', () => {
    let s = give(setup(), 'p1', [1]);
    let r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1]), request: side(10) });
    s = r.state;
    const id = find(r.events, 'tradeProposed')!.tradeId;
    r = ok(s, { type: 'counterTrade', playerId: 'p2', tradeId: id, offer: side(5), request: side(0, [1]) });
    s = r.state;
    const ev = find(r.events, 'tradeCountered')!;
    expect(ev.tradeId).toBe(id);
    const counter = s.trades.find((t) => t.id === ev.newTradeId)!;
    expect(counter.from).toBe('p2');
    expect(counter.to).toBe('p1');
    expect(counter.counterOf).toBe(id);
    expect(s.trades.find((t) => t.id === id)!.status).toBe('countered');
    s = ok(s, { type: 'acceptTrade', playerId: 'p1', tradeId: counter.id }).state;
    expect(s.ownership[1]!.owner).toBe('p2');
    expect(player(s, 'p1').cash).toBe(1505);
  });
  it('a new offer to the same player replaces the old one', () => {
    let s = give(setup(), 'p1', [1]);
    s = ok(s, {
      type: 'proposeTrade',
      playerId: 'p1',
      to: 'p2',
      offer: side(0, [1]),
      request: side(10),
    }).state;
    s = ok(s, {
      type: 'proposeTrade',
      playerId: 'p1',
      to: 'p2',
      offer: side(0, [1]),
      request: side(20),
    }).state;
    expect(s.trades.filter((t) => t.status === 'pending')).toHaveLength(1);
    expect(s.trades.filter((t) => t.status === 'cancelled')).toHaveLength(1);
  });
  it('a trade becomes invalid if the proposer loses the cash before acceptance', () => {
    let s = give(setup(), 'p1', [1]);
    const r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(1000), request: side(0) });
    s = setCash(r.state, 'p1', 100);
    fails(
      s,
      { type: 'acceptTrade', playerId: 'p2', tradeId: find(r.events, 'tradeProposed')!.tradeId },
      'NO_CASH',
    );
  });
  it('accepting one trade expires other trades touching the same property', () => {
    let s = give(setup(3), 'p1', [1]);
    let r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p2', offer: side(0, [1]), request: side(10) });
    s = r.state;
    const id1 = find(r.events, 'tradeProposed')!.tradeId;
    r = ok(s, { type: 'proposeTrade', playerId: 'p1', to: 'p3', offer: side(0, [1]), request: side(15) });
    s = r.state;
    const id2 = find(r.events, 'tradeProposed')!.tradeId;
    s = ok(s, { type: 'acceptTrade', playerId: 'p2', tradeId: id1 }).state;
    expect(s.trades.find((t) => t.id === id2)!.status).toBe('expired');
  });
  it('accepting a cash trade can settle a debt', () => {
    let s = give(setup(2), 'p2', [37, 39], 5);
    s = setCash(s, 'p1', 100);
    s = give(s, 'p1', [1]);
    s = give(s, 'p1', [5, 15, 25, 35]); // liquidation 100 + 30 + 400 + 1500 >= 2000
    s = give(s, 'p1', [31, 32, 34], 5);
    // p1 moves to 39 and owes 2000
    s = patch(s, (x) => {
      x.players[0]!.position = 35;
    });
    s = ok(s, { type: 'roll', playerId: 'p1' }, { forceDice: [1, 3] }).state;
    expect(s.phase).toBe('debt');
    expect(s.debts[0]).toMatchObject({ debtor: 'p1', creditor: 'p2', amount: 2000 });
    s = setCash(s, 'p2', 2500);
    // p2 is generous: offers 2000 cash for tile 1
    const r = ok(s, {
      type: 'proposeTrade',
      playerId: 'p2',
      to: 'p1',
      offer: side(2000),
      request: side(0, [1]),
    });
    s = ok(r.state, {
      type: 'acceptTrade',
      playerId: 'p1',
      tradeId: find(r.events, 'tradeProposed')!.tradeId,
    }).state;
    expect(s.debts).toHaveLength(0);
    expect(s.phase).toBe('postRoll');
    expect(player(s, 'p1').cash).toBe(100);
    expect(player(s, 'p1').bankrupt).toBe(false);
  });
});
