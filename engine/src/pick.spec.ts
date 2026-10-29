import { describe, expect, it } from 'vitest';
import { pickProblem } from './pick.js';

describe('pickProblem', () => {
  it('lets the seat whose turn it is pick an available card', () => {
    expect(
      pickProblem({ players: 2, picksPerPlayer: 2, picked: [] }, 0, 'shock'),
    ).toBeNull();
  });

  it('refuses a seat whose turn it is not', () => {
    expect(
      pickProblem({ players: 2, picksPerPlayer: 2, picked: [] }, 1, 'shock'),
    ).toEqual({ error: 'not-your-turn', message: 'It’s not your turn.' });
  });

  it('follows snake order: the last seat picks again at the turn', () => {
    const draft = { players: 2, picksPerPlayer: 2, picked: ['shock'] };
    expect(pickProblem(draft, 1, 'bolt')).toBeNull();
    expect(
      pickProblem({ ...draft, picked: ['shock', 'bolt'] }, 1, 'lava-spike'),
    ).toBeNull();
    expect(
      pickProblem({ ...draft, picked: ['shock', 'bolt'] }, 0, 'lava-spike')
        ?.error,
    ).toBe('not-your-turn');
  });

  it('refuses a card that has already been picked', () => {
    expect(
      pickProblem(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        1,
        'shock',
      ),
    ).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
  });

  it('refuses every seat once every pick is made', () => {
    expect(
      pickProblem(
        { players: 2, picksPerPlayer: 1, picked: ['shock', 'bolt'] },
        0,
        'lava-spike',
      )?.error,
    ).toBe('not-your-turn');
  });
});
