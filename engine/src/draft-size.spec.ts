import { describe, expect, it } from 'vitest';
import { draftSize } from './draft-size.js';

describe('draftSize', () => {
  it('takes the players apart from what the draft holds, and only its size', () => {
    const stored = { name: 'Cube night', picksPerPlayer: 45, doublePicks: 20 };

    expect(draftSize(stored, 6)).toEqual({
      players: 6,
      picksPerPlayer: 45,
      doublePicks: 20,
    });
  });
});
