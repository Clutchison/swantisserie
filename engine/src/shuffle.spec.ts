import { describe, expect, it } from 'vitest';
import { shuffle } from './shuffle.js';

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
