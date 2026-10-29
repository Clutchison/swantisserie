import { describe, expect, it } from 'vitest';
import { currentTurn } from './turn.js';

describe('currentTurn', () => {
  it('starts with the first seat taking pick 1 of round 1', () => {
    expect(currentTurn({ seats: 3, picksPerPlayer: 2, picksMade: 0 })).toEqual({
      pick: 1,
      round: 1,
      seat: 0,
    });
  });

  it('runs 1→N then N→1, so the last seat picks twice at the turn', () => {
    const seats = Array.from(
      { length: 9 },
      (_, picksMade) =>
        currentTurn({ seats: 3, picksPerPlayer: 3, picksMade })?.seat,
    );
    expect(seats).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
  });

  it('counts rounds and picks across the whole draft', () => {
    expect(currentTurn({ seats: 4, picksPerPlayer: 3, picksMade: 9 })).toEqual({
      pick: 10,
      round: 3,
      seat: 1,
    });
  });

  it('is null once every player has all their picks', () => {
    expect(
      currentTurn({ seats: 3, picksPerPlayer: 2, picksMade: 6 }),
    ).toBeNull();
  });
});
