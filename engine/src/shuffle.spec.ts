import { describe, expect, it } from 'vitest';
import { seededRandom, shuffle } from './shuffle.js';

describe('shuffle', () => {
  it('reorders with a Fisher–Yates pass driven by `random`', () => {
    // Each draw picks the index to swap into the last unshuffled place:
    // 0.0 → index 0, then 0.99 → the place itself.
    const draws = [0, 0.99];
    const random = () => draws.shift() ?? 0;

    expect(shuffle(['a', 'b', 'c'], random)).toEqual(['c', 'b', 'a']);
  });

  it('leaves the input alone', () => {
    const items = ['a', 'b', 'c'];
    shuffle(items, () => 0);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('seededRandom', () => {
  /** The first `count` numbers `seededRandom(rngSeed)` returns. */
  const draws = (rngSeed: number, count = 1000) => {
    const random = seededRandom(rngSeed);
    return Array.from({ length: count }, () => random());
  };

  it('returns numbers in [0, 1)', () => {
    for (const rngSeed of [0, 1, 42, -1, 0xffffffff, 2 ** 40 + 7]) {
      for (const value of draws(rngSeed)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('returns the same sequence for the same RNG seed', () => {
    expect(draws(7)).toEqual(draws(7));
  });

  it('returns a different sequence for a different RNG seed', () => {
    expect(draws(7, 5)).not.toEqual(draws(8, 5));
  });
});
