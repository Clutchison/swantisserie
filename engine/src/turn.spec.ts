import { describe, expect, it } from 'vitest';
import {
  currentTurn,
  draftComplete,
  picksPerTurn,
  roundRunsForward,
  turnAfter,
  turnStartPick,
} from './turn.js';

describe('currentTurn', () => {
  it('starts with the first seat taking pick 1 of round 1', () => {
    expect(
      currentTurn({ players: 3, picksPerPlayer: 2, doublePicks: 0 }, 0),
    ).toEqual({
      pick: 1,
      round: 1,
      seat: 0,
      picksBeforeTurnPasses: 1,
    });
  });

  it('runs 1→N then N→1, so the last seat picks twice at the turn', () => {
    const seats = Array.from(
      { length: 9 },
      (_, picksMade) =>
        currentTurn(
          { players: 3, picksPerPlayer: 3, doublePicks: 0 },
          picksMade,
        )?.seat,
    );
    expect(seats).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
  });

  it('counts rounds and picks across the whole draft', () => {
    expect(
      currentTurn({ players: 4, picksPerPlayer: 3, doublePicks: 0 }, 9),
    ).toEqual({
      pick: 10,
      round: 3,
      seat: 1,
      picksBeforeTurnPasses: 1,
    });
  });

  it('is null once every player has all their picks', () => {
    expect(
      currentTurn({ players: 3, picksPerPlayer: 2, doublePicks: 0 }, 6),
    ).toBeNull();
  });
});

describe('currentTurn with double picks', () => {
  const roundSeatAndPicksBeforeTurnPasses = (size: {
    players: number;
    picksPerPlayer: number;
    doublePicks: number;
  }) =>
    Array.from({ length: size.players * size.picksPerPlayer }, (_, made) => {
      const turn = currentTurn(size, made)!;
      return [turn.round, turn.seat, turn.picksBeforeTurnPasses];
    });

  it('makes every turn double when double picks equal picks per player', () => {
    expect(
      roundSeatAndPicksBeforeTurnPasses({
        players: 2,
        picksPerPlayer: 4,
        doublePicks: 4,
      }),
    ).toEqual([
      [1, 0, 2],
      [1, 0, 1],
      [1, 1, 2],
      [1, 1, 1],
      [2, 1, 2],
      [2, 1, 1],
      [2, 0, 2],
      [2, 0, 1],
    ]);
  });

  it('runs single rounds, then double rounds, snaking over turns', () => {
    expect(
      roundSeatAndPicksBeforeTurnPasses({
        players: 3,
        picksPerPlayer: 6,
        doublePicks: 4,
      }),
    ).toEqual([
      [1, 0, 1],
      [1, 1, 1],
      [1, 2, 1],
      [2, 2, 1],
      [2, 1, 1],
      [2, 0, 1],
      [3, 0, 2],
      [3, 0, 1],
      [3, 1, 2],
      [3, 1, 1],
      [3, 2, 2],
      [3, 2, 1],
      [4, 2, 2],
      [4, 2, 1],
      [4, 1, 2],
      [4, 1, 1],
      [4, 0, 2],
      [4, 0, 1],
    ]);
  });

  it('counts picks across single and double rounds', () => {
    expect(
      currentTurn({ players: 3, picksPerPlayer: 6, doublePicks: 4 }, 9),
    ).toEqual({ pick: 10, round: 3, seat: 1, picksBeforeTurnPasses: 1 });
  });

  it('is null once every player has all their picks', () => {
    const size = { players: 3, picksPerPlayer: 6, doublePicks: 4 };
    expect(currentTurn(size, 17)).not.toBeNull();
    expect(currentTurn(size, 18)).toBeNull();
    expect(draftComplete(size, 18)).toBe(true);
  });
});

/**
 * Two players, 4 picks each, the last 2 on double turns: round 1 is seats
 * 0 then 1, round 2 seats 1 then 0, then round 3 seat 0 on picks 5 and 6
 * and seat 1 on picks 7 and 8.
 */
const SINGLES_THEN_DOUBLES = { players: 2, picksPerPlayer: 4, doublePicks: 2 };

describe('turnStartPick', () => {
  it('is the pick itself on a single turn and at the start of a double turn', () => {
    expect(
      [0, 1, 2, 3, 4, 6].map((picksMade) =>
        turnStartPick(
          SINGLES_THEN_DOUBLES,
          currentTurn(SINGLES_THEN_DOUBLES, picksMade)!,
        ),
      ),
    ).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it('is the pick before on the second pick of a double turn', () => {
    expect(
      [5, 7].map((picksMade) =>
        turnStartPick(
          SINGLES_THEN_DOUBLES,
          currentTurn(SINGLES_THEN_DOUBLES, picksMade)!,
        ),
      ),
    ).toEqual([5, 7]);
  });
});

describe('turnAfter', () => {
  it('is the next pick’s turn after a single turn', () => {
    expect(
      turnAfter(SINGLES_THEN_DOUBLES, currentTurn(SINGLES_THEN_DOUBLES, 3)!),
    ).toMatchObject({ pick: 5, round: 3, seat: 0 });
  });

  it('skips a double turn’s second pick from its first, as both are the turn’s', () => {
    expect(
      turnAfter(SINGLES_THEN_DOUBLES, currentTurn(SINGLES_THEN_DOUBLES, 4)!),
    ).toMatchObject({ pick: 7, round: 3, seat: 1 });
  });

  it('is the next turn from a double turn’s second pick', () => {
    expect(
      turnAfter(SINGLES_THEN_DOUBLES, currentTurn(SINGLES_THEN_DOUBLES, 5)!),
    ).toMatchObject({ pick: 7, round: 3, seat: 1 });
  });

  it('is null from either pick of the draft’s last turn', () => {
    expect(
      [6, 7].map((picksMade) =>
        turnAfter(
          SINGLES_THEN_DOUBLES,
          currentTurn(SINGLES_THEN_DOUBLES, picksMade)!,
        ),
      ),
    ).toEqual([null, null]);
  });
});

describe('picksPerTurn', () => {
  it('is 1 in a round of single turns and 2 in a round of double turns', () => {
    const size = { players: 3, picksPerPlayer: 6, doublePicks: 4 };
    expect([1, 2, 3, 4].map((round) => picksPerTurn(size, round))).toEqual([
      1, 1, 2, 2,
    ]);
  });

  it('is 1 in every round past the draft’s last', () => {
    // Two rounds of single turns, then two of double turns: the last is round 4.
    const size = { players: 3, picksPerPlayer: 6, doublePicks: 4 };
    expect([5, 6, 7].map((round) => picksPerTurn(size, round))).toEqual([
      1, 1, 1,
    ]);
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
    expect(
      draftComplete({ players: 3, picksPerPlayer: 2, doublePicks: 0 }, 0),
    ).toBe(false);
    expect(
      draftComplete({ players: 3, picksPerPlayer: 2, doublePicks: 0 }, 5),
    ).toBe(false);
  });

  it('is true once every player has all their picks', () => {
    expect(
      draftComplete({ players: 3, picksPerPlayer: 2, doublePicks: 0 }, 6),
    ).toBe(true);
  });
});
