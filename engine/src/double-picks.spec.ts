import { describe, expect, it } from 'vitest';
import { doublePicksProblem, startingDoublePicks } from './double-picks.js';

describe('doublePicksProblem', () => {
  it.each([2, 20, 40])('allows %i of 40 picks per player', (doublePicks) => {
    expect(doublePicksProblem(doublePicks, 40)).toBeNull();
  });

  it.each([0, 1, 3, 19, 42, -2, 2.5])(
    'refuses %s of 40 picks per player, naming the rule',
    (doublePicks) => {
      expect(doublePicksProblem(doublePicks, 40)).toBe(
        'Double picks must be an even number from 2 to 40.',
      );
    },
  );

  it('allows double picks equal to an even picks per player', () => {
    expect(doublePicksProblem(6, 6)).toBeNull();
  });

  it('refuses double picks for fewer than 2 picks per player', () => {
    expect(doublePicksProblem(2, 1)).toBe(
      'Double picks need at least 2 picks per player.',
    );
  });
});

describe('startingDoublePicks', () => {
  it('starts at the preferred number when picks per player allow it', () => {
    expect(startingDoublePicks(40, 20)).toBe(20);
    expect(startingDoublePicks(20, 20)).toBe(20);
  });

  it('starts at the largest even number no greater than fewer picks per player', () => {
    expect(startingDoublePicks(15, 20)).toBe(14);
    expect(startingDoublePicks(12, 20)).toBe(12);
    expect(startingDoublePicks(2, 20)).toBe(2);
  });
});
