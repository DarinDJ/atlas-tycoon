import type { RngState } from './types/state.js';

/** mulberry32: small, fast, deterministic. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a float in [0,1) and advances the counter. Mutates the (draft) rng state passed in. */
export function nextFloat(rng: RngState): number {
  // Derive a per-draw generator from seed+count so the sequence is reproducible from any snapshot.
  const gen = mulberry32((rng.seed ^ Math.imul(rng.count + 1, 0x9e3779b9)) >>> 0);
  rng.count += 1;
  gen(); // warm one step to decorrelate neighbouring seeds
  return gen();
}

export function nextInt(rng: RngState, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(nextFloat(rng) * span);
}

export function rollDie(rng: RngState): number {
  return nextInt(rng, 1, 6);
}

export function shuffle<T>(rng: RngState, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
