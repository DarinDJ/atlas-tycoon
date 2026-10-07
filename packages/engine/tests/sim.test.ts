import { describe, expect, it } from 'vitest';
import { botDecide, valueOf } from '../src/bots/index.js';
import { runSimulations, simulateGame } from '../src/sim/simulate.js';
import { validateMap } from '../src/validate/schema.js';
import { analyzeBalance } from '../src/validate/balance.js';
import { testMap } from './fixtures/testMap.js';
import { give, roll, setup } from './helpers.js';

describe('bots & simulation', () => {
  it('bots always produce a legal action when it is their turn', () => {
    let s = setup(2);
    s = roll(s, 1, 2).state; // awaitBuy
    const a = botDecide(s, testMap, 'p1', 'hard');
    expect(a && ['buy', 'declineBuy'].includes(a.type)).toBe(true);
    expect(botDecide(s, testMap, 'p2', 'hard')).toBeNull();
  });
  it('hard bots value set-completing properties higher', () => {
    const s = give(setup(2), 'p1', [1]);
    expect(valueOf(s, testMap, 'p1', 3, 'hard')).toBeGreaterThan(valueOf(s, testMap, 'p2', 3, 'hard'));
    expect(valueOf(s, testMap, 'p1', 3, 'easy')).toBe(60);
  });
  it('a full bot-vs-bot game finishes with a winner', () => {
    const r = simulateGame(testMap, { players: 4, seed: 11, levels: ['easy', 'medium', 'hard', 'medium'] });
    expect(r.winner).not.toBeNull();
    expect(r.turns).toBeGreaterThan(10);
  });
  it('many games finish and seat win rates are plausible', () => {
    const rep = runSimulations(testMap, 30, { players: 4, seed: 100, levels: ['medium'] });
    expect(rep.games).toBe(30);
    expect(rep.turnLimitRate).toBeLessThan(0.5);
    const total = rep.winRateBySeat.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.5);
    expect(rep.avgPropertiesBought).toBeGreaterThan(10);
  }, 60_000);
  it('games are reproducible from the seed', () => {
    const a = simulateGame(testMap, { players: 3, seed: 7 });
    const b = simulateGame(testMap, { players: 3, seed: 7 });
    expect(a.winner).toBe(b.winner);
    expect(a.turns).toBe(b.turns);
    expect(a.actions).toBe(b.actions);
  });
});

describe('map validation', () => {
  it('accepts the test map', () => {
    const v = validateMap(testMap);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it('rejects broken maps with useful paths', () => {
    const broken = structuredClone(testMap) as unknown as {
      tiles: unknown[];
      cards: { luck: { effect: unknown }[] };
    };
    broken.tiles[1] = { ...(broken.tiles[1] as object), id: 'start' };
    (broken.cards.luck[0] as { effect: unknown }).effect = { kind: 'moveTo', tileId: 'nowhere' };
    const v = validateMap(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.message.includes('Duplicate tile id'))).toBe(true);
    expect(v.issues.some((i) => i.message.includes('nowhere'))).toBe(true);
    expect(validateMap({}).ok).toBe(false);
  });
  it('produces a balance report', () => {
    const b = analyzeBalance(testMap);
    expect(b.groups).toHaveLength(8);
    expect(b.groups[0]!.setCost).toBe(120);
    expect(b.transports?.count).toBe(4);
  });
});
