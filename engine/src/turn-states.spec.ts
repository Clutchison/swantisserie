import { describe, expect, it } from 'vitest';
import { isTurnState } from './index.js';

describe('isTurnState', () => {
  it.each(['Drafting', 'Frozen'])(
    'is true for a %s draft, which has a turn',
    (state) => {
      expect(isTurnState(state)).toBe(true);
    },
  );

  it.each(['Lobby', 'Complete', 'Closed'])(
    'is false for a %s draft, which has no turn',
    (state) => {
      expect(isTurnState(state)).toBe(false);
    },
  );
});
