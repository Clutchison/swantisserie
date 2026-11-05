import { describe, expect, it } from 'vitest';
import { queueAfterUndo } from './queue.js';

describe('queueAfterUndo', () => {
  it('puts a card lost under pick next back in its old place', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'shock', position: 0 },
          { card: 'spike', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['shock', 'bolt', 'spike']);
  });

  it('puts a card lost under pick next back after as many cards as were ahead of it, once the queue has changed', () => {
    // Spike was moved to the front and Skewer queued; one card is ahead of Bolt's old place.
    expect(
      queueAfterUndo(
        [
          { card: 'spike', position: 0 },
          { card: 'shock', position: 1 },
          { card: 'skewer', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['spike', 'bolt', 'shock', 'skewer']);
  });

  it('puts a cleared queue back at the front, in its order, ahead of cards queued since', () => {
    expect(
      queueAfterUndo(
        [{ card: 'skewer', position: 0 }],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });

  it('holds a taken-out card queued again since only once', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'bolt', position: 0 },
          { card: 'skewer', position: 1 },
        ],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });
});
