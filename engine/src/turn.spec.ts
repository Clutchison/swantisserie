import { describe, expect, it } from 'vitest';
import {
  currentTurn,
  draftComplete,
  nextTurn,
  roundRunsForward,
} from './turn.js';

describe('currentTurn', () => {
  it('starts with the first seat taking pick 1 of round 1', () => {
    expect(currentTurn({ players: 3, picksPerPlayer: 2 }, 0)).toEqual({
      pick: 1,
      round: 1,
      seat: 0,
    });
  });

  it('runs 1→N then N→1, so the last seat picks twice at the turn', () => {
    const seats = Array.from(
      { length: 9 },
      (_, picksMade) =>
        currentTurn({ players: 3, picksPerPlayer: 3 }, picksMade)?.seat,
    );
    expect(seats).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
  });

  it('counts rounds and picks across the whole draft', () => {
    expect(currentTurn({ players: 4, picksPerPlayer: 3 }, 9)).toEqual({
      pick: 10,
      round: 3,
      seat: 1,
    });
  });

  it('is null once every player has all their picks', () => {
    expect(currentTurn({ players: 3, picksPerPlayer: 2 }, 6)).toBeNull();
  });
});

describe('nextTurn', () => {
  it('is the turn after the one making `pick`', () => {
    expect(nextTurn({ players: 4, picksPerPlayer: 3 }, 2)).toEqual({
      pick: 3,
      round: 1,
      seat: 2,
    });
  });

  it('gives the end seat its second pick of the pair, then turns back', () => {
    const size = { players: 3, picksPerPlayer: 3 };
    expect(nextTurn(size, 3)).toEqual({ pick: 4, round: 2, seat: 2 });
    expect(nextTurn(size, 4)).toEqual({ pick: 5, round: 2, seat: 1 });
  });

  it('is null after the draft’s last pick', () => {
    expect(nextTurn({ players: 3, picksPerPlayer: 2 }, 6)).toBeNull();
  });
});

describe('roundRunsForward', () => {
  it('runs odd rounds from the first seat to the last, and even ones back', () => {
    expect([1, 2, 3, 4].map(roundRunsForward)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('draftComplete', () => {
  it('is false while any player still has picks to make', () => {
    expect(draftComplete({ players: 3, picksPerPlayer: 2 }, 0)).toBe(false);
    expect(draftComplete({ players: 3, picksPerPlayer: 2 }, 5)).toBe(false);
  });

  it('is true once every player has all their picks', () => {
    expect(draftComplete({ players: 3, picksPerPlayer: 2 }, 6)).toBe(true);
  });
});
