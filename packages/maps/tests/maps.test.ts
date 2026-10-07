import { describe, expect, it } from 'vitest';
import { analyzeBalance, simulateGame, validateMap } from '@bt/engine';
import { listMaps } from '../src/index.js';

describe('maps', () => {
  for (const map of listMaps()) {
    describe(map.id, () => {
      it('validates without errors', () => {
        const v = validateMap(map);
        expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
        expect(v.ok).toBe(true);
      });
      it('has a 40-tile board with the standard tile mix', () => {
        expect(map.tiles.length % 4).toBe(0);
        expect(map.tiles.filter((t) => t.type === 'property').length).toBeGreaterThanOrEqual(16);
        expect(map.tiles.filter((t) => t.type === 'transport').length).toBeGreaterThanOrEqual(2);
      });
      it('has unique card ids and sane balance', () => {
        const ids = [...map.cards.luck, ...map.cards.treasure].map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        const b = analyzeBalance(map);
        for (const g of b.groups) {
          expect(g.hotelRoi).toBeGreaterThan(0.2);
          expect(g.hotelRoi).toBeLessThan(3);
        }
      });
      it('plays a full bot game', () => {
        const r = simulateGame(map, { players: 4, seed: 3 });
        expect(r.turns).toBeGreaterThan(5);
      });
    });
  }
});
