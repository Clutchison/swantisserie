import { describe, expect, it } from 'vitest';
import { startProblem } from './start.js';

describe('startProblem', () => {
  it('allows a start when every player can get all their picks', () => {
    expect(
      startProblem({ players: 3, picksPerPlayer: 40, doublePicks: 0 }, 120),
    ).toBeNull();
  });

  it('refuses when picks × players is more than the pool', () => {
    expect(
      startProblem({ players: 3, picksPerPlayer: 40, doublePicks: 0 }, 119),
    ).toEqual({
      error: 'pool-too-small',
      message: '3 players × 40 picks needs 120 cards, but the pool has 119.',
    });
  });

  it('needs the same pool with double picks', () => {
    const size = { players: 3, picksPerPlayer: 40, doublePicks: 20 };
    expect(startProblem(size, 120)).toBeNull();
    expect(startProblem(size, 119)?.error).toBe('pool-too-small');
  });

  it.each([0, 1, 13])(
    'refuses %i players: a draft needs 2 to 12',
    (players) => {
      expect(
        startProblem({ players, picksPerPlayer: 1, doublePicks: 0 }, 1000),
      ).toEqual({
        error: 'player-count',
        message: 'A draft needs 2 to 12 players to start.',
      });
    },
  );

  it.each([2, 12])('allows %i players', (players) => {
    expect(
      startProblem({ players, picksPerPlayer: 1, doublePicks: 0 }, 1000),
    ).toBeNull();
  });
});
