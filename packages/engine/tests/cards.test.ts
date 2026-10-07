import { describe, expect, it } from 'vitest';
import { cur, find, give, has, patch, player, roll, setPos, setup, topCard } from './helpers.js';

describe('cards', () => {
  it('money card credits the player and goes to discard', () => {
    let s = topCard(setup(), 'treasure', 't-collect200');
    const r = roll(s, 1, 1); // -> 2 treasure
    s = r.state;
    expect(find(r.events, 'cardDrawn')?.cardId).toBe('t-collect200');
    expect(player(s, 'p1').cash).toBe(1700);
    expect(s.decks.treasure.discard).toHaveLength(1);
    expect(s.phase).toBe('preRoll'); // doubles
  });
  it('pay card charges the player', () => {
    let s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-pay50');
    s = roll(s, 1, 2).state; // -> 7 luck
    expect(player(s, 'p1').cash).toBe(1450);
  });
  it('advance to Start collects salary', () => {
    let s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-advance-start');
    const r = roll(s, 1, 2);
    s = r.state;
    expect(player(s, 'p1').position).toBe(0);
    expect(player(s, 'p1').cash).toBe(1700);
    expect(s.phase).toBe('postRoll');
  });
  it('moveTo past Start collects salary and resolves the destination', () => {
    let s = topCard(setPos(setup(), 'p1', 33), 'luck', 'l-p22');
    s = roll(s, 1, 2).state; // -> 36 luck -> advance to 39 (no start passed)
    expect(player(s, 'p1').position).toBe(39);
    expect(s.phase).toBe('awaitBuy');
    expect(player(s, 'p1').cash).toBe(1500);
    let t = topCard(setPos(setup(), 'p1', 33), 'luck', 'l-advance-start');
    t = roll(t, 1, 2).state;
    expect(player(t, 'p1').cash).toBe(1700);
  });
  it('go back 3 lands on the tile behind and resolves it', () => {
    let s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-back3');
    s = roll(s, 1, 2).state; // 7 -> back to 4 = tax
    expect(player(s, 'p1').position).toBe(4);
    expect(player(s, 'p1').cash).toBe(1350);
  });
  it('go to jail card', () => {
    const s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-jail');
    const r = roll(s, 1, 2);
    expect(find(r.events, 'jailed')?.reason).toBe('card');
    expect(player(r.state, 'p1').inJail).toBe(true);
    expect(r.state.phase).toBe('postRoll');
  });
  it('jail-free card is held, not discarded, and returns when used', () => {
    let s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-jailfree');
    s = roll(s, 1, 2).state;
    expect(player(s, 'p1').jailCards).toBe(1);
    expect(s.decks.luck.held).toHaveLength(1);
    expect(s.decks.luck.discard).toHaveLength(0);
  });
  it('repairs charges per house and hotel', () => {
    let s = give(setup(), 'p1', [1, 3], 2);
    s = give(s, 'p1', [6, 8, 9], 5);
    s = topCard(setPos(s, 'p1', 4), 'luck', 'l-repairs');
    s = roll(s, 1, 2).state;
    expect(player(s, 'p1').cash).toBe(1500 - (4 * 25 + 3 * 100));
  });
  it('collect from each player', () => {
    let s = topCard(setup(3), 'treasure', 't-each50');
    s = roll(s, 1, 1).state;
    expect(player(s, 'p1').cash).toBe(1600);
    expect(player(s, 'p2').cash).toBe(1450);
    expect(player(s, 'p3').cash).toBe(1450);
  });
  it('pay each player', () => {
    let s = topCard(setup(3), 'treasure', 't-payeach50');
    s = roll(s, 1, 1).state;
    expect(player(s, 'p1').cash).toBe(1400);
    expect(player(s, 'p2').cash).toBe(1550);
  });
  it('nearest transport pays double rent to the owner', () => {
    let s = give(setup(), 'p2', [15]);
    s = topCard(setPos(s, 'p1', 4), 'luck', 'l-nearest-t');
    const r = roll(s, 1, 2); // 7 -> nearest transport 15
    s = r.state;
    expect(player(s, 'p1').position).toBe(15);
    expect(find(r.events, 'rentDue')?.amount).toBe(50);
    expect(player(s, 'p2').cash).toBe(1550);
  });
  it('nearest transport unowned offers purchase', () => {
    let s = topCard(setPos(setup(), 'p1', 4), 'luck', 'l-nearest-t');
    s = roll(s, 1, 2).state;
    expect(s.phase).toBe('awaitBuy');
    expect(s.pendingBuy).toBe(15);
  });
  it('nearest utility rolls dice and pays 10x', () => {
    let s = give(setup(), 'p2', [12]);
    s = topCard(setPos(s, 'p1', 4), 'luck', 'l-nearest-u');
    const r = roll(s, 1, 2);
    s = r.state;
    const rolled = r.events.filter((e) => e.type === 'rolled');
    expect(rolled).toHaveLength(2);
    const d = (rolled[1] as { dice: [number, number] }).dice;
    expect(find(r.events, 'rentDue')?.amount).toBe((d[0] + d[1]) * 10);
  });
  it('nearest transport wraps past Start and collects salary', () => {
    let s = topCard(setPos(setup(), 'p1', 33), 'luck', 'l-nearest-t');
    s = roll(s, 1, 2).state; // 36 -> nearest transport is 5 (wrap)
    expect(player(s, 'p1').position).toBe(5);
    expect(player(s, 'p1').cash).toBe(1700);
  });
  it('reshuffles the discard pile when the deck is empty', () => {
    let s = patch(setup(), (x) => {
      x.decks.treasure.draw = [0];
      x.decks.treasure.discard = [1, 2, 4];
    });
    s = roll(s, 1, 1).state; // draws card 0
    expect(s.decks.treasure.draw).toHaveLength(0);
    s = patch(s, (x) => {
      x.players[0]!.position = 0;
      x.phase = 'preRoll';
      x.doubles = 0;
    });
    const r = roll(s, 1, 1);
    expect(has(r.events, 'cardDrawn')).toBe(true);
    expect(r.state.decks.treasure.draw.length + r.state.decks.treasure.discard.length).toBe(4);
    expect(cur(r.state).id).toBe('p1');
  });
});
